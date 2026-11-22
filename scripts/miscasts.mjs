/**
 * WFRP 4e Automated Miscasts
 *
 * Wraps game.wfrp4e.tables.formatChatRoll (the path used by the cast/channel card's miscast button,
 * @Table links and /table). For miscast tables it rolls through the system's own rollTable, then,
 * instead of printing the result text, posts the result as an Item card exactly like the system
 * does for critical wounds (a "item" type ChatMessage whose PostedItemMessageModel makes the card
 * draggable onto an actor sheet).
 *
 * The Item is built at roll time from the user's installed RollTable result: its name, text and,
 * when the result links a scripted ActiveEffect (core / Winds of Magic), a copy of that effect,
 * so the system runs the effect's automation when the Item lands on a character.
 */
import { MODULE_ID, MISCAST_KEYS, SOURCE_TABLES, LINKED_EFFECTS, MODULE_EFFECTS, NO_EFFECT_NAMES } from "./miscast-data.mjs";

const i18n = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const MISCAST_IMG = "icons/magic/unholy/energy-smoke-pink.webp";
// wfrp4e-core 8.0.1 effects point at this icon, which the module doesn't ship.
const MISSING_IMG = /wfrp4e-core\/icons\/effects\/miscast\.png$/;

/* ------------------------------------------------------------------------------------------ */
/* Settings                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export function registerSettings() {
  game.settings.register(MODULE_ID, "enabled", {
    name: "WFAM.Settings.Enabled.Name",
    hint: "WFAM.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, "itemType", {
    name: "WFAM.Settings.ItemType.Name",
    hint: "WFAM.Settings.ItemType.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: { injury: "WFAM.Settings.ItemType.injury", psychology: "WFAM.Settings.ItemType.psychology" },
    default: "injury"
  });
}

Hooks.once("init", registerSettings);

/* ------------------------------------------------------------------------------------------ */
/* Table identification                                                                         */
/* ------------------------------------------------------------------------------------------ */

/** Which published table a RollTable is: {source: core|moo|wom|other, key}. */
export function identifyTable(table) {
  const key = table?.getFlag?.("wfrp4e", "key") ?? null;
  const ids = [table?._stats?.compendiumSource?.split(".").pop(), table?.getFlag?.("core", "sourceId")?.split(".").pop(), table?.id];
  for (const id of ids) if (id && SOURCE_TABLES[id]) return { ...SOURCE_TABLES[id], key: key ?? SOURCE_TABLES[id].key };
  const name = table?.name ?? "";
  if (/\(moo\)/i.test(name)) return { source: "moo", key };
  if (/winds of magic/i.test(name) || table?.pack?.startsWith("wfrp4e-wom") || table?._stats?.compendiumSource?.includes("wfrp4e-wom")) return { source: "wom", key };
  if (table?._stats?.compendiumSource?.includes("wfrp4e-core") || table?.pack?.startsWith("wfrp4e-core")) return { source: "core", key };
  return { source: "other", key };
}

const SOURCE_LABEL = { core: "WFAM.Source.core", moo: "WFAM.Source.moo", wom: "WFAM.Source.wom", other: "WFAM.Source.other" };

/* ------------------------------------------------------------------------------------------ */
/* Item construction                                                                            */
/* ------------------------------------------------------------------------------------------ */

function resultName(result) {
  return (result.name || result.text || "").trim();
}

function resultDescription(result) {
  return result.description ?? result.text ?? "";
}

/** Copy an ActiveEffect document into embeddable Item effect data. */
function effectData(doc, sourceUuid) {
  const data = doc.toObject();
  delete data._id;
  data.transfer = true;
  if (!data.img || MISSING_IMG.test(data.img)) data.img = MISCAST_IMG;
  const td = data.system?.transferData;
  // Area / target effects don't land on the owner; expose them as buttons on the Item instead.
  if (td && ["area", "target", "zone"].includes(td.type)) td.testIndependent = true;
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.source`, sourceUuid);
  return data;
}

/**
 * Build Item data for one rolled TableResult.
 * @returns {Promise<{itemData: object, automation: string}|null>} null when the result should keep
 *          the system's normal output (a "no effect" row, or a result that links an Item).
 */
export async function buildMiscastItem(table, result, { roll, messageId } = {}) {
  const name = resultName(result);
  if (!name || NO_EFFECT_NAMES.includes(name.toLowerCase())) return null;
  const { source, key } = identifyTable(table);
  const effects = [];
  const auto = [];

  // 1. Result links a document: copy a linked ActiveEffect (core / WoM automation).
  let linked = result.documentUuid ? await fromUuid(result.documentUuid).catch(() => null) : null;
  if (linked?.documentName === "Item") return null; // let the system post that Item itself
  if (linked?.documentName === "ActiveEffect") {
    effects.push(effectData(linked, result.documentUuid));
    auto.push(fmt("WFAM.Auto.Linked", { name: linked.name }));
  }

  // 2. Known text result whose effect ships in core but isn't linked by the table.
  if (!effects.length) {
    const uuid = LINKED_EFFECTS[source]?.[name.toLowerCase()];
    const doc = uuid ? await fromUuid(uuid).catch(() => null) : null;
    if (doc?.documentName === "ActiveEffect") {
      linked = doc;
      effects.push(effectData(doc, uuid));
      auto.push(fmt("WFAM.Auto.Linked", { name: doc.name }));
    }
  }

  // 3. This module's own effect for a mechanical text result.
  const img = MISCAST_IMG;
  if (!effects.length) {
    const builder = MODULE_EFFECTS[source]?.[name.toLowerCase()] ?? MODULE_EFFECTS["*"]?.[name.toLowerCase()];
    if (builder) {
      const data = builder({ img, i18n });
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.source`, MODULE_ID);
      effects.push(data);
      auto.push(fmt("WFAM.Auto.Module", { name: data.name }));
    }
  }

  let description = resultDescription(result);
  if (!description && linked?.description) description = linked.description;
  const redirect = /@Table\[/.test(description);
  if (!effects.length && !redirect) description += `<p><em>${i18n("WFAM.Card.Manual")}</em></p>`;

  const itemType = game.settings.get(MODULE_ID, "itemType") || "injury";
  const system = { description: { value: description } };
  if (itemType === "injury") Object.assign(system, { location: { key: "", value: "" }, penalty: { value: "" }, duration: { value: "", active: false, permanent: false } });

  const itemData = {
    name,
    type: itemType,
    img,
    system,
    effects,
    flags: {
      wfrp4e: messageId ? { sourceMessageId: messageId } : {},
      [MODULE_ID]: {
        miscast: { key, source, table: table.uuid, tableName: table.name, result: result.uuid ?? null, roll: roll ?? null }
      }
    }
  };
  return { itemData, automation: auto.length ? auto.join(", ") : i18n(redirect ? "WFAM.Auto.Redirect" : "WFAM.Auto.None"), source, key };
}

/* ------------------------------------------------------------------------------------------ */
/* Posting                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** Post an item card the same way PostedItemMessageModel.create does, with miscast properties. */
async function postMiscastCard(built, table, { roll, messageId } = {}) {
  const { itemData, automation, source } = built;
  const properties = [
    `<b>${i18n("WFAM.Card.Table")}</b>: ${table.name} <span class="wfam-source">(${i18n(SOURCE_LABEL[source])})</span>`,
    `<b>${i18n("WFAM.Card.Roll")}</b>: ${roll}`,
    `<b>${i18n("WFAM.Card.Automation")}</b>: ${automation}`,
    `<i class="fas fa-hand-pointer"></i> ${i18n("WFAM.Card.DragHint")}`
  ];
  let content = await foundry.applications.handlebars.renderTemplate("systems/wfrp4e/templates/chat/post-item.hbs", {
    item: itemData,
    img: itemData.img,
    properties,
    postQuantity: undefined,
    retrievedBy: ""
  });
  content = content.replace('class="post-item', 'class="post-item wfam-miscast');
  const speaker = (messageId && game.messages.get(messageId)?.speaker) || ChatMessage.getSpeaker();
  return ChatMessage.create(ChatMessage.applyRollMode({
    type: "item",
    content,
    speaker,
    flavor: i18n("WFAM.Card.Flavor"),
    flags: { [MODULE_ID]: { miscast: itemData.flags[MODULE_ID].miscast } },
    system: { itemData, originalItemData: itemData, postQuantity: null }
  }, game.settings.get("core", "rollMode")));
}

/* ------------------------------------------------------------------------------------------ */
/* Rolling                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** Find the rolled TableResult document from a system rollTable() result object. */
function rolledResult(table, rolled) {
  const id = rolled?.object?._id;
  if (id && table.results?.get) return table.results.get(id);
  return table.getResultsForRoll?.(rolled?.total)?.[0] ?? null;
}

/**
 * Roll a specific miscast RollTable (document, uuid, id or name) and post the item card.
 * Mirrors WFRP_Tables.rollTable: formula + modifier, clamped to the table's range.
 */
export async function rollMiscast(tableRef, { modifier = 0, showRoll = true, messageId, lookup } = {}) {
  let table = tableRef;
  if (typeof tableRef === "string") table = tableRef.includes(".") ? await fromUuid(tableRef) : (game.tables.get(tableRef) ?? game.tables.getName(tableRef));
  if (!(table instanceof RollTable)) throw new Error(`${MODULE_ID} | table not found: ${tableRef}`);
  const T = game.wfrp4e.tables;
  const roll = await new Roll(`${table.formula} + @modifier`, { modifier }).roll({ allowInteractive: false });
  if (showRoll) await roll.toMessage({ speaker: { alias: table.name } }, { rollMode: game.settings.get("core", "rollMode") });
  let total = lookup ?? roll.total;
  if (T._isBelowMin(table, total)) total = T._minRange(table);
  if (T._isAboveMax(table, total)) total = T._maxRange(table);
  const result = table.getResultsForRoll(total)[0];
  if (!result) return null;
  const display = lookup ?? (modifier ? roll.result : total);
  const built = await buildMiscastItem(table, result, { roll: display, messageId });
  if (!built) {
    await ChatMessage.create({ content: await result.getHTML?.() ?? resultDescription(result), speaker: { alias: table.name } });
    return null;
  }
  return postMiscastCard(built, table, { roll: display, messageId });
}

async function formatChatRollWrapper(wrapped, table, options = {}, column = null, ...rest) {
  const T = game.wfrp4e.tables;
  const key = typeof table === "string" ? T.generalizeTable(table) : null;
  if (!key || !MISCAST_KEYS.includes(key) || !game.settings.get(MODULE_ID, "enabled")) return wrapped(table, options, column, ...rest);

  const tableObject = T.findTable(key, column);
  if (!(tableObject instanceof RollTable)) return wrapped(table, options, column, ...rest); // column prompt etc.

  const rolled = await T.rollTable(key, options, column);
  if (options.cancelUnderMin && T._isBelowMin(tableObject, rolled.total)) return game.i18n.format("TABLE.Cancel", { result: rolled.roll });
  if (options.lookup && !game.user.isGM) rolled.roll = game.i18n.localize("TABLE.Lookup") + rolled.roll;

  const result = rolledResult(tableObject, rolled);
  const built = result ? await buildMiscastItem(tableObject, result, { roll: rolled.roll, messageId: options.messageId }) : null;
  if (!built) {
    // Keep the system's behaviour for "no effect" rows and Item-linked results.
    if (result?.documentUuid) {
      const doc = await fromUuid(result.documentUuid).catch(() => null);
      if (doc?.documentName === "Item") { await doc.postItem(undefined, { "flags.wfrp4e.sourceMessageId": options.messageId }); return options.returnObject ? { result: "" } : null; }
    }
    return options.returnResult || options.returnObject ? rolled : rolled.result;
  }
  await postMiscastCard(built, tableObject, { roll: rolled.roll, messageId: options.messageId });
  return options.returnObject ? { result: "" } : null;
}

/* ------------------------------------------------------------------------------------------ */
/* Wiring                                                                                       */
/* ------------------------------------------------------------------------------------------ */

let originalFormatChatRoll = null;

export function wire() {
  const tables = game.wfrp4e?.tables;
  if (!tables?.formatChatRoll) {
    console.warn(`${MODULE_ID} | game.wfrp4e.tables.formatChatRoll not found; miscast items disabled.`);
  }
  else if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    globalThis.libWrapper.register(MODULE_ID, "game.wfrp4e.tables.formatChatRoll", formatChatRollWrapper, "MIXED");
  }
  else {
    originalFormatChatRoll = tables.formatChatRoll;
    tables.formatChatRoll = function (...args) {
      return formatChatRollWrapper(originalFormatChatRoll.bind(this), ...args);
    };
  }
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { rollMiscast, buildMiscastItem, identifyTable, MISCAST_KEYS };
}

Hooks.once("setup", wire);

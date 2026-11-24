/**
 * WFRP 4e Automated Miscasts
 *
 * Wraps game.wfrp4e.tables.formatChatRoll (the path used by the cast/channel card's miscast button,
 * @Table links and /table). For miscast tables it rolls through the system's own rollTable, then
 * posts a miscast card instead of the plain result text:
 *
 *  - Results with automation (a linked core / Winds of Magic Active Effect, a core effect the table
 *    doesn't link, or one of this module's effects) get a draggable card. Dropping it on an actor
 *    sheet or a token applies the miscast as a temporary Active Effect through the system's own
 *    actor.applyEffect (the same path warhammer-lib uses for effects dropped on the canvas), so the
 *    effect's scripts run and any duration they set shows on the sheet.
 *  - Narrative results get a plain card with the result text: no drag, no effect.
 *
 * Card text and effects are read at roll time from the user's installed tables and compendiums.
 */
import { preRoll, installReplay, fixCritLocation } from "./miscast-rolls.mjs";
import { openSelectDialog, miscastTables } from "./miscast-select.mjs";
import { witchlight, witchlightChoice, actorMagic, soulpyreLore, soulpyreNote, applyLoreAttribute } from "./miscast-lore.mjs";
import { MODULE_ID, MISCAST_KEYS, SOURCE_TABLES, LINKED_EFFECTS, MODULE_EFFECTS, OVERRIDE_NAMES, MODULE_PATCHES, NO_EFFECT_NAMES } from "./miscast-data.mjs";

const i18n = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const DRAG_TYPE = "wfam-miscast";
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
/* Effect construction                                                                          */
/* ------------------------------------------------------------------------------------------ */

const resultDescription = result => result.description ?? result.text ?? "";
const hasHTML = s => /<[a-z/][^>]*>?/i.test(s ?? "");

/** Plain text of an HTML fragment (tolerates unclosed tags such as a trailing "</p"). */
function plainText(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html ?? "").replace(/<\/?[a-z]*$/i, "");
  return div.textContent.replace(/\s+/g, " ").trim();
}

/**
 * Name and description of a TableResult. Results imported from older tables (or text results
 * migrated by Foundry) can hold the whole entry as HTML in the name, e.g.
 * "<p><strong>Mindnumb</strong>: Uncontrolled magic ...</p>". Take the bold lead-in as the name
 * and the rest as the description; plain "Name: text" entries are split on the colon.
 */
export function parseResult(result) {
  const rawName = String(result.name ?? "").trim();
  const rawDesc = String(resultDescription(result) ?? "").trim();
  if (rawName && !hasHTML(rawName) && rawName.length <= 60 && !/^[^:]{1,40}:\s/.test(rawName)) return { name: rawName, description: rawDesc };

  const html = hasHTML(rawName) || rawName.length > 60 || !rawDesc ? (rawName || rawDesc) : rawDesc;
  const div = document.createElement("div");
  div.innerHTML = html.replace(/<\/?[a-z]*$/i, "");
  let name = "";
  const lead = div.querySelector("strong, b");
  if (lead) {
    name = lead.textContent.replace(/[:.\s]+$/, "").trim();
    lead.remove();
  }
  let rest = div.innerHTML.replace(/^(\s|<p>)*[:.\-–—]\s*/i, m => m.startsWith("<p>") ? "<p>" : "").trim();
  if (!name) {
    const text = plainText(html);
    const m = text.match(/^([^:]{1,40}):\s*(.*)$/s);
    if (m) { name = m[1].trim(); rest = m[2].trim(); }
    else { name = text.slice(0, 60); rest = ""; }
  }
  // Keep a separate, real description if the name held the HTML and the description is different.
  const fromDesc = html === rawDesc;
  let description = !fromDesc && rawDesc && plainText(rawDesc) !== plainText(rawName) ? rawDesc : rest;
  if (description && !hasHTML(description)) description = `<p>${foundry.utils.escapeHTML(description)}</p>`;
  if (plainText(description) === "") description = "";
  return { name, description };
}

/** The same result in the published compendium table (by source, key and name), cached per table. */
const canonicalTables = new Map();
async function canonicalTable(id, info) {
  if (canonicalTables.has(id)) return canonicalTables.get(id);
  const doc = await game.packs.get(info.pack)?.getDocument(id).catch(() => null) ?? null;
  canonicalTables.set(id, doc);
  return doc;
}
async function canonicalResult(source, key, name) {
  const lname = name.toLowerCase();
  const order = Object.entries(SOURCE_TABLES).filter(([, i]) => i.key === key && (source === "other" || i.source === source));
  for (const [id, info] of order) {
    const table = await canonicalTable(id, info);
    const match = table?.results.find(r => parseResult(r).name.toLowerCase() === lname);
    if (match) return Object.assign(match, { _wfamSource: info.source });
  }
  return null;
}

function moduleEffect(source, lname) {
  const builder = MODULE_EFFECTS[source]?.[lname] ?? MODULE_EFFECTS["*"]?.[lname];
  if (!builder) return null;
  const effect = builder({ img: MISCAST_IMG, i18n });
  foundry.utils.setProperty(effect, `flags.${MODULE_ID}.source`, MODULE_ID);
  return effect;
}

/** Copy an ActiveEffect document into plain effect data for the card. */
function effectData(doc, sourceUuid) {
  const data = doc.toObject();
  delete data._id;
  if (!data.img || MISSING_IMG.test(data.img)) data.img = MISCAST_IMG;
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.source`, sourceUuid);
  return data;
}

/**
 * Work out what a rolled TableResult does.
 * @returns {Promise<object|null>} null when the result should keep the system's normal output
 *          (a "no effect" row, or a result that links an Item).
 */
export async function buildMiscast(table, result, { roll, messageId } = {}) {
  const parsed = parseResult(result);
  const name = parsed.name;
  if (!name || NO_EFFECT_NAMES.includes(name.toLowerCase())) return null;
  const lname = name.toLowerCase();
  const ident = identifyTable(table);
  const key = ident.key;
  let source = ident.source;
  let effect = null;
  let automation = null;
  let linked = null;

  // Results from older or re-imported tables may have lost their effect link (and may not say
  // which book they're from); find the same result on the published table.
  let uuid = result.documentUuid;
  let canonical = null;
  if (!uuid) {
    canonical = await canonicalResult(source, key, name);
    uuid = canonical?.documentUuid ?? null;
    if (source === "other" && canonical?._wfamSource) source = canonical._wfamSource;
  }
  // 0. A module effect that replaces an incomplete core one (Power Drain blocks Channelling too).
  if (OVERRIDE_NAMES.includes(lname)) effect = moduleEffect(source, lname);
  if (effect) automation = fmt("WFAM.Auto.Module", { name: effect.name });

  // 1. Result links a document: use a linked ActiveEffect (core / WoM automation).
  if (uuid) linked = await fromUuid(uuid).catch(() => null);
  if (linked?.documentName === "Item" && !effect) return null; // let the system post that Item itself
  if (!effect && linked?.documentName === "ActiveEffect") {
    effect = effectData(linked, uuid);
    automation = fmt("WFAM.Auto.Linked", { name: linked.name });
  }

  // 2. Known text result whose effect ships in core but isn't linked by the table.
  if (!effect) {
    const luuid = LINKED_EFFECTS[source]?.[lname];
    const doc = luuid ? await fromUuid(luuid).catch(() => null) : null;
    if (doc?.documentName === "ActiveEffect") {
      linked = doc;
      effect = effectData(doc, luuid);
      automation = fmt("WFAM.Auto.Linked", { name: doc.name });
    }
  }

  // 3. This module's own effect for a mechanical text result.
  if (!effect) {
    effect = moduleEffect(source, lname);
    if (effect) automation = fmt("WFAM.Auto.Module", { name: effect.name });
  }

  // 4. Extra scripts for a linked effect that leaves part of the result out (Soulpyre's Stunned).
  const patch = MODULE_PATCHES[source]?.[lname] ?? MODULE_PATCHES["*"]?.[lname];
  if (effect && patch) {
    let extra = patch({ i18n });
    if (!Array.isArray(extra)) {
      if (extra.flags) foundry.utils.mergeObject(effect, { flags: { [MODULE_ID]: extra.flags } });
      extra = extra.scripts;
    }
    foundry.utils.setProperty(effect, "system.scriptData", (effect.system?.scriptData ?? []).concat(extra));
    automation = fmt("WFAM.Auto.Patched", { name: automation, extra: extra[0].label });
  }

  // Description: the result's own text, unless it only embeds the effect (@Embed) or is empty.
  let description = parsed.description;
  if ((!plainText(description) || /@Embed\[/.test(description)) && linked?.documentName === "ActiveEffect" && linked.description) description = linked.description;
  if (!plainText(description) && canonical) description = parseResult(canonical).description;
  if (effect && !effect.description) effect.description = description;
  if (effect && (!effect.name || hasHTML(effect.name))) effect.name = name;

  const transferType = effect?.system?.transferData?.type ?? null;
  return {
    name,
    description,
    effect,
    transferType,
    automation,
    source,
    key,
    miscast: { key, source, table: table.uuid, tableName: table.name, result: result.uuid ?? null, roll: roll ?? null, sourceMessageId: messageId ?? null }
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Card                                                                                         */
/* ------------------------------------------------------------------------------------------ */

const escape = s => foundry.utils.escapeHTML(String(s ?? ""));

async function postMiscastCard(built, table) {
  // Roll the miscast's dice now; the drop reuses these results (see miscast-rolls.mjs).
  await preRoll(built);
  const { name, description, effect, transferType, automation, source, miscast } = built;
  const lines = [
    `<span><b>${i18n("WFAM.Card.Table")}</b>: ${escape(table.name)} <span class="wfam-source">(${i18n(SOURCE_LABEL[source])})</span></span>`,
    `<span><b>${i18n("WFAM.Card.Roll")}</b>: ${escape(miscast.roll)}</span>`
  ];
  const rolled = (built.rolls ?? []).map(r => `${r.label ? `${escape(r.label)} ` : ""}(${escape(r.formula)}): <b>${r.total}</b>${r.text ? ` <b>(${escape(r.text)})</b>` : ""}`);
  if (built.rolledDuration) rolled.push(`${i18n("WFAM.Card.Duration")}: <b>${built.rolledDuration.value} ${i18n(`WFAM.Units.${built.rolledDuration.units}`)}</b>`);
  const ours = effect?.flags?.[MODULE_ID] ?? {};
  if (ours.hideRolls) rolled.splice(0, (built.rolls ?? []).length); // dice that only mean something with the actor
  if (effect && rolled.length) lines.push(`<span class="wfam-rolled-values"><b>${i18n("WFAM.Card.Rolled")}</b>: ${rolled.join("; ")}</span>`);
  if (ours.preview === "witchlight") { const w = witchlightPreview(built, miscast); if (w) lines.push(w); }
  if (ours.preview === "soulpyre") lines.push(soulpyrePreview(built, miscast));
  if (effect) {
    lines.push(`<span><b>${i18n("WFAM.Card.Automation")}</b>: ${escape(automation)}</span>`);
    const hint = transferType === "area" ? "WFAM.Card.DragHintArea" : "WFAM.Card.DragHint";
    lines.push(`<span class="wfam-hint"><i class="fas fa-hand-pointer"></i> ${i18n(hint)}</span>`);
  }
  const content = `<div class="post-item wfam-miscast${effect ? " wfam-draggable" : " wfam-narrative"}">
  <h4>${escape(name)}</h4>
  <img src="${effect?.img ?? MISCAST_IMG}"/>
  <div class="card-content">${description}</div>
  ${lines.join("<br>\n  ")}
</div>`;
  const casterActor = miscast.casterUuid ? fromUuidSync(miscast.casterUuid) : null;
  const speaker = (miscast.sourceMessageId && game.messages.get(miscast.sourceMessageId)?.speaker)
    || (casterActor ? ChatMessage.getSpeaker({ actor: casterActor, token: casterActor.token ?? undefined }) : null)
    || ChatMessage.getSpeaker();
  return ChatMessage.create(ChatMessage.applyRollMode({
    content,
    speaker,
    flavor: i18n("WFAM.Card.Flavor"),
    flags: { [MODULE_ID]: { miscast: { ...miscast, rolls: built.rolls ?? [] }, effect: effect ?? null } }
  }, game.settings.get("core", "rollMode")));
}

/**
 * Witchlight on the card: the colour isn't shown (the light on the token says it). Only a caster
 * with several Lores gets a line, saying they choose one on drop.
 */
function witchlightPreview(built, miscast) {
  const caster = cardCaster(miscast);
  if (!(caster instanceof Actor)) return null;
  const [shade, pick] = (built.rolls ?? []).map(r => r.total);
  const l = witchlight(caster, { shade, pick });
  if (l.kind !== "lores") return null;
  return `<span class="wfam-light">${fmt("WFAM.Light.CasterChooses", { actor: escape(caster.name), options: l.lores.map(x => escape(x.label)).join(", ") })}</span>`;
}

/** Soulpyre's Lore attribute line for the caster (when the card knows them), using the card's die. */
function soulpyrePreview(built, miscast) {
  const caster = cardCaster(miscast);
  const pick = (built.rolls ?? []).find(r => r.formula === "1d1000")?.total ?? 1;
  const label = `<b>${i18n("WFAM.Pyre.Attribute")}</b>`;
  if (!(caster instanceof Actor)) return `<span class="wfam-pyre">${label}: ${i18n("WFAM.Pyre.OnDrop")}</span>`;
  const p = soulpyreLore(caster, pick);
  let text;
  if (!p) text = i18n("WFAM.Pyre.None");
  else if (p.automated) text = fmt("WFAM.Pyre.Auto", { lore: escape(p.label), what: escape(p.condition) });
  else text = fmt("WFAM.Pyre.Note", { lore: escape(p.label) });
  if (p?.of > 1) text += ` ${fmt("WFAM.Pyre.Picked", { n: p.of })}`;
  return `<span class="wfam-pyre">${label}: ${text} ${fmt("WFAM.Light.ForCaster", { actor: escape(caster.name) })}</span>`;
}

function cardCaster(miscast) {
  return (miscast.sourceMessageId && ChatMessage.getSpeakerActor(game.messages.get(miscast.sourceMessageId)?.speaker ?? {}))
    || (miscast.casterUuid ? fromUuidSync(miscast.casterUuid) : null);
}

/** Make miscast cards with an effect draggable (same drag-from-chat feel as posted items). */
function onRenderChatMessage(message, html) {
  const flags = message.flags?.[MODULE_ID];
  if (!flags?.effect) return;
  const el = html.querySelector?.(".wfam-miscast.wfam-draggable");
  if (!el) return;
  el.draggable = true;
  el.addEventListener("dragstart", ev => {
    // Same shape as the system's own custom chat drags ({type: "custom", custom: "wounds"}).
    ev.dataTransfer.setData("text/plain", JSON.stringify({
      type: "custom",
      custom: DRAG_TYPE,
      messageId: message.id,
      sourceMessageId: flags.miscast?.sourceMessageId ?? null
    }));
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Dropping                                                                                     */
/* ------------------------------------------------------------------------------------------ */

function effectFromDrop(data) {
  const message = game.messages.get(data.messageId);
  const effect = message?.flags?.[MODULE_ID]?.effect;
  if (!effect) return null;
  const doc = new CONFIG.ActiveEffect.documentClass(foundry.utils.deepClone(effect));
  const miscast = message.flags[MODULE_ID].miscast ?? {};
  return { doc, sourceMessageId: data.sourceMessageId ?? miscast.sourceMessageId ?? null, casterUuid: miscast.casterUuid ?? null };
}

/** Apply a miscast effect to an actor (temporary Active Effect), or start area placement. */
/** The caster an area miscast is measured from: the source cast's speaker, else the drop target. */
function casterFor(sourceMessageId, actor, point, casterUuid = null) {
  const speaker = sourceMessageId ? game.messages.get(sourceMessageId)?.speaker : null;
  const fromMsg = speaker ? ChatMessage.getSpeakerActor(speaker) : null;
  if (fromMsg) return fromMsg;
  const chosen = casterUuid ? fromUuidSync(casterUuid) : null; // caster picked in "Manually Select Miscast"
  if (chosen instanceof Actor) return chosen;
  if (actor) return actor;
  const token = canvas?.tokens?.quadtree
    ? Array.from(canvas.tokens.quadtree.getObjects(new PIXI.Rectangle(point.x, point.y, 0, 0))).at(0) : null;
  return token?.actor ?? canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
}

/**
 * Start the system's area-template placement for an area miscast. Area radii are usually
 * formulas on the caster (e.g. Willpower yards), which the system can't resolve for an effect
 * that isn't on an actor yet, so resolve it against the caster here.
 */
async function placeArea(doc, point, { caster, sourceMessageId } = {}) {
  const AreaTemplate = globalThis.warhammer?.apps?.AreaTemplate;
  const formula = doc.system.transferData.area?.radius;
  let radius;
  if (typeof formula === "number") radius = formula;
  else if (formula && caster) {
    try { radius = Roll.safeEval(Roll.replaceFormulaData(String(formula), { actor: caster, effect: doc })); } catch (e) { radius = undefined; }
  }
  if (!AreaTemplate) return doc.handleCanvasDrop({ x: point.x, y: point.y });
  const test = sourceMessageId ? game.messages.get(sourceMessageId)?.system?.test : undefined;
  const effectData = doc.convertToApplied(test);
  if (caster) foundry.utils.setProperty(effectData, "system.sourceData.actor", caster.uuid);
  const template = await AreaTemplate.fromEffect({ effectData }, sourceMessageId, radius || undefined);
  template.drawPreview();
  template.moveTo(point);
  return template;
}

export async function applyMiscast(actor, doc, { sourceMessageId, casterUuid, x, y } = {}) {
  const type = doc.system?.transferData?.type;
  if (type === "area") {
    // Area miscasts centre on the drop point (canvas) or the actor's token (sheet).
    let point = (x != null && y != null) ? { x, y } : null;
    if (!point) {
      const token = actor?.getActiveTokens?.()[0];
      if (token) point = token.center;
    }
    if (!point) return ui.notifications.warn(i18n("WFAM.Drop.AreaNeedsCanvas"));
    return placeArea(doc, point, { caster: casterFor(sourceMessageId, actor, point, casterUuid), sourceMessageId });
  }
  if (!actor) return ui.notifications.warn(i18n("WFAM.Drop.NoActor"));
  // An aura (Soulpyre) has to stay an aura so warhammer-lib draws its area round the token and
  // hands copies to creatures inside; applyEffect would convert it to a plain effect. No message
  // either: the aura's own scripts treat an effect with a source actor as a copy.
  if (type === "aura") return actor.applyEffect({ effectData: [doc.toObject()] });
  return actor.applyEffect({ effects: [doc], messageId: sourceMessageId ?? undefined });
}

const isMiscastDrop = data => data?.type === "custom" && data.custom === DRAG_TYPE;

/** warhammer-lib sheets route {type: "custom"} drops to the `${system}:dropCustomData` hook. */
function onDropCustomData(sheet, data) {
  if (!isMiscastDrop(data)) return;
  const actor = sheet?.actor ?? sheet?.document;
  if (!(actor instanceof Actor)) return;
  const found = effectFromDrop(data);
  if (found) applyMiscast(actor, found.doc, { sourceMessageId: found.sourceMessageId, casterUuid: found.casterUuid }).catch(err => console.error(`${MODULE_ID} |`, err));
}

/** Core ActorSheet(V2) path, for any sheet that isn't a warhammer-lib sheet. */
function onDropActorSheetData(actor, sheet, data) {
  if (!isMiscastDrop(data)) return;
  const found = effectFromDrop(data);
  if (found) applyMiscast(actor, found.doc, { sourceMessageId: found.sourceMessageId, casterUuid: found.casterUuid }).catch(err => console.error(`${MODULE_ID} |`, err));
  return false;
}

function onDropCanvasData(canvasObj, data) {
  if (!isMiscastDrop(data)) return;
  const found = effectFromDrop(data);
  if (!found) return false;
  const type = found.doc.system?.transferData?.type;
  let actor = null;
  if (type !== "area") {
    const token = Array.from(canvas.tokens.quadtree.getObjects(new PIXI.Rectangle(data.x, data.y, 0, 0)))
      .sort((a, b) => a._lastSortedIndex - b._lastSortedIndex).at(0);
    actor = token?.actor ?? null;
  }
  applyMiscast(actor, found.doc, { sourceMessageId: found.sourceMessageId, casterUuid: found.casterUuid, x: data.x, y: data.y }).catch(err => console.error(`${MODULE_ID} |`, err));
  return false;
}

/* ------------------------------------------------------------------------------------------ */
/* Forgetfulness                                                                                */
/* ------------------------------------------------------------------------------------------ */

/** Find the spell from the most recent miscasting test by this actor. */
function lastMiscastSpell(actor) {
  for (const m of game.messages.contents.slice().reverse()) {
    if (m.speaker?.actor !== actor.id) continue;
    let test;
    try { test = m.system?.test; } catch { continue; }
    const r = test?.result;
    if (!r || !(r.minormis || r.majormis || r.catastrophicmis)) continue;
    const spell = test.item ?? test.spell;
    if (spell?.type === "spell") return actor.items.get(spell.id) ?? null;
  }
  return null;
}

/**
 * Ask which memorised spell is forgotten (defaulting to the spell that miscast) and un-memorise it.
 * Used by the Forgetfulness effect's immediate script.
 */
/**
 * Ask the actor's owner to choose between a miscast's outcomes. Effect scripts run on the client
 * that applies the effect, which warhammer-lib routes to the actor's owner (their player when
 * online, else the GM), so the prompt shows there. Closing it, or no answer within the time limit,
 * applies nothing and whispers the GM to resolve it by hand.
 * @param {Actor} actor
 * @param {{title: string, text: string, choices: {action: string, label: string, icon?: string}[], source?: string, timeout?: number}} opts
 * @returns {Promise<string|null>} the chosen action, or null
 */
export async function promptChoice(actor, { title, text, choices, source, timeout = 5 * 60 * 1000 } = {}) {
  let dialog = null;
  let timer = null;
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: title ?? source ?? i18n("WFAM.Choice.Title") },
    position: { width: 440 },
    content: `<p>${text ?? ""}</p>`,
    rejectClose: false,
    render: (event, d) => {
      dialog = d ?? event?.target ?? null;
      if (timeout > 0) timer = setTimeout(() => dialog?.close(), timeout);
    },
    buttons: choices.map((c, i) => ({ action: c.action, label: c.label, icon: c.icon, default: i === 0, callback: () => c.action }))
  }).catch(() => null);
  if (timer) clearTimeout(timer);
  if (!choice || !choices.some(c => c.action === choice)) {
    await ChatMessage.create({
      content: fmt("WFAM.Choice.NoAnswer", { actor: escape(actor?.name), source: escape(source ?? title ?? "") }),
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)
    });
    return null;
  }
  return choice;
}

export async function promptForget(actor, { test, script } = {}) {
  const isPetty = s => [].concat(s.system.lore?.value ?? []).includes("petty");
  const memorised = actor.itemTypes.spell.filter(s => s.system.memorized?.value);
  const spells = memorised.filter(s => !isPetty(s)).concat(memorised.filter(isPetty));
  const notify = msg => (script?.message ? script.message(msg) : ChatMessage.create({ content: msg, speaker: ChatMessage.getSpeaker({ actor }) }));
  if (!spells.length) return notify(fmt("WFAM.Forget.None", { actor: escape(actor.name) }));
  const fromTest = test?.item?.type === "spell" ? actor.items.get(test.item.id) : null;
  const def = fromTest ?? lastMiscastSpell(actor) ?? spells[0];
  const options = spells.map(s => `<option value="${s.id}" ${s.id === def?.id ? "selected" : ""}>${escape(s.name)}</option>`).join("");
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: fmt("WFAM.Forget.Title", { actor: actor.name }) },
    content: `<p>${i18n("WFAM.Forget.Prompt")}</p><div class="form-group"><select name="spell">${options}</select></div>`,
    ok: {
      label: i18n("WFAM.Forget.Confirm"),
      icon: "fa-solid fa-brain",
      callback: (event, button) => button.form.elements.spell.value
    },
    rejectClose: false
  }).catch(() => null);
  if (!id) return notify(fmt("WFAM.Forget.Kept", { actor: escape(actor.name) }));
  const spell = actor.items.get(id);
  await spell.update({ "system.memorized.value": false });
  return notify(fmt("WFAM.Forget.Done", { actor: escape(actor.name), spell: escape(spell.name) }));
}

/* ------------------------------------------------------------------------------------------ */
/* Rolling                                                                                      */
/* ------------------------------------------------------------------------------------------ */

function rolledResult(table, rolled) {
  const id = rolled?.object?._id;
  if (id && table.results?.get) return table.results.get(id);
  return table.getResultsForRoll?.(rolled?.total)?.[0] ?? null;
}

/**
 * Roll a specific miscast RollTable (document, uuid, id or name) and post the card.
 * Mirrors WFRP_Tables.rollTable: formula + modifier, clamped to the table's range.
 */
export async function rollMiscast(tableRef, { modifier = 0, showRoll = true, messageId, lookup, actor } = {}) {
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
  const built = await buildMiscast(table, result, { roll: display, messageId });
  if (!built) {
    // Same as the system: a result that links an Item posts that Item, anything else its text.
    const doc = result.documentUuid ? await fromUuid(result.documentUuid).catch(() => null) : null;
    if (doc?.documentName === "Item" && doc.postItem) {
      await doc.postItem(undefined, messageId ? { "flags.wfrp4e.sourceMessageId": messageId } : {});
      return null;
    }
    await ChatMessage.create({ content: await result.getHTML?.() ?? resultDescription(result), speaker: { alias: table.name } });
    return null;
  }
  const caster = typeof actor === "string" ? fromUuidSync(actor) : actor;
  if (caster instanceof Actor && !messageId) built.miscast.casterUuid = caster.uuid;
  return postMiscastCard(built, table);
}

/**
 * libWrapper MIXED wrapper. It always chains: for miscast keys it calls the next wrapper (and
 * finally the system) with `returnResult: true`, so the system does the roll itself (modifiers,
 * lookups, Item results, below-minimum cancels) and every other module's wrapper still runs.
 * Only then is the returned result turned into a miscast card.
 */
async function formatChatRollWrapper(wrapped, table, options = {}, column = null, ...rest) {
  const fixed = fixCritLocation(table, options);
  if (fixed) ({ table, options } = fixed);
  const T = game.wfrp4e.tables;
  const key = typeof table === "string" ? T.generalizeTable(table) : null;
  if (!key || !MISCAST_KEYS.includes(key) || !game.settings.get(MODULE_ID, "enabled")) return wrapped(table, options, column, ...rest);

  const tableObject = T.findTable(key, column);
  if (!(tableObject instanceof RollTable) || tableObject.columns) return wrapped(table, options, column, ...rest); // column prompt etc.

  const rolled = await wrapped(table, { ...options, returnResult: true }, column, ...rest);
  // null: the system posted an Item result itself. A string: a cancel/notice. Neither is ours.
  if (!rolled || typeof rolled !== "object") return rolled;
  const plain = () => (options.returnResult ? rolled : rolled.result);

  const result = rolledResult(tableObject, rolled);
  const built = result ? await buildMiscast(tableObject, result, { roll: rolled.roll, messageId: options.messageId }) : null;
  if (!built) return plain(); // "no effect" rows keep the system's output
  await postMiscastCard(built, tableObject);
  // Callers: the table-link click posts a non-empty return, /table (returnResult) skips a falsy
  // one, and rollToChat (returnObject) reads `.result`. Nothing more to post in any of them.
  return options.returnObject ? { result: "" } : null;
}

/* ------------------------------------------------------------------------------------------ */
/* Wiring                                                                                       */
/* ------------------------------------------------------------------------------------------ */

let originalFormatChatRoll = null;

export function wire() {
  const tables = game.wfrp4e?.tables;
  if (!tables?.formatChatRoll) {
    console.warn(`${MODULE_ID} | game.wfrp4e.tables.formatChatRoll not found; miscast cards disabled.`);
  }
  else if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    globalThis.libWrapper.register(MODULE_ID, "game.wfrp4e.tables.formatChatRoll", formatChatRollWrapper, "WRAPPER");
  }
  else {
    originalFormatChatRoll = tables.formatChatRoll;
    tables.formatChatRoll = function (...args) {
      return formatChatRollWrapper(originalFormatChatRoll.bind(this), ...args);
    };
  }
  installReplay();
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on(`${game.system.id}:dropCustomData`, onDropCustomData);
  Hooks.on("dropActorSheetData", onDropActorSheetData);
  Hooks.on("dropCanvasData", onDropCanvasData);
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { rollMiscast, buildMiscast, preRoll, witchlight, witchlightChoice, actorMagic, soulpyreLore, soulpyreNote, applyLoreAttribute, openSelectDialog, miscastTables, applyMiscast, promptForget, promptChoice, identifyTable, MISCAST_KEYS };
}

Hooks.once("setup", wire);

/**
 * "Manually Select Miscast": pick a miscast table and one of its results, and post the same
 * card a natural roll of that result would (pre-rolled dice, drag to apply, area placement,
 * narrative cards, table links). Meant for testing; GM only.
 */
import { MODULE_ID, MISCAST_KEYS } from "./miscast-data.mjs";
import { rollMiscast, identifyTable, parseResult } from "./miscasts.mjs";

const i18n = (k, d) => game.i18n.format(k, d ?? {});
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const SOURCE_ORDER = ["core", "wom", "moo", "other"];
const KEY_ORDER = ["minormis", "majormis", "catastrophicmis", "grimoire-miscast"];

/**
 * Every installed miscast table: world tables with a miscast key, plus compendium tables with a
 * miscast key that the world hasn't imported (same name and source).
 * @returns {Promise<{uuid: string, label: string, source: string, key: string}[]>}
 */
export async function miscastTables() {
  const list = [];
  const seen = new Set();
  const add = (table, pack = null) => {
    const { source, key } = identifyTable(table);
    if (!MISCAST_KEYS.includes(key)) return;
    const id = `${source}|${table.name}`;
    if (seen.has(id)) return;
    seen.add(id);
    const where = pack ? ` [${pack.metadata.label}]` : "";
    list.push({ uuid: table.uuid, source, key, label: `${table.name}${/\(.+\)/.test(table.name) ? "" : ` (${i18n(`WFAM.Source.${source}`)})`}${where}` });
  };
  for (const t of game.tables) add(t);
  for (const pack of game.packs.filter(p => p.documentName === "RollTable")) {
    let index;
    try { index = await pack.getIndex({ fields: ["flags.wfrp4e.key"] }); } catch { continue; }
    for (const e of index) {
      if (!MISCAST_KEYS.includes(e.flags?.wfrp4e?.key)) continue;
      const table = await pack.getDocument(e._id).catch(() => null);
      if (table) add(table, pack);
    }
  }
  const rank = (arr, v) => (arr.indexOf(v) + 1 || arr.length + 1);
  return list.sort((a, b) => rank(SOURCE_ORDER, a.source) - rank(SOURCE_ORDER, b.source)
    || rank(KEY_ORDER, a.key) - rank(KEY_ORDER, b.key) || a.label.localeCompare(b.label));
}

/** Result options for a table: value = the roll that gives it (low end of its range). */
function resultOptions(table) {
  return table.results.contents
    .slice().sort((a, b) => a.range[0] - b.range[0])
    .map(r => {
      const [lo, hi] = r.range;
      let name = parseResult(r).name;
      if (!name) name = String(r.name || r.description || "").replace(/<[^>]+>/g, "").trim().slice(0, 60);
      return { value: lo, label: `${lo === hi ? lo : `${lo}–${hi}`}: ${name}` };
    });
}

/** Actors the caster can be: selected tokens, the user's character, then every owned actor. */
function casterOptions() {
  const out = [];
  const seen = new Set();
  const add = (actor, label) => {
    if (!actor || seen.has(actor.uuid)) return;
    seen.add(actor.uuid);
    out.push({ value: actor.uuid, label: label ?? actor.name });
  };
  for (const t of canvas?.tokens?.controlled ?? []) add(t.actor, `${t.name} (${i18n("WFAM.Select.SelectedToken")})`);
  if (game.user.character) add(game.user.character);
  for (const a of game.actors.contents.filter(a => a.isOwner).sort((a, b) => a.name.localeCompare(b.name))) add(a);
  return out;
}

const options = (list, selected) => list.map(o => `<option value="${esc(o.value)}"${String(o.value) === String(selected) ? " selected" : ""}>${esc(o.label)}</option>`).join("");

/**
 * Open the dialog. Optional defaults: {table: uuid|RollTable, actor: uuid|Actor}.
 * @returns {Promise<ChatMessage|null>} the posted card (null for system-posted or cancelled)
 */
export async function openSelectDialog({ table: tableRef, actor: actorRef } = {}) {
  if (!game.user.isGM) {
    ui.notifications.warn(i18n("WFAM.Select.GMOnly"));
    return null;
  }
  const tables = await miscastTables();
  if (!tables.length) {
    ui.notifications.warn(i18n("WFAM.Select.NoTables"));
    return null;
  }
  const docs = new Map();
  const getTable = async uuid => {
    if (!docs.has(uuid)) docs.set(uuid, await fromUuid(uuid));
    return docs.get(uuid);
  };
  const firstUuid = (tableRef?.uuid ?? tableRef) && tables.some(t => t.uuid === (tableRef?.uuid ?? tableRef)) ? (tableRef.uuid ?? tableRef) : tables[0].uuid;
  const first = await getTable(firstUuid);
  const casters = casterOptions();
  // Default caster: the given actor, else a selected token, else the user's character, else none.
  const casterDefault = actorRef?.uuid ?? actorRef ?? canvas?.tokens?.controlled?.[0]?.actor?.uuid ?? game.user.character?.uuid ?? "";

  const content = `<div class="wfam-select">
  <p class="hint">${i18n("WFAM.Select.Hint")}</p>
  <div class="form-group"><label>${i18n("WFAM.Select.Table")}</label>
    <select name="table">${options(tables.map(t => ({ value: t.uuid, label: t.label })), firstUuid)}</select></div>
  <div class="form-group"><label>${i18n("WFAM.Select.Result")}</label>
    <select name="result">${options(resultOptions(first))}</select></div>
  <div class="form-group"><label>${i18n("WFAM.Select.Caster")}</label>
    <select name="caster"><option value="">${i18n("WFAM.Select.NoCaster")}</option>${options(casters, casterDefault)}</select></div>
</div>`;

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: i18n("WFAM.Select.Title"), icon: "fa-solid fa-wand-sparkles" },
    position: { width: 520 },
    content,
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element ?? event?.target?.element;
      const tableSel = root.querySelector("select[name=table]");
      const resultSel = root.querySelector("select[name=result]");
      tableSel.addEventListener("change", async () => {
        const t = await getTable(tableSel.value);
        resultSel.innerHTML = t ? options(resultOptions(t)) : "";
      });
    },
    buttons: [
      {
        action: "post",
        label: i18n("WFAM.Select.Post"),
        icon: "fa-solid fa-comment",
        default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          return { table: f.table.value, result: Number(f.result.value), caster: f.caster.value || null };
        }
      },
      { action: "cancel", label: i18n("Cancel"), icon: "fa-solid fa-xmark" }
    ]
  });
  if (!choice || typeof choice !== "object") return null;
  const table = await getTable(choice.table);
  if (!table) return null;
  return rollMiscast(table, { lookup: choice.result, showRoll: false, actor: choice.caster ?? undefined });
}

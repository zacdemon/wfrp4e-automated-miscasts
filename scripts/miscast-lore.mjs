/**
 * A caster's Lore(s) and the colour of their magic, for lore-coloured miscasts (Witchlight).
 *
 * Colours for the eight Lores of the Winds, Necromancy and Daemonology are the values the
 * wfrp4e system's own Witchlight script uses. The rest are this module's choices: some from the
 * user's brief (High, Tzeentch, Nurgle / Plague), the others marked "placeholder" until confirmed.
 * Lores with several shades pick one with a die rolled on the card (`shade`), so the card and the
 * drop agree.
 */

/** key -> { colours: [[hex, name], ...], name?, animation?, aliases?, source } */
export const LORE_COLOURS = {
  // wfrp4e system Witchlight / Soulfire colours (the Winds' colours)
  fire: { colours: [["#b22222", "Aqshy red"]], source: "system" },
  heavens: { colours: [["#87ceeb", "Azyr sky blue"]], source: "system" },
  metal: { colours: [["#ee9b3a", "Chamon molten gold"]], source: "system" },
  shadow: { colours: [["#808080", "Ulgu grey"]], source: "system" },
  life: { colours: [["#008000", "Ghyran green"]], source: "system" },
  beasts: { colours: [["#a52a2a", "Ghur brown"]], source: "system" },
  light: { colours: [["#f0ffff", "Hysh brilliant white"]], source: "system" },
  death: { colours: [["#800080", "Shyish purple"]], source: "system" },
  necromancy: { colours: [["#800080", "necromantic purple"]], source: "system" },
  daemonology: { colours: [["#8b0000", "daemonic dark red"]], source: "system" },
  // From the brief
  high: {
    colours: [["#ff0000", "red"], ["#ff7f00", "orange"], ["#ffff00", "yellow"], ["#00ff00", "green"], ["#0000ff", "blue"], ["#4b0082", "indigo"], ["#8f00ff", "violet"]],
    name: "every colour of the rainbow", animation: "rainbowswirl", aliases: ["qhaysh", "highmagic"], source: "brief"
  },
  tzeentch: { colours: [["#1e90ff", "incandescent blue"], ["#00e5ff", "incandescent cyan"], ["#8a2be2", "blue-violet"], ["#b14cff", "incandescent purple"]], source: "brief" },
  nurgle: { colours: [["#9acd32", "sickly yellow-green"], ["#6b8e23", "bilious olive"], ["#a4c639", "pus green"]], source: "brief" },
  plague: { colours: [["#9acd32", "sickly yellow-green"], ["#6b8e23", "bilious olive"], ["#a4c639", "pus green"]], source: "brief" },
  // Confident
  slaanesh: { colours: [["#ff69b4", "hot pink"], ["#da70d6", "orchid"], ["#e6a8d7", "pale lilac"]], source: "confident" },
  waaagh: { colours: [["#39ff14", "Waaagh! green"]], aliases: ["littlewaaagh", "bigwaaagh", "waagh"], source: "confident" },
  // Placeholders, to be confirmed by the user
  undivided: { colours: [["#c00000", "Khorne red"], ["#9acd32", "Nurgle green"], ["#1e90ff", "Tzeentch blue"], ["#ff69b4", "Slaanesh pink"]], aliases: ["chaos", "chaosundivided"], source: "placeholder" },
  hedgecraft: { colours: [["#4f7942", "fern green"]], aliases: ["hedge"], source: "placeholder" },
  witchcraft: { colours: [["#5fd3b3", "corpse-candle green"]], aliases: ["witch"], source: "placeholder" },
  ruin: { colours: [["#7fff00", "warpstone green"]], source: "placeholder" },
  stealth: { colours: [["#6e7f6e", "murky grey-green"]], source: "placeholder" },
  greatmaw: { colours: [["#c0392b", "raw-meat red"]], aliases: ["maw", "gutmagic", "gut"], source: "placeholder" }
};

/** Magic but no Lore: a colour no Lore uses, picked with a die rolled on the card. */
export const NO_LORE_COLOURS = [["#008080", "teal"], ["#40e0d0", "turquoise"], ["#ff7f50", "coral"], ["#ffdab9", "peach"], ["#7fffd4", "aquamarine"]];
/** No magic at all. */
export const NO_MAGIC_COLOUR = ["#bdbdb5", "dull white"];

const norm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\b(the|lore|lores|of|magic|magick)\b/g, "").replace(/[^a-z]/g, "");

/** Map from normalised name -> lore key: keys, the system's lore labels and wind names, aliases. */
function aliasMap() {
  const cfg = game.wfrp4e?.config ?? {};
  const loc = k => (k ? game.i18n.localize(k) : "");
  const map = new Map();
  const add = (name, key) => { const n = norm(name); if (n && !map.has(n)) map.set(n, key); };
  for (const key of Object.keys(LORE_COLOURS)) add(key, key);
  for (const [key, label] of Object.entries(cfg.magicLores ?? {})) if (key !== "petty") add(loc(label), key);
  for (const [key, wind] of Object.entries(cfg.magicWind ?? {})) {
    const w = loc(wind);
    if (key !== "petty" && w && !["none", "dhar"].includes(norm(w))) add(w, key); // Dhar is shared by six lores
  }
  for (const [key, l] of Object.entries(LORE_COLOURS)) for (const a of l.aliases ?? []) add(a, key);
  return map;
}

const spec = name => String(name ?? "").match(/\(([^)]+)\)\s*$/)?.[1] ?? "";

/**
 * The actor's magic: {hasMagic, lores: [key...], unknown: [label...]}.
 * Lores come from spells (petty and "any lore" spells don't count), Arcane / Chaos Magic talents
 * ("Arcane Magic (Fire)"), Witch! (Witchcraft), the Spellcaster trait and Channelling skills.
 */
export function actorMagic(actor) {
  const map = aliasMap();
  const lores = new Set();
  const unknown = new Set();
  let hasMagic = false;
  const take = raw => {
    for (const part of [].concat(raw ?? [])) {
      const n = norm(part);
      if (!n || n === "petty" || n.startsWith("any") || n === "none") continue;
      const key = map.get(n);
      if (key) lores.add(key); else unknown.add(String(part));
    }
  };
  for (const s of actor?.itemTypes?.spell ?? []) { hasMagic = true; take(s.system?.lore?.value); }
  for (const t of actor?.itemTypes?.talent ?? []) {
    const name = t.name ?? "";
    if (/^(arcane magic|chaos magic)\b/i.test(name)) { hasMagic = true; take(t.system?.specification?.value || spec(name)); }
    else if (/^petty magic\b/i.test(name)) hasMagic = true;
    else if (/^witch!?\s*$/i.test(name.replace(/\(.*\)/, "").trim())) { hasMagic = true; lores.add("witchcraft"); }
  }
  for (const t of actor?.itemTypes?.trait ?? []) {
    if (/^spellcaster\b/i.test(t.name ?? "")) { hasMagic = true; const sp = t.system?.specification?.value || spec(t.name); if (norm(sp) !== "") take(sp); }
  }
  for (const s of actor?.itemTypes?.skill ?? []) {
    if (/^channell?ing\b/i.test(s.name ?? "")) { hasMagic = true; take(spec(s.name)); }
  }
  return { hasMagic, lores: [...lores].sort(), unknown: [...unknown] };
}

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = rgb => "#" + rgb.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
/** Blend colours as light: average in linear RGB, then re-gamma (keeps mixed light bright). */
export function blend(colours) {
  const lin = v => Math.pow(v / 255, 2.2);
  const avg = [0, 1, 2].map(i => colours.reduce((a, c) => a + lin(hex(c)[i]), 0) / colours.length);
  return toHex(avg.map(v => 255 * Math.pow(v, 1 / 2.2)));
}

const loreLabel = key => {
  const l = game.wfrp4e?.config?.magicLores?.[key];
  return l ? game.i18n.localize(l) : key.charAt(0).toUpperCase() + key.slice(1);
};

/**
 * Witchlight colour for an actor.
 * @param {Actor} actor
 * @param {{shade: number, pick: number}} dice two 1d1000 results rolled on the card
 * @returns {{kind: string, colour: string, colourName: string, animation: string, specifier: string, lores: object[]}}
 */
export function witchlight(actor, { shade = 1, pick = 1 } = {}) {
  const magic = actorMagic(actor);
  if (!magic.hasMagic) return { kind: "nomagic", colour: NO_MAGIC_COLOUR[0], colourName: NO_MAGIC_COLOUR[1], animation: "fog", specifier: game.i18n.localize("WFAM.Light.NoMagic"), lores: [] };
  if (!magic.lores.length) {
    const [colour, colourName] = NO_LORE_COLOURS[(pick - 1) % NO_LORE_COLOURS.length];
    return { kind: "nolore", colour, colourName, animation: "fog", specifier: game.i18n.localize("WFAM.Light.NoLore"), lores: [], unknown: magic.unknown };
  }
  const lores = magic.lores.map((key, i) => {
    const pal = LORE_COLOURS[key].colours;
    const [colour, shadeName] = pal[(shade - 1 + i) % pal.length];
    const colourName = LORE_COLOURS[key].name ?? shadeName; // High: the light cycles the rainbow
    return { key, label: loreLabel(key), colour, colourName, animation: LORE_COLOURS[key].animation };
  });
  const specifier = lores.map(l => l.label).join(" & ");
  if (lores.length === 1) return { kind: "lore", colour: lores[0].colour, colourName: lores[0].colourName, animation: lores[0].animation ?? "fog", specifier, lores };
  const names = lores.map(l => l.colourName);
  const colourName = game.i18n.format("WFAM.Light.Swirling", { colours: names.slice(0, -1).join(", ") + " " + game.i18n.localize("WFAM.Light.And") + " " + names.at(-1) });
  return { kind: "lores", colour: blend(lores.map(l => l.colour)), colourName, animation: "fog", specifier, lores };
}

/* ------------------------------------------------------------------------------------------ */
/* Lore attributes (Soulpyre)                                                                   */
/* ------------------------------------------------------------------------------------------ */

/**
 * How each Lore's attribute is handled when Soulpyre's damage hits a creature in range.
 * The attribute definitions are the system's (game.wfrp4e.config.loreEffects, filled in by
 * wfrp4e-core); the "auto" ones mirror the system's own "target" lore scripts. The others are
 * caster-side or spell-damage riders that an aura can't apply, so the GM gets the Lore's text.
 * Lores the system gives no attribute to (Necromancy, Daemonology, Chaos, High, ...) do nothing.
 */
export const LORE_ATTRIBUTES = {
  death: { auto: "fatigued" },
  fire: { auto: "ablaze" },
  light: { auto: "blinded" },
  witchcraft: { auto: "bleeding" },
  life: { auto: "life" },
  beasts: { note: "WFAM.Pyre.NoteCaster" },
  heavens: { note: "WFAM.Pyre.NoteArmour" },
  metal: { note: "WFAM.Pyre.NoteArmour" },
  shadow: { note: "WFAM.Pyre.NoteArmour" },
  hedgecraft: { note: "WFAM.Pyre.NoteNothing" }
};

/**
 * The Lore whose attribute a caster's Soulpyre carries. Several Lores: one picked with `pick`
 * (1d1000 rolled on the card). Returns null with no Lore or no magic.
 */
export function soulpyreLore(actor, pick = 1) {
  const { lores } = actorMagic(actor);
  if (!lores.length) return null;
  const key = lores[(pick - 1) % lores.length];
  const def = LORE_ATTRIBUTES[key];
  const sys = !!game.wfrp4e?.config?.loreEffects?.[key];
  const condition = def?.auto && def.auto !== "life" ? condName(def.auto) : null;
  return {
    key,
    label: loreLabel(key),
    automated: !!def?.auto && sys,
    attribute: def?.auto ?? null,
    condition,
    note: def?.note ?? (sys ? "WFAM.Pyre.NoteNothing" : "WFAM.Pyre.NoteNone"),
    of: lores.length
  };
}

/** GM-facing text for a Lore Soulpyre doesn't automate. */
export function soulpyreNote(pyre, effectName) {
  const desc = game.wfrp4e?.config?.loreEffectDescriptions?.[pyre.key] ?? "";
  const why = game.i18n.localize(pyre.automated ? "WFAM.Pyre.NoteAuto" : pyre.note);
  return `<p><b>${effectName}</b> — ${game.i18n.format("WFAM.Pyre.NoteHead", { lore: pyre.label })}</p><p><i>${why}</i></p>${desc ? `<p>${desc}</p>` : ""}`;
}

const condName = c => game.i18n.localize(`WFRP4E.ConditionName.${c.charAt(0).toUpperCase()}${c.slice(1)}`);
const hasTrait = (actor, key) => actor.has?.(game.i18n.localize(key));
const hasLoreTalent = (actor, key) => {
  const map = aliasMap();
  return (actor.itemTypes?.talent ?? []).some(t => /^arcane magic\b/i.test(t.name ?? "") && map.get(norm(t.system?.specification?.value || spec(t.name))) === key);
};

/**
 * Apply a Lore attribute to a creature caught by Soulpyre (called each time its damage lands).
 * Mirrors the system's lore scripts, plus the riders in the Lore descriptions (Fire / Light don't
 * affect casters of that Lore; Death only keeps one Fatigued from this source at a time).
 * @returns {Promise<string|null>} what happened, for the chat
 */
export async function applyLoreAttribute(target, caster, key, effect) {
  const f = (k, d = {}) => game.i18n.format(k, { actor: target.name, ...d });
  const IGNORE_ALL = game.wfrp4e.config.DAMAGE_TYPE.IGNORE_ALL;
  const undead = hasTrait(target, "NAME.Undead");
  const daemonic = hasTrait(target, "NAME.Daemonic");
  switch (LORE_ATTRIBUTES[key]?.auto) {
    case "fatigued": {
      if (undead) return f("WFAM.Pyre.NotLiving");
      const mid = "wfrp4e-automated-miscasts";
      if (effect?.getFlag?.(mid, "loreFatigued") && target.hasCondition("fatigued")) return f("WFAM.Pyre.AlreadyFatigued");
      await target.addCondition("fatigued");
      if (effect?.id && target.effects.get(effect.id)) await effect.setFlag(mid, "loreFatigued", true);
      return f("WFAM.Pyre.Gains", { condition: condName("fatigued") });
    }
    case "ablaze":
      if (hasLoreTalent(target, "fire")) return f("WFAM.Pyre.Immune", { lore: loreLabel("fire") });
      await target.addCondition("ablaze");
      return f("WFAM.Pyre.Gains", { condition: condName("ablaze") });
    case "blinded": {
      if (hasLoreTalent(target, "light")) return f("WFAM.Pyre.Immune", { lore: loreLabel("light") });
      await target.addCondition("blinded");
      let out = f("WFAM.Pyre.Gains", { condition: condName("blinded") });
      if ((undead || daemonic) && caster) out += " " + await target.applyBasicDamage(caster.system.characteristics.int.bonus, { damageType: IGNORE_ALL, suppressMsg: true });
      return out;
    }
    case "bleeding":
      await target.addCondition("bleeding");
      return f("WFAM.Pyre.Gains", { condition: condName("bleeding") });
    case "life":
      if (undead) return caster ? await target.applyBasicDamage(caster.system.characteristics.wp.bonus, { damageType: IGNORE_ALL, suppressMsg: true }) : null;
      if (daemonic) return null;
      await target.hasCondition("bleeding")?.delete();
      await target.hasCondition("fatigued")?.delete();
      return f("WFAM.Pyre.Cleansed");
    default:
      return null;
  }
}

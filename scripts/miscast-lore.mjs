/**
 * A caster's Lore(s) and the colour of their magic, for lore-coloured miscasts (Witchlight).
 *
 * Colours for the eight Lores of the Winds, Necromancy and Daemonology are the values the
 * wfrp4e system's own Witchlight script uses. The rest are this module's choices: some from the
 * user's brief (High, Tzeentch, Nurgle / Plague) or picked by the user ("user").
 * Lores with several shades pick one with a die rolled on the card (`shade`), so the card and the
 * drop agree.
 */

/** key -> { colours: [[hex, name], ...], name?, animation?, aliases?, source } */
export const LORE_COLOURS = {
  // wfrp4e system Witchlight / Soulfire colours (the Winds' colours)
  fire: { colours: [["#b22222", "Aqshy red"]], animation: "torch", source: "system" },
  heavens: { colours: [["#87ceeb", "Azyr sky blue"]], animation: "starlight", source: "system" },
  metal: { colours: [["#ee9b3a", "Chamon molten gold"]], animation: "energy", source: "system" },
  shadow: { colours: [["#808080", "Ulgu grey"]], animation: "smokepatch", source: "system" },
  life: { colours: [["#008000", "Ghyran green"]], animation: "wave", source: "system" },
  beasts: { colours: [["#a52a2a", "Ghur brown"]], animation: "pulse", source: "system" },
  light: { colours: [["#f0ffff", "Hysh brilliant white"]], animation: "sunburst", source: "system" },
  death: { colours: [["#800080", "Shyish purple"]], animation: "ghost", source: "system" },
  necromancy: { colours: [["#800080", "necromantic purple"]], animation: "fog", source: "system" },
  daemonology: { colours: [["#8b0000", "daemonic dark red"]], animation: "hexa", source: "system" },
  // From the user
  high: {
    colours: [["#ff0000", "red"], ["#ff7f00", "orange"], ["#ffff00", "yellow"], ["#00ff00", "green"], ["#0000ff", "blue"], ["#4b0082", "indigo"], ["#8f00ff", "violet"]],
    name: "every colour of the rainbow", animation: "rainbowswirl", aliases: ["qhaysh", "highmagic"], source: "user"
  },
  tzeentch: { colours: [["#1f8fff", "incandescent blue"]], animation: "vortex", source: "user" },
  nurgle: { colours: [["#9acd32", "sickly yellow-green"], ["#6b8e23", "bilious olive"], ["#a4c639", "pus green"]], animation: "fog", source: "user" },
  plague: { colours: [["#9acd32", "sickly yellow-green"], ["#6b8e23", "bilious olive"], ["#a4c639", "pus green"]], animation: "fog", source: "user" },
  dark: { colours: [["#9d00ff", "intense dark purple"]], animation: "emanation", aliases: ["darkmagic", "druchii", "druchiimagic"], source: "user" },
  bigwaaagh: { colours: [["#00c853", "Waaagh! emerald"]], animation: "energy", aliases: ["waaagh", "waagh", "bigwaagh"], source: "user" },
  littlewaaagh: { colours: [["#b2f2a0", "pale grot green"]], animation: "flame", aliases: ["littlewaagh"], source: "user" },
  hedgecraft: { colours: [["#4f7942", "fern green"]], animation: "dome", aliases: ["hedge"], source: "user" },
  witchcraft: { colours: [["#5b3f6e", "murky violet"]], animation: "witchwave", aliases: ["witch"], source: "user" },
  ruin: { colours: [["#7fff00", "warpstone green"]], animation: "grid", source: "user" },
  stealth: { colours: [["#6e7f6e", "murky grey-green"]], animation: "smokepatch", source: "user" },
  greatmaw: { colours: [["#c0392b", "raw-meat red"]], animation: "pulse", aliases: ["maw", "gutmagic", "gut"], source: "user" },
  // Confident picks
  slaanesh: { colours: [["#ff69b4", "hot pink"], ["#da70d6", "orchid"], ["#e6a8d7", "pale lilac"]], animation: "wave", source: "confident" },
  undivided: { colours: [["#c00000", "Khorne red"], ["#9acd32", "Nurgle green"], ["#1e90ff", "Tzeentch blue"], ["#ff69b4", "Slaanesh pink"]], animation: "chroma", aliases: ["chaos", "chaosundivided"], source: "confident" }
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

const loreLabel = key => {
  const l = game.wfrp4e?.config?.magicLores?.[key];
  return l ? game.i18n.localize(l) : key.charAt(0).toUpperCase() + key.slice(1);
};

/** One Lore's Witchlight: {key, label, colour, colourName, animation}. */
export function loreLight(key, shade = 1) {
  const l = LORE_COLOURS[key];
  const [colour, shadeName] = l.colours[(shade - 1) % l.colours.length];
  return { key, label: loreLabel(key), colour, colourName: l.name ?? shadeName, animation: l.animation ?? "fog" };
}

/**
 * Witchlight colour for an actor.
 * kind "lore": one Lore. kind "lores": several, the character picks one (`lores`), and
 * `fallback` is the one picked by the card's die if nobody answers.
 * @param {Actor} actor
 * @param {{shade: number, pick: number}} dice two 1d1000 results rolled on the card
 */
export function witchlight(actor, { shade = 1, pick = 1 } = {}) {
  const magic = actorMagic(actor);
  if (!magic.hasMagic) return { kind: "nomagic", colour: NO_MAGIC_COLOUR[0], colourName: NO_MAGIC_COLOUR[1], animation: "fog", specifier: game.i18n.localize("WFAM.Light.NoMagic"), lores: [] };
  if (!magic.lores.length) {
    const [colour, colourName] = NO_LORE_COLOURS[(pick - 1) % NO_LORE_COLOURS.length];
    return { kind: "nolore", colour, colourName, animation: "fog", specifier: game.i18n.localize("WFAM.Light.NoLore"), lores: [], unknown: magic.unknown };
  }
  const lores = magic.lores.map(key => loreLight(key, shade));
  if (lores.length === 1) return { kind: "lore", ...lores[0], specifier: lores[0].label, lores };
  const fallback = lores[(pick - 1) % lores.length];
  return { kind: "lores", colour: null, colourName: null, animation: null, specifier: lores.map(l => l.label).join(" / "), lores, fallback };
}

/** The final light once a Lore is chosen (or the only one). */
export function witchlightChoice(light, key) {
  if (light.kind !== "lores") return light;
  const l = light.lores.find(x => x.key === key) ?? light.fallback;
  return { kind: "lore", ...l, specifier: l.label, lores: [l], chosen: true };
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
  life: { note: "WFAM.Pyre.NoteLife" },
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
  const condition = def?.auto ? condName(def.auto) : null;
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
 * Apply a Lore attribute to the caster or a creature caught by Soulpyre (called each time its damage lands).
 * Mirrors the system's lore scripts, plus the riders in the Lore descriptions (Fire / Light don't
 * affect casters of that Lore; Death only keeps one Fatigued from this source at a time).
 * @returns {Promise<string|null>} what happened, for the chat
 */
export async function applyLoreAttribute(target, caster, key, effect) {
  // The caster suffers their own Soulpyre too; a Fire or Light caster is by definition a caster
  // of that Lore, so they're spared Ablaze / Blinded as the Lore rules say.
  const ownLore = l => hasLoreTalent(target, l) || (caster && target.uuid === caster.uuid && key === l);
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
      if (ownLore("fire")) return f("WFAM.Pyre.Immune", { lore: loreLabel("fire") });
      await target.addCondition("ablaze");
      return f("WFAM.Pyre.Gains", { condition: condName("ablaze") });
    case "blinded": {
      if (ownLore("light")) return f("WFAM.Pyre.Immune", { lore: loreLabel("light") });
      await target.addCondition("blinded");
      let out = f("WFAM.Pyre.Gains", { condition: condName("blinded") });
      if ((undead || daemonic) && caster) out += " " + await target.applyBasicDamage(caster.system.characteristics.int.bonus, { damageType: IGNORE_ALL, suppressMsg: true });
      return out;
    }
    case "bleeding":
      await target.addCondition("bleeding");
      return f("WFAM.Pyre.Gains", { condition: condName("bleeding") });
    default:
      return null;
  }
}

/**
 * Roll a miscast's dice once, when its card is posted, and reuse those results when the card is
 * dropped on an actor.
 *
 * - Card time: the effect's immediate scripts are scanned for `new Roll("<formula>")` calls (core,
 *   Winds of Magic and this module's own scripts all roll that way), and the card text for inline
 *   rolls (`[[1d10]]`, `[[/r 1d10]]`). Each is rolled once. Inline rolls share dice with the script
 *   roll they describe (same dice, in order), and are replaced with static roll results on the card.
 * - The results are stored on the card's effect (`flags[MODULE_ID].rolls`).
 * - Drop time: while that effect's immediate scripts run, a Roll whose dice match the next stored
 *   roll (e.g. 1d10) takes the stored dice instead of rolling. Other rolls (tests, table rolls)
 *   are untouched. Nothing from the scripts is copied; they run unchanged.
 * - Where a result's text gives a rolled duration ("for [[1d10]] hours") but its effect has no
 *   duration and no script that sets one, the rolled duration is put on the effect.
 */
import { MODULE_ID } from "./miscast-data.mjs";

const FLAG = "rolls";
const clone = v => foundry.utils.deepClone(v);

/** Source of a script entry, resolving the system's "[Script.id]" references. */
export function scriptSource(script) {
  const s = String(script ?? "");
  const m = s.match(/^\s*\[Script\.(\w+)\]\s*$/);
  return m ? (game.wfrp4e?.config?.effectScripts?.[m[1]] ?? "") : s;
}

/** Dice signature of a Roll (evaluated or not): "1d10", "2d10", "1d10+1d6". */
export function diceSig(roll) {
  return roll.dice.map(d => `${d.number}d${d.faces}`).join("+");
}

/** Formulas rolled by an effect's immediate scripts, in order, with a label for each. */
export function scriptRolls(effect) {
  const out = [];
  for (const s of effect?.system?.scriptData ?? []) {
    if (s.trigger !== "immediate") continue;
    const src = scriptSource(s.script);
    const re = /new\s+Roll\(\s*(["'`])(.*?)\1/g;
    let m;
    const found = [];
    while ((m = re.exec(src))) found.push({ formula: m[2], at: m.index });
    found.forEach((f, i) => {
      if (f.formula.includes("${") || f.formula.includes("@")) return; // depends on the actor: rolled at drop
      const until = found[i + 1]?.at ?? src.length;
      const flavor = src.slice(f.at, until).match(/flavor\s*:\s*(["'`])(.*?)\1/)?.[2];
      // "let duration = await new Roll(...)" says more than a script label like "Choose Limb".
      const variable = src.slice(0, f.at).match(/(?:let|const|var)\s+(\w+)\s*=\s*(?:await\s+)?\(?\s*$/)?.[1];
      const named = variable && !/^(roll|r|result|res|formula|number|num|amount|value|total|dice)\d*$/i.test(variable)
        ? variable.charAt(0).toUpperCase() + variable.slice(1).replace(/([a-z])([A-Z])/g, "$1 $2") : null;
      out.push({ formula: f.formula, label: flavor || named || s.label || "" });
    });
  }
  return out;
}

/** True when an immediate script already sets the effect's duration. */
function scriptSetsDuration(effect) {
  return (effect?.system?.scriptData ?? []).some(s => s.trigger === "immediate" && /duration/.test(scriptSource(s.script)));
}

const diceResults = roll => roll.dice.map(d => clone(d.results));

/** Give a not-yet-evaluated Roll the stored dice results. */
function injectDice(roll, dice) {
  const terms = roll.dice;
  if (!terms.length || terms.length !== dice.length || terms.some((d, i) => !Array.isArray(dice[i]) || dice[i].length < (Number(d.number) || 0))) return false;
  terms.forEach((d, i) => { d.results = clone(dice[i]); d._evaluated = true; });
  return true;
}

async function rollWith(formula, dice) {
  const roll = new Roll(formula);
  if (dice) injectDice(roll, dice);
  await roll.evaluate({ allowInteractive: false });
  return roll;
}

const INLINE = /\[\[(?:\s*\/(?:r|roll|gmr|br|sr)\s+)?([^\]]+?)\]\](?:\{([^}]*)\})?/gi;
const UNITS = { hour: "hours", hours: "hours", round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", day: "days", days: "days" };

/**
 * Pre-roll a built miscast: fills built.rolls (shown on the card), replaces inline rolls in the
 * description with their results, and stores the dice on the effect for the drop.
 */
export async function preRoll(built) {
  const effect = built.effect;
  const pool = [];
  const rolls = [];
  for (const { formula, label } of effect ? scriptRolls(effect) : []) {
    let roll;
    try { roll = await rollWith(formula); } catch (e) { continue; }
    const entry = { formula, label, sig: diceSig(roll), dice: diceResults(roll), total: roll.total, used: false };
    pool.push(entry);
    rolls.push(entry);
  }

  let duration = null;
  const wantDuration = effect && !Number.isFinite(effect.duration?.value) && !scriptSetsDuration(effect);
  const parts = [];
  let last = 0;
  let html = String(built.description ?? "");
  for (const m of html.matchAll(INLINE)) {
    const formula = m[1].replace(/#.*$/, "").trim();
    let roll = null;
    try {
      const probe = new Roll(formula);
      const sig = diceSig(probe);
      if (!sig) throw new Error("no dice");
      const shared = pool.find(p => !p.used && p.sig === sig);
      if (shared) shared.used = true;
      roll = await rollWith(formula, shared?.dice);
      const after = html.slice(m.index + m[0].length).match(/^\s*([a-z]+)/i)?.[1]?.toLowerCase();
      if (wantDuration && !duration && UNITS[after]) duration = { value: roll.total, units: UNITS[after] };
    } catch (e) { roll = null; }
    parts.push(html.slice(last, m.index));
    parts.push(roll ? roll.toAnchor({ classes: ["inline-result", "wfam-rolled"], label: m[2] || undefined }).outerHTML : m[0]);
    last = m.index + m[0].length;
  }
  parts.push(html.slice(last));
  built.description = parts.join("");

  if (effect) {
    if (duration) {
      effect.duration = { ...(effect.duration ?? {}), value: duration.value, units: duration.units };
      built.rolledDuration = duration;
    }
    if (effect.description) effect.description = built.description;
    foundry.utils.setProperty(effect, `flags.${MODULE_ID}.${FLAG}`, rolls.map(({ formula, label, sig, dice, total }) => ({ formula, label, sig, dice, total })));
  }
  built.rolls = rolls.map(({ formula, label, total }) => ({ formula, label, total }));
  return built;
}

/* ------------------------------------------------------------------------------------------ */
/* Replay at drop time                                                                          */
/* ------------------------------------------------------------------------------------------ */

const contexts = [];
let paused = 0;

function takeStored(roll) {
  if (paused || !contexts.length || roll._root) return null;
  const sig = diceSig(roll);
  if (!sig) return null;
  for (let c = contexts.length - 1; c >= 0; c--) {
    const i = contexts[c].findIndex(e => e.sig === sig);
    if (i >= 0) return contexts[c].splice(i, 1)[0];
  }
  return null;
}

function beforeEvaluate(roll) {
  // Roll#evaluate marks the roll evaluated before calling _evaluate, so look at the dice terms.
  if (roll.dice.some(d => d._evaluated)) return;
  const stored = takeStored(roll);
  if (stored) injectDice(roll, stored.dice);
}

async function immediateWrapper(wrapped, ...args) {
  const stored = this.flags?.[MODULE_ID]?.[FLAG];
  if (!stored?.length) return wrapped(...args);
  const queue = clone(stored);
  contexts.push(queue);
  try { return await wrapped(...args); }
  finally { contexts.splice(contexts.indexOf(queue), 1); }
}

async function pauseWrapper(wrapped, ...args) {
  paused++;
  try { return await wrapped(...args); }
  finally { paused--; }
}

function register(target, fn, type = "WRAPPER") {
  const lib = game.modules.get("lib-wrapper")?.active && globalThis.libWrapper;
  if (lib) return globalThis.libWrapper.register(MODULE_ID, target, fn, type);
  // Fallback: patch the method in place.
  const path = target.split(".");
  const name = path.pop();
  const owner = path.reduce((o, k) => o?.[k], globalThis);
  if (!owner?.[name]) return;
  const original = owner[name];
  owner[name] = function (...a) { return fn.call(this, original.bind(this), ...a); };
}

export function installReplay() {
  register("foundry.dice.Roll.prototype._evaluate", function (wrapped, ...a) { beforeEvaluate(this); return wrapped(...a); });
  register("foundry.dice.Roll.prototype._evaluateSync", function (wrapped, ...a) { beforeEvaluate(this); return wrapped(...a); });
  if (CONFIG.ActiveEffect.documentClass.prototype.handleImmediateScripts) {
    register("CONFIG.ActiveEffect.documentClass.prototype.handleImmediateScripts", immediateWrapper);
  }
  // Table rolls inside a script (scatter, hit location, crit tables) keep their own dice.
  if (game.wfrp4e?.tables?.rollTable) register("game.wfrp4e.tables.rollTable", pauseWrapper);
}

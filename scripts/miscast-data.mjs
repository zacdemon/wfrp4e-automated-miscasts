/**
 * Identification data for the miscast tables this module handles, plus the small amount of
 * automation the module adds itself. Nothing here copies table prose: names and document ids only.
 * Item descriptions are read at roll time from the RollTable the user has installed.
 */

export const MODULE_ID = "wfrp4e-automated-miscasts";

/** Table keys (flags.wfrp4e.key) the system uses for miscast tables. */
export const MISCAST_KEYS = ["minormis", "majormis", "catastrophicmis", "grimoire-miscast"];

/**
 * Known source tables, by compendium document id. World copies are matched through
 * _stats.compendiumSource (or their own id when imported with keepId).
 */
export const SOURCE_TABLES = {
  // WFRP4e Core Rulebook (wfrp4e-core.tables)
  iPVwX0ul6lHVbKSX: { source: "core", key: "minormis", pack: "wfrp4e-core.tables" },
  we8Vo5GC3ZsDI7aA: { source: "core", key: "majormis", pack: "wfrp4e-core.tables" },
  // Moo's Homebrew, shipped inside wfrp4e-core.tables ("Moo's Homebrew" folder)
  xPenaTMFvD4BVEeK: { source: "moo", key: "minormis", pack: "wfrp4e-core.tables" },
  kuRQ1DeNp2Ar87Ns: { source: "moo", key: "majormis", pack: "wfrp4e-core.tables" },
  SdruU0zkacpwCMJn: { source: "moo", key: "catastrophicmis", pack: "wfrp4e-core.tables" },
  // Winds of Magic (wfrp4e-wom.tables)
  UBStehgyR7pNHuxc: { source: "wom", key: "minormis", pack: "wfrp4e-wom.tables" },
  GLUmYTuEmgdvDXJQ: { source: "wom", key: "majormis", pack: "wfrp4e-wom.tables" },
  "3KxhbbDdeu4hE73O": { source: "wom", key: "grimoire-miscast", pack: "wfrp4e-wom.tables" }
};

const CORE_EFFECT = id => `Compendium.wfrp4e-core.effects.ActiveEffect.${id}`;

/** wfrp4e-core injuries a useless limb is treated as (by hit location key). */
export const AMPUTATIONS = {
  eyes: "Compendium.wfrp4e-core.items.Item.weczkAMPlTjX7lqU", // Amputated Eye ("Lost Eye")
  arm: "Compendium.wfrp4e-core.items.Item.MnMZv7ZXoRqoH9dS", // Amputated Arm
  leg: "Compendium.wfrp4e-core.items.Item.k00PimCWkff11IA0" // Amputated Leg
};
const LIMBS = ["lArm", "rArm", "lLeg", "rLeg"];
const HIT_LOCATIONS = ["head", "lArm", "rArm", "body", "lLeg", "rLeg"];

/**
 * Scripts for a miscast that makes one location useless "as if amputated".
 * The location is a die roll (1d4 over the limbs, or 1d6 over all six hit locations) so it is
 * rolled with the card and replayed on drop: the card shows the same location that is applied.
 * Arms and legs get core's Amputated Arm / Amputated Leg injury at that location, created by
 * the effect (warhammer-lib's addEffectItems), so it is removed again when the effect ends.
 * @param {object} o
 * @param {string[]} o.locations hit location keys, in die order
 * @param {string|null} o.hours duration formula in hours (null: permanent)
 * @param {string} o.label script label
 * @param {boolean} [o.headEyes] a head roll costs both eyes (two Amputated Eye injuries)
 * @param {object} o.noInjury i18n keys (by location key, or `default`) for the GM note when the
 *        location has no matching injury
 */
function uselessLocationScripts({ locations, hours, label, noInjury, headEyes = false }) {
  const die = `1d${locations.length}`;
  const choose = `const LOCS = ${JSON.stringify(locations)};
const armour = this.actor.system.status?.armour ?? {};
let location = await new Roll("${die}").roll();
location.toMessage(this.script.getChatData({flavor: game.i18n.localize("WFAM.Limb.Location")}));
let key = LOCS[location.total - 1];
// A creature without that location (unusual hit locations): use one it has, in the same order.
if (!armour[key]) {
  const have = LOCS.filter(k => armour[k]);
  if (have.length) key = have[(location.total - 1) % have.length];
}
const label = game.wfrp4e.config.locations[key] ?? key;
const update = {name: this.effect.setSpecifier(label), "flags.${MODULE_ID}.location": key, "flags.${MODULE_ID}.baseName": this.effect.name};
${hours ? `let duration = await new Roll("${hours}").roll();
duration.toMessage(this.script.getChatData({flavor: game.i18n.localize("WFAM.Card.Duration")}));
update.duration = {value: duration.total, units: "hours"};
` : ""}this.effect.updateSource(update);`;
  const injure = `const key = this.effect.getFlag("${MODULE_ID}", "location");
if (!key) return;
const kind = /Arm$/.test(key) ? "arm" : /Leg$/.test(key) ? "leg" : (key === "head" && ${!!headEyes}) ? "eyes" : null;
const uuid = ${JSON.stringify(AMPUTATIONS)}[kind];
const where = game.wfrp4e.config.locations[key] ?? key;
const base = this.effect.getFlag("${MODULE_ID}", "baseName") ?? this.effect.name;
if (!uuid) {
  const notes = ${JSON.stringify(noInjury)};
  this.script.message(game.i18n.format(notes[key] ?? notes.default, {name: base, location: where}), {whisper: ChatMessage.getWhisperRecipients("GM")});
  return;
}
const injury = await fromUuid(uuid);
// Eyes: one Amputated Eye per eye, left and right (the item's own key/value pattern, "lEye" / "Left Eye").
const merges = kind === "eyes"
  ? [["l", "Left"], ["r", "Right"]].map(([k, side]) => ({name: \`\${injury.name} (\${base})\`, "system.location.key": k + "Eye", "system.location.value": \`\${game.i18n.localize(side)} \${injury.system.location.value}\`}))
  : [{name: \`\${injury.name} (\${base})\`, "system.location.key": key}];
const items = await this.actor.addEffectItems(merges.map(() => uuid), this.effect, merges, {skipLocationValue: kind === "eyes"});
this.script.message(game.i18n.format("${hours ? "WFAM.Limb.Applied" : "WFAM.Limb.AppliedPermanent"}", {injury: (items ?? []).map(i => i.system.location.value ? \`\${i.name}, \${i.system.location.value}\` : i.name).join("; ") || injury.name, location: where}));`;
  return [
    { label, trigger: "immediate", script: choose, options: {} },
    { label: "WFAM.Limb.Injury", trigger: "addItems", script: injure, options: {} }
  ];
}

const uselessLocationEffect = (nameKey, opts) => ({ img, i18n }) => ({
  name: i18n(nameKey),
  img,
  type: "base",
  transfer: true,
  flags: { [MODULE_ID]: { rollText: { [`1d${opts.locations.length}`]: opts.locations } } },
  system: {
    transferData: { type: "document", documentType: "Actor" },
    scriptData: uselessLocationScripts({ ...opts, label: i18n(opts.label) }).map(s => ({ ...s, label: s.label.startsWith("WFAM.") ? i18n(s.label) : s.label }))
  }
});

// Core / WoM "Limb Frozen" and Moo "Limbfrozen": a random limb (never the head or body) is
// useless as if amputated for 1d10 hours.
const limbFrozen = nameKey => uselessLocationEffect(nameKey, { locations: LIMBS, hours: "1d10", label: "WFAM.Limb.Choose", noInjury: { default: "WFAM.Limb.NoInjury" } });

/**
 * wfrp4e-core ships scripted "Minor (Moo)" effects, but the Moo minor table's results are plain text
 * that don't link to them. Map result name -> core effect so those results get core's own automation.
 * Soulquake has no Moo copy; the core minor-table Soulquake effect (gain Prone) is the same mechanic.
 */
export const LINKED_EFFECTS = {
  moo: {
    "hexeyes": CORE_EFFECT("0YPzJqELtZgm1bbG"),
    "soulwax": CORE_EFFECT("Xo7GEFcGlouC3ME2"),
    "witchlight": CORE_EFFECT("KusAeo60hFZASpe6"),
    "fell whispers": CORE_EFFECT("JRWOOwfKE0aDUY6T"),
    "facebleed": CORE_EFFECT("5NzC3j1fokWiADQs"),
    "soulquake": CORE_EFFECT("aVoIrzGcSpEvnRhX"),
    "aethyric needle": CORE_EFFECT("01Blr8BPQJyczF1E"),
    "wayward garb": CORE_EFFECT("XuHkhXzaSh0A0Fqe"),
    "creeping congregation": CORE_EFFECT("tkm6vFLoA1Hq1ssj"),
    "souldrain": CORE_EFFECT("r414pjrzqzvcijlq"),
    "regurgitation": CORE_EFFECT("uFKrc4U4jZVYrpIe"),
    "unholy visions": CORE_EFFECT("n32KbNptDebxNIyD"),
    "cloying tongue": CORE_EFFECT("C2CJmUhiN0exLdJs"),
    "the horror!": CORE_EFFECT("kJlRfQiar7xB7oHP"),
    "curse of corruption": CORE_EFFECT("cmD5p01uNXe7g50J")
  }
};

/**
 * Effects written by this module for text results that have a clear mechanical effect and no
 * core/WoM effect. Keyed by source ("*" = any source) and lowercased result name.
 * Each builder returns ActiveEffect data (wfrp4e scriptData format).
 */
export const MODULE_EFFECTS = {
  moo: {
    // Moo Catastrophic: everyone else within Willpower Bonus yards becomes Frenzied for 1d10 rounds.
    // Area effect; each creature caught gets a temporary effect running core's own Frenzy scripts
    // (referenced by script id, so nothing is copied). The caster is skipped.
    "rageboil": ({ img, i18n }) => ({
      name: i18n("WFAM.Effect.Rageboil"),
      img,
      type: "base",
      transfer: true,
      system: {
        transferData: {
          type: "area",
          documentType: "Actor",
          area: { radius: "@actor.system.characteristics.wp.bonus", duration: "instantaneous", shape: { type: "emanation" } }
        },
        scriptData: [
          {
            label: i18n("WFAM.Effect.Frenzied"),
            trigger: "immediate",
            script: `const caster = this.effect.sourceActor;
if (caster && (caster.uuid === this.actor.uuid || (caster.id === this.actor.id && caster.isToken === this.actor.isToken))) return false;
let roll = await new Roll("1d10").roll();
roll.toMessage(this.script.getChatData());
this.effect.updateSource({duration: {value: roll.total, units: "rounds"}});
return true;`,
            options: {}
          },
          { label: "Frenzy", trigger: "computeCharacteristics", script: "[Script.91S2GnBFYFbxmOCK]", options: {} },
          { label: "Disable", trigger: "update", script: "[Script.OeKeQAAcJhdI4Qky]", options: {} }
        ]
      }
    }),

    // Moo Catastrophic: a Major Miscast now (the card's table link) and again at the start of
    // each of your turns for the next 8 rounds.
    "tzeentch's lash": ({ img, i18n }) => ({
      name: i18n("WFAM.Effect.TzeentchsLash"),
      img,
      type: "base",
      transfer: true,
      duration: { value: 8, units: "rounds" },
      system: {
        transferData: { type: "document", documentType: "Actor" },
        scriptData: [
          {
            label: i18n("WFAM.Effect.LashTurn"),
            trigger: "startTurn",
            script: `const html = await game.wfrp4e.tables.formatChatRoll("majormis", {showRoll: true});
if (html) await ChatMessage.create(game.wfrp4e.utility.chatDataSetup(html, game.settings.get("core", "rollMode"), true));`,
            options: {}
          }
        ]
      }
    }),

    // Moo Catastrophic: lost to the Realm of Chaos unless you spend a Fate point (then 1 Corruption
    // and Stunned). Core's version kills the character if its yes/no prompt is closed; this one asks
    // the actor's owner to choose, and a closed or unanswered prompt changes nothing and tells the GM.
    "called to the void": ({ img, i18n }) => ({
      name: i18n("WFAM.Effect.CalledToTheVoid"),
      img,
      type: "base",
      transfer: true,
      system: {
        transferData: { type: "document", documentType: "Actor" },
        scriptData: [
          {
            label: i18n("WFAM.Effect.Choice"),
            trigger: "immediate",
            script: `const api = game.modules.get("${MODULE_ID}")?.api;
const L = k => game.i18n.localize(k);
const fate = Number(this.actor.system.status.fate?.value) || 0;
const choices = [];
if (fate > 0) choices.push({ action: "fate", label: L("WFAM.Void.SpendFate"), icon: "fa-solid fa-star" });
choices.push({ action: "lost", label: L("WFAM.Void.Lost"), icon: "fa-solid fa-skull" });
const choice = await api.promptChoice(this.actor, {
  title: this.effect.name,
  text: game.i18n.format(fate > 0 ? "WFAM.Void.Prompt" : "WFAM.Void.PromptNoFate", { fate }),
  choices,
  source: this.effect.name
});
if (choice === "fate") {
  await this.actor.update({ "system.status.fate.value": fate - 1, "system.status.corruption.value": (Number(this.actor.system.status.corruption.value) || 0) + 1 });
  await this.actor.addCondition("stunned");
  this.script.message(game.i18n.format("WFAM.Void.SpentFate", { actor: this.actor.name }));
}
else if (choice === "lost") {
  await this.actor.addCondition("dead");
  this.script.message(game.i18n.format("WFAM.Void.WasLost", { actor: this.actor.name }));
}`,
            options: { deleteEffect: true }
          }
        ]
      }
    })
  },
  "*": {
    // Core / WoM Major "Limb Frozen", Moo Major "Limbfrozen": one random limb is useless as if
    // amputated for 1d10 hours. Core's script picks from every hit location (head and body too)
    // and applies no injury.
    "limb frozen": limbFrozen("WFAM.Effect.LimbFrozen"),
    "limbfrozen": limbFrozen("WFAM.Effect.Limbfrozen"),

    // Moo Catastrophic: one random hit location (head and body included, per the text) withers
    // and becomes useless, permanently. Arms and legs get the matching amputation injury; the head
    // (eyes and mouth fuse shut, vision lost forever) costs both eyes: core's Amputated Eye, left
    // and right. The body has no system injury, so the GM is told.
    "witherlimb": uselessLocationEffect("WFAM.Effect.Witherlimb", { locations: HIT_LOCATIONS, hours: null, label: "WFAM.Limb.ChooseLocation", headEyes: true, noInjury: { default: "WFAM.Limb.NoInjury" } }),

    // Core / Moo Minor: you glow with the light of your Lore (as a large bonfire) for 1d10 rounds.
    // Core's script colours only the eight Winds, Necromancy and Daemonology (anything else got a
    // random, sometimes empty, colour). This one covers every Lore (scripts/miscast-lore.mjs),
    // blends the colours of several Lores, gives casters with no Lore a colour no Lore uses and
    // non-casters a dull white. Its two dice are rolled on the card, so the card's colour and the
    // applied one match. The rounds come from the card text's inline roll.
    "witchlight": ({ img, i18n }) => ({
      name: i18n("WFAM.Effect.Witchlight"),
      img,
      type: "base",
      transfer: true,
      flags: { [MODULE_ID]: { hideRolls: true, preview: "witchlight" } },
      system: {
        transferData: { type: "document", documentType: "Actor" },
        changes: [
          { key: "token.light.dim", type: "override", value: 40, phase: "initial" },
          { key: "token.light.bright", type: "override", value: 20, phase: "initial" },
          { key: "token.light.animation.type", type: "override", value: "fog", phase: "initial" }
        ],
        scriptData: [
          {
            label: i18n("WFAM.Light.Colour"),
            trigger: "immediate",
            script: `const api = game.modules.get("${MODULE_ID}")?.api;
let shade = await new Roll("1d1000").roll();
let pick = await new Roll("1d1000").roll();
const light = api.witchlight(this.actor, {shade: shade.total, pick: pick.total});
const keep = (this.effect.system.changes ?? []).filter(c => !["token.light.color", "token.light.animation.type"].includes(c.key));
this.effect.updateSource({
  name: this.effect.setSpecifier(light.specifier),
  "system.changes": keep.concat(
    {key: "token.light.color", type: "override", value: light.colour, phase: "initial"},
    {key: "token.light.animation.type", type: "override", value: light.animation, phase: "initial"}
  ),
  "flags.${MODULE_ID}.light": light
});
this.script.message(game.i18n.format("WFAM.Light.Message", {actor: this.actor.name, colour: light.colourName, hex: light.colour}));`,
            options: {}
          }
        ]
      }
    }),

    // Core / WoM Major: you cannot use the casting Talent for 1d10 minutes.
    "power drain": ({ img, i18n }) => ({
      name: i18n("WFAM.Effect.PowerDrain"),
      img,
      type: "base",
      transfer: true,
      system: {
        transferData: { type: "document", documentType: "Actor" },
        scriptData: [
          {
            label: i18n("WFAM.Effect.Duration"),
            trigger: "immediate",
            script: `let roll = await new Roll("1d10").roll();
roll.toMessage(this.script.getChatData());
this.effect.updateSource({duration: {value: roll.total, units: "minutes"}});`,
            options: {}
          },
          {
            label: i18n("WFAM.Effect.NoCasting"),
            trigger: "dialog",
            script: "",
            options: {
              hideScript: `if (args.type == "cast" || args.type == "channelling") {
  args.abort = true;
  this.script.notification(game.i18n.localize("WFAM.Effect.NoCastingToast"));
}
return true;`,
              activateScript: "",
              submissionScript: ""
            }
          }
        ]
      }
    }),

    // WoM Major: the spell being cast is forgotten. Prompts the caster to un-memorise a spell,
    // defaulting to the spell from the casting test that caused the miscast.
    "forgetfulness": ({ img, i18n }) => ({
      name: i18n("WFAM.Effect.Forgetfulness"),
      img,
      type: "base",
      transfer: true,
      system: {
        transferData: { type: "document", documentType: "Actor" },
        scriptData: [
          {
            label: i18n("WFAM.Effect.Unmemorise"),
            trigger: "immediate",
            script: `const api = game.modules.get("${MODULE_ID}")?.api;
let test;
try { test = this.effect.sourceTest; } catch (e) {}
if (api?.promptForget) await api.promptForget(this.actor, {test, script: this.script});`,
            options: { deleteEffect: true }
          }
        ]
      }
    })
  }
};

/**
 * Module effects that replace the effect a table links or core ships, because that one doesn't
 * cover the full rule. Core's Moo Power Drain only blocks Casting; ours blocks Channelling too.
 * Core's Called to the Void kills the character when its prompt is closed; ours asks and never assumes.
 */
export const OVERRIDE_NAMES = ["power drain", "called to the void", "limb frozen", "limbfrozen", "witherlimb", "witchlight"];

/**
 * Scripts added to a linked core effect that covers most, but not all, of a result.
 * Moo Catastrophic "Soulpyre": "While the Soulpyre persists, you have a Stunned Condition that
 * cannot be removed". Core's aura does the light and the damage but never stuns the caster.
 * The aura also lands on nearby creatures, so each script only acts on the caster.
 */
export const MODULE_PATCHES = {
  "*": {
    "soulpyre": ({ i18n }) => {
      const casterOnly = `const src = this.effect.sourceActor;
if (src && src.uuid !== this.actor.uuid) return;`;
      const recipient = `const src = this.effect.sourceActor;
if (!src || src.uuid === this.actor.uuid) return;`;
      const scripts = [
        {
          label: i18n("WFAM.Patch.SoulpyreStunned"),
          trigger: "immediate",
          script: `${casterOnly}
await this.actor.addCondition("stunned");`,
          options: {}
        },
        {
          label: i18n("WFAM.Patch.PreventRemoval"),
          trigger: "preUpdateDocument",
          script: `${casterOnly}
if (args.type == "effect" && args.options.action == "delete" && args.document.statuses?.has("stunned")) {
  this.script.notification(game.i18n.format("WFAM.Patch.CannotRemove", {condition: args.document.name, source: this.effect.name}));
  return false;
}`,
          options: {}
        },
        {
          label: i18n("WFAM.Patch.SoulpyreEnds"),
          trigger: "deleteEffect",
          script: `${casterOnly}
if (this.actor.hasCondition("stunned")) await this.actor.removeCondition("stunned");`,
          options: {}
        },
        {
          // The caster's Lore (one picked with a die rolled on the card if they have several),
          // stored on the effect so the copies the aura hands out carry it.
          label: i18n("WFAM.Patch.SoulpyreLore"),
          trigger: "immediate",
          script: `${casterOnly}
let lorePick = await new Roll("1d1000").roll();
const api = game.modules.get("${MODULE_ID}").api;
const pyre = api.soulpyreLore(this.actor, lorePick.total);
this.effect.updateSource({"flags.${MODULE_ID}.soulpyre": pyre});
if (pyre && !pyre.automated) ChatMessage.create({ content: api.soulpyreNote(pyre, this.effect.name), speaker: ChatMessage.getSpeaker({actor: this.actor}), whisper: ChatMessage.getWhisperRecipients("GM") });`,
          options: {}
        },
        {
          // Creatures in range: the Lore attribute rides on each round's damage.
          label: i18n("WFAM.Patch.SoulpyreLoreHit"),
          trigger: "startTurn",
          script: `${recipient}
const pyre = this.effect.getFlag("${MODULE_ID}", "soulpyre");
if (!pyre?.automated) return;
const out = await game.modules.get("${MODULE_ID}").api.applyLoreAttribute(this.actor, src, pyre.key, this.effect);
if (out) this.script.scriptMessage(\`<b>\${pyre.label}</b>: \${out}\`);`,
          options: {}
        }
      ];
      return { scripts, flags: { hideRolls: true, preview: "soulpyre" } };
    }
  }
};

/** Result names (lowercased) that mean "nothing happened"; these keep the system's plain output. */
export const NO_EFFECT_NAMES = ["no effect"];

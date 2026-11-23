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
export const OVERRIDE_NAMES = ["power drain", "called to the void"];

/** Result names (lowercased) that mean "nothing happened"; these keep the system's plain output. */
export const NO_EFFECT_NAMES = ["no effect"];

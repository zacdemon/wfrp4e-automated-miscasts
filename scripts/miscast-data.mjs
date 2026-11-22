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
  iPVwX0ul6lHVbKSX: { source: "core", key: "minormis" },
  we8Vo5GC3ZsDI7aA: { source: "core", key: "majormis" },
  // Moo's Homebrew, shipped inside wfrp4e-core.tables ("Moo's Homebrew" folder)
  xPenaTMFvD4BVEeK: { source: "moo", key: "minormis" },
  kuRQ1DeNp2Ar87Ns: { source: "moo", key: "majormis" },
  SdruU0zkacpwCMJn: { source: "moo", key: "catastrophicmis" },
  // Winds of Magic (wfrp4e-wom.tables)
  UBStehgyR7pNHuxc: { source: "wom", key: "minormis" },
  GLUmYTuEmgdvDXJQ: { source: "wom", key: "majormis" },
  "3KxhbbDdeu4hE73O": { source: "wom", key: "grimoire-miscast" }
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
    })
  }
};

/** Result names (lowercased) that mean "nothing happened"; these keep the system's plain output. */
export const NO_EFFECT_NAMES = ["no effect"];

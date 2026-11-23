# WFRP 4e Automated Miscasts

A Foundry VTT v14 module for Warhammer Fantasy Roleplay 4th Edition (`wfrp4e` system 10.x).

When a miscast table is rolled, the result is posted as a **miscast card** in chat. If the result has automation, the card can be dragged onto a character sheet or token, much like critical wounds. Dropping it applies the miscast to the character as a **temporary Active Effect** and runs its automation: conditions, Corruption, damage, tests, durations or casting locks. Results with no mechanic are posted as plain narrative cards with nothing to drag.

## How it works

- The module wraps the system's `game.wfrp4e.tables.formatChatRoll`. That covers the miscast link on casting and channelling cards, `@Table[...]` links, and the system's `/table` command.
- For the table keys `minormis`, `majormis`, `catastrophicmis` and `grimoire-miscast`, it rolls through the system's own `rollTable`, so modifiers, Aethyric Attunement and Dice So Nice still work.
- The card is **built at roll time from the table you have installed**. Its name and text come from the rolled result. If the result links a scripted Active Effect, the card carries a copy of that effect.
- Dragging uses the system's custom drop data (`{type: "custom", custom: "wfam-miscast"}`, handled through the `wfrp4e:dropCustomData` hook) and `dropCanvasData` for tokens. A drop calls the system's `actor.applyEffect`, so players can apply miscasts to characters they own, and tests prompted by an effect open for the actor's owner.
- Effects with a duration (such as Power Drain) stay under **Temporary Effects** on the Effects tab until they expire or are removed. Instant effects (Corruption, damage, conditions) run their script and then remove themselves, as the core effects are designed to.
- Area effects (for example Ghostly Voices, Chaos Quake, Aethyric Storm) open the system's area-template placement at the drop point. If the drop was onto a sheet, the actor's token on the current scene is used.
- The module ships no table text. It only holds table and effect ids, and two small scripts of its own.
- The table the system picks for each key is still set in the system's **Table Settings**. Use them to choose Core, Winds of Magic or Moo's Homebrew.

## Supported tables

| Source | Tables | Automation |
| --- | --- | --- |
| Core Rulebook (`wfrp4e-core`) | Minor, Major | The result's linked core effect. |
| Moo's Homebrew (shipped in `wfrp4e-core`) | Minor, Major, Catastrophic | Major and Catastrophic use their linked core effects. The Minor table's results are plain text, so the module applies core's own "Minor (Moo)" effects to them. |
| Winds of Magic (`wfrp4e-wom`) | Minor, Major, Grimoire | The result's linked core or WoM effect. |

## Module effects

Some text-only results with a clear mechanic get a small effect from this module:

- **Power Drain** (Core, Moo and WoM Major): rolls 1d10 minutes for its duration and blocks both Casting and Channelling tests until it ends. It replaces core's Moo Power Drain effect, which only blocks Casting.
- **Rageboil** (Moo Catastrophic): an area of Willpower Bonus yards around the caster. Every other creature caught in it becomes Frenzied for 1d10 rounds, using core's own Frenzy scripts.
- **Tzeentch's Lash** (Moo Catastrophic): the card's link rolls the immediate Major Miscast, and the effect rolls another Major Miscast at the start of each of the caster's turns for 8 rounds.
- **Forgetfulness** (WoM Major): asks the caster which memorised spell is forgotten, defaulting to the spell whose casting caused the miscast, then un-memorises it (`system.memorized.value = false`).

## Other results

- Narrative results, such as Witchsign, Swarmed, Levitation or Daemonic Possession, become plain chat cards with the result text. They have no effect and can't be dragged.
- "Roll again" results, such as Multiplying Misfortune, Cascading Chaos or Trick of Fate, are narrative cards that keep their clickable table link.
- Grimoire "No Effect" rows keep the system's plain output.

## Older or re-imported tables

Some worlds have miscast tables whose results are plain text, with the whole entry as HTML in the name or description (for example `<p><strong>Mindnumb</strong>: Uncontrolled magic ...</p>`), and no link to an effect. The module reads the bold lead-in as the result's name and the rest as its text, then looks the result up by name on the published Core, Moo or Winds of Magic table to find its effect. Those results get the same draggable card and automation as the published tables.

## Rolled values

Dice in a miscast are rolled once, when the card is posted, and the card shows the results ("Rolled (applied on drop)"). Dropping the card applies those same numbers, not new rolls:

- **Effect scripts.** Core, Winds of Magic and module effects roll their numbers (duration, damage, Corruption, Fortune points, crit modifier) in their own scripts. The module reads the formulas from those scripts, rolls them for the card, and stores the dice on the effect (`flags.wfrp4e-automated-miscasts.rolls`). When the effect is applied, the script runs unchanged, but each `Roll` it makes with the same dice gets the stored dice. This only applies while that effect's immediate scripts run. Rolls on other tables inside a script (scatter, critical tables) keep their own dice. Area effects give every creature in the area the same value.
- **Card text.** Inline rolls in the result text (`[[1d10]]`, `[[/r 1d10]]`) are replaced with the rolled number. Where a script rolls the same dice, the text and the script share the result, so the card text, the script's roll message and the applied value all match. The numbers on a narrative card no longer change each time it is re-rendered.
- **Durations from text.** Some effects say "for [[1d10]] rounds/hours" but no script sets a duration (Witchlight, Souldrain, Regurgitation, Soulpyre). For these the rolled number becomes the effect's duration.

Not rolled in advance: Tests (d100), random picks in a script (hit location, colour), rolls each turn (Soulpyre's start-of-turn damage, Tzeentch's Lash's Major Miscast each turn), and formulas that depend on the actor.

## libWrapper

The module registers a `WRAPPER` on `game.wfrp4e.tables.formatChatRoll` and always calls the next wrapper. For miscast tables it asks the system for the rolled result (`returnResult`), then turns that into the card. Other modules wrapping the same function (Expanded Criticals, Mutant's Handbook) still run, and libWrapper has no conflict to report.

For the rolled values it also registers `WRAPPER`s on `Roll#_evaluate`, `Roll#_evaluateSync`, `ActiveEffect#handleImmediateScripts` and `game.wfrp4e.tables.rollTable`. These always call through; they only change dice while a miscast effect's immediate scripts are running.

## Settings

- **Post miscasts as draggable cards** (world, on by default). Turn it off to get the system's plain text results.

## API

`game.modules.get("wfrp4e-automated-miscasts").api`

- `rollMiscast(table, {modifier, lookup, messageId})` rolls a specific RollTable (document, uuid, id or name) and posts the card.
- `buildMiscast(table, result)` returns the card data, including the effect data, without posting it.
- `preRoll(built)` rolls the card's dice into `built` (as `postMiscastCard` does).
- `applyMiscast(actor, effect, {sourceMessageId, x, y})` applies a miscast effect document to an actor.
- `promptForget(actor, {test})` opens the Forgetfulness prompt.
- `identifyTable(table)` returns `{source: "core"|"moo"|"wom"|"other", key}`.

## Requirements

- Foundry VTT v14 (verified 14.370)
- wfrp4e 10.1.2
- WFRP4e Core Rulebook module
- Recommended: Winds of Magic, libWrapper

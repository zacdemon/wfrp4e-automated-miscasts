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

- **Power Drain** (Core and WoM Major): rolls 1d10 minutes for its duration and blocks both Casting and Channelling tests until it ends.
- **Forgetfulness** (WoM Major): asks the caster which memorised spell is forgotten, defaulting to the spell whose casting caused the miscast, then un-memorises it (`system.memorized.value = false`).

## Other results

- Narrative results, such as Witchsign, Swarmed, Levitation or Daemonic Possession, become plain chat cards with the result text. They have no effect and can't be dragged.
- "Roll again" results, such as Multiplying Misfortune, Cascading Chaos or Trick of Fate, are narrative cards that keep their clickable table link.
- Grimoire "No Effect" rows keep the system's plain output.

## Settings

- **Post miscasts as draggable cards** (world, on by default). Turn it off to get the system's plain text results.

## API

`game.modules.get("wfrp4e-automated-miscasts").api`

- `rollMiscast(table, {modifier, lookup, messageId})` rolls a specific RollTable (document, uuid, id or name) and posts the card.
- `buildMiscast(table, result)` returns the card data, including the effect data, without posting it.
- `applyMiscast(actor, effect, {sourceMessageId, x, y})` applies a miscast effect document to an actor.
- `promptForget(actor, {test})` opens the Forgetfulness prompt.
- `identifyTable(table)` returns `{source: "core"|"moo"|"wom"|"other", key}`.

## Requirements

- Foundry VTT v14 (verified 14.370)
- wfrp4e 10.1.2
- WFRP4e Core Rulebook module
- Recommended: Winds of Magic, libWrapper

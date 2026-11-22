# WFRP 4e Automated Miscasts

A Foundry VTT v14 module for Warhammer Fantasy Roleplay 4th Edition (`wfrp4e` system 10.x).

When a miscast table is rolled, the result is posted as an **item card** that can be dragged from chat onto a character sheet, the same way critical wounds work. Dropping it adds a miscast item to the character and runs the result's automation. That can mean conditions, Corruption, damage, tests, durations or casting locks.

## How it works

- The module wraps the system's `game.wfrp4e.tables.formatChatRoll`. That covers the miscast link on casting and channelling cards, `@Table[...]` links, and the system's `/table` command.
- For the table keys `minormis`, `majormis`, `catastrophicmis` and `grimoire-miscast`, it rolls through the system's own `rollTable`, so modifiers, Aethyric Attunement and Dice So Nice still work. It then posts a system `item` chat message (`PostedItemMessageModel`), which is the same draggable card the system uses for criticals.
- The item is **built at roll time from the table you have installed**. Its name and text come from the rolled result. If the result links a scripted Active Effect, the item carries a copy of that effect, so the system runs the effect when the item lands on an actor.
- The module ships no table text. It only holds table and effect ids, and two small scripts of its own.
- The table the system picks for each key is still set in the system's **Table Settings**. Use them to choose Core, Winds of Magic or Moo's Homebrew.

## Supported tables

| Source | Tables | Automation |
| --- | --- | --- |
| Core Rulebook (`wfrp4e-core`) | Minor, Major | The result's linked core effect. |
| Moo's Homebrew (shipped in `wfrp4e-core`) | Minor, Major, Catastrophic | Major and Catastrophic use their linked core effects. The Minor table's results are plain text, so the module adds core's own "Minor (Moo)" effects to them. |
| Winds of Magic (`wfrp4e-wom`) | Minor, Major, Grimoire | The result's linked core or WoM effect. |

Other notes:

- Text results with a clear mechanic and no core effect get a module effect. Right now that's only **Power Drain** on the Core and WoM Major tables: it rolls 1d10 minutes and blocks Casting and Channelling tests until then.
- Narrative results, such as Witchsign, Swarmed, Levitation or Daemonic Possession, become items marked "apply manually".
- "Roll again" results, such as Multiplying Misfortune, Cascading Chaos or Trick of Fate, keep their clickable table link on the card.
- Grimoire "No Effect" rows keep the system's plain output.
- Area and target effects (for example Ghostly Voices, Chaos Quake, Aethyric Storm, Creeping Congregation) don't land on the caster. They show as a place-area or apply button on the miscast item instead.

## Settings

- **Post miscasts as draggable items** (world, on by default). Turn it off to get the system's plain text results.
- **Miscast item type**: Injury (the default, listed under Injuries on the Effects tab) or Psychology.

## API

`game.modules.get("wfrp4e-automated-miscasts").api`

- `rollMiscast(table, {modifier, lookup, messageId})` rolls a specific RollTable (document, uuid, id or name) and posts the card.
- `buildMiscastItem(table, result)` returns the item data without posting it.
- `identifyTable(table)` returns `{source: "core"|"moo"|"wom"|"other", key}`.

## Requirements

- Foundry VTT v14 (verified 14.370)
- wfrp4e 10.1.2
- WFRP4e Core Rulebook module
- Recommended: Winds of Magic, libWrapper

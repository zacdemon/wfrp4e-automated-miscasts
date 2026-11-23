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
- **Limb Frozen** (Core and WoM Major) and **Limbfrozen** (Moo Major): one random limb (left/right arm or leg, never the head or body) is useless as if amputated for 1d10 hours. The limb (1d4) and the hours are rolled with the card, so the card shows which limb. On drop the limb gets core's **Amputated Arm** or **Amputated Leg** injury at that location (named e.g. "Amputated Arm (Limb Frozen)"), created by the effect, so it is removed when the effect expires or is deleted. Core's own effect picked from every hit location and applied no injury. The injury row shows "Permanent" on the sheet (that is the core item's setting); the miscast effect above it carries the real duration.
- **Witherlimb** (Moo Catastrophic): one random hit location (1d6; the head and body are included, as the text says) withers and becomes useless, permanently. An arm or leg gets the matching amputation injury, tied to the effect. The head (eyes fuse shut, vision lost forever) gets core's **Amputated Eye** injury twice, Left Eye and Right Eye, so the system's lost-eye penalties apply, including the both-eyes -30. The body has no system injury, so the GM gets a whispered note.
- **Witchlight** (Core and Moo Minor): the light takes the colour of the afflicted character's Lore (see below). It replaces core's effect, whose random fallback colour could come out undefined.
- **Forgetfulness** (WoM Major): asks the caster which memorised spell is forgotten, defaulting to the spell whose casting caused the miscast, then un-memorises it (`system.memorized.value = false`).

## Additions to core effects

- **Soulpyre** (Moo Catastrophic): core's aura does the light and the start-of-turn damage but never stuns the caster. The module adds the text's "Stunned Condition that cannot be removed" while the Soulpyre persists: the caster gains Stunned, it can't be removed while the effect lasts, and it is removed when the Soulpyre ends. These scripts only act on the caster, not on creatures caught in the aura.
  The module also gives the caster and every creature caught in the Soulpyre the caster's **Lore attribute** (the system's lore effects from wfrp4e-core) each time its start-of-turn damage hits them. With several Lores one is picked by a die rolled with the card; with no Lore (or no magic) nothing is added. Automated: Death (+1 Fatigued, living creatures only, one at a time from this Soulpyre), Fire (+1 Ablaze, not Fire casters, so never the caster), Light (+1 Blinded, not Light casters, so never the caster; Undead and Daemonic also take Intelligence Bonus damage), Witchcraft (+1 Bleeding). GM note only (whispered on drop): Life (would strip Fatigued and Bleeding from friend and foe and harm the Undead), Beasts (a caster-side Fear trait), Heavens, Metal and Shadow (armour riders; the Soulpyre already ignores armour), Hedgecraft (ingredients), and Lores the system gives no attribute (Necromancy, Daemonology, the Chaos Lores, High Magic and others).
  Dropping an aura miscast now keeps it an aura, so warhammer-lib draws its area around the caster's token and hands the effect to creatures inside (before, it was converted to a plain effect and never spread).

## Witchlight colours

Each Lore has its own colour and light animation (`scripts/miscast-lore.mjs`, `LORE_COLOURS`). The eight Lores of the Winds, Necromancy and Daemonology use the colours of the system's own Witchlight script; the rest were chosen with the user.

| Lore | Colour | Animation |
|---|---|---|
| Fire | #b22222 Aqshy red | torch |
| Heavens | #87ceeb Azyr sky blue | starlight |
| Metal | #ee9b3a Chamon molten gold | revolving |
| Shadow | #808080 Ulgu grey | smokepatch |
| Life | #008000 Ghyran green | wave |
| Beasts | #a52a2a Ghur brown | pulse |
| Light | #f0ffff Hysh brilliant white | sunburst |
| Death | #800080 Shyish purple | ghost |
| Necromancy | #800080 necromantic purple | fog |
| Daemonology | #8b0000 daemonic dark red | hexa |
| Dark Magic | #9d00ff intense dark purple | emanation |
| High Magic | every colour of the rainbow | rainbow swirl |
| Tzeentch | #1f8fff incandescent blue | vortex |
| Nurgle / Plague | sickly yellow-green, bilious olive or pus green | fairy |
| Slaanesh | hot pink, orchid or pale lilac | siren |
| Chaos Undivided | Khorne red, Nurgle green, Tzeentch blue or Slaanesh pink | chroma |
| Big Waaagh! | #00c853 Waaagh! emerald | energy |
| Little Waaagh! | #b2f2a0 pale grot green | flame |
| Hedgecraft | #4f7942 fern green | dome |
| Witchcraft | #5b3f6e murky violet | witchwave |
| Ruin | #7fff00 warpstone green | grid |
| Stealth | #6e7f6e murky grey-green | smokepatch |
| Great Maw | #c0392b raw-meat red | pulse |

Lores with several shades pick one with a die rolled with the card.

The Lores come from the character's spells (not Petty or "any Lore" spells), Arcane Magic / Chaos Magic talents, Witch!, the Spellcaster trait and Channelling (Wind) skills.

- One Lore: that Lore's colour and animation.
- Several Lores: the character is asked which Lore's light they glow with (the prompt opens for the actor's owner, the same way the effect is created). If nobody answers within 5 minutes, the GM gets a note and the card's die picks one.
- Magic but no Lore (Petty only, or a Lore the module doesn't know): a colour no Lore uses (teal, turquoise, coral, peach or aquamarine), picked by a die rolled with the card.
- No magic: a dull white.

No chat message is posted when the light is applied; the effect's name shows the Lore (e.g. "Witchlight (Fire)").

The card shows the colour for the caster (or, for a caster with several Lores, the choices). Dropped on someone else, it uses that character's Lores with the same dice.

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

Not rolled in advance: Tests (d100), random picks in a core script (Aethyric Attack's hit location), rolls each turn (Soulpyre's start-of-turn damage, Tzeentch's Lash's Major Miscast each turn), and formulas that depend on the actor.

**Random critical locations.** The system's Aethyric Attack script (used by Moo's Aethyric Attack, and the same pattern in Moo's Aethyric Assault) picks a random hit location from every key of the actor's armour data. That data also has `shield` and `shieldDamage`, so a quarter of the time it asked for the non-existent tables `critshield` / `critshielddamage` ("Table critshield not found") and no Critical Wound was rolled. The module re-picks those among the actor's real hit locations, so all six locations stay equally likely and the Critical is always rolled.

## libWrapper

The module registers a `WRAPPER` on `game.wfrp4e.tables.formatChatRoll` and always calls the next wrapper. For miscast tables it asks the system for the rolled result (`returnResult`), then turns that into the card. Other modules wrapping the same function (Expanded Criticals, Mutant's Handbook) still run, and libWrapper has no conflict to report.

For the rolled values it also registers `WRAPPER`s on `Roll#_evaluate`, `Roll#_evaluateSync`, `ActiveEffect#handleImmediateScripts` and `game.wfrp4e.tables.rollTable`. These always call through; they only change dice while a miscast effect's immediate scripts are running.

## Choices

When a miscast lets the affected character choose between outcomes, dropping it asks the actor's owner (their player if online, else the GM) with a dialog, then applies the chosen outcome. Closing the dialog, or no answer within 5 minutes, applies nothing and whispers the GM to resolve it by hand.

Across the Core, Winds of Magic and Moo tables, the only such result the system didn't handle safely is Moo's **Called to the Void**: core's version asks "Spend Fate?" and kills the character if the prompt is closed. The module replaces it: *Spend 1 Fate point* (1 Corruption and Stunned) or *Be lost to the Void* (Dead). With no Fate left, only the second is offered. Results that already prompt are kept: Forgetfulness (this module's un-memorise prompt) and Marked by Magic (core's Arcane Marks table choice). "GM's choice" results such as Swarmed stay narrative cards. Other modules or macros can use `api.promptChoice(actor, {title, text, choices, source, timeout})`.

## Manually Select Miscast (macro)

The module's compendium **Macros (Automated Miscasts)** has a **Manually Select Miscast** macro for testing (GM only). It opens a dialog to pick:

- a miscast table: every installed miscast table (Core Minor/Major, Winds of Magic Minor/Major/Grimoire, Moo's Minor/Major/Catastrophic, and any other table with a miscast key), from the world or a compendium;
- a result from that table (range and name; the list follows the table);
- optionally a caster (defaults to the selected token, else your character). The card speaks as the caster, and area miscasts measure their radius from them.

It posts exactly the card a natural roll of that result would: pre-rolled dice, drag to apply, area placement, narrative cards and "roll again" links. Same as `game.modules.get("wfrp4e-automated-miscasts").api.openSelectDialog({table, actor})`.

The pack is built from `src/packs/macros` with `npm install && npm run build` (`tools/build.sh` does this before zipping).

## Settings

- **Post miscasts as draggable cards** (world, on by default). Turn it off to get the system's plain text results.

## API

`game.modules.get("wfrp4e-automated-miscasts").api`

- `rollMiscast(table, {modifier, lookup, messageId, actor})` rolls a specific RollTable (document, uuid, id or name) and posts the card; `lookup` picks the result, `actor` sets the caster.
- `openSelectDialog({table, actor})` opens the Manually Select Miscast dialog; `miscastTables()` lists the installed miscast tables.
- `buildMiscast(table, result)` returns the card data, including the effect data, without posting it.
- `preRoll(built)` rolls the card's dice into `built` (as `postMiscastCard` does).
- `applyMiscast(actor, effect, {sourceMessageId, x, y})` applies a miscast effect document to an actor.
- `promptForget(actor, {test})` opens the Forgetfulness prompt.
- `witchlight(actor, {shade, pick})` returns the Witchlight colour for an actor; `actorMagic(actor)` returns `{hasMagic, lores, unknown}`.
- `soulpyreLore(actor, pick)` returns the Lore whose attribute a Soulpyre carries; `applyLoreAttribute(target, caster, key, effect)` applies it.
- `identifyTable(table)` returns `{source: "core"|"moo"|"wom"|"other", key}`.

## Requirements

- Foundry VTT v14 (verified 14.370)
- wfrp4e 10.1.2
- WFRP4e Core Rulebook module
- Recommended: Winds of Magic, libWrapper

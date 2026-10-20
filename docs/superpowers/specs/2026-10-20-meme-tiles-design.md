# Meme tiles across Tile World Online and DATTools

## Intent and confirmed behavior

Add four elements to a new Meme palette section in DATTools, with shared artwork
and playable behavior in Tile World Online's MS and Lynx rulesets. Preserve the
existing Expanded section and existing DAT encodings.

The user confirmed: Hint boots mark newly entered tiles with successive hint
characters, including spaces. Existing marks remain unchanged and revisits do
not advance the cursor. The hint loops after its last character. Red tanks start
moving immediately; each of the two buttons turns every Red tank 90 degrees in
its indicated direction. Blue and Red tank buttons affect only their own family.

## Format

Next unallocated DAT codes after Expanded's 0x70–0x75:

| Code | Element |
| --- | --- |
| 0x76 | Hint boots |
| 0x77–0x7A | Red tank north, west, south, east |
| 0x7B | Clockwise Red tank button |
| 0x7C | Counterclockwise Red tank button |

Runtime tile IDs are separate from DAT codes: RedTank=0x7C (four directional
variants through 0x7F), Boots_Hint=0x86, Button_RedTankCW=0x87,
Button_RedTankCCW=0x88. Existing creature classification expands through 0x7F.

## Runtime and presentation

Use each ruleset's existing pickup, actor movement, and button policy seams.
Red tanks retain normal tank speed, hazards, collision, forced floors, traps and
cloners, with 90-degree family-specific button turns instead of blue reversal.
Turns use each ruleset's normal button timing and cannot teleport a moving actor.

Hint boots occupy boot slot 4, leaving the four existing slots intact and absent
from old snapshots until needed. Thieves remove them as boots. On successful Chip
arrival, after pickup resolution, write the next character if boots remain owned
and that (layer, position) is unmarked. Empty hints produce no marks. Spaces reserve
their tile without visible ink. Characters use Array.from, and overlays are
semi-transparent with enough contrast to remain readable without hiding terrain.
Marks do not affect movement or tile contents and persist until restart; undo and
replay restore both marks and cursor. Current-layer hints use the level's existing
hint lookup. Other inventory-capable actors may collect the boots but only Chip
writes the hint trail.

Use a shared bitmap sprite set for Hint boots (boots plus yellow question mark),
four Red tank facings, and two distinctly curved arrow buttons. Both apps consume
the same source art at their respective tile sizes. The web game shows boots in
inventory on desktop and phone; text overlays honor map orientation and layers.

## Acceptance and delivery

Test actual DAT encode/decode round trips and directional editor transforms,
layered placement/creature metadata, both game engines, inventory theft, repeated
and blank hints, revisits, blocked/overlapping button turns, forced movement,
undo and deterministic replay. Inspect the artwork and both apps in the browser.
Run bounded relevant suites, production checks, and independent review before
committing/pushing and deploying both default branches. The user has authorized
implementation and deployment; requirements questions are resolved above.

# 3D Levels

This document captures the agreed engine-side and display-side rules for stacked z-layers in DAT level sets.

## Layer Grouping

- A contiguous sequence of levels in a DAT file whose titles share the same base title and end in `\1`, `\2`, `\3`, ... is one logical 3D level.
- The first level in the sequence is the bottom layer.
- Semantically:
  - `z = 1` is the base layer.
  - `z = 2`, `z = 3`, ... are upper layers.
- The merged level title strips the trailing `\1` from the first layer title.

## Metadata

- Global level metadata comes from the first layer only.
- This includes:
  - visible level title, with trailing `\1` stripped
  - level number
  - password
  - time limit
  - chips needed
  - status flags
- Layer-local data must still be preserved for every z-layer:
  - cell contents
  - creature position ordering metadata
  - trap connections
  - cloner connections
  - hint text

## Data Model

- All cells have `x`, `y`, and `z`.
- Existing single-layer behavior must remain unchanged.
- `z = 1` should preserve current behavior unless a rule below explicitly says otherwise.

## Special 3D Tile Codes

- In 3D levels, DAT file code `32` on layers where `z > 1` is `air`.
- `air` is a terrain tile.
- A mob can occupy `air`.
- On `z = 1`, DAT file code `32` keeps its current meaning.

- In 3D levels, DAT file code `57` is `elevator`.
- `elevator` is a terrain tile.
- A mob can occupy `elevator`.
- `elevator` pushes upward toward higher `z`.

## Gravity / Falling

- A mob in upper-layer `air` is treated like it is on a force floor pointing downward toward lower z.
- Downward movement uses the same timing and speed as force-floor movement for that ruleset.
- A mob can move downward by at most one z-layer per tick.
- Mobs that start the level in upper-layer empty space are subject to this rule immediately.

This is an engine rule, not a display rule. A mob can remain in an upper-layer `air` cell if the tile below supports its weight.

## Elevator / Upward Movement

- A mob on `elevator` is treated like it is on a force floor pointing upward toward higher z.
- Upward movement uses the same timing and speed as force-floor movement for that ruleset.
- A mob can move upward by at most one z-layer per tick.
- The upward move only succeeds if the destination tile above at the same `x,y` is one of:
  - `air`
  - a force floor
  - `exit`
- If the destination tile above is anything else, the upward move is denied.
- If there is no layer above, the upward move is denied.

After a successful upward move:

- entering `air` behaves like ordinary arrival into `air`
- entering a force floor triggers normal force-floor behavior
- entering `exit` triggers ordinary exit behavior

An `elevator` only pushes upward while the mob is on the `elevator` tile itself. A mob that has already moved into a supported `air` tile above an `elevator` does not continue rising automatically.

## Support Rules

When a mob in upper-layer `air` checks the tile directly below at the same `x,y`, the mob does not fall if the lower tile supports it.

Always supports:

- wall tiles
- blocks
- clone machines, occupied or not
- closed toggle walls
- invisible walls
- real blue walls
- elevator

Does not support:

- thin walls
- southeast walls
- popup walls
- open toggle walls

Doors and sockets:

- keyed doors and sockets support all mobs by default
- exception: if the mob is the player and the normal entry condition is satisfied
  - door: player has the required key
  - socket: `chipsNeeded === 0`
- in that exception case, the tile is removed and the player falls

Blue walls:

- non-player mobs are supported by both real and fake blue walls
- player above a real blue wall:
  - the wall is checked as normal blue-wall behavior
  - real blue turns into wall
  - player is supported
- player above a fake blue wall:
  - fake blue turns into floor
  - player is not supported
  - player falls

Mob-on-mob support:

- any non-player mob supports any other non-player mob
- monsters and blocks can remain above monsters and blocks without falling
- player above a monster is not supported and falls
- monster above the player is not supported and falls
- block above the player is not supported and falls
- player above a block is supported

Elevator support rule:

- `elevator` always supports the `air` tile directly above it
- nothing ever falls onto an `elevator` tile from above
- a mob in `air` above an `elevator` is supported and remains there unless some other rule moves it

## Falling Outcome

- If the lower tile does not support the mob, the mob falls onto the tile below.
- The destination is the same `x,y` on `z - 1`.
- Entering from above should trigger the same ordinary entry effects as entering from any other direction, except where explicitly overridden below.

Examples:

- block falling into water becomes dirt
- player falling onto a key collects the key
- player or monster falling onto a bomb triggers bomb effects
- player falling onto a socket with `chipsNeeded === 0` opens it and falls onto the opened floor

Landing layering:

- if the tile below is a pickup or terrain, the mob ends up on top of it
- example: lower tile is a key, upper mob is a block, final result is block over key

Collision during vertical landing:

- if the player lands on a monster, the player dies
- if a monster lands on the player, the player dies
- if a block lands on the player, the player dies

## Upward Occupancy Interactions

When an `elevator` tries to move a mob upward into a destination cell that is already occupied:

- non-player -> non-player: the upward move does not succeed
- player -> monster: the player dies
- monster -> player: the player dies
- block -> player: the player dies
- player -> block:
  - try a normal horizontal block push in the player's current `N/E/W/S` facing
  - if the push succeeds, the upward move succeeds
  - otherwise the upward move is denied

## Ice and Force Floors

- Landing vertically on ice does not automatically start sliding.
- After landing on ice, the mob behaves as if it had started the level on ice and is free to move.
- Landing vertically on a force floor does trigger force-floor behavior.

## Teleports, Traps, and Cloners

- Teleports are scoped per z-layer.
- A teleport only searches teleports on its own z-layer.
- Trap and cloner connections are also scoped per z-layer.
- There are no cross-layer trap or cloner connections.

Examples:

- z1 can have its own 25 trap connections
- z2 can have another 25 trap connections
- a button on z1 can never target a trap or cloner on z2

## Creature Ordering

- Creature order is the normal per-layer order, appended by layer:
  - all z1 creatures first
  - then all z2 creatures
  - then z3, and so on

## Teeth

- Teeth still chase the player using global `x,y` only.
- Teeth ignore z when deciding how to pursue the player.

## Hints

- Each z-layer can have its own hint text.
- Hint text must be stored per layer, not globally collapsed to the first layer.
- When the player is on a hint tile, the active hint is the hint text for the player's current z-layer.

## Display Rules

- The current z-layer is always rendered.
- Up to the next three lower z-layers are also rendered, if they exist.
- Lower-layer rendering is only a visual aid and does not alter engine behavior.

Air:

- `air` is always rendered as transparency.
- Lower layers are visible through `air`.

Lower-layer parallax:

- Each visible lower z-layer is rendered with parallax.
- Lower-layer tiles are rendered at `0.9x` size.
- Lower-layer tiles are blurred slightly.
- Lower-layer tiles are darkened by `0.25`.

Support highlight:

- Any time a downward fall request is supported by the tile below, draw a blue border around the supporting tile for that tick.
- The blue border is cleared on the following tick.

Elevator rendering:

- `elevator` is rendered procedurally in code.
- The tile is a green floor.
- A dark green rectangle is centered inside it.
- The large centered word `UP` is drawn inside that rectangle.

Failed elevator move highlight:

- Any failed upward move from an `elevator` draws a red border around that elevator tile for that tick.
- The red border is cleared on the following tick.

Lynx falling animation:

- In Lynx only, mobs that are falling scale down smoothly during the fall.
- The scale animates toward `0.9x` to indicate vertical motion.

## Engine Examples

- Player in upper-layer empty space above a locked red door, with no red key:
  - the door supports the player
  - the player stays above it

- Player in upper-layer empty space above a locked red door, with a red key:
  - the door opens
  - the player falls onto that layer

- Player in upper-layer empty space above a fake blue wall:
  - fake blue turns to floor
  - the player falls

- Monster in upper-layer empty space above a fake blue wall:
  - the monster is supported
  - fake blue does not collapse for the monster

- Player in upper-layer empty space above a real blue wall:
  - real blue becomes wall
  - the player is supported

- Block in upper-layer empty space above water:
  - the block falls
  - the water becomes dirt

- Block in upper-layer empty space above a key:
  - the block falls
  - final result is block over key

- Player in upper-layer empty space above a key:
  - the player falls
  - the key is collected

- Monster in upper-layer empty space above another monster:
  - supported
  - no fall

- Player in upper-layer empty space above a monster:
  - unsupported
  - player falls and dies on collision

- Block in upper-layer empty space above the player:
  - unsupported
  - block falls and kills the player

- Player in upper-layer empty space above a block:
  - supported

- Player in `air` directly above an `elevator`:
  - the player is supported
  - the player does not fall
  - the player does not continue rising automatically

- Player standing on `elevator` with `air` above:
  - the player rises one layer

- Player standing on `elevator` with water above:
  - the upward move is denied
  - the player stays on the elevator

- Player standing on `elevator` with force floor above:
  - the upward move succeeds
  - force-floor behavior then applies

- Player standing on `elevator` with exit above:
  - the upward move succeeds
  - ordinary exit behavior applies

- Player standing on `elevator` with a block above while facing east:
  - try to push the block east on the destination layer
  - if that push succeeds, the player rises
  - otherwise the player stays on the elevator

- Monster standing on `elevator` with the player above:
  - the monster moves upward into the player
  - the player dies

- Block in `air` above an `elevator`:
  - the block is supported
  - it does not fall onto the elevator

- Mob landing vertically on ice:
  - lands
  - does not auto-slide

- Mob landing vertically on force floor:
  - force-floor behavior applies

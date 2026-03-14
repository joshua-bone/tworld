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
- All gameplay logic should operate on `x,y,z`, even when `z = 1`.
- Existing single-layer behavior must remain unchanged.
- `z = 1` should preserve current behavior unless a rule below explicitly says otherwise.

## Architecture Constraint

- 3D levels are first-class citizens at the engine level.
- The engine should not branch into separate 2D and 3D gameplay modes.
- The only special-case parsing behavior is at map assembly / DAT grouping time:
  - title suffix grouping into `\1`, `\2`, `\3`, ...
  - remapping special DAT file codes for 3D layers
- After parsing, gameplay systems should operate on one unified 3D model.
- Existing non-3D levels should simply be levels whose cells all live on `z = 1`.

## Compatibility Requirement

- Existing replay behavior must remain intact for non-3D content.
- Replay verification during implementation may use bounded subsets only while the feature is in progress.
- Full compatibility remains the acceptance bar, but intermediate work should validate with focused replay subsets rather than full-corpus sweeps.

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
- Lower-layer rendering must remain visually contiguous as a map.
- Parallax must not introduce visible gaps between adjacent lower-layer tiles.
- The lower map should read as one connected surface, not as separately shrunken tiles floating apart.

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

## PR Plan

The implementation should be split into small, reversible PRs. During the feature build-out, replay validation should stay bounded to focused subsets. Full-corpus replay verification is for the end, not every intermediate PR.

### PR1: 3D Parsing And Unified Level Model

- [x] Group contiguous DAT levels with titles ending in `\1`, `\2`, `\3`, ... into one logical 3D level.
- [x] Strip `\1` from the visible merged title.
- [x] Keep global metadata from layer 1 only.
- [x] Preserve per-layer cell data, creature order metadata, trap connections, cloner connections, and hint text.
- [x] Introduce unified `x,y,z` coordinates in the parsed/prepared level model, even for ordinary `z = 1` levels.
- [x] Keep all non-3D levels represented as single-layer 3D levels rather than a separate 2D path.

Validation:

- [x] focused parser/unit tests for DAT grouping and title stripping
- [x] bounded replay subset:
  - `series3d.test.ts`
  - `CCLP1.dac.tws:1`
  - `CCLP1-lynx.dac.tws:1`

### PR2: Engine Coordinate Lift

- [x] Lift engine board/cell/actor addressing to `x,y,z`.
- [x] Keep existing single-layer gameplay behavior unchanged on `z = 1`.
- [x] Ensure teleports, traps, and cloners are layer-scoped in the runtime model.
- [x] Ensure creature ordering remains z1 first, then z2, etc.
- [x] Preserve teeth targeting by global `x,y` only.

Progress checkpoints:

- [x] carry layered map boards in runtime state
- [x] preserve z-aware actor/debug projection without changing z1 traces
- [x] seed MS and Lynx runtime actor order from layered creature metadata
- [x] select live board cells by active actor/chip z during runtime advancement
- [x] scope live teleport search to the actor's current z-layer
- [x] scope live trap/cloner activation to the actor's current z-layer
- [x] make runtime actor occupancy/lookups z-aware so layers do not collide by shared `pos`

Validation:

- [x] focused engine tests for actor ordering, same-layer trap/teleport scoping, and cross-z teeth targeting
- [x] bounded replay subset:
  - [x] intro MS characterization comparison
  - [x] intro Lynx characterization comparison
  - [x] one CCLP1 MS replay
  - [x] one CCLP1 Lynx replay

### PR3: Air Tile And Downward Movement

- [x] Remap DAT code `32` to `air` on `z > 1` only.
- [x] Seed MS Chip air falling from live state and initial state on the existing floor-movement cadence.
- [x] Extend initial unsupported `air` falling to non-player mobs in MS.
- [x] Extend initial unsupported `air` falling to Lynx.
- [x] Implement support checks from the immediately lower layer only in MS.
- [x] Implement support checks from the immediately lower layer only in Lynx.
- [x] Implement downward movement as force-floor-style movement toward lower `z` in MS.
- [x] Implement downward movement as force-floor-style movement toward lower `z` in Lynx.
- [x] Limit vertical movement to one z-layer per tick in MS.
- [x] Limit vertical movement to one z-layer per tick in Lynx.
- [x] Apply falling from initial state when starting unsupported in `air`, including non-player mobs such as blocks, in MS.
- [x] Apply falling from initial state when starting unsupported in `air`, including non-player mobs such as blocks, in Lynx.
- [x] Implement downward landing effects and the ice exception in MS.
- [x] Implement downward landing effects and the ice exception in Lynx.
- [x] Implement collision-on-landing rules, including block/monster kills on player, in MS.
- [x] Implement collision-on-landing rules, including block/monster kills on player, in Lynx.

Validation:

- [x] focused MS engine tests for:
  - falling into water
  - falling onto pickups
  - falling onto bombs
  - falling onto ice
  - falling onto force floors
  - falling onto player / monster / block
- [x] focused Lynx engine tests for:
  - falling into water
  - falling onto pickups
  - falling onto bombs
  - falling onto ice
  - falling onto force floors
  - falling onto player / monster / block
- [x] bounded replay subset for regression safety on ordinary non-3D levels

### PR4: Elevator Tile And Upward Movement

- [x] Remap DAT code `57` to `elevator` only when the grouped level has higher z-layers; allow ordinary `Exited_Chip` on single-layer levels and on `z = 1` when there is no higher layer.
- [x] Implement elevator upward movement as force-floor-style movement toward higher `z`.
- [x] Implement MS Chip elevator movement on the existing floor-movement cadence.
- [x] Implement non-player elevator movement in MS.
- [x] Implement Lynx elevator movement.
- [x] Restrict legal upward destinations to:
  - `air`
  - force floor
  - `exit`
- [x] Restrict MS Chip upward destinations to `air`, force floors, and `exit`.
- [x] Restrict non-player and Lynx upward destinations to the same rules.
- [x] Implement upward occupancy interactions.
- [x] Implement player-up-into-block horizontal push using current `N/E/W/S` facing.
- [x] Make `elevator` support the `air` tile directly above it.
- [x] Ensure nothing ever falls onto an `elevator`.

Validation:

- [x] focused engine tests for:
  - successful rise into air
  - denied rise into non-air terrain
  - rise into force floor
  - rise into exit
  - rise into player / monster / block cases
  - supported air above elevator
- [x] bounded replay subset for ordinary non-3D regression safety

### PR5: Per-Layer Hints And Connected-Item Isolation

- [ ] Make hint text layer-local.
- [ ] Show the active hint for the player’s current `z`.
- [ ] Lock teleport searches to the player or actor’s current z-layer.
- [ ] Lock trap and cloner connections to their current z-layer only.

Validation:

- [ ] focused engine/use-case tests for per-layer hints and same-layer-only connections
- [ ] bounded MS/Lynx replay subset

### PR6: Renderer And Visual Stack

- [ ] Render the current z-layer always.
- [ ] Render up to the next three lower z-layers if present.
- [ ] Render `air` as transparency.
- [ ] Render lower layers with contiguous parallax presentation:
  - no gaps between adjacent lower-layer tiles
  - `0.9x` scale treatment
  - slight blur
  - `0.25` darkening
- [ ] Procedurally render `elevator`.
- [ ] Add blue support-border overlay for one tick after supported downward checks.
- [ ] Add red failure-border overlay for one tick after failed upward elevator moves.
- [ ] Add smooth Lynx falling scale toward `0.9x`.

Validation:

- [ ] focused renderer/snapshot tests
- [ ] manual visual smoke check in browser player

### PR7: Hand-Stitched Showcase Set

- [ ] Create a small hand-authored showcase level set named `3DINTRO`.
- [ ] Place it alongside the existing intro data so it is visible in the startup console menu.
- [ ] Add corresponding MS and Lynx solution / replay files if needed for smoke verification.
- [ ] Include levels demonstrating:
  - air falling
  - support from doors/socket
  - real vs fake blue wall behavior
  - nonplayer/nonplayer support
  - player/monster/block vertical collisions
  - elevator rise success and failure
  - player-up-into-block push
  - per-layer hints
  - per-layer teleports
  - per-layer traps/cloners
  - ice landing exception
  - force-floor landing

Placement:

- [ ] `data/3DINTRO.dat`
- [ ] matching set entries alongside the intro sets in `sets/`
- [ ] matching solution/replay assets in `save/` as needed

Validation:

- [ ] run the showcase set manually in both MS and Lynx modes
- [ ] add focused smoke tests if practical

### PR8: Replay/Undo/Editor Compatibility Sweep

- [ ] Ensure undo/history captures the new z-aware state without lossy shortcuts.
- [ ] Ensure interactive projection and replay export preserve `z`.
- [ ] Verify non-3D replays still pass on a bounded but representative subset.
- [ ] Verify 3D showcase replays pass in both MS and Lynx.

Validation:

- [ ] bounded replay subset:
  - intro MS
  - intro Lynx
  - one CCLP1 MS replay
  - one CCLP1 Lynx replay
  - one CCLP2 replay
  - one EvanD1 replay
  - all `3DINTRO` smoke replays

### Final Acceptance

- [ ] browser/manual play works for the showcase set in both rulesets
- [ ] bounded replay subset is green throughout development
- [ ] full replay frontier is rerun once the feature stack is complete

# Hybrid v1 Tile World adapter

This directory is the browser presentation adapter for the separately built
HybridCC2026 deterministic engine. Tile World supplies the DAT catalog, shared
player shell, rendering, audio, progress, modal, and replay-file UI. Gameplay
state and scheduling remain authoritative in the WebAssembly engine.

## Pinned engine

`engine/engine-manifest.json` records the exact HybridCC2026 source revision,
merge, pull request, ABI version, and SHA-256 digest of both shipped artifacts.
`wasmArtifact.test.ts` verifies those bytes rather than trusting filenames.

The current artifact is Hybrid v1 ruleset 1.0.5, ABI/snapshot record version 2.
It includes PR43's immediate logical occupancy and durable player-push state,
PR44's HCR1 replay-version correction, and PR47's generic pushable-actor
transaction shared by direct pushes and side slaps. The browser refuses an ABI,
snapshot, or exact ruleset mismatch.

M3 PR46 corrects classic DAT composition for a dirt block layered over a real
blue wall: it is one recessed `becomes_wall` departure, not a block occupying
an already-solid trick wall. The ruleset and ABI are unchanged because this is
an immediate DAT-to-native conversion correction.

## Timing and state boundary

- The engine advances exactly once per 100 ms `logic_step` (10 Hz).
- The shared browser input collector samples every 25 ms (40 Hz), preserving a
  held direction until the next deterministic boundary.
- Presentation advances every second host sample (20 Hz). Duplicate 25 ms host
  samples intentionally render the same presentation coordinate.
- At StartMove, the engine vacates the origin and gives the actor's destination
  immediate logical occupancy. `actor.logicalPosition` and `cell.occupant` are
  gameplay truth even while a movement interval is unfinished.
- `playerMotion`, `terminalMotion`, and per-actor movement records are immutable
  interpolation facts. They do not reserve cells or change gameplay occupancy.
- `playerPush` is durable presentation state. A rejected direction remains a
  push while held; an accepted direct push remains a push for the whole
  interval; release, completion, or lethal contact clears it.
- Direct pushes and paired-input side slaps use the engine's same generic
  pushable-actor transaction. A side slap moves Chip along the accepted primary
  direction and the pushed actor along the secondary direction atomically; it
  does not put Chip in the pushing pose.
- A retained completed `playerMotion` can finish camera interpolation, but it
  cannot determine live facing. Live facing comes from `playerPush` during
  contact, the current movement while moving, and otherwise the authoritative
  actor direction.

The adapter projects those facts into Tile World's shared rendering model. It
does not infer collisions from sprites, retain a second occupancy map, invent
movement cooldowns, or reconstruct held push state from one-shot events.
Teleport events remain available for every actor, while the classic teleport
sound is projected only when the event actor is Chip.

## Acceptance coverage

`HybridCcV1RealWasmAcceptance.test.ts` exercises the actual shipped artifact,
including immediate occupancy, N+1-to-N+1 and N+1-to-N+2 track adjacency,
monotonic coordinates under duplicate host samples, every directional force
override input phase, steady held/released pushing, full-interval block
pushing, atomic paired-input side slaps, rejected facing after an earlier
completed move, teleport timing, lethal contact, post-death simulation, wall
reveal, and classic DAT thief conversion.

The bounded local gate is:

```sh
nvm use
npm --workspace web run test -- --run src/player-web/impl/hybridcc-v1
npm --workspace web run typecheck:all
BASE_PATH=/tworld/ npm --workspace web run build
```

After those checks, the production build is inspected through the real browser
route at `/tworld/dev/hybridcc/v1`. A public release is accepted only after the
same route is verified on GitHub Pages.

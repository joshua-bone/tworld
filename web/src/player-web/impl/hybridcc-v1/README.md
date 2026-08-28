# Hybrid v1 Tile World adapter

This directory is the browser presentation adapter for the separately built
HybridCC2026 deterministic engine. Tile World supplies the DAT catalog, shared
player shell, rendering, audio, progress, modal, and replay-file UI. Gameplay
state and scheduling remain authoritative in the WebAssembly engine.

## Pinned engine

`engine/engine-manifest.json` records the exact HybridCC2026 source revision,
merge, pull request, ruleset, ABI version, and SHA-256 digest of both shipped
artifacts.
`wasmArtifact.test.ts` verifies those bytes rather than trusting filenames.

The current artifact is Hybrid v1 ruleset 1.0.11, ABI/snapshot record version 2.
It includes PR43's immediate logical occupancy and durable player-push state,
PR44's HCR1 replay-version correction, PR45's generic pushable-actor transaction
shared by direct pushes and side slaps, PR48's independent destination timing
plus actor-specific rejected facing, M4 PR51's staged dependent-push admission,
M5 PR54's source-independent terrain-arrival arbitration, M6 PR55's
signal-driven release ordering, M7 PR56's entry-scoped teleport activation,
and M7 PR58's atomic adjacent-pad self-return occupancy. A button edge that
makes a later cloner actor ready is resolved
before an immediately competing Player move without globally reordering
unrelated nonplayer actors. On completion of a real arrival, force terrain
tries its automatic direction first. An unblocked
automatic move remains authoritative; only a completely blocked automatic move
can offer the player a legal same-boundary N+1 fallback. Constructing an actor
on force terrain is not an arrival and does not create that offer. The browser
refuses an ABI, snapshot, or exact ruleset mismatch.

Teleport search retains its ordered remote candidates and then tries the source
pad as the final candidate. A legal departure from the source remains a
teleport-owned move. Only when every remote and source departure is blocked is
that actor's entry-scoped activation consumed. Eligible ordinary Player/AI
intent then receives the same boundary through the common planner, and the pad
acts as ordinary floor for that actor until it completes an exit and later
re-enters. Opening an exit underneath a dormant resident does not re-arm it.
If a remote pad exits through the actor's own logical source cell, the actor
does not collide with itself. The engine publishes one normal N+2
discontinuous interval, retains exactly one occupied cell, and re-arms the next
teleport activation only when that interval completes.

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
- A pushed actor commits its own departure before the player is admitted into
  the vacated cell. If that departure changes the terrain beneath it, the
  player's follow-up is tested against the changed terrain. The player can
  therefore remain stationary and visibly pushing while the pushed actor
  completes its movement.
- Block-moving audio is a loop derived from an active `pushableActor` movement
  track. It lasts for that pushed actor's complete N+1 or N+2 interval and ends
  at its completion; a later autonomous ice/force interval does not inherit it.
- A retained completed `playerMotion` can finish camera interpolation, but it
  cannot determine live facing. Live facing comes from `playerPush` during
  contact, the current movement while moving, and otherwise the authoritative
  actor direction.

The adapter projects those facts into Tile World's shared rendering model. It
does not infer collisions from sprites, retain a second occupancy map, invent
movement cooldowns, or reconstruct held push state from one-shot events.
Teleport events remain available for every actor, while the classic teleport
sound is projected only when the event actor is Chip.

During a cloner-owned launch, the adapter also draws a presentation-only copy
of the departing actor over the source cloner. This is not a second logical
occupant: collision and actor counts continue to come solely from the engine.
When the launch completes, the real replacement actor takes over the same
source position without an empty frame.

## Acceptance coverage

`HybridCcV1RealWasmAcceptance.test.ts` exercises the actual shipped artifact,
including immediate occupancy, N+1-to-N+1 and N+1-to-N+2 track adjacency,
monotonic coordinates under duplicate host samples, every directional blocked-
force fallback input phase, automatic-force priority over conflicting input,
the first arrival and full multi-tile Tunnel Clearance lateral force corridor,
steady held/released pushing, full-interval block pushing, the Oasis count-one
blocked-follow and count-two admitted-follow cases, atomic paired-input side
slaps, rejected facing after an earlier completed move, teleport timing,
source-last teleport departure, adjacent-pad self-return through the real host
and renderer, total-failure same-boundary ordinary fallback, actor-local
teleport dormancy, lethal contact, post-death simulation, wall reveal, and
classic DAT thief conversion. The cloner fixture additionally
verifies signal-release collision ordering and uninterrupted source
presentation against the pinned real WebAssembly engine.

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

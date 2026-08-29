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

The current artifact is Hybrid v1 ruleset 1.0.16, ABI/snapshot record version 2.
It includes PR43's immediate logical occupancy and durable player-push state,
PR44's HCR1 replay-version correction, PR45's generic pushable-actor transaction
shared by direct pushes and side slaps, PR48's independent destination timing
plus actor-specific rejected facing, M4 PR51's staged dependent-push admission,
M5 PR54's source-independent terrain-arrival arbitration, M6 PR55's
signal-driven release ordering, M7 PR56's entry-scoped teleport activation,
M7 PR58's atomic adjacent-pad self-return occupancy, M8 PR60's category-aware
released-trap arbitration, and sandbox PR63's explicit DAT 51–63 compatibility
policy plus replay-publication guardrails, sandbox PR65's block-transaction
and ordered-slap proof corpus, and sandbox PR67's ice/force-floor ownership,
arrival, continuity, corner, boost, random-force, and mixed-track proofs,
PR69's destination-resolved N+1/N+2 movement timing, and PR71's systemic
moving-pushable contact settlement plus explicit force-run provenance, while
PR73 certifies the existing signal, toggle-wall, tank, trap, and cloner rules
against the expanded linked-device sandbox and PR75 certifies classic DAT
teleports without changing engine behavior. A button edge that
makes a later cloner actor ready is resolved
before an immediately competing Player move without globally reordering
unrelated nonplayer actors. On an ordinary or plain-ice arrival, force terrain
tries its automatic direction first; only a completely blocked automatic move
can offer the player a legal same-boundary N+1 fallback. A qualifying automatic
force-to-force run instead allows current legal side or backward input to
preempt the next force arrow. That run permission can cross terrain-owned ice,
including corners and reversals, but a player-selected force departure,
ordinary terrain, boots, teleports, traps, cloners, or death clears it. Plain
ice-to-force never creates run permission. Constructing an actor on force
terrain is not an arrival and does not create a fallback offer. The browser
refuses an ABI, snapshot, or exact ruleset mismatch.

A released trap preserves distinct actor authorities. Player tries current
sampled input before facing. Any actor with Hybrid's generic pushable trait
tries concrete own or external intent before facing, so a direct or side-slap
Player push wins in either actor-list order. Ordinary non-pushable actors retain
trap-facing first and may use eligible ordinary AI only as fallback. Holding
traps still reject every departure. Tile World supplies the sampled input and
renders the engine's accepted transaction; it does not reproduce this ordering
in browser code.

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
- Movement speed is an engine-published transition fact. The browser verifies
  start boundary, completion boundary, and sample count agree; it never treats
  `forced`, `sliding`, or `boosted` as synonyms for N+1. An unprotected ice or
  force-floor destination is N+1, while an ordinary destination is N+2 even
  when terrain still owns the movement.
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
- Player contact with a generic pushable whose accepted interval is strictly
  between StartMove and FinishMove first settles that interval through its
  normal Finish lifecycle, then re-evaluates the complete attempted move.
  Aligned follow-up pushes and perpendicular direct pushes or side slaps can
  therefore succeed without treating an interpolated sprite as a blocker;
  anti-parallel contact remains blocked.
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

## Built-in Legacy DAT Sandbox

The Hybrid v1 set selector has a separate **Sandbox** section. Its built-in
`Legacy DAT Sandbox` is still a classic DAT file: the browser passes its bytes
through the production DAT converter first. Only after that conversion does
the host apply the sandbox's per-room Hint JSON through
`hybridcc_v1_native_level_apply_hint_overlay`. The sidecar is admitted only for
the exact built-in asset identity and SHA-256 digest; a local DAT with the same
filename never receives the overlay.

Sandbox PR9 publishes 89 physical DAT entries with 257 navigable Hint rooms and
261 frozen scenario IDs across 266 physical placements. Its evidence contains
134 independently verified terminal reference replays (120 wins and 14
intentional losses) plus 100 bounded deterministic proofs. The proof policy
identifies 127 strict causal placements and 139 retained executable placements.
Bounded proofs are accounting evidence, not playable replays; every
physical entry must have either terminal or bounded evidence. The bundled
official `CCLP2.dat` is omitted
from the Hybrid v1 catalog before its bytes are loaded or converted; this does
not alter MS/Lynx catalogs or user-uploaded DAT files.

Terminal reference HCR1 files are verified against the enriched canonical HCLV bytes
before they enter the replay menu. They are shown as **Reference replay**, are
read-only, and sort behind locally saved or imported runs. The replay index is
bound to the DAT, Hint JSON, HCR1 bytes, ruleset, and enriched level hash.

The checked-in browser assets are synchronized from HybridCC2026 with:

```sh
node web/src/player-web/impl/hybridcc-v1/sandbox/syncSandboxAssets.mjs /path/to/HybridCC2026/sandbox/legacy_dat/generated
node web/src/player-web/impl/hybridcc-v1/sandbox/syncSandboxAssets.mjs --check /path/to/HybridCC2026/sandbox/legacy_dat/generated
node web/src/player-web/impl/hybridcc-v1/sandbox/checkSandbox.mjs
```

The sync command replaces only the dedicated
`hybridcc-v1/sandbox/assets` directory. It is not part of local DAT import and
does not teach Tile World to interpret general sidecar files. Sync also writes
a canonical asset manifest with the exact allowed files, byte hashes, and
HybridCC source commit. The no-argument check is self-contained for CI: it
requires that provenance to match the pinned Wasm engine, rejects missing or
extra payloads, and rechecks every DAT, JSON, and HCR1 byte identity without a
sibling HybridCC checkout.

## Acceptance coverage

`HybridCcV1RealWasmAcceptance.test.ts` exercises the actual shipped artifact,
including moving-pushable settlement and re-push from strict-interior motion,
perpendicular push/slap settlement, anti-parallel rejection, force-run override
provenance, its permitted ice bridge, and every lineage-breaking case. It also
retains immediate occupancy, destination-resolved N+1 fast landing/internal
slide continuity, and its direct handoff to an N+2 ordinary landing,
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
presentation against the pinned real WebAssembly engine. Released-trap
fixtures verify Player intent-first, generic pushable external-intent priority
in both native actor orders, and ordinary-monster facing-first through that
same pinned engine and production adapter. Sandbox acceptance converts all 89
entries through the shipped Wasm, proves the four DAT 60–63 sanitation messages
remain nonmodal notes, verifies every enriched level hash, plays all 134
terminal references to their declared win or loss outcome, and accounts for
all 100 bounded proofs without offering nonexistent replay files. Rendering tests cover each
DAT special-art code 51–63 and the retained native-only marker fallbacks.

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

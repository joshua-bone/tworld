# P2A runtime observation and human-review packets

## Status and boundary

P2A establishes trusted perception of live MS and Lynx execution. It does not
plan a route, infer a puzzle solution, align donor strategies, prove a subgoal,
or construct a replay. Those reasoning and proof layers begin in P3.

The checked P2A packet set becomes authoritative runtime-characterization
evidence only after `npm run ccsolver:p2a:generate` has completed and a separate
`npm run ccsolver:p2a:check` reproduces every checked byte. The canonical JSON
is the machine-readable evidence. Each `review.md` is a deterministic,
non-authoritative human projection of that JSON.

P2A runtime DTOs remain preview values rather than frozen root artifact
envelopes. Opaque run and checkpoint authorities are deliberately absent from
durable output.

Runtime entry accepts only the standard CC1 tile vocabulary. It first excludes the six Tile World
extension codes `0x70`–`0x75` (Sandbag, Bowling Ball, Cloud, Hook, Ice Block,
and Pet Carrier) on either plane or any otherwise-valid layer, then applies the
pinned DATTools cell-validity gate. Valid multi-layer geometry remains in
scope. Both manual and replay starts reject these sources before
creating an engine session. The legacy game engines retain their extension
support; it is intentionally not part of CCSolver perception, planning, or
curriculum scope.

Initial actors retain LevelFacts placement identities. Actors that appear only
at runtime receive target-scoped projected identities whose continuity is
preserved by exact checkpoints; P2A does not claim causal clone lineage.
The delivered P2B causal-journal foundation adds source-plus-clone-ordinal
lineage to authoritative spawn events. It does not retroactively turn P2A's
state-only actor projection into a causal claim.

## Delivered seam

The pure `@tworld/ccsolver` package defines target-neutral runtime values and a
`SolverRuntimePort`. Tile World's web-side composition supplies independent MS
and Lynx adapters over the existing engines and undo checkpoints. The shared
engine-neutral kernel owns run/checkpoint authority and provides:

- manual and true replay initialization;
- one exact native manual poll or replay-owned tick at a time;
- detached semantic observation and deterministic full-map/box projection;
- first-terminal latching while later world ticks may continue;
- exact checkpoint capture, independent clone, restore, and disposal;
- target, owner, mode, capacity, and disposed-handle enforcement; and
- transactional error behavior through clone-before-observe/advance.

An observation includes level and LevelFacts bindings, target/mode provenance,
native timing, polled/applied input, replay cursor/deadline, initial random-slide
header metadata, RNG state
fingerprints, every semantic cell, player, deterministic actor observation
order, optional exact target collection/index positions, inventory, remaining
requirements, devices, exact/continuation/semantic fingerprints, and the
latched terminal result. Collection positions do not claim one target-native
execution order across different actor collections. A render projection is
semantic scene data bound to the same exact observation fingerprint; P2A does
not render pixels or claim target-native visual depth for same-stratum items.

Despite its preview field name, `fingerprints.semantic` is a target-scoped
canonical digest of the public observation. It does not establish MS/Lynx
alignment, parity, or target-neutral state equality. A genuinely normalized
alignment digest is deferred until P2B/P3 has evidence for that projection.

The port treats manual input codes as target-native opaque values. Code `0` is
the explicit none/release poll used by the current MS and Lynx adapters. MS
legacy preserve (`1568`) and Lynx repeated-held behavior are adapter-level
characterizations, not universal meanings. Replay mode rejects manual polls and
lets the loaded replay own decisions. Native ticks are never presented as one
shared cross-ruleset speed.

Replay best-time handling is deliberately target-specific. MS enforces the
native deadline in-engine and projects an exceeded replay deadline as
`lost` with cause `cc1:replay-deadline`. Lynx preserves and reports the same
header metadata but does not enforce MS deadline semantics; a nonwinning Lynx
run remains `running` until a separately bounded outer verifier stops it. P2A
tests this divergence instead of inventing parity.

## Checked review cases

The generator uses direct MS/Lynx runtime adapters and emits full observations
and full semantic render values with compact deltas. It includes no handles,
raw checkpoints, wall-clock timestamps, or workstation paths.
Each packet directly pins the exact DAT map and DAC series bytes, their checked
repository revision, its target-specific runtime-adapter contract revision, the
engine source commit, and the exact LevelFacts digest.

### Key Pyramid (`cclp1-001`)

For each target, the packet contains:

1. a separately initialized manual start (not replay-executed, but using a
   donor-derived initialization seed and therefore not donor-independent);
2. a true replay start from the exact matching CCLP1 donor TWS; and
3. the first donor-caused inventory or remaining-requirement change.

Every replay-derived point is labeled `donor-runtime-characterization`; it is
not claimed to be a target-neutral strategy. The generator pins both the whole
TWS blob and the exact level-entry bytes, plus password, encoded seed, replay
deadline, and move count. The measured strict search bounds are one native
replay tick for MS and four for Lynx. Both donors first move Chip from
`(15, 19, 0)` to `(16, 19, 0)` and collect one red key; the different observed
native boundaries remain explicit.

### Intro 8 (`intro-008`)

For each target, the packet contains the manual start, one east poll, and one
bounded useful followup change. It uses the existing characterization seeds:
MS `123456789` and Lynx `362436069`.

The east poll is named `blocked-east-poll` only after verifying that Chip stays
at `(4, 4, 0)`. Its interpretation is exactly “blocked movement observation;
not button evidence.” Followups retain their exact input:

- a change during an explicit no-input poll is named
  `first-no-input-semantic-change`; and
- when the bounded historical cadence reaches a second east poll, that point is
  named `second-east-poll-semantic-change` rather than being described as
  autonomous behavior.

The followup bound is four native polls for each target.

## Files and commands

Canonical packets:

- `ccsolver/fixtures/golden/p2a/cclp1-001/{ms,lynx}/runtime-review.json`
- `ccsolver/fixtures/golden/p2a/intro-008/{ms,lynx}/runtime-review.json`

Derived human reviews:

- `ccsolver/fixtures/golden/p2a/cclp1-001/review.md`
- `ccsolver/fixtures/golden/p2a/intro-008/review.md`

From the repository root:

```sh
npm run ccsolver:p2a:generate
npm run ccsolver:p2a:check
```

The generator builds every value before transactionally replacing the six
checked outputs. The checker rebuilds from pinned source bytes and compares
exact file contents. Both replay/resource and followup searches are hard
bounded; CI applies an additional ten-minute process step timeout.

## Human review checkpoints

The solver becomes progressively more judgeable rather than waiting for a
finished replay:

1. **P2A — exact perception (available now):** inspect exact JSON plus the
   compact Markdown summaries for coordinates, ticks, input ownership,
   inventory/requirements, actors, devices, and changed cells.
2. **P3A — backward prerequisite graph (available now):** inspect terminal-first AND/OR graphs,
   alternatives, rejected achievers, and the human-language theory of the
   level. This is the first checkpoint for judging solver reasoning.
3. **P3B — exact contextual witnesses (available now):** inspect executable subgoal segments
   from exact full-world checkpoints, including entry/exit observations and
   contract deltas.
4. **P4A — annotated map evidence (available now):** inspect graphical
   starting/ending map sections, plan-intent routing, exact observed endpoints,
   points of interest, state changes, and the separate failed-canary states.
5. **P5 — full-level proof (available now):** inspect the pre-execution plan,
   composed forward execution, and certified replay from canonical
   initialization.
6. **P4B — whole-level dossier (available now):** inspect paired 32-by-32 maps,
   the terminal-rooted plan, every exact subgoal boundary, certificates, and
   downloadable replay files in one static review surface.

P2A can prove that CCSolver sees a runtime state accurately. It cannot yet prove
that CCSolver understands why a level works or can solve it.

## Deferred work

The P2B foundation now adds bounded causal semantic journals for the Key
Pyramid slice and named standard-mechanic canaries. Full P2 mechanics coverage,
native diagnostic-window adaptation, and causal-contract integration remain
follow-on work. P3A terminal-first regression, P3B exact contextual witnesses,
P4A annotated boundary evidence, P5 composition/certification, and the P4B
whole-level dossier are delivered for the Key Pyramid reference slice.

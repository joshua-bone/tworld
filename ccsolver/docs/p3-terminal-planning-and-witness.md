# P3 terminal-first planning and contextual witnesses

## Status and authority

P3A and P3B are implemented as a bounded vertical slice. The pure planning
kernel explains prerequisites backward from each target exit; the pure witness
executor proves a selected candidate forward through the existing MS or Lynx
runtime. Neither layer reverse-simulates gameplay.

The checked Key Pyramid files are preview artifacts, not frozen root protocol
schemas. They are authoritative for this P3 characterization only after
`npm run ccsolver:p3:check` regenerates all five outputs byte-for-byte.

## Big-plan position

```text
P0/P1 static facts and topology
              |
P2A exact runtime perception
              |
P3A terminal-first theory  <--- delivered here
              |
P3B exact leaf witness     <--- delivered here
              |
P4A annotated map panels   <--- delivered graphical review
              |
P5 continuous full-level replay and certification <--- next
```

P3 answers two different questions:

- P3A: what would have to become true before an exit can be reached?
- P3B: did one selected subgoal actually run from the claimed complete state?

An exact leaf witness does not prove its unresolved parent plan or the whole
level.

## P3A planning contract

`@tworld/ccsolver/plan` is a pure layer. Its initial closed vocabulary is:

- `ReachExit(exit)`;
- `Reach(region)`;
- `Collect(resource, occurrence, source placement)`; and
- `Unlock(gate, requirement)`.

Unlock requirements distinguish three materially different semantics:

- consume an inventory resource, as with an ordinary colored key and door;
- possess an inventory resource without consuming it, as with a green key; or
- require a remaining counter to be zero, as with chips and a socket.

State effects likewise distinguish inventory from remaining requirements.
Repeated chip collections carry distinct occurrence and placement identities.
This prevents a socket from being modeled as though it consumed ten owned
inventory items.

The planner creates one root per target exit, regresses each goal through
target-scoped declarative achievers, and emits:

- a deterministic AND/OR goal graph;
- a backward trace with `authored`, `forward-derived`, and
  `backward-regressed` provenance;
- forward-ordered candidate or unresolved plan previews;
- separate inventory and remaining-requirement ledgers; and
- bounded diagnostics for unknown/dynamic premises, missing achievers, cycles,
  resource inconsistency, and configured limits.

Graph-local public IDs are canonical ordinals accepted by the artifact stable-ID
grammar. Canonical predicate keys remain private implementation details. Static
unknowns and dynamic boundaries remain unresolved; they never become traversable
merely because an operator would like them to be.

## P3B witness contract

`@tworld/ccsolver/snippets` is also pure. It consumes one contiguous segment of
a candidate or unresolved expanded plan and a closed runtime-observation
contract. A contract
may test player position, inventory, remaining requirements, placement presence,
actor state, device state, terminal state, and native-state fingerprints. It
also declares entry requirements, invariants, a stop predicate, ending
requirements, a bounded decision count, and must/may/must-not-change
footprints.

Execution is forward and target-native:

1. start from the pinned manual or replay source;
2. execute the exact prefix in the real target engine;
3. capture an exact full-world checkpoint and entry observation;
4. restore an independent branch;
5. execute the same bounded snippet on the uninterrupted and restored runs;
6. compare exact fingerprints and full normalized observations at every
   decision boundary; and
7. capture content-addressed entry/end observations and semantic renders.

Only an exact join can verify. The result says `selected-segment-only` and
retains the parent's candidate/unresolved status, so verification cannot upgrade
the parent plan. Semantic-only equality is retained as a failure, not presented
as composition. Checkpoint handles remain process-local and never enter checked
output. The bounded cache is keyed by source/runtime identity, initial exact
state, initialization, prefix, and expected entry boundary; a cache clear
followed by prefix reconstruction must produce the same witness.

For selected plan resource effects, P3B compares aggregate entry-to-end deltas
on the exact inventory or remaining-requirement axis, including sign and
magnitude. A contract cannot verify an intended `+1` collection merely because
the resource changed by some other amount.

The P3B delta is deliberately named `observedChanges`. It records co-observed
before/after state and makes no causal event claim. The complete ordered causal
journal remains P2B work.

## Key Pyramid result

The checked review is
[`fixtures/golden/p3/cclp1-001/review.md`](../fixtures/golden/p3/cclp1-001/review.md).
It is the first place a human can inspect solver reasoning on a real level.

For each target, P3A starts at the sole exit, identifies the socket and ten
placement-distinct chips, and retains a provisional red-door branch. The whole
terminal theory remains `unresolved`: P1 candidate topology does not prove the
dynamic terminal boundary, joint route feasibility, ordering, or the level's
time constraint.

P3B separately verifies one safe local segment from a donor-independent manual
initialization with seed zero:

- start: Chip at `(15,19,0)`, no red key, ten chips remaining;
- intent: move east to the exact red-key placement at `(16,19,0)`;
- MS realization: one east poll, verified at native tick `0`;
- Lynx realization: east plus three neutral polls, verified at native tick `3`;
- end: Chip stationary at `(16,19,0)`, red-key inventory `1`, the exact pickup
  placement absent, and ten chips still remaining.

The adjacent blue key is retained as an equally immediate alternative; it is
not falsely treated as an achiever for the red door. Both target witnesses bind
the unresolved parent theory and the exact one-step segment within it; there is
no second plan reusing the parent's identity. Cache clear/rebuild and
restored-versus-uninterrupted execution reproduce the complete canonical
witness.

The Markdown contains compact textual start/end map crops and plan-intent POIs.
They remain useful early review aids; P4A now derives the separate graphical,
content-addressed annotation surface from these checked bytes. Neither view
proves a full route.

## Checked outputs and commands

The five outputs are:

- `ccsolver/fixtures/golden/p3/cclp1-001/ms/terminal-plan.json`;
- `ccsolver/fixtures/golden/p3/cclp1-001/ms/red-key-witness.json`;
- `ccsolver/fixtures/golden/p3/cclp1-001/lynx/terminal-plan.json`;
- `ccsolver/fixtures/golden/p3/cclp1-001/lynx/red-key-witness.json`; and
- `ccsolver/fixtures/golden/p3/cclp1-001/review.md`.

Regenerate intentionally with:

```sh
npm run ccsolver:p3:generate
```

Verify without writing with:

```sh
npm run ccsolver:p3:check
```

The runner builds all bytes before replacing any output and rolls back a failed
promotion. The bounded CI check has a ten-minute timeout; the focused local
generation is measured in seconds. No corpus sweep is part of P3 because this
slice changes neither static analysis nor cohort selection.

## Limits and next human checkpoint

P3 does not provide a solved Key Pyramid replay, a causal event journal, or a
complete route. P4A now turns these exact boundaries into mandatory annotated
map panels, keeps planned routing distinct from observed endpoints, and adds a
failed-attempt view plus durable human review status. P5 is the next checkpoint:
all reviewed subgoals must execute continuously into a certified full-level
win.

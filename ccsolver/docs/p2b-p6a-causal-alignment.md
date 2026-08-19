# P2B causal journals and P6A semantic alignment

P2B and P6A ship as one forward vertical slice. P2A established exact,
read-only world-state perception. P3 through P5 then used those states to plan,
witness, execute, and certify Key Pyramid. P6 cannot safely align executions by
inferring causes from adjacent snapshots, so this P2B foundation supplies the
missing ordered event authority for the first P6A slice before P6A consumes it.

This is not a return to an earlier product milestone. It adds a lower-level
capability that was deliberately deferred, then immediately exercises it in a
higher-level cross-ruleset feature.

## Causal journal authority

`SolverRuntimePort.readEvents` exposes a detached, non-consuming, bounded page
of target-neutral causal events. Causal capture is explicit opt-in. When it is
not requested, the existing runtime token and exact fingerprint remain
byte-for-byte compatible and `readEvents` fails explicitly rather than
pretending that an empty journal is complete.

Each retained event records:

- a contiguous sequence and a semantic occurrence ordinal;
- target, mode, native tick, and transition phase;
- stable actor, placement, device, resource, and terminal identities when the
  native action provides them;
- before/after coordinates and a closed kind-specific detail value;
- optional plan and command identities; and
- an authority declaration that distinguishes a native action hook, a runtime
  command, a diagnostic, a boundary delta, or the terminal latch.

Chronological proximity is never promoted to causality. `causedBySequences`
contains only explicit earlier causes. An event without native command linkage
remains authoritative for the action but says that its causality is
unattributed.

The journal has a caller-selected finite capacity. Exhaustion records the first
omitted sequence and the omitted count, stops retaining further events, and
does not change gameplay. An overflowed journal is useful diagnostic evidence
but is rejected as complete alignment input.

Checkpoint metadata includes the causal-journal cursor, retained count, and
retention status when capture is enabled. Restore preserves that continuation.
Event reads and metadata reads are checked for exact nonmutation, binding and
mode continuity, and agreement between page range and checkpoint companion
state.

## Native adaptation

MS and Lynx emit purpose-built raw action records at the mutation seams that
actually perform movement, collection, inventory or remaining-requirement
changes, pickup/door/socket/toggle/clear-floor/popup-wall map changes, standard
button-device activation, teleport relocation, actor lifecycle, death, and
terminal transitions. The CCSolver adapters map those target-native records to
stable semantic identities. Thief evidence covers the four standard boots;
expanded tool tiles remain outside solver scope.

The native sinks are optional and retain no engine-owned observer state. Tests
compare capture-disabled and capture-enabled execution to prove that observing
does not alter gameplay, native state, randomness, or terminal results.

Command attribution follows target timing rather than forcing parity. A target
may settle an initiated move several native ticks after the nonzero route
command. The adapter carries the exact initiating command through its
checkpointed sidecar when the target exposes that relationship; otherwise the
event remains explicitly unattributed.

## P6A alignment

`@tworld/ccsolver/alignment` accepts only complete, non-overflowed first-page
journals for the same level facts and runtime mode. It performs bounded,
deterministic weighted sequence alignment with three evidence strengths:

- **hard** anchors use stable irreversible semantic effects such as a specific
  pickup, opened gate or socket, device mutation, teleport pair, or terminal;
- **medium** anchors combine semantic state and causal context; and
- **soft** anchors use movement or position only as supporting evidence.

Coordinates and native ticks are never hard identities. Repeated visits retain
occurrence ordinals, and bounded one-to-many movement spans can represent
target-specific settlement without erasing it. Incompatible causal parents,
plan identities, semantic effects, or occurrence ordinals become explicit
divergent spans rather than forced matches.

The initial strategy portfolio records whether the evidence supports a shared
plan, parallel implementation, alternative branch, or different plan. A
matched terminal alone cannot upgrade limited causal evidence: resolution
remains proposed until matched hard causal context exists.

## Key Pyramid checked slice

The checked Key Pyramid slice:

1. reads the existing checked P5 route and P4B dossier inputs without rewriting
   either tree;
2. executes that route independently in MS and Lynx with explicit causal
   capture and stable route command/plan identities;
3. proves deterministic fresh rerun, exact checkpoint suffix equality,
   capture-on/off gameplay parity against the checked P5 baseline, and complete
   bounded retention;
4. aligns the placement-bound resource, gate, socket, and terminal milestones
   while preserving target-native timing; and
5. builds a first strategy portfolio plus disagreement and repeated-coordinate
   canaries that prevent coordinate-only matching.

The slice uses an explicit 1,024-event capacity. The slice remains `paired`,
`full-input`, and `manual-assisted`. The P6 builder
does not read donor replay bytes, but it does not relabel the inherited route as
donor-blind. It makes no P8 isolation claim.

Checked machine evidence lives under
`ccsolver/fixtures/golden/p6a/cclp1-001/`. The unlisted human review is emitted
under the existing `/dev/ccsolver/levels/cclp1/001-key-pyramid/` tree. The page
groups the primary milestones by the six route subgoals and keeps raw machine
evidence behind explicit download links.

## Deliberate limits

- P6A is an alignment preview, not a general search engine or tactic compiler.
- This is the P2B causal foundation required by Key Pyramid, not the complete
  P2 exit gate. Hazard-driven floor mutations, native-oracle diagnostic-window
  adaptation, and other mechanics not named above remain follow-on work.
- When a target cannot prove which earlier held or queued poll initiated a
  later action, that action is deliberately unattributed. The journal never
  assigns a nearby command merely because it occurred earlier.
- The Key Pyramid result proves one certified route context, not robustness
  across seeds, alternate routes, or unseen levels.
- Diagnostic boundary deltas cannot satisfy authoritative causal anchors.
- A complete contract taxonomy does not imply that every event kind occurs in
  Key Pyramid; focused target canaries exercise mechanics absent from that
  level.
- Full cross-level portfolio acceptance still requires the later P6 canaries,
  including local-route divergence, alternative rejoin, and genuinely
  different MS/Lynx plans.

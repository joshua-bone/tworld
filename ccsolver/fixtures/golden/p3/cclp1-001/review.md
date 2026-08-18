# Key Pyramid P3 terminal-first review

## Big-picture checkpoint

P3A now has a content-addressed terminal-first parent theory for Key Pyramid. It works backward from the exit through the socket and ten exact chip placements, but remains deliberately **unresolved** because P1 does not prove dynamic terminal entry or joint route feasibility.

P3B verifies one bounded child leaf in both rulesets: from the fixed manual seed-0 start, collect the placement-bound red key one cell east. This verified leaf does **not** upgrade the unresolved parent plan. P4A can later consume the included semantic renders and plan-intent annotations for richer overlays or animation.

## Human review checkpoints

1. Confirm the parent explanation is useful: exit at (15,7), socket at (15,8), ten exact chips, and an explicitly provisional red-door branch.
2. Compare each annotated start/end crop below. The selected red key is immediate; the blue key remains visible as an equally immediate alternative.
3. Check target-native cadence: MS reaches the stop after one decision; Lynx reaches the same semantic stop after east plus three neutral polls.
4. Confirm the evidence boundary: this is one donor-independent leaf witness, not a whole-level solution or proof that the red-first branch is uniquely required.

## Cross-ruleset result

The exact terminal theory, selected placement, start state, and semantic stop state agree across MS and Lynx. The intentional difference is native movement cadence and therefore native tick/fingerprint history.

## MS: adjacent red-key leaf

Parent theory: `sha256:d7ca887e7e3d2842273bbe5c15a546bf08284526ec0971235955c195507d1b99` (unresolved).
Contextual leaf segment: `sha256:a83707fc0947ef511456aa0ad520c329cbd442bed47f009e166e68bd59228fe3` (candidate-for-contextual-verification; unresolved parent step 5).
Verification scope: `selected-segment-only`; this result does not change the parent plan status.
Plan effect: red-key inventory expected +1, observed +1, passed.
Runtime result: **verified** at native tick 0; fixed-seed manual decisions `0:8`.

The arrow `P (15,19) -> R (16,19)` is a one-step plan-intent annotation for review. It is not a claim that a full exit route was observed.

### Segment start — native tick -1

```text
      x 13 14 15 16 17
y 16   #  D  #  Y  #
y 17   #  .  H  .  #
y 18   #  .  .  .  #
y 19   #  B  P  R  #
y 20   #  #  #  #  #
```

### Segment end — verified stop boundary

```text
      x 13 14 15 16 17
y 16   #  D  #  Y  #
y 17   #  .  H  .  #
y 18   #  .  .  .  #
y 19   #  B  .  P  #
y 20   #  #  #  #  #
```

Legend: `P` player, `R` selected red key, `B` retained blue-key alternative, `D` later red door, `Y` yellow door, `H` hint, `#` wall, `.` floor. The render is cropped for human review; contract predicates use the full observation.

## Lynx: adjacent red-key leaf

Parent theory: `sha256:5df38f5f595628a91468b4661f0e9f5e62d2120622e2362e99450de6b1f51584` (unresolved).
Contextual leaf segment: `sha256:897810d94f669c0ec156f54ba9868108e861d4c9b65d6f036fe6abdad6ecd281` (candidate-for-contextual-verification; unresolved parent step 5).
Verification scope: `selected-segment-only`; this result does not change the parent plan status.
Plan effect: red-key inventory expected +1, observed +1, passed.
Runtime result: **verified** at native tick 3; fixed-seed manual decisions `0:8, 1:0, 2:0, 3:0`.

The arrow `P (15,19) -> R (16,19)` is a one-step plan-intent annotation for review. It is not a claim that a full exit route was observed.

### Segment start — native tick -1

```text
      x 13 14 15 16 17
y 16   #  D  #  Y  #
y 17   #  .  H  .  #
y 18   #  .  .  .  #
y 19   #  B  P  R  #
y 20   #  #  #  #  #
```

### Segment end — verified stop boundary

```text
      x 13 14 15 16 17
y 16   #  D  #  Y  #
y 17   #  .  H  .  #
y 18   #  .  .  .  #
y 19   #  B  .  P  #
y 20   #  #  #  #  #
```

Legend: `P` player, `R` selected red key, `B` retained blue-key alternative, `D` later red door, `Y` yellow door, `H` hint, `#` wall, `.` floor. The render is cropped for human review; contract predicates use the full observation.

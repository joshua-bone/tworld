# Intro 8 (intro-008) runtime review

Derived, non-authoritative human review of the checked canonical JSON packets.

## MS

Canonical JSON: [`./ms/runtime-review.json`](./ms/runtime-review.json).

Source: `intro-ms.dac` level 8; manual seed 123456789 (`manual-source-fixed-characterization`).

Source provenance: repository revision `42c78d0db343621f887fefce581315479d9a8be3`; map `data/intro.dat` (sha256:0f210063095b6981ea23f3a3a8371bed768892f0e9be28b081a16d9e62844aa6, 3415 bytes); series `sets/intro-ms.dac` (sha256:b358359609485c0a66ca33cbcaa9461fbfc2c5d10dc06a352dc363afc1c0c75e, 26 bytes).

Bound: followup semantic change within 4 polls; observed after 4.

### manual-start

Role: `runtime-characterization`; native tick: -1; player: (4, 4, 0).

Provenance: adapter `tworld-ms-solver-runtime` revision `ccsolver:tworld-ms-solver-runtime:p2a-v1`; engine `tworld-ms` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

- Baseline state (no preceding delta):
  - Runtime: mode `manual`; terminal `running`; input last-polled=none, last-applied=none, replay-cursor=none, replay-move-count=none, replay-best-time-ticks=none.
  - Inventory: none.
  - Remaining requirements: none.
  - Actors (semanticType + lifecycle): `cc1:ball + active` × 1; `cc1:block + active` × 1; `cc1:fireball + contained` × 1; `cc1:tank + active` × 4.
  - Devices (semanticType + state): `cc1:beartrap + closed` × 2; `cc1:button-blue + released` × 4; `cc1:button-brown + released` × 2; `cc1:button-green + released` × 4; `cc1:button-red + released` × 4; `cc1:clonemachine + idle` × 1; `cc1:switchwall-closed + closed` × 4; `cc1:switchwall-open + open` × 4.

### blocked-east-poll

Role: `runtime-characterization`; native tick: 0; player: (4, 4, 0).

Provenance: adapter `tworld-ms-solver-runtime` revision `ccsolver:tworld-ms-solver-runtime:p2a-v1`; engine `tworld-ms` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

Interpretation: blocked movement observation; not button evidence (input code 8).

- Native tick delta: 1
- Changed categories: cell, input, player, timing
- Player: (4, 4, 0) west stationary → (4, 4, 0) east stationary
- Inventory: unchanged
- Remaining requirements: unchanged
- Actor changes: 0
- Device changes: 0
- Changed cells: 1 — (4, 4, 0): `cc1:chip` (actor; state=stationary; facing=west) → `cc1:chip` (actor; state=stationary; facing=east)

### second-east-poll-semantic-change

Role: `runtime-characterization`; native tick: 4; player: (4, 4, 0).

Provenance: adapter `tworld-ms-solver-runtime` revision `ccsolver:tworld-ms-solver-runtime:p2a-v1`; engine `tworld-ms` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

Trigger: `second-east-poll-semantic-change`; input code 8 after 4 followup polls.

- Native tick delta: 4
- Changed categories: actor, cell, timing
- Player: unchanged
- Inventory: unchanged
- Remaining requirements: unchanged
- Actor changes: 1 — actor:sha256:87c09b39e16198714c03f1679db503d025e75f982ac5fab7c6348fb4a6961ae2: (21, 10, 0) east stationary → (22, 10, 0) east stationary
- Device changes: 0
- Changed cells: 2 — (21, 10, 0): `cc1:ball` (actor; state=stationary; facing=east) → `cc1:floor` (terrain; state=none; facing=none); (22, 10, 0): `cc1:floor` (terrain; state=none; facing=none) → `cc1:ball` (actor; state=stationary; facing=east)

## LYNX

Canonical JSON: [`./lynx/runtime-review.json`](./lynx/runtime-review.json).

Source: `intro-lynx.dac` level 8; manual seed 362436069 (`manual-source-fixed-characterization`).

Source provenance: repository revision `42c78d0db343621f887fefce581315479d9a8be3`; map `data/intro.dat` (sha256:0f210063095b6981ea23f3a3a8371bed768892f0e9be28b081a16d9e62844aa6, 3415 bytes); series `sets/intro-lynx.dac` (sha256:383ca01bf1c97b40330c3014577d6f37bd3397e070be09a80b8154e566ed0e95, 28 bytes).

Bound: followup semantic change within 4 polls; observed after 3.

### manual-start

Role: `runtime-characterization`; native tick: -1; player: (4, 4, 0).

Provenance: adapter `tworld-lynx-solver-runtime` revision `ccsolver:tworld-lynx-solver-runtime:p2a-v1`; engine `tworld-lynx` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

- Baseline state (no preceding delta):
  - Runtime: mode `manual`; terminal `running`; input last-polled=none, last-applied=none, replay-cursor=none, replay-move-count=none, replay-best-time-ticks=none.
  - Inventory: none.
  - Remaining requirements: none.
  - Actors (semanticType + lifecycle): `cc1:ball + active` × 1; `cc1:block + dormant` × 1; `cc1:fireball + contained` × 1; `cc1:tank + active` × 4.
  - Devices (semanticType + state): `cc1:beartrap + closed` × 2; `cc1:button-blue + released` × 4; `cc1:button-brown + released` × 2; `cc1:button-green + released` × 4; `cc1:button-red + released` × 4; `cc1:clonemachine + idle` × 1; `cc1:switchwall-closed + closed` × 4; `cc1:switchwall-open + open` × 4.

### blocked-east-poll

Role: `runtime-characterization`; native tick: 0; player: (4, 4, 0).

Provenance: adapter `tworld-lynx-solver-runtime` revision `ccsolver:tworld-lynx-solver-runtime:p2a-v1`; engine `tworld-lynx` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

Interpretation: blocked movement observation; not button evidence (input code 8).

- Native tick delta: 1
- Changed categories: actor, cell, input, player, timing
- Player: (4, 4, 0) south stationary → (4, 4, 0) east stationary
- Inventory: unchanged
- Remaining requirements: unchanged
- Actor changes: 1 — actor:sha256:87c09b39e16198714c03f1679db503d025e75f982ac5fab7c6348fb4a6961ae2: (21, 10, 0) east stationary → (22, 10, 0) east moving
- Device changes: 0
- Changed cells: 3 — (4, 4, 0): `cc1:chip` (actor; state=stationary; facing=south); `cc1:floor` (terrain; state=none; facing=none) → `cc1:chip` (actor; state=stationary; facing=east); `cc1:floor` (terrain; state=none; facing=none); (21, 10, 0): `cc1:ball` (actor; state=stationary; facing=east); `cc1:floor` (terrain; state=none; facing=none) → `cc1:floor` (terrain; state=none; facing=none); (22, 10, 0): `cc1:floor` (terrain; state=none; facing=none) → `cc1:ball` (actor; state=moving; facing=east); `cc1:floor` (terrain; state=none; facing=none)

### first-no-input-semantic-change

Role: `runtime-characterization`; native tick: 3; player: (4, 4, 0).

Provenance: adapter `tworld-lynx-solver-runtime` revision `ccsolver:tworld-lynx-solver-runtime:p2a-v1`; engine `tworld-lynx` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

Trigger: `first-no-input-semantic-change`; input code 0 after 3 followup polls.

- Native tick delta: 3
- Changed categories: actor, cell, input, timing
- Player: unchanged
- Inventory: unchanged
- Remaining requirements: unchanged
- Actor changes: 1 — actor:sha256:87c09b39e16198714c03f1679db503d025e75f982ac5fab7c6348fb4a6961ae2: (22, 10, 0) east moving → (22, 10, 0) east stationary
- Device changes: 0
- Changed cells: 1 — (22, 10, 0): `cc1:ball` (actor; state=moving; facing=east); `cc1:floor` (terrain; state=none; facing=none) → `cc1:ball` (actor; state=stationary; facing=east); `cc1:floor` (terrain; state=none; facing=none)

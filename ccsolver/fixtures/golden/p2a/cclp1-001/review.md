# Key Pyramid (cclp1-001) runtime review

Derived, non-authoritative human review of the checked canonical JSON packets.

## MS

Canonical JSON: [`./ms/runtime-review.json`](./ms/runtime-review.json).

Donor replay evidence is explicitly **donor-runtime-characterization** from `save/CCLP1.dac.tws` (sha256:2ace452b2857b9a9a74b3895c50396e4885641a9fbf2e19b0667d4fb75bde12f); it is not a target-neutral solution claim.

Source: `CCLP1-MS.dac` level 1; manual seed 1496659129 (`manual-source-derived-from-donor-replay-uint31`).

Source provenance: repository revision `42c78d0db343621f887fefce581315479d9a8be3`; map `data/CCLP1.dat` (sha256:46cc0aaa862c7cc5a63aea542eedf86836d6232b1180b3aece64d4de238cae5e, 111772 bytes); series `sets/CCLP1-MS.dac` (sha256:d0b660cadb896307c8e232874d0d332b1c19f481ea313115bab0b953a8423258, 40 bytes).

Seed provenance: this manual-source characterization is not replay-executed; its seed is derived from donor replay metadata, so it is not donor-independent.

Bound: first resource change within 1 replay ticks; observed after 1.

Exact donor replay seed: 1496659129 (`exact-donor-replay-uint32`).

### manual-start

Role: `runtime-characterization`; native tick: -1; player: (15, 19, 0).

Provenance: adapter `tworld-ms-solver-runtime` revision `ccsolver:tworld-ms-solver-runtime:p2a-v1`; engine `tworld-ms` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

- Baseline state (no preceding delta):
  - Runtime: mode `manual`; terminal `running`; input last-polled=none, last-applied=none, replay-cursor=none, replay-move-count=none, replay-best-time-ticks=none.
  - Inventory: none.
  - Remaining requirements: `cc1:icchip`: 10.
  - Actors (semanticType + lifecycle): none.
  - Devices (semanticType + state): none.

### donor-replay-start

Role: `donor-runtime-characterization`; native tick: -1; player: (15, 19, 0).

Provenance: adapter `tworld-ms-solver-runtime` revision `ccsolver:tworld-ms-solver-runtime:p2a-v1`; engine `tworld-ms` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

- Baseline state (no preceding delta):
  - Runtime: mode `replay`; terminal `running`; input last-polled=none, last-applied=none, replay-cursor=0, replay-move-count=162, replay-best-time-ticks=644.
  - Inventory: none.
  - Remaining requirements: `cc1:icchip`: 10.
  - Actors (semanticType + lifecycle): none.
  - Devices (semanticType + state): none.

### first-donor-resource-change

Role: `donor-runtime-characterization`; native tick: 0; player: (16, 19, 0).

Provenance: adapter `tworld-ms-solver-runtime` revision `ccsolver:tworld-ms-solver-runtime:p2a-v1`; engine `tworld-ms` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

- Native tick delta: 1
- Changed categories: cell, input, inventory, player, timing
- Player: (15, 19, 0) west stationary → (16, 19, 0) east stationary
- Inventory: cc1:key-red 0 → 1
- Remaining requirements: unchanged
- Actor changes: 0
- Device changes: 0
- Changed cells: 2 — (15, 19, 0): `cc1:chip` (actor; state=stationary; facing=west) → `cc1:floor` (terrain; state=none; facing=none); (16, 19, 0): `cc1:key-red` (pickup; state=none; facing=none) → `cc1:chip` (actor; state=stationary; facing=east)

## LYNX

Canonical JSON: [`./lynx/runtime-review.json`](./lynx/runtime-review.json).

Donor replay evidence is explicitly **donor-runtime-characterization** from `save/CCLP1-lynx.dac.tws` (sha256:5bda2f73f3be57d93761aa891a361f57c71f34be03fc364a3f718b9b3339c109); it is not a target-neutral solution claim.

Source: `CCLP1-Lynx.dac` level 1; manual seed 2011157566 (`manual-source-derived-from-donor-replay-uint31`).

Source provenance: repository revision `42c78d0db343621f887fefce581315479d9a8be3`; map `data/CCLP1.dat` (sha256:46cc0aaa862c7cc5a63aea542eedf86836d6232b1180b3aece64d4de238cae5e, 111772 bytes); series `sets/CCLP1-Lynx.dac` (sha256:bc19e89be402c875659394f42e369d0f3615c1268e2300323a7a59991d61b86c, 42 bytes).

Seed provenance: this manual-source characterization is not replay-executed; its seed is derived from donor replay metadata, so it is not donor-independent.

Bound: first resource change within 4 replay ticks; observed after 4.

Exact donor replay seed: 2011157566 (`exact-donor-replay-uint32`).

### manual-start

Role: `runtime-characterization`; native tick: -1; player: (15, 19, 0).

Provenance: adapter `tworld-lynx-solver-runtime` revision `ccsolver:tworld-lynx-solver-runtime:p2a-v1`; engine `tworld-lynx` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

- Baseline state (no preceding delta):
  - Runtime: mode `manual`; terminal `running`; input last-polled=none, last-applied=none, replay-cursor=none, replay-move-count=none, replay-best-time-ticks=none.
  - Inventory: none.
  - Remaining requirements: `cc1:icchip`: 10.
  - Actors (semanticType + lifecycle): none.
  - Devices (semanticType + state): none.

### donor-replay-start

Role: `donor-runtime-characterization`; native tick: -1; player: (15, 19, 0).

Provenance: adapter `tworld-lynx-solver-runtime` revision `ccsolver:tworld-lynx-solver-runtime:p2a-v1`; engine `tworld-lynx` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

- Baseline state (no preceding delta):
  - Runtime: mode `replay`; terminal `running`; input last-polled=none, last-applied=none, replay-cursor=0, replay-move-count=162, replay-best-time-ticks=648.
  - Inventory: none.
  - Remaining requirements: `cc1:icchip`: 10.
  - Actors (semanticType + lifecycle): none.
  - Devices (semanticType + state): none.

### first-donor-resource-change

Role: `donor-runtime-characterization`; native tick: 3; player: (16, 19, 0).

Provenance: adapter `tworld-lynx-solver-runtime` revision `ccsolver:tworld-lynx-solver-runtime:p2a-v1`; engine `tworld-lynx` revision `49cf63da3dda99e65dff5136fbabd0f7a09ce72f`.

- Native tick delta: 4
- Changed categories: cell, input, inventory, player, timing
- Player: (15, 19, 0) south stationary → (16, 19, 0) east stationary
- Inventory: cc1:key-red 0 → 1
- Remaining requirements: unchanged
- Actor changes: 0
- Device changes: 0
- Changed cells: 2 — (15, 19, 0): `cc1:chip` (actor; state=stationary; facing=south); `cc1:floor` (terrain; state=none; facing=none) → `cc1:floor` (terrain; state=none; facing=none); (16, 19, 0): `cc1:key-red` (pickup; state=none; facing=none) → `cc1:chip` (actor; state=stationary; facing=east); `cc1:floor` (terrain; state=none; facing=none)

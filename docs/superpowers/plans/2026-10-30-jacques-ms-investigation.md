# Jacques MS replay investigation

**Goal:** For each of the 38 levels named by the user, construct a winning MS replay or a clear, reviewable impossibility argument, then publish per-level HTML reports at `/tworld/dev/solutions/jacques/`.

**Authority:** The 986-level Bit Busters archive DAT, SHA-256 `c10acac13135586a4ce7b45f0427010229c51ac2fc5b6d0631a7036b86a90b6f`. Its level records match the author's attachment; the attachment additionally contains 13 empty placeholders. Legacy Tile World MS is the independent replay authority. No level or gameplay edits.

**Approach:** Read full visual maps and both tile layers, formulate semantic strategies or invariants, test exact actions in the existing MS engine, and verify candidate wins against the native oracle. Use bounded variation searches only for identified uncertainties. Astra agents handle disjoint level groups; the coordinator reviews their evidence and builds the reports. Failed searches remain explicitly unresolved and do not become impossibility claims.

## Tasks

- [ ] Establish fixed input provenance and reusable visual / precise-input / replay-verification harness in `scripts/jacques/`.
- [ ] Investigate early group: 186, 288, 376, 379, 402, 431, 527, 628, 643, 660, 668, 672, 675.
- [ ] Investigate middle group: 723, 732, 756, 791, 909, 910, 914, 915, 920, 925.
- [ ] Investigate late group: 931, 932, 937, 939, 945, 949, 952, 955, 970, 972, 974, 978, 981, 982, 984.
- [ ] Review claims for buried tiles, actor order, teleporting, MS glitches, random seeds, timing, and exit requirements. Record the exact scope of any proof.
- [ ] Produce an index plus individual HTML reports, visual maps, evidence, reproducible commands, and verified replay downloads where available in `web/public/dev/solutions/jacques/`.
- [ ] Verify tooling and report contracts, build, inspect rendered reports, merge through protected master, wait for Pages, and verify public routes.

## Evidence rules

Winning replay means terminal success on the unmodified level, with input and randomization data retained. An impossibility argument must cover the relevant alternatives, including MS-specific interactions, rather than rely on a pathfinder's failure. Coordinates are zero-based `(x,y)` and the reports label both tile layers. Intermediate reports may disclose unresolved cases, but these are incomplete outcomes, not either requested final outcome.

# Melinda Router and Melinda Vicinity Searcher

[Melinda Router (MR)](http://www.cc-optimization.byethost12.com/) is a turn-based
replay editor and simulator. Melinda Vicinity Searcher (MVS), from the same author,
adds searches around known routes, including block arrangements and TSP tools.
Use MR for additional MS compatibility checks and quarter-tick experiments; use
MVS to explore a constrained level or fragment after reproducing a known route.
Neither replaces final TWO, original Tile World, and stock SuCC verification.

## Build pinned upstream tools

Requires Python 3.9+, a C compiler, Make, and (for MR) a JDK. Replay checks also use
Node/npm and `tsx@4.23.13` (npm downloads this pinned version if not cached).
Download the original
archives from the author's site to a directory **outside Git**:

- [MR 3.12 source](http://cc-optimization.byethost12.com/MELINDA-ROUTER-3.12.tar.bz2)
- [MVS 9.74 source](http://cc-optimization.byethost12.com/MVS-SOURCE-9.74.tar.bz2)
- [MR manual](http://cc-optimization.byethost12.com/MR306.pdf)
- [MVS manual](http://cc-optimization.byethost12.com/MVS914.pdf)

From the repository root:

```sh
python3 scripts/melinda/setup.py \
  --archives "$HOME/Downloads/melinda-sources" \
  --output "$HOME/cc-tools/melinda" --tool mr
```

The setup verifies pinned SHA256 digests before extraction, rejects archive
links/path escapes, builds the unmodified C helper, and compiles a small Java
bridge using MR's own DAT importer. The output must be new; builds never overwrite
an existing directory. `build-manifest.json` records source and executable hashes.
The upstream helper name ends in `-linux` even when built natively on macOS.

For **MVS search, use Linux x86_64** and `--tool mvs` (or `--tool both`). The
original source contains x86 assembly. An experimental ARM intrinsic substitution
could replay a fragment on macOS but its breadth search crashed during startup;
it is not included or claimed supported here. Use an isolated Linux worker with
an explicit runtime/memory budget. The helper is built from unchanged source.

## Check an MS TWS in MR

Keep the route and every generated file outside Git. The existing replay exporter
under `scripts/mscc` supplies the shared decoded-input format; it does not require
the original MSCC executable. Run from this repository's root:

```sh
npm exec --yes --package=tsx@4.23.13 -- tsx \
  --tsconfig web/tsconfig.json scripts/mscc/export-replay.ts \
  data/CCLP5.dat "$HOME/private-cc/candidate.tws" 1 \
  "$HOME/private-cc/candidate.json"

python3 scripts/melinda/run_mr.py \
  --tools "$HOME/cc-tools/melinda" --dat data/CCLP5.dat \
  --tws "$HOME/private-cc/candidate.tws" \
  --replay-json "$HOME/private-cc/candidate.json" \
  --output "$HOME/private-cc/mr-check"
```

The output directory contains the helper input, trace, and `result.json`. Exit
status zero requires both completion and the exact recorded TWS completion tick.
MR labels the state *after* an input with the next tick; `winTick` normalizes this
by subtracting one. `mrWinStateTick` preserves the raw value. Input ticks remain
1/20-second ticks, and relative/absolute mouse commands are passed unchanged.
The runner preserves stepping, slide direction, and the TWS starting RNG seed.
It binds the exported input to DAT/TWS hashes, decodes the actual TWS again using
the repository codec, and rejects any difference from the supplied JSON. Editing
the JSON alone cannot create a passing certificate for different TWS inputs.

MR's TSG support defaults on; `--no-tsg` allows a separate diagnostic check.
The non-adjacent-trap variant defaults off; `--nonadj-traps` explicitly enables it.
Record which variant was used, investigate disagreements, and never substitute a
variant's success for a required engine check. A compatible run is not evidence
of scoreboard eligibility.

## Using MVS search

The native helper accepts the same text protocol used by its Java GUI. Preserve
each search's input file alongside its source/version, starting snapshot, route,
deadline, neighborhood limits, options, and output. The manual's vicinity-search
sections describe push and XOR neighborhoods. Push vicinity does not support
teleporters; XOR vicinity can be useful when a route relocates or consumes blocks.

First replay the known fragment through the helper, then ensure the search itself
can recover that control with a generous deadline. Only then tighten the deadline
or expand its neighborhood. MVS is a separate simulator with documented limitations
(including TSG and some teleporter behavior); all resulting routes need full exit
checks in the required engines, plus MR and best-effort original MSCC.

Prefer replaying an exact prefix and searching from its saved full-world state.
In the native protocol, a `from STATE TICK` replay block must end with
`final TICK 0` before a `bfsearch` command; otherwise the helper can continue
parsing replay input without starting the search. `winpathULDR` imports a known
route from state 1. Returned `WIN`/`tWIN` paths start at the chosen search state;
prepend its exact prefix before checking the full replay. Preserve wrapped `WIN`
output through `ENDWIN` when reconstructing a candidate, and calibrate its
completion tick against the known TWS rather than assuming the two tools label
states identically.

Check the complete output and process status. `bfsearch is complete` alone does
not establish exhaustion: require a normal calculation end and successful process
exit, with no overflow or stopped-calculation message. A hash-table overflow can
end a search early even when a later message says it is complete.

Do not feed raw TWS mouse commands into MVS's directional input protocol. For
fragments, import the actual starting world state, including actor state, inventory,
RNG, wiring, and timer phase. A synthetic exit or modified fragment is search
scaffolding, not a winning replay. Reconstruct a candidate on the unedited DAT
and check its complete route. Timeouts, memory pressure, vicinity limits, and hash
pruning must be reported explicitly; they do not prove the level has no better
route. Keep Linux Spot inputs/results private and remove owned workers after
durable checkpoints; see [private route storage](../../docs/private-cc-routes.md).

## Tests

```sh
python3 -m unittest discover -s scripts/melinda -p 'test_*.py' -v
MR_TOOLS="$HOME/cc-tools/melinda" \
  python3 -m unittest discover -s scripts/melinda -p 'test_*.py' -v
```

The second command also checks a synthetic corridor against the actual pinned
MR build. No private routes, upstream source archive, or licensed MSCC assets are
included in this directory.

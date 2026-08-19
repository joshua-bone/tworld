# P5 certified route and P4B whole-level dossier

## Big-picture status

P5 and P4B close the first complete, human-reviewable CCSolver vertical slice
for CCLP1 level 1, Key Pyramid. P5 turns the earlier static theory and local
witnesses into one uninterrupted winning execution per ruleset, complete TWS
files, and TypeScript/native replay certificates. P4B consumes only those
checked P5 bytes and turns them into the unlisted whole-level dossier under
`web/dist/ccsolver/`.

The historical P3 terminal theory remains `unresolved`; it is retained as
provenance and is not silently upgraded. P5 publishes a separate
pre-execution `candidate` plan. The exact continuous witnesses and replay
certificates prove that its selected implementation wins; they do not rewrite
the plan artifact's epistemic status after the fact.

## P5 result

Both targets use the same facts-derived, standard-tile-only route:

- 162 directional decisions scheduled four native ticks apart;
- six reviewed subgoals joined through one live execution;
- seven exact full-world observation/render boundaries per target;
- all ten exact chip occurrences, the relevant key/door choices, the socket,
  and the exit represented in a terminal-rooted 29-step plan whose exact
  selected implementation supplies the replay decisions; and
- a 700-tick replay deadline, retained as deadline slack rather than mislabeled
  as the first terminal boundary.

MS triggers and settles the win at native tick 644. Lynx triggers the win at
tick 647 and settles its replay trace at tick 660 after its target-native
endgame interval. The P5 plan and dossier keep those two timing axes distinct.

The generated complete replay files are:

- `ccsolver/fixtures/golden/p5/cclp1-001/ms/key-pyramid-ms.tws` — 117 bytes;
- `ccsolver/fixtures/golden/p5/cclp1-001/lynx/key-pyramid-lynx.tws` — 119 bytes.

Each file round-trips through the complete solution-file codec. Certification
loads those exact bytes from an otherwise-empty temporary native save
directory, requires both the TypeScript target engine and native oracle to win,
and requires exact trace parity. Missing native-oracle support is a hard
failure, never a skipped or passing check.

The checked P5 bundle contains 33 files and 10,849,355 bytes: 14 unique exact
boundary files, two TWS files, canonical `expanded-plan` roots plus their
route/plan/witness/static/certificate records for both targets, a real
corpus-case state transition, a manifest, and a compact human review. Each
expanded-plan root binds the exact planning document and selected route before
execution. The same non-null plan reference is retained by the witness,
certificate, and corpus record.

## Evidence and donor limits

This is a paired, full-input, manual-assisted training case. It is not
donor-blind. The route generator reads checked level facts and does not read or
copy donor TWS bytes, but that narrower byte-provenance fact does not erase the
historical full-input exposure. P8 remains the later blind-evaluation gate.

The full route overlay is plan intent. The dossier labels exact captured
subgoal endpoints as observed witness evidence. It does not invent a P2B causal
event journal, infer missing terrain, or call route chronology causality.

## P4B dossier

The P4B builder verifies the P5 manifest and the digest and byte length of every
listed file before producing the site. It does not read P1/P3 source goldens,
rerun either engine, or contact an external service. Its checked compact
authority is:

- `ccsolver/fixtures/golden/p4b/cclp1-001/manifest.json`;
- `ccsolver/fixtures/golden/p4b/cclp1-001/review.md`.

The derived `web/dist/ccsolver/` bundle is static-first and complete without
JavaScript. It includes an index, the stable Key Pyramid level route, paired
whole-level maps, an accessible plan graph and table, six subgoal capsules per
target, 24 Starting State/Ending State panel instances backed by 14 shared
boundary scenes, exact join and timing tables, provenance, certificates, and
downloadable TWS files. Small JavaScript enhancements may toggle overlays and
zoom, but there is no autoplay or fabricated animation.

The dossier is intentionally absent from the ordinary Tile World homepage,
player navigation, and sitemap. Generated pages carry `noindex,nofollow`; this
is convenience obscurity, not access control. Direct static-directory routing
and the SPA fallback are tested separately under both `/` and the production
`/tworld/` base.

## Reproduction

Build the native replay oracle once before the P5 gate:

```sh
cmake -S . -B build-verify -DOSHW=sdl -DCMAKE_BUILD_TYPE=Debug
cmake --build build-verify --target tworld-oracle --parallel 4
npm run ccsolver:p5:check
```

Check the compact P4B authority and emit the derived site after the ordinary
web build and SPA fallback exist:

```sh
npm run ccsolver:p4b:check
npm run build
cp web/dist/index.html web/dist/404.html
npm run ccsolver:p4b:emit-dist
```

`ccsolver:p5:generate` and `ccsolver:p4b:generate` are the corresponding
transactional write commands. Both checks fail on extra, missing, or changed
checked output bytes.

## Human review checkpoints

1. Open the generated dossier index, then Key Pyramid. Confirm the page says
   `Human review: unreviewed`; generation never approves itself.
2. Compare the MS and Lynx 32×32 maps. Toggle source, region, resource/gate,
   plan-intent, and observed-boundary evidence while checking that semantic
   cell stacks remain literal.
3. Walk all six subgoal capsules for each target. Every Ending State must be the
   exact checked Starting State of the next capsule, with digest, tick,
   coordinate, inventory, remaining-chip, and terminal evidence visible in
   text as well as graphics.
4. Inspect the terminal-first graph/table. Direct key, chip, socket, and exit
   prerequisites must be distinct from the noncausal chronological predecessor
   field; reusable green keys must not appear consumed.
5. Confirm MS reports trigger/settle 644/644 and Lynx 647/660 rather than
   flattening the target timing difference.
6. Download both TWS files and compare their displayed digest and certificate
   reference with the P5 manifest.
7. Confirm the donor ledger remains paired/full-input/manual-assisted and the
   page makes no donor-blind, score-optimal, full-causal-journal, or human-
   reviewed claim.

This is the first checkpoint where a person can judge the complete route rather
than a static theory or isolated local move. The next solver milestone should
start only after that review either accepts the route/evidence presentation or
records concrete changes requested.

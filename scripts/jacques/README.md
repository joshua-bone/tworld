# Jacques MS investigation harness

This offline, white-box research harness uses the existing production MS engine and standard MS sprites. It accepts only the exact 986-level `Jacques.dat` SHA-256 `c10acac13135586a4ce7b45f0427010229c51ac2fc5b6d0631a7036b86a90b6f`. The default path is `/Users/joshuabone/Downloads/Jacques.dat`; `loadLevel` accepts another path containing identical bytes.

From `web/`:

```sh
../node_modules/.bin/tsc --project ../scripts/jacques/tsconfig.json --noEmit
node_modules/.bin/vite-node ../scripts/jacques/self-test.ts
node_modules/.bin/vite-node ../scripts/jacques/native-smoke.ts
node_modules/.bin/vite-node ../scripts/jacques/cli.ts inspect 732 /tmp/jacques
node_modules/.bin/vite-node ../scripts/jacques/cli.ts run 732 /tmp/jacques inputs.json
node_modules/.bin/vite-node ../scripts/jacques/render-all.ts
```

`inputs.json` is an array of exact per-tick inputs: integers or `N`, `W`, `S`, `E`, `.`. Direction codes are north=1, west=2, south=4, east=8, idle=0. Legacy preserve=1568 and absolute mouse commands (512 + y * 32 + x) are available as integer inputs. Original MS keyboard play emits only one cardinal direction; replay-only diagonal commands cannot certify a solution. The initial tick is -1 and the first input executes tick 0. An ordinary MS move takes four ticks; forced surfaces and timing can change observed motion.

For investigation scripts import from `./harness`:

```ts
const loaded = await loadLevel(732); // exact number or exact unique title
const run = createRun(loaded, { stepping: 0, randomSeed: 0 });
tick(run, 'E', 1); // one precise native tick, mutates the run holder
move(run, 'S', 3); // hold south for exactly twelve ticks
console.log(snapshot(run));
console.log(dump(run));
await writeFile('/tmp/current.svg', await renderSvg(run));
await saveWinningReplay(run, '/tmp/732.tws');
```

`run.session.state.engine` exposes inventory, map and status; `.internal` exposes MS creature order, block state, release state and movement mode. `dump` preserves both map planes and wiring. Coordinates are zero based. `structuredClone(run)` provides a detached exploratory branch. Neither the harness nor a bounded experiment's failure asserts impossibility.

`renderSvg` writes self-contained artwork using the production legacy sprite coordinates and transparency. Default `plane:'both'` shows the composite scene; `plane:'bottom'` exposes the buried map plane. Hover titles record exact cell IDs. Empty top tiles can visually cover buried terrain, so the separate bottom-plane view is necessary. Rendering never changes gameplay.

Replay export audits recorded commands against the original MS cardinal/mouse command alphabet, rejects live or failed states, requires a real completed status, round-trips the complete TWS, replays its encoded inputs in TypeScript, then stages the exact DAT and TWS in fresh isolated directories for the native `build-verify/legacy_c/tworld-oracle`. Native verification has a 30-second timeout and a 200,000-tick limit. Export requires native completion and exact initial-state, tick-by-tick and result parity. A neighboring `.tws.json` certificate records DAT/TWS hashes and terminal results. Unknown stderr is retained in the certificate. Native temporary directories are removed after use.

The harness does not change levels, engine rules or existing donor replay files. Initial map generation is bounded to the requested 38 levels. A winning replay establishes one solution under its recorded seed and stepping, not a general claim about other initializations.

`prove-middle.ts` checks the structural red-key lower bound for level 732 and all eight native stepping cases for the isolated fatal assembly in level 756. `verify-probes.ts` retains bounded, explicitly nonwinning native traces for levels 732, 756 and 955. These scripts write their evidence to the report evidence directory.

`review-791.ts` verifies the chip-alcove geometry and native-source ice-axis argument for 791. `navigate-ice.ts 974` constructs a valid 360-tick partial run collecting all 42 chips, but does not call it a win. `prove-ice-trap.ts` independently checks the shared 972/974 one-way ice-cross geometry and verifies that 974 partial run in the native oracle. The important distinction is that the mandatory chip is reachable, but collecting it consumes the sole pivot and makes escape impossible. `ice-analysis.ts` is explicitly an optimistic static reachability diagnostic, not a solvability test.

`verify-723-progress.ts` replays the preserved partial routes through 53/54 chips; `verify-952-progress.ts` replays the 329/376-chip route. Both assert the exact live endpoint, replay the exported cardinal-only TWS in both engines, compare every trace step, and regenerate the parity certificate. These are partial-route checks, not winning replays.

`prove-723.ts /path/to/Jacques.dat` checks the exact DAT/map and finite certificate for the native-MS impossibility proof in `723-scheduler-proof.md`: the global slipper queue can delay the gate for at most 70 ticks, while collecting the mandatory final chip and clearing the gateway requires at least 73. The queue sanity check is bounded by 20 seconds. `verify-723-progress.ts 54-trapped` checks the preserved 3,997-step all-chips-but-trapped route against the native oracle; it is not a winning replay.

`replay-978.ts` replays the preserved winning fixture, audits its 255-region order from tick zero, and independently verifies the exact published TWS in the native oracle. Each region must be fully cleared before any future-region pickup; remaining chips must form at most one component at each completed-region transition. The replay completes at tick 9,812 with seed 0 and stepping 0.

That replay produces a native trace larger than the buffered harness's 128 MiB output limit. `native-stream.ts` compares the initial state, each snapshot, and final result incrementally with a 60-second process timeout, exact staged-byte readback, and empty-stderr requirement. It records the complete native stdout hash and size. `native-stream-test.ts` checks a shorter real winning replay and rejects corrupted initial state, tick data, missing/extra steps, and result data. Run both scripts with `node_modules/.bin/vite-node` from `web/`, as above.

`replay-932.ts` replays the winning five-Teeth-queue fixture and verifies the exact staged TWS against the native oracle. It checks the Ball and five Teeth pins on every tick from 1,543 to completion, the preserved Walker outlet, and the doubled final chip corridor through tick 10,531. Four southward landings reach the exit at tick 10,544, with seed 0 and stepping 4. The verifier writes a route audit and four full-map milestone SVGs. This certifies the repository TW 2.3 ruleset; compatibility with a corrected cloning-identity implementation is not asserted.

# Original MSCC replay checker (experimental)

This adapter executes the original 16-bit `CHIPS.EXE` instructions with Unicorn.
It loads the DAT layers and connections into the original game structures, calls
the original initialization/movement/timer routines, and stops at the original
win or death boundary. It does not translate MSCC gameplay into another engine.

The executable, original assets, and private replays are **not included**. Supply
your own licensed executable. The supported SHA-256 is
`8e26acd67cf120bd5b512de4b4e78b80aca1579413cd04f3b2b68909a375866c`.
Offsets and data structures were researched using the annotated
[magical/CHIPS.EXE disassembly](https://github.com/magical/CHIPS.EXE), which identifies
this same executable. No disassembly checkout is needed to run the adapter.

## Run from a fresh checkout

Run these commands from the repository root. Keep the working directory outside
Git; JSON inputs and optional traces reveal the route.

```sh
python3 -m venv /tmp/tworld-mscc-venv
/tmp/tworld-mscc-venv/bin/python -m pip install -r scripts/mscc/requirements.txt
mkdir -m 700 /private/path/replay-check
npm exec --yes --package=tsx@4.23.13 -- tsx --tsconfig web/tsconfig.json \
  scripts/mscc/export-replay.ts /private/path/PACK.dat \
  /private/path/solution.tws 42 /private/path/replay-check/input.json
/tmp/tworld-mscc-venv/bin/python scripts/mscc/oracle.py \
  --exe /private/path/CHIPS.EXE --dat /private/path/PACK.dat \
  --replay-json /private/path/replay-check/input.json \
  --output /private/path/replay-check/result.json \
  --trace /private/path/replay-check/trace.json
```

The export uses the repository's existing TWS decoder and pins both input hashes.
Output files are created with mode `0600` and refuse to overwrite existing files.
Omit `--trace` when a detailed trace is unnecessary. Exit status is zero only for
completion. Inspect `status`, `final.time`, `final.tick`, and hashes in the result;
an error or incomplete run is not evidence that the level is impossible. A zero
exit status establishes completion only; check stored/final tick agreement and
the actual remaining time separately.

Defaults bound a run to 200,000 replay ticks, 100 ticks beyond the stored finish,
and 60 seconds of wall time. Each original-code call also has an instruction and
time limit. Override with `--max-ticks` and `--wall-seconds` when needed.

## What is established, and what is not

- Only the pinned executable is supported. All eight TWS stepping values are
  accepted: MS uses bit 2, so 0–3 share one phase and 4–7 share the other.
  Diagonal commands remain unsupported. RNG calls fail closed by default; the
  separate native RNG mode below does not translate the TWS seed. Explicit
  controlled-seed research is available separately and is not scoreboard legal.
- One original timer callback runs per two replay ticks, before input on even
  ticks starting at tick two; keyboard events run `MoveChip` immediately.
  Original `DoTick` (segment 7, offset 0) moves normal monsters on even callbacks,
  Teeth/Blobs when the callback counter is divisible by four, and decrements the
  countdown every ten callbacks. The adapter starts that counter at **0** for
  stepping 0–3 and **10** for stepping 4–7. Starting at 10 changes only the
  half-speed phase while retaining full first and subsequent seconds. Starting
  at 2 would incorrectly shorten the first second. `initialTimerCounter` in the
  result and `timerCounter` in traces expose this mapping.
- Timing remains a logical normalization: original MSCC requests a 110 ms
  Windows timer, so the adapter does not reproduce its wall-clock cadence.
  No gameplay is run before replay tick zero and no long-first-second trick is
  used. The original 16-bit callback counter still wraps in very long runs.
- Mouse commands set the original target and clear the buffered key, matching
  the window handler after its pixel-to-map conversion. Targets outside the map
  are rejected. This does **not** establish that each target was clickable in a
  particular viewport; mouse click visibility still needs independent review.
- Win16 memory allocation is implemented in a bounded emulated heap. Rendering,
  scrolling, counters, hints, and sound are skipped at named presentation
  boundaries. The actual Windows event loop, graphics and audio are not run.
  Unknown imports fail explicitly; they are never silently treated as successes.
- Completion stops at `EndLevel` before UI/level advance. Death stops at
  `ShowDeathMessage` after the original code sets the autopsy. This prevents
  later processing from changing the score or restarting the level.
- A matching Chip/chip-count trace is narrower evidence than full-state parity.
  Continue validating in legacy Tile World, SuCC, and TWO: these are the required
  checks. Original MSCC is best effort. This experimental checker adds
  original-binary evidence; it does not replace those checks or
  establish [scoreboard eligibility](https://scores.bitbusters.club/faq).

## Native RNG runs

TW and original MSCC use different random generators. A TW seed cannot be
assumed to reproduce a Windows run. The default rejects a runtime RNG call.
For a separate original-MSCC startup experiment, add `--native-rng` to the
command above. It samples the local system monotonic clock once, passes its low
16 bits into the original `srand`, and then executes the original `rand`
instructions without substituting random outcomes. This matches the original
startup dependency (`CreateWindowsAndInitGame`, 2:092e, calls
`GetCurrentTime` then `srand` at 1:00c4); it is not a reconstruction of an unknown
historical Windows session. Prior levels and retries can also have consumed RNG
state in such a session.

The result records `rng.mode`, `rng.startupMilliseconds`, `rng.seed`, the number
of original `rand` calls, and the distinct `rng.twsRandomSeed`. To reproduce a
recorded experiment, use `--native-rng-startup-ms NUMBER` with that exact recorded
startup value, in place of `--native-rng`. Do not select favorable startup values
or inspect future random outcomes when assessing scoreboard routes. Ordinary
blind retries are distinct from seed selection, but this adapter models a fresh
application startup per run; it does not yet implement in-process retries that
continue the existing RNG state. Native RNG results are separate evidence, and random
monster traces can legitimately differ from TW/SuCC. Investigate a death or
desynchronization; do not label it a matching deterministic TWS replay.

## Controlled RNG research (not scoreboard eligible)

The adapter can deliberately seed original MSCC for reproducible experiments.
The executable stays unchanged: the adapter calls its original `srand` once,
then lets every original `rand` instruction execute normally. Nothing substitutes
individual random outcomes. Choose exactly one RNG option per run.

For an explicit seed, add this to the normal checker command:

```sh
--research-rng-seed 12345
```

The seed must be an integer from **0 through 65535**, inclusive, matching the
original 16-bit `srand` argument. This option preserves the TWS's own seed and is
the recommended way to retain independent TW/SuCC replay evidence.

A standard TWS already carries a 32-bit random-seed field. Original MSCC does not
read TWS files itself; our exporter and adapter can explicitly use that field as
a carrier for a research MSCC seed. Export the modified TWS normally, then add:

```sh
--research-rng-from-tws
```

This uses `replay.randomSeed` from the exported JSON and requires it to be in
0–65535. Missing or oversized seeds are rejected, never truncated. No new TWS
format is needed. Editing a TWS seed also changes its TW random history, so a
modified TWS needs fresh TW/SuCC validation if used there. Without this flag,
the TWS seed is **never** automatically interpreted as an MSCC seed.

Every emitted research result, including unsuccessful runs and engine errors, is labeled
`validationPurpose: "controlled-rng-research"` and `scoreboardEligible: false`.
Their `rng` object records `mode: "research-fixed-seed"`, `seed`, `seedSource`
(`explicit` or `tws`), `twsRandomSeed`, and the original RNG call count. The
startup-clock field is null. Errors before the engine starts have a null call
count. Results retain the DAT, TWS, and exported-JSON hashes. Invalid CLI options,
unreadable inputs, or a DAT-hash mismatch fail before a result file is created.
Repeating the same
inputs, adapter version, binary, and research seed reproduces the experiment;
use new output paths because evidence files cannot be overwritten.

This deliberately manipulated mode is **unsuitable for scoreboard evidence**.
Keep its generated inputs, results and traces private and separate from normal
score-route validation. The CLI does not search seeds; research tooling can use
the Python constructor's `research_rng_seed` argument for controlled experiments.

### Why equal seed numbers do not reproduce TW randomness

Research of the pinned executable, using the annotated
[magical/CHIPS.EXE disassembly](https://github.com/magical/CHIPS.EXE), established:

- Original `srand` is at segment 1, offset `0x00c4`; it initializes a 32-bit
  state from a 16-bit argument, with the high word zero.
- Original `rand` is at `1:00dc`: the state becomes
  `(214013 * state + 2531011) mod 2^32`, returning `(state >> 16) & 0x7fff`.
  Seed 1 starts with outputs `41, 18467, 6334`; binary regression tests pin this.
- The original application seeds once during startup from `GetCurrentTime`.
  Ordinary level retries can continue an already-advanced state.
- Tile World uses a different generator and consumes it differently for random
  creatures. For example, MSCC Walkers draw after forward movement is blocked;
  TW constructs a random direction order before attempting forward movement.

An identical seed value therefore does not imply identical monster movement,
random-force behavior, route completion, or score across engines. A controlled
MSCC success is a separate experimental execution, not a seed translation or
proof of an ordinary native run.

## Tests

Synthetic DAT fixtures exercise parsing, clone connection stride, collection,
death, keyboard buffering, mouse replacement, both stepping phases (all eight
metadata values), normal versus half-speed monster turns, countdown boundaries,
and explicit unsupported cases. Native RNG tests execute the original routines,
check repeatability from a recorded startup value, and ensure TWS seeds are not
silently mapped. Research tests cover both seed boundaries, invalid values,
explicit TWS opt-in, mutually exclusive modes, repeatability, and non-scoreboard
labels on completion and errors. No real level routes are embedded in tests.

```sh
MSCC_EXE=/private/path/CHIPS.EXE /tmp/tworld-mscc-venv/bin/python \
  -m unittest discover -s scripts/mscc -v
npm exec --yes --package=tsx@4.23.13 -- tsx --tsconfig web/tsconfig.json \
  --test scripts/mscc/export-replay.test.ts
```

Without `MSCC_EXE`, only format tests run; binary tests are explicitly skipped.
Run the complete suite with the licensed binary before accepting adapter changes.

## Private original-copy recovery

The owner-supplied original folder has a verified, create-only backup in private
GCS. Authorized maintainers can restore it with the existing GCP account:

```sh
gcloud storage cp \
  gs://joshua-server-data-775718163601/cc-tools/mscc/original/5ae4d03225644fcfb3edc51307355abf952b8f92e59322a1d95093136c438f1a.tar.gz \
  /private/path/mscc-original.tar.gz
```

Archive SHA-256:
`5ae4d03225644fcfb3edc51307355abf952b8f92e59322a1d95093136c438f1a`.
Verify the hash and inspect archive members before extracting outside Git.
Keep restored assets and validation evidence private. No public asset mirror or
automatic binary download is provided.

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
  separate native RNG mode below does not translate the TWS seed.
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
  Continue validating in legacy Tile World, SuCC, and TWO. This experimental
  checker adds original-binary evidence; it does not replace those checks or
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
startup value, in place of `--native-rng`. Never search startup values or resample
until a route passes. Native RNG results are separate evidence, and random
monster traces can legitimately differ from TW/SuCC. Investigate a death or
desynchronization; do not label it a matching deterministic TWS replay.

## Tests

Synthetic DAT fixtures exercise parsing, clone connection stride, collection,
death, keyboard buffering, mouse replacement, both stepping phases (all eight
metadata values), normal versus half-speed monster turns, countdown boundaries,
and explicit unsupported cases. Native RNG tests execute the original routines,
check repeatability from a recorded startup value, and ensure TWS seeds are not
silently mapped. No real level routes are embedded in tests.

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

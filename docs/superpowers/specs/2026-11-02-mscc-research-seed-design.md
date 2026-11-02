# Controlled MSCC RNG for research

The user authorizes deliberate RNG control for experiments, explicitly outside
scoreboard eligibility. SuCC and legacy Tile World remain required replay checks
alongside TWO; original MSCC is best-effort additional evidence.

## Approach

Use the original executable's `srand(unsigned int)` with an explicit 16-bit
seed, then execute its unchanged `rand` instructions. Add mutually exclusive
`--research-rng-seed N` and `--research-rng-from-tws` options alongside the existing
native-clock modes. The latter explicitly interprets the exported TWS seed as
an MSCC seed and rejects values outside 0–65535 rather than truncating them.

This is the implementation choice: a new TWS format would break compatibility,
and silently reinterpreting the existing seed would change ordinary validation.
The existing JSON export plus opt-in CLI mode avoids both. Direct seed selection
preserves the original TWS bytes and is preferable when maintaining TW evidence.

## Contract

- Default behavior and independently clock-seeded runs remain unchanged.
- Zero and 65535 are valid. Booleans, fractional values, negative values and
  larger integers are invalid; incompatible RNG configurations fail explicitly.
- Research output identifies the seed, source, original TWS seed, RNG-call count,
  and `scoreboardEligible: false`, including unsuccessful runs.
- A controlled original-MSCC win is experimental evidence, never a scored result
  or proof that TW's random history is reproducible in MSCC.
- No seed search, route changes, RNG-output substitution or binary patching is
  included. Generated replays, traces and original assets remain private.

## Verification

Use synthetic DAT fixtures and the privately supplied executable to test the
original RNG sequence, replay repeatability and CLI behavior. Retain the native
clock and reject-by-default regression coverage. Document commands, provenance,
the distinct random algorithms, and the validation priority in README/AGENTS.

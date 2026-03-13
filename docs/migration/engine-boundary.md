# Engine Boundary

This document defines the gameplay migration seam for the new TypeScript/React code.

## Rule

Do not port legacy gameplay by translating helper functions one at a time.

The migration boundary is the engine contract exposed to the application layer, with parity measured against oracle traces.

## Current Contract

The application-facing engine port is [web/src/application/ports/GameEngine.ts](/Users/joshuabone/git/tworld/web/src/application/ports/GameEngine.ts).

Shared trace scenarios live behind [web/src/application/ports/TraceScenarioRepository.ts](/Users/joshuabone/git/tworld/web/src/application/ports/TraceScenarioRepository.ts), and live oracle execution sits behind [web/src/application/ports/TraceOracle.ts](/Users/joshuabone/git/tworld/web/src/application/ports/TraceOracle.ts).

It intentionally describes:

- start request identity: `seriesFile`, `levelNumber`, `ruleset`
- scheduled commands
- canonical semantic snapshots
- replay cursor and PRNG state for deterministic debugging
- full trace results

It intentionally does not describe:

- SDL or Qt rendering details
- legacy globals
- map struct layouts
- creature linked lists
- native input polling

## Parity Gate

Any future engine adapter, whether native bridge, WASM wrapper, or full TS rewrite, must match the oracle on:

- `input-trace`
- `replay-trace`
- final status
- final tick count
- canonical hashes and actor snapshots

## Adapter Strategy

- Short term: keep the native engine as the oracle and likely runtime authority.
- Medium term: add a native/WASM adapter implementing `GameEnginePort`.
- Long term: only replace that adapter with a TS engine after trace parity is proven.
- Differential tests should compare a candidate `GameEnginePort` against a `TraceOracle` over shared scenario specs instead of inventing parallel fixtures.

## Consequence

React never talks to `legacy_c/play.c`, `legacy_c/mslogic.c`, or `legacy_c/lxlogic.c` directly.

Those files remain implementation detail behind the gameplay port until they are replaced entirely.

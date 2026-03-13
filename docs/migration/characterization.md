# Characterization Contract

This document defines the contract for the native characterization oracle used during the TypeScript migration.

## Goals

- Freeze legacy behavior behind a small, deterministic command-line interface.
- Compare TypeScript modules to oracle outputs instead of comparing them to legacy implementation details.
- Keep characterization focused on bundled free content in this repository.
- Make the TypeScript/React side hexagonal from the beginning so domain logic stays independent from UI and I/O.

## Non-Goals

- Characterizing renderer pixels from SDL or Qt.
- Reproducing native UI widget structure in React.
- Depending on `CHIPS.dat`.
- Freezing undocumented incidental behavior such as pointer values, struct padding, or filesystem enumeration order.

## Oracle Principles

1. The oracle is headless and runnable from the repo root.
2. Outputs are machine-readable JSON.
3. Outputs are deterministic for the same repo contents and save data.
4. Outputs describe semantic behavior, not native control flow.
5. Canonicalization is allowed where the native program is nondeterministic.

## Hexagonal TS/React Boundary

- Domain and application modules must not import React, browser APIs, Node filesystem APIs, or fixture/oracle subprocess code.
- Ports define the interfaces for fixture loading, content access, persistence, and oracle comparison.
- Adapters implement those ports for tests, browser usage, and any native bridge.
- React components are UI adapters only and should consume application services rather than legacy-shaped structs directly.

## Initial Command Surface

The first oracle surface covers the lower-risk modules and parser/data contracts:

- `series-list`
- `level-info <series-file> [level-number]`
- `score-table <series-file>`
- `times-table <series-file>`
- `solution-list <series-file>`
- `solution-roundtrip <ruleset> <level-number> <password> <best-time> <flags> <random-slide-dir> <stepping> <random-seed> [when:dir,...]`

Later PRs extend the oracle with gameplay traces.

## Output Shape Rules

- Top-level payloads are JSON objects.
- Strings are JSON strings with non-ASCII legacy bytes escaped deterministically.
- Arrays are ordered deterministically.
- Any list sourced from nondeterministic filesystem enumeration must be sorted by the oracle before emission.
- Table-like outputs are serialized as normalized table cells:
  - `span`
  - `align`
  - `text`

## Parity Definition

### Series Parsing

Parity means TypeScript matches the oracle for:

- series discovery
- ruleset selection
- visible filenames
- map metadata needed to load a series

### Level Metadata

Parity means TypeScript matches the oracle for:

- level numbering
- names
- authors
- passwords
- time limits
- level hashes
- saved-solution metadata
- unsolvable annotations

### Score And Time Behavior

Parity means TypeScript matches the oracle for:

- row presence and ordering
- title visibility rules
- replaceable-solution markers
- numeric values
- formatted table cells after normalization

### Solution File Behavior

Parity means TypeScript matches the oracle for:

- solution file discovery
- associated filenames
- stable sorted output order
- solution payload encoding and decoding for checked-in synthetic round-trip specs

### Gameplay

Gameplay parity is enforced through canonical state snapshots and replay/input traces, not raw structs or pixels.

Canonical gameplay snapshots should include enough diagnostic state to explain deterministic drift:

- replay cursor
- timer state
- Chip and actor state
- canonical map and creature hashes
- main PRNG state
- Lynx PRNG bytes

Scenario specs for gameplay traces should carry an explicit random seed whenever normal play would otherwise inherit a time-based shared seed.
Initialization parity can be represented as zero-tick input traces with `inputs: "-"`, which keeps initialization and gameplay on the same contract surface.

## Out Of Scope For The First Pass

- Sound playback
- Qt-only narrative presentation details
- Clipboard behavior
- Window/input timing behavior
- Native prompt widgets

## Fixture Policy

- Fixtures must use only bundled free content in `data/`, `sets/`, `res/`, and `docs/`.
- Fixtures must not require `CHIPS.dat`.
- Fixtures should be reviewed as plain text.
- Schema changes require an explicit version bump in fixture metadata.
- Live differential tests may query the oracle directly, but any reduced regression case should be promoted into a checked-in fixture.

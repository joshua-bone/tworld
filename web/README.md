# Web Workspace

This workspace follows a package-first hexagonal structure:

- `src/bootstrap/`: browser entrypoints and cross-package architecture checks
- `src/content/`: pure file-format parsing and series/solution metadata
- `src/game-core/`: shared simulation model, commands, traces, and kernel helpers
- `src/game-runtime/`: game engine ports and interactive session services
- `src/level-catalog/`: level repositories and catalog-loading services
- `src/oracle-fixtures/`: oracle adapters, fixture repositories, and fixture mappers
- `src/player-web/`: browser UI, browser storage, audio, and player composition
- `src/replay-verifier/`: replay comparison, sweep, inspect, and report flows
- `src/ruleset-ms/`: MS ruleset implementation
- `src/ruleset-lynx/`: Lynx ruleset implementation

Package layout conventions:

- pure libraries expose public contracts from `api/` and keep internal helpers in `impl/`
- boundary-facing packages expose adapters/contracts from `ports/`, keep concrete code in `impl/`, and place wiring in `compose/`
- `bootstrap/` holds true entrypoints and architecture checks, not feature logic

Current migration state:

- content parsing is isolated from runtime orchestration
- shared simulation code is isolated from MS and Lynx policy
- browser composition is isolated in `player-web/compose` and `bootstrap/browser`
- replay verification and oracle fixture plumbing are split into their own packages

Validation commands:

- `npm run typecheck`
- `npm test`
- `npm run build`

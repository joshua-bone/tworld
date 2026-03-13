# Web Workspace

This workspace follows a hexagonal structure:

- `src/domain/`: pure TypeScript logic and legacy file-format parsers
- `src/application/`: ports, fixture contracts, mappers, and use-cases
- `src/adapters/`: browser, Node, and React adapters

Current migration state:

- series metadata is parsed from raw `.dac` and `.dat` files in domain code
- solution payloads are parsed and serialized in domain code
- fixture JSON is treated as an outer-layer contract owned by the application layer
- React only calls use-cases through adapter repositories

Validation commands:

- `npm run typecheck`
- `npm test`
- `npm run build`

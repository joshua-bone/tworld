# Clean Code for Humans and Coding Agents

Adapted and expanded from **Urs Enzler, _Clean Code Cheat Sheet_ (V2.4, October 2014)**. The original cheat sheet is licensed under **CC BY 4.0**. This document is a synthesized, repo-friendly Markdown version with added examples and agent-oriented guidance.

This is not a line-by-line transcription. It keeps the original themes, reorganizes them for practical use, and adds notes for modern coding agents such as Codex, Claude Code, and Copilot coding agent.

## Why clean code still matters

Clean code keeps the cost of change from spiking as a codebase grows. It improves:

- readability
- changeability
- extensibility
- testability
- defect isolation

That matters for humans, but it matters even more for coding agents. Agents are fast at making local edits, but they are less reliable when behavior is hidden behind:

- long call chains
- implicit invariants
- giant functions
- wide condition trees
- undocumented workflow quirks

If a person has to reverse-engineer the code before changing it, an agent will too. The same things that reduce human cognitive load usually reduce agent error rate.

## Agent-oriented categories

### Tier 1: highest leverage for LLM agents and humans

These are the biggest multipliers for both maintainability and agent reliability.

- Small, single-purpose functions and classes
- Explicit interfaces and narrow seams
- One level of abstraction per function
- Step-down flow in control logic
- Fewer nested conditionals
- Fewer long argument lists
- Clear ownership of state
- Deterministic build, test, and validation commands
- Good characterization tests before refactors
- Precise repository instructions (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`)

### Tier 2: broadly important clean-code rules

These matter a lot, but usually pay off after Tier 1 is already in place.

- SRP, DIP, ISP, OCP, and LSP used pragmatically
- Loose coupling and high cohesion
- DRY without over-abstracting
- Encapsulation of boundary conditions
- Explicit error handling and fail-fast behavior
- Feature-oriented file structure
- Avoiding tangles and cyclic dependencies
- Descriptive naming

### Tier 3: valuable, but less agent-specific

These are still useful, but they are less about agent correctness and more about team quality and long-term engineering habits.

- Pair programming
- Commit reviews
- Coding dojo / deliberate practice
- Package-level principles like RREP, CCP, CRP, SDP, SAP
- Broader testing taxonomies and process discipline

## Tier 1 guidance: what matters most for coding agents

### 1. Keep functions small and focused

Original cheat-sheet idea:

- methods should do one thing
- methods should descend one level of abstraction
- classes should be small

Why it matters for agents:

- Small units are easier to modify without collateral damage.
- Agents are much better at preserving behavior when a function has one clear purpose.
- Smaller helpers produce better localized tests and diffs.

Bad:

```ts
function advanceTurn(state: State, input: Input) {
  // input normalization
  // movement decision
  // collision checks
  // sound effects
  // inventory changes
  // death handling
  // debug tracing
  // score updates
}
```

Better:

```ts
function advanceTurn(runtime: TickRuntime) {
  const move = selectChipMove(runtime);
  applyForcedMovement(runtime);
  resolveChipMove(runtime, move);
  advanceActors(runtime);
  finalizeTurn(runtime);
}
```

This step-down shape is easier for humans to read and easier for agents to extend safely.

### 2. Replace raw branching with named policies or helpers

Original cheat-sheet idea:

- prefer polymorphism to `if/else` or `switch/case`
- encapsulate conditionals
- use positive conditionals

Why it matters for agents:

- Repeated tile-id checks or type checks are where feature work turns into branch sprawl.
- Agents tend to copy existing conditionals; if the codebase teaches branching, the diff will grow branches.
- Named policies create stable extension points.

Bad:

```ts
if (tile === Tile.Fire) {
  if (actor === Actor.Chip && hasFireBoots(state)) {
    return MoveResult.Allow;
  }
  if (actor === Actor.Fireball) {
    return MoveResult.Allow;
  }
  return MoveResult.Die;
}
```

Better:

```ts
const firePolicy = getActorCapabilities(actor).fireRule;
return applyFireRule(firePolicy, runtime, pos);
```

This does not remove all branching. It localizes branching at a stable boundary.

### 3. Avoid long argument lists by passing focused context objects

Original cheat-sheet idea:

- methods with too many arguments are a smell
- keep configurable data at high levels

Why it matters for agents:

- Long parameter lists are a major source of wiring mistakes.
- They also blur ownership: which values are inputs, mutable state, caches, or projections?

Bad:

```ts
resolveMove(
  engine,
  state,
  cells,
  topTiles,
  bottomTiles,
  chipPos,
  inventory,
  sounds,
  debugPhases,
  actorId,
  pos,
  dir,
);
```

Better:

```ts
resolveMove(runtime, actor, dir);
```

Where `runtime` is a deliberately small context, not a bag of everything.

Good context objects:

- collect values that always travel together
- preserve invariants
- hide mechanical plumbing

Bad context objects:

- become a service locator
- expose unrelated global state
- let any helper mutate anything

### 4. Keep state ownership explicit

Why it matters for agents:

- Features go wrong when state has no single home.
- Agents are especially vulnerable to “projection vs source of truth” confusion.

Examples:

- `chipsNeeded` is global level progress, not actor-local inventory.
- A portable item store should own portable item identity.
- Actor-local inventory should own keys and boots for that actor.
- Derived UI state should stay a projection, not become a second source of truth.

Rule:

- each mutable fact should have one authoritative owner
- everything else should be derived from it

### 5. Prefer explicit workflow instructions over tribal knowledge

Modern agent docs consistently reinforce this.

OpenAI says Codex agents perform best with configured environments, reliable tests, and clear documentation, and that `AGENTS.md` can tell the agent how to navigate the repo and which commands to run.

Anthropic recommends `CLAUDE.md` for project architecture, coding standards, and workflows, and says the instructions should be specific, concise, and well structured.

GitHub recommends repository custom instructions that tell the agent which commands work, which do not, and what order to run them in.

That means “clean code” for an agent includes clean repo operations:

- one command to build
- one command to run tests
- one command to typecheck
- explicit known failures and workarounds
- path-specific guidance where conventions differ

### 6. Write characterization tests before structural cleanup

Original cheat-sheet idea:

- always have a running system
- change in small steps
- write acceptance tests around existing features
- refactor before adding functionality

Why it matters for agents:

- Agents can refactor aggressively, but they need a safety net.
- Characterization tests let you improve structure without guessing behavior.

Use characterization tests when:

- behavior is subtle
- there are two rulesets or modes
- the current code is ugly but important
- you plan to extract interfaces or move logic across modules

### 7. Scope tasks so they fit in one reasoning window

This is where modern agent guidance adds something new beyond the original cheat sheet.

OpenAI recommends well-scoped tasks, often around “about an hour” of human work or a few hundred lines of code. GitHub’s coding-agent guidance similarly emphasizes clear task boundaries and explicit validation steps.

Practical implication:

- large design changes should be split into staged PRs
- each PR should establish a seam, not mix seam creation with feature explosion
- agents do better when they can land one coherent change with one validation story

## Tier 2 guidance: broadly important clean-code rules

### Loose coupling and high cohesion

Original cheat-sheet idea:

- loose coupling
- high cohesion
- change is local
- easy to remove
- mind-sized components

Use this as a design test:

- Can I replace this module without rewriting half the system?
- Can I explain this file in one sentence?
- If I change one behavior, do the edits stay local?

If not, the module probably mixes multiple responsibilities or leaks internal assumptions.

### SOLID, used pragmatically

The original cheat sheet includes SRP, OCP, LSP, DIP, and ISP. These are useful when applied to actual change pressure, not as a class diagram exercise.

Good use:

- extract an interface because two policies vary independently
- separate high-level orchestration from low-level mechanics
- prevent one module from depending on the concrete internals of another

Bad use:

- creating ten micro-interfaces around a stable design
- wrapping everything in factories because “DIP”
- introducing inheritance where composition is clearer

Practical reading:

- SRP: one reason to change
- OCP: new behavior should usually plug in at a seam
- LSP: subtype promises must actually hold
- DIP: high-level logic depends on contracts, not concrete plumbing
- ISP: consumers should not depend on methods they do not need

### Encapsulate boundary conditions

Original cheat-sheet idea:

- boundary conditions are hard to track, so put them in one place

Examples:

- coordinate clamping
- array bounds
- forced-move rules
- “if supported, drop later”
- “if blocked on ice without boots, keep trying”

Boundary rules are where bugs cluster. If a condition is subtle, it should have a name and a home.

### Use value objects when primitives hide meaning

Original cheat-sheet idea:

- prefer dedicated value objects over primitive types

Good candidates:

- `Position`
- `Direction`
- `TickIndex`
- `ActorId`
- `InventoryOwnerId`
- `AbsolutePath`

This reduces accidental mixups and makes signatures more obvious.

### Naming should expose intent and side effects

Original cheat-sheet ideas:

- choose descriptive, unambiguous names
- name methods after what they do
- names should reflect side effects

Examples:

- `scanPortableItems` is clearer than `initTools`
- `consumeKeyAndOpenDoor` is clearer than `enterDoor`
- `projectInventoryView` is clearer than `getInventory`

If a function mutates state, the name should not sound read-only.

### Remove duplication, but not by hiding important differences

Original cheat-sheet idea:

- duplication is a maintainability killer

For this repo, the dangerous duplication is not just repeated lines. It is repeated logic shapes across MS and Lynx.

Good extraction:

- shared result types
- shared store mechanics
- shared testing vocabulary

Bad extraction:

- fake “one true engine” abstractions that erase real ruleset timing differences

The right target is often:

- shared vocabulary
- shared helper structure
- per-ruleset policy data
- per-ruleset orchestration where behavior truly differs

### Fail fast and catch only where you can act

Original cheat-sheet ideas:

- catch specific exceptions
- catch only where you can react meaningfully
- fail fast
- do not use exceptions for control flow
- do not swallow exceptions

In TypeScript-heavy codebases, this often translates to:

- throw or return a typed failure as soon as the invariant is broken
- avoid “impossible” default branches that silently continue
- use explicit result objects for expected gameplay outcomes
- reserve exceptions for programmer errors or infrastructure failures

## Tier 3 guidance: useful, but less agent-specific

### Package-level principles

The original cheat sheet includes package cohesion and coupling principles such as RREP, CCP, CRP, ADP, SDP, and SAP.

These are useful for larger systems, but they are usually not the first thing to optimize when an engine has:

- giant functions
- raw condition trees
- unclear state ownership

Use them when evaluating module boundaries, not as the first cleanup move.

### Human process and team habits

The original cheat sheet recommends:

- pair programming
- commit reviews
- coding dojo
- CI discipline

These remain valuable. For agent-heavy teams, the modern equivalent is:

- review agent diffs carefully
- keep instructions versioned
- prefer small, auditable changes
- require runnable validation

## Patterns especially useful for this repo

### 1. Step-down turn runners

Good:

```ts
function advanceInteractiveTick(runtime: TickRuntime) {
  const chipMove = selectChipMove(runtime);
  resolveChipPhase(runtime, chipMove);
  resolveActorPhase(runtime);
  finalizeTick(runtime);
}
```

Bad:

```ts
function advanceInteractiveTick(...) {
  if (...) {
    if (...) {
      ...
    } else if (...) {
      ...
    }
  }
  // 500 more lines
}
```

### 2. Policy dispatch over tile-id branching

Good:

```ts
interface ActorCapabilities {
  fireRule: FireRule;
  thiefRule: ThiefRule;
  supportRule: SupportRule;
}
```

Then:

```ts
const capabilities = getActorCapabilities(actor);
applyThiefRule(capabilities.thiefRule, runtime, actor);
```

### 3. Narrow projections over duplicated state

Good:

- runtime store owns mutable identity and state
- compatibility arrays are projections

Bad:

- runtime store, tile layer, and inventory array all treated as equal sources of truth

### 4. Feature-oriented module splits

Prefer:

- `chipInput.ts`
- `portableItems.ts`
- `verticalMovement.ts`
- `actorCapabilities.ts`

Over:

- one `engine.ts` that owns every detail forever

## Clean-code smells to watch for

From the original sheet, with agent-specific interpretation:

- Rigidity: a small change forces edits across unrelated modules.
- Fragility: a tiny diff breaks distant behavior.
- Immobility: useful logic cannot be reused without dragging the engine with it.
- Viscosity of design: the fastest change is the ugliest one.
- Viscosity of environment: builds and tests are slow or unclear, so validation gets skipped.
- Needless complexity: seams exist before the variability does.
- Needless repetition: the same rule is implemented in slightly different forms.
- Opacity: understanding requires reading too much code or guessing hidden invariants.

## Refactoring playbook

Adapted from the legacy-code section of the original sheet.

### 1. Keep the system running

Refactor from green state to green state.

### 2. Characterize existing behavior

Before extracting or generalizing, pin down:

- timing
- collisions
- inventory transitions
- support rules
- ruleset differences

### 3. Extract one seam at a time

Good seam examples:

- phase recorder
- portable item store
- vertical movement
- actor-local inventory
- actor capabilities

### 4. Separate shared vocabulary from shared behavior

This is especially important in a dual-ruleset engine.

Extract:

- shared result types
- shared interfaces
- shared storage helpers

Keep ruleset-specific:

- timing order
- movement semantics
- arrival sequencing
- collision quirks

### 5. Add the feature only after the seam is clean

If a new element forces conditionals all over the engine, the seam is not ready.

## Practical checklist

Use this list when reviewing a change.

- Does each new function have one obvious responsibility?
- Does control flow read top-down?
- Are conditionals named or encapsulated when they carry domain meaning?
- Did we reduce or increase state duplication?
- Is each mutable fact owned in exactly one place?
- Did we avoid adding another long argument list?
- Are we extracting shared vocabulary instead of erasing ruleset differences?
- Can the change be validated with one or two deterministic commands?
- Do tests characterize behavior before refactoring it?
- Would a coding agent be able to follow the repo instructions without trial-and-error?

## What to write down for coding agents

Based on OpenAI, Anthropic, and GitHub guidance, the highest-value repository instructions usually include:

- exact build, test, lint, and typecheck commands
- known command failures and workarounds
- file and module ownership hints
- architecture seams and extension points
- naming and formatting rules
- where not to add new branches or tile checks
- ruleset-specific pitfalls
- which tests to run for which kinds of changes

Keep these instructions:

- specific
- concise
- versioned with the repo
- scoped to the files or directories they govern

## Sources

- Urs Enzler, _Clean Code Cheat Sheet_, V2.4, October 2014. Original PDF in this repo: `Clean-Code-V2.4.pdf`. Licensed under CC BY 4.0.
- OpenAI, “Introducing Codex”: https://openai.com/index/introducing-codex/
- OpenAI, “How OpenAI uses Codex”: https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf
- Anthropic, “How Claude remembers your project”: https://docs.anthropic.com/en/docs/claude-code/memory
- GitHub Docs, “Adding repository custom instructions for GitHub Copilot”: https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
- GitHub Docs, “Best practices for using GitHub Copilot to work on tasks”: https://docs.github.com/en/enterprise-cloud@latest/copilot/tutorials/coding-agent/get-the-best-results

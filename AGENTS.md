# Local Codex Working Agreements

- Long-running tooling such as tests, replay sweeps, fixture generation, Docker Compose, and migrations must be invoked with sensible timeouts or in non-interactive batch mode.
- Full-corpus replay sweeps must set an explicit timeout that exceeds the expected wall time or use a direct non-vitest path. Do not rely on the default `verify:*` vitest timeout for all-corpus Lynx sweeps; use `TWORLD_LYNX_SWEEP_TIMEOUT_MS` or split the run into bounded per-file sweeps.
- Never leave a shell command waiting indefinitely. Prefer explicit timeouts, scripted one-shot runs, or bounded polling, and summarize/stop if a command runs materially longer than expected.
- After each completed user-visible change, commit and push the current branch unless the user explicitly says not to or a blocker prevents it.
- Always stage deleted files in the next commit unless the user explicitly says to keep them out.

## User-visible Web Deployment

- A commit and feature-branch push that changes deployable web content is not complete by itself. Take the change through the protected `master` branch, wait for the GitHub Pages deployment to succeed, and verify the intended public routes unless the user explicitly opts out or a CI/permission blocker prevents deployment.
- Keep production deployment automatic on protected `master`; do not make arbitrary feature-branch pushes overwrite the public site.
- In the Pages build, emit root-owning bundles before additive leaves and validate public payloads only after every emitter has run. The P7 training-pack emitter must remain after the P4B root-bundle emitter so the levels are not removed by a later root replacement.
- When deployment is blocked, report the exact failed check or missing authority instead of describing the feature-branch push as deployed.

## CCSolver Workspace Path

- The canonical workspace directory is exactly `ccsolver` (8 characters). `ccssolver` is a misspelling and must never be used in commands, identifiers, or paths.
- In multi-command diagnostics, assign `CCSOLVER_DIR=ccsolver` once and reference that variable instead of retyping the directory name.
- An `ENOENT` for this workspace is not evidence of deletion until `test -d "$CCSOLVER_DIR"` and `git cat-file -e "HEAD:$CCSOLVER_DIR/package.json"` have both been checked with the canonical variable.

## Handling Replay Failures

- When a replay failure appears recent, start with a bounded backwards history search before attempting speculative fixes.
- Prefer the smallest possible repro: run only the failing replay file/level against the current fixtures and oracle, not a full pack sweep.
- First verify the failure on current `HEAD` with the exact replay pack, level filter, and ruleset that the user reported.
- Then rewind and retest in small steps, usually commit-by-commit through the most recent suspicious range, until the first bad commit is identified.
- Once a regression boundary is found, inspect the specific files and hunks in that commit before changing code elsewhere.
- If a replay failure turns out to be oracle stderr handling, fixture drift, or verification harness behavior rather than gameplay simulation, fix that seam narrowly and add a regression test there.
- After fixing a replay regression, rerun the original minimal repro first, then run only the nearest targeted tests or replay checks needed to prove the fix.

## Adding New Elements Extensibly

- Prefer extending the relevant ruleset catalog policy layer before adding new raw tile-id branches in engine hot paths.
- Encode reusable semantics as typed ruleset policy, such as entry masks, exit masks, enter actions, button actions, forced-floor kinds, release-to-exit rules, or actor-arrival actions.
- Use broad tags only for coarse taxonomy and discovery. Do not rely on tags like `pushable` or `blocking` as the final gameplay rule when direction, inventory, occupancy, timing, or ruleset quirks still matter.
- Keep ruleset-specific behavior in the ruleset catalog or ruleset engine. Do not introduce shared abstractions that erase real MS vs Lynx differences.
- When behavior exists in both rulesets, inspect both MS and Lynx before choosing a seam. Reuse an existing seam shape when possible, but keep the policy data per-ruleset.
- When adding a new element, check whether the behavior belongs to one of these seams first:
- entry policy
- exit policy
- chip-enter action
- non-Chip arrival action
- forced movement / redirection
- button / wiring activation
- actor traits such as immunities
- If a new element needs a genuinely new interaction seam, add a typed policy/helper for that seam instead of scattering identical tile checks across multiple engine functions.
- Update or add catalog tests for every new policy branch, and add targeted engine tests for the user-visible interaction that motivated the new element.

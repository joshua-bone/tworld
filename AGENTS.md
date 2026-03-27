# Local Codex Working Agreements

- Long-running tooling such as tests, replay sweeps, fixture generation, Docker Compose, and migrations must be invoked with sensible timeouts or in non-interactive batch mode.
- Full-corpus replay sweeps must set an explicit timeout that exceeds the expected wall time or use a direct non-vitest path. Do not rely on the default `verify:*` vitest timeout for all-corpus Lynx sweeps; use `TWORLD_LYNX_SWEEP_TIMEOUT_MS` or split the run into bounded per-file sweeps.
- Never leave a shell command waiting indefinitely. Prefer explicit timeouts, scripted one-shot runs, or bounded polling, and summarize/stop if a command runs materially longer than expected.
- After each completed user-visible change, commit and push the current branch unless the user explicitly says not to or a blocker prevents it.
- Always stage deleted files in the next commit unless the user explicitly says to keep them out.

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

# Local Codex Working Agreements

- Long-running tooling such as tests, replay sweeps, fixture generation, Docker Compose, and migrations must be invoked with sensible timeouts or in non-interactive batch mode.
- Full-corpus replay sweeps must set an explicit timeout that exceeds the expected wall time or use a direct non-vitest path. Do not rely on the default `verify:*` vitest timeout for all-corpus Lynx sweeps; use `TWORLD_LYNX_SWEEP_TIMEOUT_MS` or split the run into bounded per-file sweeps.
- Never leave a shell command waiting indefinitely. Prefer explicit timeouts, scripted one-shot runs, or bounded polling, and summarize/stop if a command runs materially longer than expected.
- After each completed user-visible change, commit and push the current branch unless the user explicitly says not to or a blocker prevents it.

# MSCC Research Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reproducible, explicitly non-scoreboard original-MSCC RNG experiments.

**Architecture:** Seed the original `srand` routine through an opt-in constructor
argument and two mutually exclusive CLI choices. Keep TWS and JSON formats intact.

**Tech Stack:** Python 3.9+, Unicorn, unittest; existing TypeScript TWS exporter.

**Spec:** `docs/superpowers/specs/2026-11-02-mscc-research-seed-design.md`

## Global constraints

No public private-route data or original binary. Required route checks remain
TWO/SuCC/legacy. Original MSCC is best effort; research runs are not score evidence.

## Review focus

Zero seed must activate RNG; oversized TWS seeds must not truncate; conflicting
options must fail; errors must retain the research label; native clock behavior
and default RNG rejection must remain unchanged.

## Task 1: Seed control and evidence

Files: `scripts/mscc/oracle.py`, `scripts/mscc/test_oracle.py`.

- [x] Add failing tests for original seed-1 sequence `[41, 18467, 6334]`, zero and
  max seed acceptance, invalid values, repeatability, CLI TWS opt-in, conflicts,
  research labeling and default behavior.
- [x] Run the tests against the old adapter and inspect expected failures.
- [x] Implement `MSCC(..., research_rng_seed=None, research_rng_source="explicit")`,
  `--research-rng-seed`, `--research-rng-from-tws`, and research result metadata.
- [x] Run the full adapter suite with `MSCC_EXE`, plus the exporter tests.

## Task 2: Documentation and delivery

Files: `scripts/mscc/README.md`, `AGENTS.md`.

- [x] Document usage, original RNG mechanics, TWS interpretation, bounds,
  provenance and independent native-vs-controlled experiment distinctions.
- [x] Record required engines and original-MSCC best-effort policy in AGENTS.
- [ ] Independently review the diff, run required CI, squash through protected
  master, verify deployment and workspace health. Keep all real replay work
  outside Git throughout.

Verification: 33 adapter tests execute against the private original binary; both
exporter tests pass. The first test run failed on absent seed-mode APIs/options.
Independent review found missing DAT provenance on emitted errors; a new failing
assertion reproduced it, and the CLI now includes the verified DAT hash and level
on errors. No real route artifacts were added to Git.

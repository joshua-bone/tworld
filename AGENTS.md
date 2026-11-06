# Local Codex Working Agreements

## Private optimization routes

- Newly generated optimization routes, replay files, route traces, certificates,
  screenshots revealing private routes, and private score snapshots must stay out
  of this public repository and its deployments. Keep working artifacts outside
  Git and archive them in private GCS. Existing public reference replays remain
  reference inputs; do not overwrite them with private improvements.
- Do not save generated routes, GIFs, reports, or other work artifacts in
  `~/Downloads` unless the user explicitly asks again. Use private working
  storage outside Git and private GCS instead.
- Use the authenticated CC scores page and the private publication workflow in
  `docs/private-cc-routes.md`. Commit tools, schemas, synthetic tests, and general
  documentation only. Do not publish route instructions or a replay link that
  bypasses owner authentication unless the user explicitly authorizes release.
- Use GCP Spot/preemptible CPU liberally for seed searches and other work that
  benefits from parallel compute. Partition meaningful search cases, keep inputs
  and results in private GCS, and checkpoint enough state to resume after
  preemption. Set explicit job and VM runtime limits, record search parameters,
  and shut down or remove workers after preserving their results. A timeout,
  preemption, or capped expansion is unfinished work, not evidence of exhaustion.

## Optimization

- Start with a visual and semantic level review: identify dependencies, forced
  traversals, irreversible actions, and possible task orders before searching.
  Check proposed mechanics against the actual ruleset and original engine before
  building a search around them; inspect destination, support, and buried tiles.
  In particular, MS blocks cannot enter uncleared dirt or uncollected chips.
- Audit RNG during the initial strategy review. For competing task orders,
  compare current execution with geometric no-wait bounds and identify random
  outcomes that control access, occupancy, or timing. One order at its bound
  does not rule out an RNG-sensitive alternative. Test specific useful outcome
  patterns early; validate any reduced simulator against the original engine
  before using it to screen seeds. When useful, first test an optimistic model
  that permits any random outcome at each draw: if even that cannot improve the
  stated route contract, a larger seed sweep cannot help it. Such a model is a
  research bound, not a replay; realize any positive with an ordinary seed and
  inputs before validating it as a candidate.
- Identify **equalizer gates** early: waits that erase upstream time savings.
  Measure arrival-to-earliest-exit windows, their period, and the entry-state
  assumptions. Target an earlier window, bypass, or changed task order; do not
  treat an earlier arrival as a gain when the final completion time is unchanged.
  Padding needed by one fixed continuation is not a proven gate. Before rejecting
  an earlier legal prefix, reroute a bounded region through the obstruction to a
  safe common exit, then check the complete replay at its new phase.
- Compare an obstruction's clearance with Chip's next legal movement tick.
  An actor delay can be entirely hidden by Chip's own cooldown. Test departure
  on the first legal tick in the actual update order before budgeting an extra
  wait or removing the delaying actor.
- Measure producer periods before and after pickups or terrain changes. A
  collectible beneath an actor can prevent re-entry until Chip collects it;
  collection may change the actor's route, button cadence, and later traffic.
  Preserve those different histories instead of transferring a fixed clock
  between task orders without a native trace.
- For proposed overlap with final monster disposal, compare the last button
  activation, the last surviving actor, and downstream clearance separately.
  A stopped producer can leave traffic in flight. Bound those event delays and
  verify their extremal witnesses in the native engine before expanding a
  scheduling search; record which terrain, actor order and obstacles are fixed.
- Use geometry, resource constraints, deadlocks, and sound lower bounds to prune
  search. Choose suitable algorithms such as assignment, subset DP, or push-state
  search; avoid broad input mutation without a concrete hypothesis.
  Check goal feasibility before exploring waiting schedules: identify what can
  cause every required event under the fixed terrain and actor boundaries.
- Verify that an optimistic model retains every relevant legal transition.
  Removing an obstruction can change a teleport destination or remove a useful
  forced-movement stop, making a supposedly relaxed distance larger. Allow the
  alternative destinations/stops or limit the claim; matching one control route
  alone does not establish that a pruning bound is safe.
- Build search regions from possible terrain changes, not only the starting
  walkable cells. Remote actors can clear bombs, fill water, or open gates after
  the prefix. Admit those cells and let native transitions decide access; check
  every position of a known witness against region and inventory guards.
- Rank proposed routes by the obstruction that controls access or completion.
  Monster retirement counts can reward harmless disposal while leaving the
  critical producer active. Use actual button cadence, downstream traffic and
  safe access windows; keep speculative forecasts as ordering hints, with exact
  state restoration, rather than unproved pruning rules.
- Audit search goals against actual level completion. Fixed final block posts,
  complete monster disposal, and prescribed room exits are route assumptions
  unless their necessity is proved. Test safe surviving actors and alternative
  posts. Assert the required inventory, block positions, and other endpoint
  conditions in the native trace before calling a fragment a positive control;
  visiting a waypoint does not establish the intended world state.
- Screen each new mechanism for resource cost, pushing support, access and escape
  before searching its timing. Count blocks consumed by water or bombs separately
  from blocks needed as permanent posts. Include teleports and forced movement in
  optimistic bounds. Treat uncleared dirt and stalled actors as possible resources;
  verify tile identities and both layers when artwork is ambiguous.
- Being one or two ticks from the target is not evidence that the current route
  family is best. Keep at least one independent line of work on a different task
  order, dependency, resource assignment, or mechanism. More seeds, timing offsets,
  larger caps, and wider vicinities around the same fixed prefix are, by themselves,
  local variants, not independent strategies. Assign workers by hypothesis, not
  merely by tool.
- After two bounded batches without an exit-time gain, checkpoint that family and
  revisit the map and assumptions before extending it. Name what the next run can
  discover that earlier runs could not. Explicitly examine fixed prefixes, room
  boundaries, objective order, input alphabet, and pruning assumptions. Do not
  spend the whole budget rediscovering a known positive: replay its exact witness
  and audit the search bounds against it, then test the proposed improvement.
- Review unfinished search frontiers during each strategy review: record what
  remains queued, which states still meet the finish bound, and why work stopped.
  Resume or partition saved frontiers instead of repeatedly checking only the
  endpoints discovered before a cap. Audit state-merging rules against native
  successors. Canonicalize named gameplay fields, not raw struct padding or
  allocator addresses; preserve live actor order, pending effects and referenced
  identities. Exclude history only with a source argument and successor audits.
  Keep inexpensive, viable unfinished work on the active agenda.
- Accept slower intermediate routes and later fragment arrivals when they change
  a gate, preserve a resource, or leave useful work completed. First construct a
  legal full-route control for the new idea, then optimize it. Preserve distinct
  endpoint worlds and actor phases; earliest arrival alone is not dominance.
- Compare task orders and RNG variants at a common fragment exit, accounting for
  remaining work, resources, and actor phases. Include all travel to that exit
  and compare against the best existing order. A local gain can merely catch up
  with an existing route. State any equivalence assumptions, and confirm the
  saving through the level exit.
- Look for overlap between tasks: stage a block or resource, release a worker,
  then finish another job while it travels. Reconsider when irreversible actions
  happen and whether rooms can be split across visits. Combine individually legal
  variations when their timing or resource effects interact; test the combination
  through the exit rather than assuming their savings add.
- Keep passing alternatives as a fragment library. Try bounded combinations at
  named room interfaces, matching exact remaining-chip masks and inventory.
  Execute the new continuation on the actual prefix world; never transplant the
  reference state. Compare the resulting input stream with the incumbent: a
  successful combination may expose a simple timing gain without needing the
  resource change that originally motivated that fragment.
- Keep a private variation ledger grouped by semantic hypothesis: tested result,
  fixed assumptions, completed scope versus cap/overflow, and next distinct idea.
  A failed splice with the old suffix does not reject the new prefix. Mechanical
  mistakes and incomplete searches must remain visible, not become negative proofs.
- Reproduce a known passing route within each search model. Record its scope and
  limits: a capped search is unfinished, and a restricted-model optimum is not a
  global proof. Evaluate candidates through the exit in the required engines;
  local timing gains or chip counts can conceal traps, lost escape routes, or
  downstream equalizer gates.
- Also calibrate each claimed search freedom with a positive that requires it,
  such as a changed block layout or resource count. An unchanged-route control
  cannot detect an accidentally restrictive neighborhood. Audit interacting
  bounds before increasing caps; narrow a capped positive to a diagnostic
  fragment rather than treating it as validation.
- When a verified improvement escapes an optimizer, use that exact witness to
  audit its input conversion, intermediate contracts, simulator and pruning.
  Reproducing the slower route alone does not validate the missed freedom.
- Prefer [Melinda Router and MVS](scripts/melinda/README.md) for replay work when
  their capabilities fit: MR for quarter-tick/mouse routing and inspection; MVS
  for vicinity, block, transposition, and TSP-assisted searches. Check their
  existing tools before writing a replacement search. Choose a semantic fragment,
  reproduce its known route, and record neighborhood and simulator limitations.
  Reassess stalled routes using these tools rather than only increasing caps.
  Validate complete candidates in the required engines. Run stock MVS searches
  on Linux x86_64; keep all route inputs/results private.
- MVS action codes are not TWS direction codes: its MS compound actions
  `3/6/9/12` encode a direction probe followed by a movement attempt. Realize
  them as mouse inputs and verify the native successor and complete replay, or
  reject them explicitly; do not serialize them as diagonal keyboard commands.
  A cardinal-only control does not validate this conversion.

## Mechanics knowledge

- Use known game mechanics to generate and constrain hypotheses before searching.
  Name the mechanism, predict its effect on the actual actor and terrain, and
  check that prediction against the original ruleset code and a witnessed trace.
  Preserve newly learned mechanics here with their scope and exceptions; do not
  repeatedly rediscover them through failed routes. Keep level-specific examples
  and private route evidence outside this public repository.
- **[Concussion Rule](https://wiki.bitbusters.club/Concussion_Rule):** an MS
  glider, fireball, pink ball, or walker on a released trap tries its facing
  direction only. If that exit is blocked, it stays put instead of applying its
  normal floor turning or bouncing behavior. An open trap is not ordinary floor.
  Use this to identify persistent blockers and stop mechanisms, or reject a
  proposed worker path. A removable obstacle can make the stall temporary.
- Keep the MS exceptions explicit: blobs can choose other directions; bugs,
  paramecia, and teeth use the **Controller and Boss Glitch** direction; tanks
  can be turned by a blue button. Inspect `choosecreaturemove`, `canmakemove`,
  and `springtrap` in `legacy_c/mslogic.c` for the exact interaction. The
  Concussion Rule also exists in Lynx, with different trap-release behavior;
  it does not apply to CC2 open traps. Do not transfer MS exceptions between
  rulesets without checking their implementation.
- **Cloner exit direction (MS):** the same facing-only move selection applies
  to gliders, fireballs, pink balls, walkers, and tanks while they remain on a
  cloner. A blocked awakened actor can remain pending there; do not apply its
  ordinary-floor turning rule before it leaves. Check the shared
  `CloneMachine`/`Beartrap` branch in `choosecreaturemove`, and distinguish
  activation, pending departure, and actual arrival outside the cloner.
- **Prepared trap releases (MS):** `springtrap` sets `CS_RELEASED` on the
  current occupant. A blocked attempt preserves that flag, and leaving the
  Brown button does not revoke it; `startmovement` clears it after a successful
  move. A blocked Tank also becomes stalled (`CS_HASMOVED`), so removing its
  obstacle alone does not restart it. A later Blue reversal can move the
  released Tank without another Brown visit. Model the actor's release and
  stalled states separately, rather than treating the trap as latched-open
  floor; verify future arrivals and other rulesets independently.
- **Tank facing versus forced direction (MS):** a Blue button reverses a
  Tank's facing, but its slip-list entry retains a separate movement direction.
  If the Tank is still sliding, its next forced move can restore that direction
  and continue its old course while other Tanks reverse. Check actual slip-list
  membership, phase, and terrain in `turntanks` and
  `floormovements_of_blocks_and_monsters`; a single corner does not necessarily
  leave a usable input window. Distinguish this from the Tank Top Glitch's
  separate mid-movement `frame` handling and validate in the required engines.
- **[Slide delay](https://wiki.bitbusters.club/Slide_delay) (MS):** a blocked or
  rebounding slipper can leave and rejoin the slip list without reducing its
  length, skipping another block or monster's forced move. Chip is not delayed
  this way. A nailed block can deliberately supply delay; its effect depends on
  slip-list order and phase, not just the number of stalled objects. Inspect
  `floormovements_of_blocks_and_monsters` and an actual trace.
- **Failed perpendicular pushes can nail a block (MS):** `pushblock` first
  rejects an ordinary push along or against the block's saved slip direction.
  A perpendicular attempt reaches `advancecreature`; if that push fails, it
  clears the block's sliding flags and removes it from the slip list. Thus a
  wall beyond a sliding block can make a deliberate failed push useful, even
  though Chip stays put. Preserve this side effect when skipping stationary
  inputs or comparing states. A mouse direction probe can also reach this code,
  but a combined probe-and-walk needs separate cross-engine validation; a
  passing cardinal nailing action does not establish mouse compatibility.
- **Ordinary boosting (MS):** Chip can move voluntarily after a forced move in
  the same native tick, once the other slippers have updated. This is distinct
  from the Twice Step Glitch, which inserts the extra move before those updates.
  Two displacements in one tick alone do not establish TSG. Preserve ordinary
  boosts in timing bounds; distinguish the phases with a native trace and an
  MR `--no-tsg` control before restricting the input model.
- **[Dirty Trick](https://wiki.bitbusters.club/Dirty_trick) (MS):** sufficient
  slide delay can let Chip push a block onto a sliding tile that sends it back,
  then escape before its return. Establish the delay source and escape timing;
  pushing and stepping aside alone does not make this safe.
- **[Mouse Panel Glitch](https://wiki.bitbusters.club/Mouse_Panel_Glitch) (MS):**
  for a mouse goal on both axes,
  `chipmovetogoalpos` probes the primary direction with `canmakemove`. That probe
  can push a block off a thin wall even when the exposed wall prevents Chip's
  entry; Chip can then walk in the secondary direction in the same update.
  Include this combined action when modeling pushes and support walks. An
  ordinary failed keyboard move still sets `CS_HASMOVED`, so it does not have
  the same timing. Check the actual wall direction and state, and validate the
  complete replay in the required engines before counting a saving.

## Scoreboard rules and replay validation

- Consult the current [BitBusters scoreboard FAQ](https://scores.bitbusters.club/faq)
  before optimizing or assessing scoreboard eligibility.
- Use original, unedited level packs; follow the FAQ's documented exception for
  adding time limits to untimed levels.
- Mouse experiments are encouraged. Respect the FAQ's one-input/one-output
  remapping rule and ban on the long-first-second glitch. Only the teleport
  application of the Twice Step Glitch is permitted.
- For this private AI-assisted optimization project, RNG state inspection,
  deterministic lookahead, and seed searches are explicitly authorized. Do not
  impose scoreboard eligibility as an RNG-search constraint or discard a compatible
  replay solely because its route used RNG knowledge.
- Document every RNG-related gain in that level's private evidence: the starting
  seed and engine, what was inspected or searched, the changed inputs and timing,
  the measured gain, and whether any engine or RNG state was modified. Distinguish
  ordinary replay inputs and initial-seed selection from injected RNG outcomes
  or altered engine behavior. Preserve enough information to reproduce the run.
- Validate candidate routes in SuCC and original legacy Tile World, as well as
  TWO. Record versions, replay hashes, completion, and scores; investigate
  disagreements rather than treating one engine's success as sufficient.
- A successful parity check on a partial replay is not a win. When harvesting
  route libraries or promoting scores, require explicit completed status and
  matching completion time, as well as matching hashes and trace parity.
- Also check new MS candidates with the pinned headless Melinda Router adapter.
  Record its TSG/trap options and investigate discrepancies. MR is additional
  compatibility evidence, not a replacement for the three required engines.
- Engine compatibility alone does not establish scoreboard eligibility. The FAQ
  prohibits prior knowledge of random outcomes and requires TW routes to be valid
  in MSCC, but does not explain every seed-search workflow. Label these results
  as AI-assisted research, describe the actual method, and do not represent them
  as accepted scoreboard submissions or infer community rulings from tool names.
- The experimental original-MSCC checker lives in `scripts/mscc/README.md`.
  Original MSCC is best-effort additional evidence; the required replay checks
  are SuCC, original legacy Tile World, and TWO. Keep its licensed executable in
  private storage. Use it as additional evidence
  within its documented supported inputs; do not silently ignore unsupported
  RNG/stepping or claim that it replaces full Windows execution.
- Deliberate MSCC RNG control is allowed for explicitly labeled research using
  the adapter's `--research-rng-seed` or `--research-rng-from-tws` modes. Such runs
  are not scoreboard eligible. Keep their evidence separate from score-route
  validation and never promote a controlled-RNG win as an ordinary native check.

## Workspace lifecycle

- `git/tworld` is the canonical checkout; `git/HybridCC2026` is the canonical
  engine checkout. Never leave current work in a task-named worktree.
- Keep one active history on `master`. Squash short-lived PR branches at
  completion and remove them; do not accumulate checkpoint/archive branches or
  rewrite published default-branch history. Keep recovery bundles outside Git.
- Temporary checkouts belong in `git/.worktrees/tworld/<task>`, maximum two
  without explicit approval. Register their relative path, purpose, owner and
  removal condition in `.worktree-policy.json`; remove or account for them at
  task completion. Preserve all unique changes/data before removal.
- At handoff, commit/push reviewed changes, fetch, and run
  `node ../HybridCC2026/tools/workspace-health.mjs . --check`.
  This is a read-only maintenance tool, not a production dependency.
- Ignore status is not deletion permission. Never automatically delete dirty,
  unknown or ignored data. Historical snapshots from the September cleanup are
  indexed in `~/workspace-recovery-20260923-P1X8nc/manifest.json`.

- Long-running tooling such as tests, replay sweeps, fixture generation, Docker Compose, and migrations must be invoked with sensible timeouts or in non-interactive batch mode.
- Full-corpus replay sweeps must set an explicit timeout that exceeds the expected wall time or use a direct non-vitest path. Do not rely on the default `verify:*` vitest timeout for all-corpus Lynx sweeps; use `TWORLD_LYNX_SWEEP_TIMEOUT_MS` or split the run into bounded per-file sweeps.
- Never leave a shell command waiting indefinitely. Prefer explicit timeouts, scripted one-shot runs, or bounded polling, and summarize/stop if a command runs materially longer than expected.
- After each completed user-visible change, commit and push the current branch unless the user explicitly says not to or a blocker prevents it.
- Always stage deleted files in the next commit unless the user explicitly says to keep them out.

## User-visible Web Deployment

- A commit and feature-branch push that changes deployable web content is not complete by itself. Take the change through the protected `master` branch, wait for the GitHub Pages deployment to succeed, and verify the intended public routes unless the user explicitly opts out or a CI/permission blocker prevents deployment.
- Keep production deployment automatic on protected `master`; do not make arbitrary feature-branch pushes overwrite the public site.
- When deployment is blocked, report the exact failed check or missing authority instead of describing the feature-branch push as deployed.

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

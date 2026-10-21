# Smart Teeth acceptance fixture

`SMART_TEETH_ACCEPTANCE.dat` is byte-identical to the fixture in DATTools,
generated with `npx tsx scripts/smartTeethAcceptanceFixture.ts --write` there.
It uses real editor placement, actor ordering and DAT export. Both passwords are
four characters.

| Level                     | Password | Acceptance case                                                                                                                                 |
| ------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: Smart Teeth acceptance | `BRAI`   | The west-side actors need a wall detour; the southern actor has the shortest direct approach. Keys on the routes exercise legal item traversal. |
| 2: Smart Teeth teamwork   | `HELP`   | A helper in a disconnected button corridor must open a closed toggle wall so its buddy can reach Chip.                                          |

In level 2, the pursuer starts at `(3,3)`, the closed toggle wall is at `(6,3)`,
and Chip is at `(9,3)`. The helper starts at `(2,6)` and can reach the green
button at `(4,6)`. All cells outside those two corridors are walls: the helper
cannot chase Chip itself, and the pursuer cannot bypass the closed toggle wall.
Coordinates start at zero.

Smart Teeth uses DAT codes 0x7D–0x80 (N/W/S/E). Both rulesets use A\* with their
own pure movement probes and ordinary Teeth timing. Each planning round chooses
the shortest-path direct pursuer; remaining actors reserve distinct nearest
reachable targets and next steps. The planner also explores reachable green-button
helpers and pursuer routes, choosing a shorter combined plan when cooperation
improves the approach. Any suitable actor can help; there is no fixed leader-only
button restriction. A planning round includes at most one helper activation and
replans after the actual toggle. Presses already committed by moving Lynx actors
are counted before assigning more work, including two pending presses that cancel.
New forced-floor/teleport entries are deferred across planned flips, and new
button actions wait for already committed forced movement to settle. Actors wait safely while an opening is pending
or when no legal route is available. Unreachable targets use Manhattan proximity,
then shortest route length, then stable N/W/S/E discovery order. Equal pursuers
use actor serial order. Occupied tiles and lethal routes are excluded.

Cooperation uses an 8,192-expansion budget and one helper activation per round,
then replans from the real board. Costs count movement steps and waits, not exact
native animation ticks. This is bounded cooperative planning, not an exhaustive
multi-actor puzzle solver; actual ruleset movement always checks legal entry.

Routes support ordinary terrain, fixed force floors, ice corners and deterministic
teleports. Teleport maps use a zero A\* heuristic so nonlocal edges do not invalidate
shortest-path selection. Planning remains on the actor's current vertical layer;
random force floors and vertical air/elevator transfers are excluded from planned
routes. Normal ruleset movement still handles those effects if forced onto them.

Translucent colored routes show each actor's current plan, ending at its assigned
target. They update with planning, survive undo/replay, and disappear with the actor.
The public desktop and phone players use the same route rendering.

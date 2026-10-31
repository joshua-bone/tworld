# Jacques 723: impossibility in original Tile World MS

This audit accompanies `scripts/jacques/prove-723.ts` and `723-scheduler-certificate.json`. It does not rely on failed searches, fixed oscillator periods, count-halving, or simultaneous bounces. The scope is the unmodified Jacques DAT (SHA-256 `c10acac13135586a4ce7b45f0427010229c51ac2fc5b6d0631a7036b86a90b6f`) and the repository's original native Tile World MS implementation. It covers every initial stepping/seed and legitimate cardinal-keyboard or mouse input; it does not assert identical behavior in CHIP.EXE or other engines.

## Scope of an attempt

Take Chip's last west-to-east entry from (23,0) into (24,0) before collecting (31,0) and successfully returning west. Any earlier manipulation on the accessible side is included in the arbitrary starting state. Chip cannot subsequently affect the other ice rooms without crossing back through (23,0), contradicting that choice. Arbitrary legitimate mouse input and ice excursions remain allowed within the gate/pocket region.

There must be at least one block on the three gate ice cells. Otherwise the original gate block has stopped at (24,0), which Chip could not enter from the west without pushing it back onto (25,0). Chip cannot pass a gate-ice block: all motion there is horizontal, entry from row 1 is barred by north thin walls, and a block moving onto Chip kills him. Thus an ice excursion cannot put Chip east of a returning gate block to push it from (24,0) westwards.

Use the leftmost gate-ice block as the target. Its next westward traversal has no block ahead while (24,0) remains empty. Extra blocks to its east only make its eastward attempt fail earlier. Consequently it makes at most two eastward advances, one reversal-and-westward advance, and two further westward advances before reaching (24,0). It requeues at most once. A collision with Chip terminates the attempt sooner. Chip cannot reset its direction during an ice excursion: `pushblock` rejects both parallel and antiparallel pushes of a slipping block (`legacy_c/mslogic.c:962–969`), and no teleport push applies at this gate. The target begins and remains on ice until that final step; it is included in the original-ice occupancy count and then subtracted once when counting predecessors.

## Exact predecessor abstraction for one target queue interval

An interval ends when the target itself requeues (or exits ice). During it, a predecessor that requeues moves behind the target and never becomes its predecessor again. Newly created or newly slipping actors append behind the target. Chip's separately processed prepended entry never skips a non-Chip entry. An actor leaving forced movement can be removed silently (the MS counter changes), or can still emit a skip if its synchronous clone creation balances the counter. In particular the red buttons at (5,12)/(6,12) clone blocks onto ice at (4,13)/(12,13). We retain both kinds of departure explicitly rather than assuming deletion is monotone.

For every original predecessor, let `a` count its unskipped passes completed before its first removal or requeue. Each such pass requires at least one normal advance. Ordinarily it is processed once per pass; any counter-dependent repeated processing can only reduce this pass count relative to the physical straight-run bound. All interactions that shorten the run are allowed. After removal/requeue, its subsequent movements are irrelevant to this target interval. New clone entries append behind the target.

Process these predecessors in initial list order. Let `S` be the set of pass numbers on which the processed prefix skips its next entry. A new predecessor absorbs every incoming skip while still present. Its removal/requeue occurs on the `(a+1)`-th pass not in `S`, say pass `t`. If it emits a skip, its exact boundary operation is:

`S -> (S restricted to passes > t) union {t}`.

A silent departure instead maps `S` to `S restricted to passes >t`: it deletes the absorbed roots without creating a replacement. This formulation includes mixtures of normal advances, reversals, and departures. No halving or deletion-monotonicity assumption is made.

## Forest reduction and arithmetic certificate

Every set bit has a unique creating actor. When an actor creates bit `t`, the lower set bits it erases are its dependency children. There are exactly `t-1-a` such children, with distinct labels less than `t`; bits above `t` survive as separate roots. Each actor appears at most once in this forest. A silent departure merely deletes disjoint subtrees, so it cannot create additional resource cost in the final forest.

A subtree with root label `u` can be reduced to any smaller label `v` without adding actors or increasing any actor's `a`: set its own `a' = min(a,v-1)`, retain only `v-a'-1` of its children, and recursively reduce their increasing labels to `1,2,...,v-a'-1`. Each retained original child label is at least its rank. Therefore, if a prefix can cause at least sixteen skips at arbitrary passes, its forest can be pruned/relabelled to exactly sixteen roots labelled `1,...,16`, with every node's children exactly the prefix `1,...,t-a-1`.

Give an actor cost 1 for `a<=3`, 2 for `a=4`, 3 for `a=5`, and 4 for `a=6`. Define:

`w[t] = min_a (cost[a] + sum(w[1..max(0,t-a-1)]))`.

For `t=1..16`, the checked integer values are:

`1,1,1,1,2,3,4,5,6,7,8,10,13,17,22,28`.

Induction on a normalized subtree shows its actor cost is at least its root weight. Sixteen roots therefore require at least **129** actor cost. The verifier checks the recurrence and sum using exact integers.

## Board capacity: at most 128 cost

Only original ice and teleports can hold active non-Chip sliders here; there are no force floors or bear traps. No mechanism creates new ice. There are 118 original ice cells including the six buried beneath the original chamber monsters, plus two teleports.

Remove the 28 ice cells in the four long rows `(7..13,7..10)`. Remove the sealed 16-cell chamber `(18..21,7..10)` and replace it by its six original monsters: its permanent wall boundary admits no added actors. Remove the permanently inaccessible isolated ice at `(14,0)`. Remove the target gate block's occupied ice cell. Add both teleport positions. This leaves at most:

`118 - 28 - 16 + 6 - 1 - 1 + 2 = 80`

short predecessors. Every straight ice run outside the four long rows has length at most four, so these actors make at most three normal advances before removal or requeue. The only potentially contiguous ice/teleport route is `(9,0),(10,0),(11,0)`; teleporting to `(25,4)` cannot extend it by more than the same three-advance budget before leaving forced movement or requeuing. These 80 actors cost at most 80. The estimate deliberately allows every short cell to be occupied and ignores physical conflicts.

In a long row, blocks enter its ice only horizontally through floor cells `(6,y)` or `(14,y)`. Top/bottom permanent walls bar vertical entry, and Chip without ice boots cannot choose a perpendicular push from adjacent ice; discard occurs before mouse-goal evaluation. There is no teleporter or cloner in the room. Ordinary monsters cannot enter its only external opening through Gravel `(14,6)` and none start inside. Thus all non-Chip actors on these long rows are horizontal blocks.

During the target interval Chip cannot manipulate these rows. Consider the `k` blocks in a row that contribute to the predecessor forest, `0<=k<=7`. They cannot pass each other, disappear, or leave the extended nine-cell row `(6..14,y)`: either endpoint is ordinary floor, where an arriving block stops. Other noncontributing blocks only obstruct them further. Their order in those nine cells is invariant, so each can move at most `9-k` consecutive cells in one direction, and at most six normal ice advances before its first removal or requeue. Hence `a<=min(6,9-k)`. This permits BOTH endpoint floor cells to fill during the interval; it does not assume persistent or closed oscillators.

The maximum total cost per long row is 12:

| k | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| allowed a | 6 | 6 | 6 | 6 | 5 | 4 | 3 | 2 |
| total cost | 0 | 4 | 8 | 12 | 12 | 10 | 6 | 7 |

Total available cost is at most `80 + 4*12 = 128 < 129`. Therefore no interval can contain sixteen skips. This is a resource argument over every queue order and allowed phase, not a timing sample.

## Gate upper bound and required escape time

Each of the target's two queue intervals has at most fifteen skipped passes. The target makes at most five advances total. There is a non-Chip floor pass every two ticks, so it reaches (24,0) within at most:

`2*(15 + 3 + 15 + 2) = 70 ticks`.

For the second interval, discard any further target progress during the reversal pass and start the bound at the next complete non-Chip floor pass, with its arbitrary valid predecessor prefix. The now-westbound target cannot requeue again and has at most two advances left. Thus the first interval costs at most 36 ticks and the second at most 34; this does not apply the prefix formula to a partial pass. Once at (24,0), the block is on ordinary floor and leaves the slip list. There is no later autonomous cycle. Chip cannot remove this stopped block from inside the nine-cell pocket, and no ordinary monster can reach the gate before the remote socket is actually opened. The pocket contains no exit.

Let that last entry occur at `T=4q+p`, `0<=p<=3`, and let `B=4(q+1)`. Entry sets `CS_HASMOVED` on ordinary floor. `choosechipmove` rejects input while this flag is set, before evaluating keyboard directions or mouse goals; it clears the flag at a tick divisible by four. Successful forced movement can also clear it, but entering adjacent ice first requires a manual move, so cannot precede `B`. Thus the first entry to pocket cell (24,1), at `U`, satisfies `U>=B`, even with an optional ice excursion.

The pocket path is (24,1), (25,1), (26,1), (27,1), (28,1), (29,1), (29,0), (30,0), (31,0), with no forced floors or teleport. After first entering (24,1), collecting the chip and clearing west to (23,0) needs eighteen more manual moves. At most one can occur per four-tick window, so clearance is no earlier than `4*floor(U/4)+72 >=B+72 >=T+73`. Returning merely to (24,0) takes at least 69 ticks, but is not escape. An ice excursion after that return cannot start before the same next manual window and cannot accelerate clearance.

The block floor phase precedes Chip's manual input. If the returning block reaches (24,0) while Chip occupies it, `endmovement` sets `CHIP_COLLIDED` and the phase immediately fails. The clone-squish exception cannot apply: the block's old square is fixed ice (25,0), not a cloner. Chip cannot dodge west on that same tick. Therefore `70 < 73` rules out successful clearance.

## Entity uniqueness / teleporter audit

The capacity count requires at most one live non-Chip slider per ice/teleport square in a surviving play prefix. Initial layers contain no actor stack. Normal block/monster entry into another non-Chip actor is blocked. Entry into a Chip-looking mutant causes COLLIDED. A block cloned onto Chip causes SQUISHED; the status never resets except at initialization and becomes fatal at the next floor phase, so it cannot survive to the remote gate/exit.

The remaining source of potential overlap is teleport convergence. `teleportcreature` selects only a destination whose TOP is Teleport, hence unoccupied. Its only synchronous side effect is `canmakemove` pushing a block adjacent to that destination. For this board the only successful such pushes are `(10,0)->(9,0)`, `(26,4)->(27,4)`, and `(25,5)->(25,6)`. Their destinations are Ice, chip/floor, and Gravel respectively; none is a teleporter, clone button, or cloner. All other directions have permanent wall/boundary destinations. Therefore no nested teleport or clone can occupy the selected destination during this call. Slipping starts but does not advance synchronously. Non-Chip teleport checks cannot push at all. This preserves non-overlap and prevents ghost/duplicate slider creation by induction in any prefix that survives to the gate.

## Required-chip and exit topology

There are exactly 54 chip units and the level requires 54. The two buried exits are in the region isolated by the socket at (15,28); the hint at (7,23) additionally masks its exit. The exit under ordinary floor at (14,29) becomes usable only after reaching that region. Thus the gate chip cannot be omitted from a winning route. The preserved native 54-chip probe explicitly demonstrates collection followed by a blocked return; it is not a winning replay.

## Reproduction and source references

From `web/`, run `node_modules/.bin/vite-node ../scripts/jacques/prove-723.ts /path/to/Jacques.dat`. The runner verifies the exact DAT hash, preserved initial map, chip count, ice/teleport counts, sealed chamber, long-room boundaries, lack of skates/corners/force floors/traps/tanks, short-run limit, cloner types, directed pocket cut, socket/exit separation, ordinary-monster exclusion, exact integer recurrence and lane budgets. It also checks the queue formula against a literal simulation for all 137,257 emitting-removal sequences of length 0..6 and 41,371 mixed emitting/silent-departure sequences of length 0..4, with a 20-second deadline. These finite checks support the written mathematical and native-source lemmas; they are not exhaustive gameplay search.

The native source references are `legacy_c/mslogic.c`:307–379 (append/update/remove slip entries), 946–1105 (block pushing, occupancy, thin walls, gravel), 1347–1393 (input-window and ice discard before mouse handling), 1396–1430 (teleport destination and synchronous side effects), 1449–1485 (block cloning), 1597–1867 (movement, collision, mutant creation, forced-floor registration), 1916–2028 (Chip and non-Chip forced movement, counter-dependent successor skip), 2332 (initial status reset), and 2378–2404 (floor phase precedes manual input; successful manual movement sets HASMOVED).

Earlier fixed-phase probes did not prove impossibility: native reordering can genuinely delay the gate, and a count-halving argument is false for mixed normal/reversing predecessors. The weighted forest capacity is the additional universal argument that closes that gap.

The constructive probe is rerun with `node_modules/.bin/vite-node ../scripts/jacques/verify-723-progress.ts 54-trapped`. It compares all 3,997 steps, initial state and terminal result to the original native oracle. The last chip is collected at tick 3924; after returning and attempting north for 40 ticks, Chip is alive at (24,1), tick 3996, with no chips remaining. The proof of permanent entrapment comes from the source/topology argument, not from those 40 failed inputs.

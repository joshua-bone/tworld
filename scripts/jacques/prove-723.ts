// From web/: node_modules/.bin/vite-node ../scripts/jacques/prove-723.ts /path/to/Jacques.dat [output-directory]
// Checks the finite certificate and board lemmas in 723-scheduler-proof.md.
// This is a source/geometry proof checker, not a winning replay or exhaustive game search.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ROOT, createRun, dump, loadLevel } from './harness';
import { MS_TILE as T } from '../../web/src/ruleset-ms/api/tiles';

assert.ok(process.argv[2], 'Supply the original Jacques.dat path');
const loaded = await loadLevel(723, process.argv[2]);
const board = dump(createRun(loaded));
const saved = JSON.parse(await readFile(join(ROOT, 'web/public/dev/solutions/jacques/maps/723.json'), 'utf8'));
assert.deepEqual(board.cells, saved.cells, 'Original DAT initial map matches the preserved map');
const output = resolve(process.argv[3] ?? join(ROOT, 'web/public/dev/solutions/jacques/evidence'));
const cells = board.cells;
const pos = (x: number, y: number) => y * 32 + x;
const top = (x: number, y: number) => cells[pos(x, y)]!.top.id;
const has = (p: number, id: number) => cells[p]!.top.id === id || cells[p]!.bottom.id === id;
const positions = (id: number) => cells.flatMap((_, p) => has(p, id) ? [p] : []);
const ice = positions(T.Ice);
const teleports = positions(T.Teleport);
const longRows = Array.from({ length: 4 }, (_, y) => Array.from({ length: 7 }, (_, x) => pos(x + 7, y + 7)));
const longSet = new Set(longRows.flat());
const chamber = Array.from({ length: 4 }, (_, y) => Array.from({ length: 4 }, (_, x) => pos(x + 18, y + 7))).flat();
const chamberMonsters = board.internal.creatures.filter(cr => chamber.includes(cr.pos));
assert.equal(ice.length, 118);
assert.deepEqual(teleports, [11, 153]);
assert.equal(chamberMonsters.length, 6);
for (const p of [...longSet, ...chamber]) assert.ok(ice.includes(p));
for (let y = 7; y <= 10; y++) {
  for (const x of [17, 22]) assert.equal(top(x, y), T.Wall);
  assert.equal(top(6, y), y === 8 ? T.Chip + 3 : T.Wall_West);
  if (y === 8) assert.equal(cells[pos(6, y)]!.bottom.id, T.Wall_West);
}
for (const y of [6, 11]) for (let x = 18; x <= 21; x++) assert.equal(top(x, y), T.Wall);
for (let x = 6; x <= 13; x++) assert.equal(top(x, 6), T.Wall);
for (const x of [15, 16]) assert.equal(top(x, 6), T.Wall);
for (let x = 6; x <= 17; x++) assert.equal(top(x, 11), T.Wall);
for (let y = 7; y <= 9; y++) assert.equal(top(5, y), T.Wall);
assert.equal(top(14, 6), T.Gravel);
for (const p of [13, 15, 46]) assert.equal(cells[p]!.top.id, T.Wall);
assert.equal(top(14, 0), T.Ice); // The fourth side is the board edge.
for (const id of [T.Slide_North, T.Slide_West, T.Slide_South, T.Slide_East, T.Slide_Random,
  T.IceWall_Northwest, T.IceWall_Northeast, T.IceWall_Southwest, T.IceWall_Southeast,
  T.Beartrap, T.Boots_Ice]) assert.equal(positions(id).length, 0);
assert.ok(board.internal.creatures.every(cr => cr.id === T.Fireball || cr.id === T.Glider));
for (let id = T.Tank; id < T.Tank + 4; id++) assert.equal(positions(id).length, 0);
const actorTile = (id: number) => id === T.Block_Static || (id >= T.Chip && id < T.Pushing_Chip);
assert.ok(cells.every(c => !(actorTile(c.top.id) && actorTile(c.bottom.id))), 'No initial actor stacks');
for (const c of cells) if (c.bottom.id === T.CloneMachine) {
  assert.ok(c.top.id >= T.Block && c.top.id < T.Block + 4);
}
let maximumShortIceRun = 0;
for (const p of ice.filter(p => !longSet.has(p))) for (const d of [1, 32]) {
  let length = 0;
  for (let q = p; q < 1024 && (d === 32 || Math.floor(q / 32) === Math.floor(p / 32)) && has(q, T.Ice); q += d) length++;
  maximumShortIceRun = Math.max(maximumShortIceRun, length);
}
assert.equal(maximumShortIceRun, 4);
// Successful virtual pushes adjacent to either teleport cannot nest a teleport or clone.
for (const [p, id] of [[9, T.Ice], [155, T.ICChip], [217, T.Gravel],
  [13, T.Wall], [89, T.Wall], [151, T.Wall], [43, T.Wall]] as const) assert.equal(cells[p]!.top.id, id);
const chipCount = cells.reduce((n, c) => n + Number(c.top.id === T.ICChip) + Number(c.bottom.id === T.ICChip), 0);
assert.equal(chipCount, 54);
assert.equal(loaded.level.chipsNeeded, chipCount);

// Optimistic static reachability: all removable objects and hazards are passable.
// Thin-wall masks are native canmakemove's departure checks and movelaws entry checks.
const floor = (p: number) => {
  const c = cells[p]!;
  return c.top.id >= T.Chip && c.top.id < T.Pushing_Chip ? c.bottom.id : c.top.id;
};
const leaveBlocked = new Map<number, number>([[T.Wall_North, 1], [T.Wall_West, 2], [T.Wall_South, 4], [T.Wall_East, 8], [T.Wall_Southeast, 12]]);
const enterBlocked = new Map<number, number>([[T.Wall_North, 4], [T.Wall_West, 8], [T.Wall_South, 1], [T.Wall_East, 2], [T.Wall_Southeast, 3]]);
function reachable(starts: readonly number[], removed: ReadonlySet<number>, extraBlocked: readonly number[] = []): Set<number> {
  const blocked = new Set<number>([T.Wall, T.HiddenWall_Perm, T.BlueWall_Real, ...extraBlocked]);
  const seen = new Set(starts), queue = [...starts];
  for (let index = 0; index < queue.length; index++) {
    const p = queue[index]!;
    for (const [bit, dx, dy] of [[1, 0, -1], [2, -1, 0], [4, 0, 1], [8, 1, 0]] as const) {
      const x = p % 32 + dx, y = Math.floor(p / 32) + dy;
      if (x < 0 || x >= 32 || y < 0 || y >= 32) continue;
      const q = pos(x, y);
      if (removed.has(q) || blocked.has(floor(q)) || ((leaveBlocked.get(floor(p)) ?? 0) & bit) || ((enterBlocked.get(floor(q)) ?? 0) & bit)) continue;
      if (!seen.has(q)) { seen.add(q); queue.push(q); }
    }
    if (floor(p) === T.Teleport) for (const q of teleports) if (!seen.has(q)) { seen.add(q); queue.push(q); }
  }
  return seen;
}
const pocket = [...reachable([31], new Set([24]))].sort((a, b) => a - b);
assert.deepEqual(pocket, [29, 30, 31, 56, 57, 58, 59, 60, 61]);
const exits = positions(T.Exit);
assert.deepEqual(exits, [743, 942]);
assert.equal(top(15, 28), T.Socket);
const beforeSocket = reachable([pos(6, 8)], new Set([pos(15, 28)]));
assert.ok(exits.every(p => !beforeSocket.has(p)));
const cloners = new Set(cells.flatMap((c, p) => c.bottom.id === T.CloneMachine ? [p] : []));
const monsters = reachable(board.internal.creatures.map(cr => cr.pos), cloners, [T.Gravel, T.Socket]);
assert.ok([...pocket, 23, 24, 25, 26, 27, ...teleports].every(p => !monsters.has(p)));
assert.ok([...longSet].every(p => !monsters.has(p)));

// A literal queue simulation independently checks the boundary-set operation.
function boundarySet(as: readonly number[]): number[] {
  let skips = new Set<number>();
  for (const code of as) {
    const a = code % 7, emitsSkip = code < 7;
    let t = 0, left = a + 1;
    while (left) if (!skips.has(++t)) left--;
    skips = new Set([...skips].filter(pass => pass > t));
    if (emitsSkip) skips.add(t);
  }
  return [...skips].sort((a, b) => a - b);
}
function literalQueue(as: readonly number[]): number[] {
  const queue = as.map(code => ({ left: code % 7, emitsSkip: code < 7 }));
  const skips: number[] = [];
  for (let pass = 1; queue.length; pass++) {
    assert.ok(pass < 1000);
    for (let n = 0; n < queue.length;) {
      if (queue[n]!.left > 0) { queue[n]!.left--; n++; }
      else {
        const [removed] = queue.splice(n, 1); // Removed or requeued behind the target.
        if (removed!.emitsSkip) {
          if (n === queue.length) { skips.push(pass); break; }
          n++; // Native advance skips the successor now occupying the removed slot.
        }
      }
    }
  }
  return skips;
}
const deadline = Date.now() + 20000;
let abstractSequencesChecked = 0;
function checkSequences(as: readonly number[], remaining: number, maximumCode: number): void {
  assert.deepEqual(boundarySet(as), literalQueue(as));
  abstractSequencesChecked++;
  if ((abstractSequencesChecked & 4095) === 0) assert.ok(Date.now() < deadline, '20-second certificate check deadline');
  if (remaining) for (let code = 0; code <= maximumCode; code++) checkSequences([...as, code], remaining - 1, maximumCode);
}
checkSequences([], 6, 6);
assert.equal(abstractSequencesChecked, 137257);
checkSequences([], 4, 13); // Also includes silent departures, which absorb skips without emitting one.
assert.equal(abstractSequencesChecked, 178628);

const costs = [1, 1, 1, 1, 2, 3, 4];
const weights: number[] = [];
for (let t = 1; t <= 16; t++) {
  weights.push(Math.min(...costs.map((cost, a) => cost + weights.slice(0, Math.max(0, t - a - 1)).reduce((x, y) => x + y, 0))));
}
assert.deepEqual(weights, [1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 10, 13, 17, 22, 28]);
const laneBudgets = Array.from({ length: 8 }, (_, k) => {
  const maximumNormalAdvances = Math.min(6, 9 - k);
  const budget = k * costs[maximumNormalAdvances]!;
  assert.ok(budget <= 12);
  return { contributingBlocks: k, maximumNormalAdvances, budget };
});
const shortBudget = ice.length - 28 - 16 + 6 - 1 - 1 + teleports.length;
const available = shortBudget + 4 * 12;
const requiredFor16Skips = weights.reduce((a, b) => a + b, 0);
assert.equal(shortBudget, 80);
assert.equal(available, 128);
assert.equal(requiredFor16Skips, 129);
assert.ok(requiredFor16Skips > available);
const maximumGateReturnTicks = 2 * (15 + 3 + 15 + 2);
const minimumSafeEscapeTicks = 1 + 18 * 4;
assert.ok(maximumGateReturnTicks < minimumSafeEscapeTicks);
const result = {
  level: 723, datSha256: board.datSha256,
  kind: 'Finite arithmetic and geometry certificate; source and mathematical lemmas are in 723-scheduler-proof.md',
  proofOnlyNotWinning: true, requiredChips: chipCount, originalIceCells: ice.length,
  pocketWithoutGateway: pocket, exits, socket: pos(15, 28),
  optimisticChipReachableBeforeSocket: beforeSocket.size,
  optimisticMonsterReachableBeforeSocket: monsters.size,
  originalTeleports: teleports, longRows, chamber, originalChamberMonsterCount: chamberMonsters.length,
  maximumShortIceRun, shortBudgetFormula: '118 -28 -16 +6 -1 isolated -1 target +2 teleports',
  shortPredecessorBudget: shortBudget, costsByNormalAdvances: costs, weights, laneBudgets,
  abstractSequencesChecked, abstractMaximumEmittingPrefixLength: 6,
  abstractMaximumMixedDeparturePrefixLength: 4, abstractCheckDeadlineMs: 20000,
  requiredFor16Skips, available, maximumSkipsPerInterval: 15, gateIntervals: 2,
  maximumGateAdvances: 5, maximumGateReturnTicks, minimumSafeEscapeTicks,
};
await mkdir(output, { recursive: true });
await writeFile(join(output, '723-scheduler-certificate.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));

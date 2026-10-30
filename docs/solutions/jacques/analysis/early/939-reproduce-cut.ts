// Run from web/: node_modules/.bin/vite-node ../docs/solutions/jacques/analysis/early/939-reproduce-cut.ts
// Permissive graph supporting the source-level one-way burglar/fire invariant.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadLevel, createRun } from '../../../../../scripts/jacques/harness';
import { MS_TILE } from '../../../../../web/src/ruleset-ms/api/tiles';
const loaded = await loadLevel(939), run = createRun(loaded), cells = run.session.state.engine.map.cells;
const ids = (pos: number) => [cells[pos].top.id, cells[pos].bottom.id];
const burglars = new Set([20, 21, 22].map(y => y * 32 + 12));
for (const pos of burglars) {
  assert.equal(cells[pos].top.id, MS_TILE.Burglar);
  assert.equal(cells[pos + 1].top.id, MS_TILE.Fire);
}
assert.deepEqual(cells.flatMap((_, pos) => ids(pos).includes(MS_TILE.Boots_Fire) ? [pos] : []), [21 * 32 + 18]);
assert.ok(cells.every((_, pos) => ids(pos).every(id => id !== MS_TILE.Block_Static && !(id >= MS_TILE.Block && id < MS_TILE.Block + 4))));
assert.ok(cells.every((_, pos) => !ids(pos).includes(MS_TILE.Teleport)));
assert.equal(loaded.level.cloners.length, 0);
assert.deepEqual(cells.flatMap((_, pos) => ids(pos).includes(MS_TILE.Exit) ? [pos] : []), [0]);
assert.equal(cells[1].top.id, MS_TILE.Socket);
assert.equal(cells[32].top.id, MS_TILE.Wall);
const solid = new Set([MS_TILE.Wall, MS_TILE.HiddenWall_Perm, MS_TILE.HiddenWall_Temp, MS_TILE.BlueWall_Real, MS_TILE.CloneMachine]);
const blocked = new Set(cells.flatMap((_, pos) => solid.has(cells[pos].top.id) || cells[pos].bottom.id === MS_TILE.CloneMachine || burglars.has(pos) ? [pos] : []));
const reachable = new Set([run.session.state.internal.chipPos]), queue = [...reachable];
for (const pos of queue) for (const next of [pos - 32, pos + 32, ...(pos % 32 ? [pos - 1] : []), ...(pos % 32 < 31 ? [pos + 1] : [])]) {
  if (next < 0 || next >= 1024 || blocked.has(next) || reachable.has(next)) continue;
  reachable.add(next); queue.push(next);
}
const chips = [...reachable].reduce((sum, pos) => sum + ids(pos).filter(id => id === MS_TILE.ICChip).length, 0);
assert.equal(reachable.size, 494); assert.equal(chips, 317); assert.ok(chips < loaded.metadata.chipsRequired);
const result = { level: 939, componentCells: [...reachable].sort((a, b) => a - b), blockingCells: [...blocked].sort((a, b) => a - b), irreversibleBoundary: [...burglars], reachableChipUpperBound: chips, requiredChips: loaded.metadata.chipsRequired };
await writeFile(fileURLToPath(new URL('./939-cut.json', import.meta.url)), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ level: 939, componentSize: reachable.size, reachableChipUpperBound: chips, requiredChips: loaded.metadata.chipsRequired, status: 'all assertions passed' }, null, 2));

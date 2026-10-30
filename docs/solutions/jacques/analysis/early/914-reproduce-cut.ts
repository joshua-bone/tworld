// Run from web/: node_modules/.bin/vite-node ../docs/solutions/jacques/analysis/early/914-reproduce-cut.ts
// This computes an intentionally permissive graph, not a gameplay search.
import assert from 'node:assert/strict';
import { loadLevel, createRun } from '../../../../../scripts/jacques/harness';
import { MS_TILE } from '../../../../../web/src/ruleset-ms/api/tiles';

const loaded = await loadLevel(914);
const run = createRun(loaded);
const cells = run.session.state.engine.map.cells;
const ids = (pos: number) => [cells[pos].top.id, cells[pos].bottom.id];
assert.ok(cells.every((_, pos) => !ids(pos).includes(MS_TILE.Button_Green)));
const wiredTraps = new Set(loaded.level.traps.map(connection => connection.to));
const traps = new Set(cells.flatMap((_, pos) => ids(pos).includes(MS_TILE.Beartrap) && !wiredTraps.has(pos) ? [pos] : []));
const walls = new Set([MS_TILE.Wall, MS_TILE.HiddenWall_Perm, MS_TILE.HiddenWall_Temp, MS_TILE.BlueWall_Real, MS_TILE.SwitchWall_Closed]);
const blocked = new Set(cells.flatMap((cell, pos) => walls.has(cell.top.id) || traps.has(pos) ? [pos] : []));
const teleports = cells.flatMap((_, pos) => ids(pos).includes(MS_TILE.Teleport) ? [pos] : []);
const reachable = new Set([run.session.state.internal.chipPos]);
const queue = [...reachable];
for (const pos of queue) {
  const neighbors = [pos - 32, pos + 32, ...(pos % 32 ? [pos - 1] : []), ...(pos % 32 < 31 ? [pos + 1] : []), ...(teleports.includes(pos) ? teleports : [])];
  for (const next of neighbors) {
    if (next < 0 || next >= 1024 || blocked.has(next) || reachable.has(next)) continue;
    reachable.add(next);
    queue.push(next);
  }
}
const chips = [...reachable].reduce((sum, pos) => sum + ids(pos).filter(id => id === MS_TILE.ICChip).length, 0);
assert.equal(traps.size, 92);
assert.equal(reachable.size, 310);
assert.equal(chips, 36);
assert.equal(loaded.metadata.chipsRequired, 131);
console.log(JSON.stringify({ level: 914, unconnectedTraps: traps.size, permissiveComponentCells: reachable.size, reachableChipUpperBound: chips, requiredChips: loaded.metadata.chipsRequired }));

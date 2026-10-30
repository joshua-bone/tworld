// Run from web/: node_modules/.bin/vite-node ../docs/solutions/jacques/analysis/early/925-reproduce-exit.ts
// Map assertions supporting a source-level exit invariant, not a gameplay search.
import assert from 'node:assert/strict';
import { loadLevel, createRun } from '../../../../../scripts/jacques/harness';
import { MS_TILE } from '../../../../../web/src/ruleset-ms/api/tiles';
const loaded = await loadLevel(925);
const run = createRun(loaded);
const cells = run.session.state.engine.map.cells;
const at = (x: number, y: number) => cells[y * 32 + x];
const ids = (x: number, y: number) => [at(x, y).top.id, at(x, y).bottom.id];
const exits = cells.flatMap((cell, pos) => [cell.top.id, cell.bottom.id].includes(MS_TILE.Exit) ? [pos] : []);
assert.deepEqual(exits, [31 * 32]);
assert.deepEqual(ids(0, 31), [MS_TILE.Water, MS_TILE.Exit]);
assert.deepEqual(ids(0, 30), [MS_TILE.Block + 2, MS_TILE.CloneMachine]);
assert.ok(loaded.level.cloners.every(connection => connection.to !== 30 * 32));
for (let x = 1; x <= 9; x++) assert.equal(at(x, 30).top.id, MS_TILE.CloneMachine);
assert.equal(at(5, 31).top.id, MS_TILE.Water);
assert.equal(at(6, 31).top.id, MS_TILE.Slide_East);
assert.equal(at(7, 31).top.id, MS_TILE.Fire);
for (let x = 0; x <= 10; x++) for (let y = 29; y < 32; y++) assert.ok(!ids(x, y).includes(MS_TILE.Teleport));
console.log(JSON.stringify({ level: 925, soleExit: [0, 31], coveringTile: 'Water', unwiredCloner: [0, 30], immutableClonerBarrier: 'x=1..9,y=30', forcedBlockCut: [6, 31], status: 'all map assertions passed' }, null, 2));

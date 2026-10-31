import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildWinningReplay, createRun, DAT_SHA256, loadLevel, ROOT, snapshot, tick } from './harness';
import { verifyNativeStream } from './native-stream';

const directory = join(ROOT, 'docs/solutions/jacques/analysis/late');
const fixture = JSON.parse(await readFile(join(directory, '978-winning-inputs.json'), 'utf8'));
assert.equal(fixture.level, 978);
assert.equal(fixture.datSha256, DAT_SHA256);
assert.equal(fixture.finalTick, 9812);
assert.ok(Array.isArray(fixture.inputs) && fixture.inputs.length === 9813);
assert.ok(fixture.inputs.every((input: unknown) => [0, 1, 2, 4, 8].includes(input as number)));
const loaded = await loadLevel(978);
const run = createRun(loaded, { randomSeed: fixture.seed, stepping: fixture.stepping });

// The 4x3 opening is followed by paired columns, alternately down and up.
const regions: number[][] = [Array.from({ length: 12 }, (_, i) => Math.floor(i / 4) * 32 + i % 4)];
for (let columnPair = 0; columnPair < 16; columnPair++) {
  for (let row = 0; row < 16; row++) {
    const x = columnPair * 2;
    const y = (columnPair % 2 ? 15 - row : row) * 2;
    const cells = [y * 32 + x, y * 32 + x + 1, (y + 1) * 32 + x, (y + 1) * 32 + x + 1]
      .filter(pos => pos % 32 >= 4 || Math.floor(pos / 32) >= 3);
    if (cells.length) regions.push(cells);
  }
}
assert.equal(regions.length, 255);
const rank = Array<number>(1024).fill(-1);
regions.forEach((cells, index) => cells.forEach(pos => { assert.equal(rank[pos], -1); rank[pos] = index; }));
assert.ok(rank.every(value => value >= 0));
const counts = () => run.session.state.engine.map.cells.map(cell => Number(cell.top.id === 45) + Number(cell.bottom.id === 45));
const activeRegion = (chips: number[]) => {
  const index = regions.findIndex(cells => cells.some(pos => chips[pos]));
  return index < 0 ? regions.length : index;
};
function remainingComponents(chips: number[]) {
  const unseen = new Set(chips.flatMap((count, pos) => count ? [pos] : []));
  let count = 0;
  while (unseen.size) {
    count++;
    const first = unseen.values().next().value!;
    unseen.delete(first);
    const pending = [first];
    while (pending.length) {
      const pos = pending.pop()!;
      for (const next of [pos - 32, pos - 1, pos + 1, pos + 32]) {
        if (unseen.has(next) && (Math.abs(next - pos) !== 1 || Math.floor(next / 32) === Math.floor(pos / 32))) {
          unseen.delete(next);
          pending.push(next);
        }
      }
    }
  }
  return count;
}

const transitions = [];
for (const [index, input] of fixture.inputs.entries()) {
  const before = counts();
  const active = activeRegion(before);
  tick(run, input);
  const after = counts();
  for (let pos = 0; pos < 1024; pos++) {
    if (after[pos]! < before[pos]!) assert.ok(rank[pos]! <= active, `Future-region pickup at tick ${index}, cell ${pos}`);
  }
  const next = activeRegion(after);
  if (next !== active) {
    const components = remainingComponents(after);
    assert.ok(components <= 1, `Scattered remaining chips at completed region ${active}`);
    transitions.push({ tick: index, completed: active, next, nextCells: regions[next], remainingComponents: components, chip: snapshot(run).chip!.position });
  }
}
assert.equal(activeRegion(counts()), 255);
assert.equal(run.session.state.engine.status, 'completed');
assert.equal(run.session.state.engine.timer.currentTime, fixture.finalTick);
const built = buildWinningReplay(run);
// Verify the exact artifact to be published, not a different regenerated replay.
const bytes = await readFile(join(directory, '978.tws'));
assert.ok(bytes.equals(Buffer.from(built.bytes)), 'Winning fixture changed the staged TWS bytes');
const native = await verifyNativeStream(loaded, bytes, fixture.finalTick + 100, built.trace);
assert.equal(native.native.status, 'completed');
const certificate = { level: loaded.metadata, typescript: built.trace.result, ...native, inputAudit: built.inputAudit };
await writeFile(join(directory, '978.tws.json'), JSON.stringify(certificate, null, 2) + '\n');
const audit = { orderedInvariant: true, prefixExceptionTicks: 0, checkedTicks: run.inputs.length, fullyClearedRegions: 255, totalRegions: 255, transitions, endpoint: snapshot(run) };
await writeFile(join(ROOT, 'web/public/dev/solutions/jacques/evidence/978-ordered-completion-audit.json'), JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify(certificate, null, 2));

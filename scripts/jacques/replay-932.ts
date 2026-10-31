import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildWinningReplay, createRun, DAT_SHA256, loadLevel, renderSvg, ROOT, snapshot, tick } from './harness';
import { verifyNativeStream } from './native-stream';

const directory = join(ROOT, 'docs/solutions/jacques/analysis/late');
const evidence = join(ROOT, 'web/public/dev/solutions/jacques/evidence');
const fixture = JSON.parse(await readFile(join(directory, '932-winning-inputs.json'), 'utf8'));
assert.equal(fixture.level, 932);
assert.equal(fixture.datSha256, DAT_SHA256);
assert.equal(fixture.finalTick, 10544);
assert.equal(fixture.stepping, 4);
assert.equal(fixture.seed, 0);
assert.ok(Array.isArray(fixture.inputs) && fixture.inputs.length === 10545);
assert.ok(fixture.inputs.every((input: unknown) => [0, 1, 2, 4, 8].includes(input as number)));
const loaded = await loadLevel(932);
const run = createRun(loaded, { randomSeed: fixture.seed, stepping: fixture.stepping });
const pins = [[1016, 76], [1017, 96], [1018, 96], [1019, 96], [1020, 96], [1021, 96]] as const;
const corridor = [368, 400, 432];
const chipCount = (pos: number) => {
  const cell = run.session.state.engine.map.cells[pos]!;
  return Number(cell.top.id === 45) + Number(cell.bottom.id === 45);
};
const rawInitialChipUnits = run.session.state.engine.map.cells.reduce((sum, _, pos) => sum + chipCount(pos), 0);
assert.equal(rawInitialChipUnits, 1029);
assert.equal(chipCount(0), 1);
// The implicit player overwrites its starting chip on tick zero without credit.
const initialSpawnOverwriteChipUnits = 1;
const collectibleChipUnits = rawInitialChipUnits - initialSpawnOverwriteChipUnits;
const milestones = [];
const descent = [];
let pinnedActors: { serial: number; id: number; pos: number }[] = [];
let pinnedTicks = 0;
for (const [index, input] of fixture.inputs.entries()) {
  tick(run, input);
  assert.equal(run.inputs.length, index + 1, `Replay ended before input ${index}`);
  const state = snapshot(run);
  assert.equal(chipCount(553), 1, `Walker outlet opened at tick ${index}`);
  if (index === 0) {
    assert.equal(chipCount(0), 0);
    const chipUnits = run.session.state.engine.map.cells.reduce((sum, _, pos) => sum + chipCount(pos), 0);
    assert.equal(rawInitialChipUnits - chipUnits, 2);
    assert.equal(state.chipsNeeded, loaded.metadata.chipsRequired - 1);
  }
  if (index === 1543) {
    pinnedActors = pins.map(([pos, id]) => {
      const actors = run.session.state.internal.creatures.filter(actor => !actor.hidden && actor.pos === pos);
      assert.equal(actors.length, 1);
      assert.equal(actors[0]!.id, id);
      return { serial: actors[0]!.serial, id, pos };
    });
  }
  if (index >= 1543) {
    for (const { serial, id, pos } of pinnedActors) {
      const actor = run.session.state.internal.creatures.find(actor => actor.serial === serial);
      assert.ok(actor && !actor.hidden && actor.id === id && actor.pos === pos, `Pin missing at ${pos}, tick ${index}`);
    }
    pinnedTicks++;
  }
  if (index < 10532) {
    for (const pos of corridor) assert.equal(chipCount(pos), 2, `Exit corridor opened at ${pos}, tick ${index}`);
  }
  if ([1543, 6735, 10531, 10544].includes(index)) {
    milestones.push({ tick: index, chip: state.chip!.position, chipsNeeded: state.chipsNeeded, creatureCount: state.creatureCount });
    await writeFile(join(evidence, `932-winning-${index}.svg`), await renderSvg(run));
  }
  if ([10532, 10536, 10540, 10544].includes(index)) {
    descent.push({ tick: index, position: state.chip!.position.pos, chipsNeeded: state.chipsNeeded, status: state.status });
  }
}
assert.equal(run.session.state.engine.status, 'completed');
assert.equal(run.session.state.engine.timer.currentTime, fixture.finalTick);
assert.deepEqual(descent.map(step => step.position), [...corridor, 464]);
assert.deepEqual(descent.map(step => step.chipsNeeded), [1, 0, 0, 0]);
for (const pos of corridor) assert.equal(chipCount(pos), 1);
const built = buildWinningReplay(run);
const bytes = await readFile(join(directory, '932.tws'));
assert.ok(bytes.equals(Buffer.from(built.bytes)), 'Winning fixture changed the staged TWS bytes');
const native = await verifyNativeStream(loaded, bytes, fixture.finalTick + 100, built.trace);
assert.equal(native.native.status, 'completed');
const certificate = { level: loaded.metadata, typescript: built.trace.result, ...native, inputAudit: built.inputAudit };
await writeFile(join(directory, '932.tws.json'), JSON.stringify(certificate, null, 2) + '\n');
const remainingChipUnits = run.session.state.engine.map.cells.reduce((sum, _, pos) => sum + chipCount(pos), 0);
const audit = { level: 932, datSha256: DAT_SHA256, checkedTicks: run.inputs.length, pinnedFromTick: 1543, pinnedTicks, pinnedActors, walkerOutletPreserved: 553, corridor, corridorProtectedUntilTick: 10531, rawInitialChipUnits, initialSpawnOverwriteChipUnits, collectibleChipUnits, remainingChipUnits, pickedUpChipUnits: collectibleChipUnits - remainingChipUnits, milestones, descent, endpoint: { tick: snapshot(run).currentTime, status: snapshot(run).status, chip: snapshot(run).chip!.position } };
await writeFile(join(evidence, '932-winning-route-audit.json'), JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify(certificate, null, 2));

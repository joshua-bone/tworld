// Run from web: node_modules/.bin/vite-node ../scripts/jacques/verify-723-progress.ts
// These fixtures are partial routes, not winning solutions.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSolutionFile, serializeSolutionFile } from '../../web/src/content/api/solution-file';
import { runMsReplayTrace } from '../../web/src/ruleset-ms/impl/engine';
import { collectTraceMismatches, type TraceMismatch } from '../../web/src/replay-verifier/impl/engine/comparators/traceComparison';
import { ROOT, loadLevel, createRun, tick, snapshot, verifyNativeReplay, auditMsReplayInputs } from './harness';

const directory = join(ROOT, 'web/public/dev/solutions/jacques/evidence');
const normalize = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
for (const [name, count, remaining, position] of [
  ['partial', 2137, 14, 670],
  ['early-upper', 837, 37, 286],
] as const) {
  const fixtureBytes = await readFile(join(directory, `723-${name}-route.json`));
  const fixture = JSON.parse(fixtureBytes.toString());
  const loaded = await loadLevel(723);
  assert.equal(fixture.datSha256, loaded.datSha256);
  assert.equal(fixture.inputs.length, count);
  const run = createRun(loaded);
  const manual = [];
  for (const input of fixture.inputs) {
    assert.ok([0, 1, 2, 4, 8].includes(input), 'Expected cardinal or released input');
    tick(run, input);
    manual.push(snapshot(run));
  }
  const endpoint = snapshot(run);
  assert.equal(endpoint.status, 'playing');
  assert.equal(endpoint.chipsNeeded, remaining);
  assert.equal(endpoint.chip?.position.pos, position);
  const bestTimeTicks = count + 100;
  const bytes = serializeSolutionFile({ ruleset: 'MS', flags: 0, extraHeader: new Uint8Array(), setName: 'Jacques-MS.dac', entries: [{
    levelNumber: 723, password: loaded.metadata.password, bestTimeTicks, solutionData: null,
    expandedSolution: { flags: 0, randomSlideDirection: 1, stepping: 0, randomSeed: 0, moves: run.session.recordedMoves },
  }] });
  const solution = parseSolutionFile(bytes).entries[0].expandedSolution!;
  const replay = runMsReplayTrace(loaded.request, loaded.level, solution, count);
  const native = await verifyNativeReplay(loaded, bytes, count);
  assert.equal(replay.steps.length, count);
  assert.equal(native.trace.steps.length, count);
  const fields = ['currentTime', 'status', 'randomState', 'chipsNeeded', 'chip', 'creatureCount', 'creaturesHash', 'mapHash'] as const;
  for (let index = 0; index < count; index++) {
    for (const field of fields) assert.deepEqual(manual[index][field], replay.steps[index][field], `Manual/replay tick ${index}: ${field}`);
  }
  const differences: TraceMismatch[] = [];
  for (const field of ['initialState', 'steps', 'result'] as const) {
    collectTraceMismatches(normalize(replay[field]), normalize(native.trace[field]), field, differences, 10);
  }
  assert.deepEqual(differences, [], 'Full native trace mismatch');
  assert.equal(native.exactInputBytesRead, true);
  assert.equal(native.stderr, '');
  const certificate = {
    proofOnlyNotWinning: true, level: 723, fixture: `723-${name}-route.json`,
    fixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
    datSha256: native.datSha256, twsSha256: native.twsSha256,
    exactInputBytesRead: native.exactInputBytesRead, nativeStderr: native.stderr,
    exactTraceParity: true, checkedTicks: count, chipsCollected: 54 - remaining,
    chipsRemaining: remaining, position: endpoint.chip?.position,
    typescript: replay.result, native: native.trace.result,
    inputAudit: auditMsReplayInputs(solution.moves),
  };
  await writeFile(join(directory, `723-${name}-parity.json`), JSON.stringify(certificate, null, 2) + '\n');
  console.log(JSON.stringify(certificate));
}

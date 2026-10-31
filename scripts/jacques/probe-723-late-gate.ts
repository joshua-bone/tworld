// From web/: node_modules/.bin/vite-node ../scripts/jacques/probe-723-late-gate.ts /path/to/Jacques.dat /tmp/jacques-723-late-gate
// Exploratory TypeScript-only probes; reaching the left side is not completion.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ROOT, createRun, dump, loadLevel, snapshot, tick, type Run } from './harness';

const datPath = process.argv[2];
assert.ok(datPath, 'Supply the path to the original Jacques.dat');
const output = resolve(process.argv[3] ?? '/tmp/jacques-723-late-gate');
await mkdir(output, { recursive: true });
const evidence = join(ROOT, 'web/public/dev/solutions/jacques/evidence');
const prefixBytes = await readFile(join(evidence, '723-late-gate-prefix.json'));
const prefix = JSON.parse(prefixBytes.toString());
const source = await readFile(join(evidence, prefix.sourceFixture));
assert.equal(createHash('sha256').update(source).digest('hex'), prefix.sourceFixtureSha256);
assert.deepEqual(prefix.inputs, JSON.parse(source.toString()).inputs.slice(0, prefix.prefixInputCount));
const base = createRun(await loadLevel(723, datPath));
assert.equal(base.loaded.datSha256, prefix.datSha256);
assert.equal(prefix.inputs.length, 3804);
for (const input of prefix.inputs) tick(base, input);
const endpoint = snapshot(base);
assert.equal(endpoint.chip?.position.pos, prefix.expectedEndpoint.position);
for (const key of ['currentTime', 'chipsNeeded', 'status', 'mapHash', 'creaturesHash'] as const) {
  assert.equal(endpoint[key], prefix.expectedEndpoint[key], `Prefix ${key}`);
}
const fork = (run: Run): Run => ({ ...run, session: structuredClone(run.session), inputs: [...run.inputs] });
const playing = (run: Run) => run.session.state.engine.status === 'playing';
const position = (run: Run) => run.session.state.internal.chipPos;
const corridor = [[4, 56], [8, 61], [1, 29], [8, 31], [2, 29], [4, 61], [2, 56], [1, 24], [2, 23]] as const;
function walk(run: Run, direction: number, target: number, cap = 40, afterTick?: () => void): boolean {
  for (let count = 0; count < cap && position(run) !== target && playing(run); count++) {
    tick(run, direction);
    afterTick?.();
  }
  return position(run) === target && playing(run);
}
const metadata = {
  level: 723, datSha256: base.loaded.datSha256, nativeCertified: false, proofOnlyNotWinning: true,
  prefixFixture: '723-late-gate-prefix.json', prefixSha256: createHash('sha256').update(prefixBytes).digest('hex'),
  timingNote: 'Wall-clock cutoffs are checked between bounded trials. Elapsed time and the number of completed trials vary across machines; one trial can finish after its cutoff.',
};
async function save(name: string, result: object) {
  const record = { ...metadata, ...result };
  await writeFile(join(output, name + '.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record));
}

// Incremental idle state matches the original late-gate probe.
const late = fork(base);
const lateStart = Date.now();
let lateWaits = 0, lateAttempts = 0, maximumReturnDelay = 0, lateSuccesses = 0;
for (let wait = 0; wait < 1200 && Date.now() - lateStart < 30000; wait++) {
  lateWaits++;
  if (wait) tick(late, 0);
  if (late.session.state.internal.chipHasMoved) continue;
  const run = fork(late);
  tick(run, 8);
  if (position(run) !== 24) continue;
  lateAttempts++;
  const pushTime = run.session.state.engine.timer.currentTime;
  let returnedAt: number | undefined;
  const observe = () => {
    if (returnedAt === undefined && run.session.state.internal.blocks.some(block => block.pos === 24)) {
      returnedAt = run.session.state.engine.timer.currentTime - pushTime;
    }
  };
  const returned = corridor.every(([direction, target]) => walk(run, direction, target, 40, observe));
  if (returnedAt !== undefined) maximumReturnDelay = Math.max(maximumReturnDelay, returnedAt);
  if (returned) {
    lateSuccesses++;
    await writeFile(join(output, 'late-return-candidate.json'), JSON.stringify(dump(run)) + '\n');
    break;
  }
}
await save('late-gate-timing', {
  maximumWaitTicks: 1199, waitCandidates: 1200, timeoutMs: 30000, waitsExamined: lateWaits,
  attempts: lateAttempts, maximumObservedReturnDelayTicks: maximumReturnDelay,
  successfulReturns: lateSuccesses, actualElapsedMs: Date.now() - lateStart,
});

// Enter ice after the push, rebound to (24,0), then try the corridor.
const excursionStart = Date.now();
let excursionWaits = 0, safeExcursions = 0, excursionSuccesses = 0;
for (let wait = 0; wait < 256 && Date.now() - excursionStart < 12000; wait++) {
  excursionWaits++;
  const run = fork(base);
  tick(run, 0, wait);
  if (!walk(run, 8, 24) || !walk(run, 8, 25, 16)) continue;
  for (let count = 0; count < 20 && position(run) !== 24 && playing(run); count++) tick(run, 0);
  if (position(run) !== 24 || !playing(run)) continue;
  safeExcursions++;
  if (corridor.every(([direction, target]) => walk(run, direction, target))) {
    excursionSuccesses++;
    await writeFile(join(output, 'ice-excursion-return-candidate.json'), JSON.stringify(dump(run)) + '\n');
    break;
  }
}
await save('ice-excursion-timing', {
  maximumWaitTicks: 255, waitCandidates: 256, timeoutMs: 12000, waitsExamined: excursionWaits,
  safeExcursions, successfulReturns: excursionSuccesses, actualElapsedMs: Date.now() - excursionStart,
});

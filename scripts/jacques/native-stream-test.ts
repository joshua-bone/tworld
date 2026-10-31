import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildWinningReplay, createRun, loadLevel, ROOT, tick } from './harness';
import { verifyNativeStream } from './native-stream';

// Use a small real winning replay to exercise the process and streaming seam.
const fixture = JSON.parse(await readFile(join(ROOT, 'docs/solutions/jacques/analysis/late/981-winning-inputs.json'), 'utf8'));
const loaded = await loadLevel(981);
const run = createRun(loaded, { randomSeed: fixture.seed, stepping: fixture.stepping });
for (const input of fixture.inputs) tick(run, input);
const built = buildWinningReplay(run);
const verify = (expected: typeof built.trace) => verifyNativeStream(loaded, built.bytes, 1884, expected);
const certificate = await verify(built.trace);
assert.equal(certificate.native.status, 'completed');
assert.equal(certificate.checkedTicks, 1785);
assert.equal(certificate.exactInputBytesRead, true);
assert.equal(certificate.nativeStderr, '');

const initial = structuredClone(built.trace);
initial.initialState.chipsNeeded++;
await assert.rejects(verify(initial), /initialState.*chipsNeeded/);
const tickMismatch = structuredClone(built.trace);
tickMismatch.steps[100]!.chipsNeeded++;
await assert.rejects(verify(tickMismatch), /steps\[100\].*chipsNeeded/);
await assert.rejects(verify({ ...built.trace, steps: built.trace.steps.slice(0, -1) }), /extra step/);
await assert.rejects(verify({ ...built.trace, steps: [...built.trace.steps, built.trace.steps.at(-1)!] }), /Incomplete native trace/);
await assert.rejects(verify({ ...built.trace, result: { ...built.trace.result, finalTick: 1 } }), /result.*finalTick/);
console.log('Native streaming verification: real win and five corruption controls passed.');

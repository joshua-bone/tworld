import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRun, DAT_SHA256, loadLevel, ROOT, saveWinningReplay, tick } from './harness';

// The fixed input fixture preserves the successful room order and Teeth lures.
// Recheck the encoded TWS against the original C engine before writing it.
const directory = join(ROOT, 'docs/solutions/jacques/analysis/late');
const fixture = JSON.parse(await readFile(join(directory, '981-winning-inputs.json'), 'utf8'));
assert.equal(fixture.level, 981);
assert.equal(fixture.datSha256, DAT_SHA256);
assert.ok(Array.isArray(fixture.inputs) && fixture.inputs.length === 1785);
assert.ok(fixture.inputs.every((input: unknown) => [0, 1, 2, 4, 8].includes(input as number)));

const run = createRun(await loadLevel(981), { randomSeed: fixture.seed, stepping: fixture.stepping });
for (const input of fixture.inputs) tick(run, input);
assert.equal(run.session.state.engine.status, 'completed');
assert.equal(run.session.state.engine.timer.currentTime, fixture.finalTick);
const certificate = await saveWinningReplay(run, join(directory, '981.tws'));
console.log(JSON.stringify(certificate, null, 2));

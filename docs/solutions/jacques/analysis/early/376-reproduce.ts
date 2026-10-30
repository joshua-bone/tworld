// Run from web/: node_modules/.bin/vite-node ../docs/solutions/jacques/analysis/early/376-reproduce.ts
// Optional first argument changes the output TWS path (default /tmp/jacques-376-reproduced.tws).
import { readFile } from 'node:fs/promises';
import { loadLevel, createRun, tick, saveWinningReplay } from '../../../../../scripts/jacques/harness';

const source = JSON.parse(await readFile(new URL('./376-inputs.json', import.meta.url), 'utf8'));
const run = createRun(await loadLevel(source.level), { randomSeed: source.randomSeed, stepping: source.stepping });
for (const input of source.inputs) {
  if (input === 9) {
    // Manual UI latching normalizes diagonals; TWS replay latching preserves them.
    // Feed this command through replay input latching and preserve it in the authored TWS.
    const when = run.inputs.length;
    run.session.state.engine.replay.cursor = 0;
    tick(run, input);
    run.session.state.engine.replay.cursor = -1;
    run.session.recordedMoves.push({ when, dir: input });
  } else {
    tick(run, input);
  }
}
const certificate = await saveWinningReplay(run, process.argv[2] ?? '/tmp/jacques-376-reproduced.tws');
if (certificate.twsSha256 !== '948ebbe595ea138b5c089cdbee6d6b3b2f33c548252c2ac490852be8edbda0f6') {
  throw new Error('Reproduction changed the verified TWS bytes');
}
console.log(JSON.stringify(certificate, null, 2));

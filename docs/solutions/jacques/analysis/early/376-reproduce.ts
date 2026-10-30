// Run from web/: node_modules/.bin/vite-node ../docs/solutions/jacques/analysis/early/376-reproduce.ts
// Optional first argument changes the output TWS path (default /tmp/jacques-376-reproduced.tws).
import { readFile } from 'node:fs/promises';
import { loadLevel, createRun, tick, saveWinningReplay } from '../../../../../scripts/jacques/harness';

const source = JSON.parse(await readFile(new URL('./376-inputs.json', import.meta.url), 'utf8'));
const run = createRun(await loadLevel(source.level), { randomSeed: source.randomSeed, stepping: source.stepping });
// All commands pass through ordinary manual input latching, including the mouse click.
for (const input of source.inputs) tick(run, input);
const certificate = await saveWinningReplay(run, process.argv[2] ?? '/tmp/jacques-376-reproduced.tws');
if (certificate.twsSha256 !== '8c2cf373930654ef5eb252dba030359f838d2112680b77f8b51236f78a400fd9') {
  throw new Error('Reproduction changed the verified TWS bytes');
}
console.log(JSON.stringify(certificate, null, 2));

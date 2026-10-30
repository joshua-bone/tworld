import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadLevel, createRun, tick, dump, snapshot, renderSvg, saveWinningReplay } from './harness';
const [command = 'help', selector, destination = '/tmp/jacques-investigation', inputPath] = process.argv.slice(2);
if (!['inspect', 'run'].includes(command) || !selector) {
  console.log('Usage (from web): node_modules/.bin/vite-node ../scripts/jacques/cli.ts inspect LEVEL OUTPUT_DIR\n  run LEVEL OUTPUT_DIR INPUTS_JSON\nLEVEL is exact number or name; INPUTS_JSON is an array of per-tick integer codes or N/W/S/E/. strings.');
} else {
  const loaded = await loadLevel(/^\d+$/.test(selector) ? Number(selector) : selector);
  const run = createRun(loaded);
  if (command === 'run') {
    if (!inputPath) throw new Error('run requires INPUTS_JSON');
    const inputs = JSON.parse(await readFile(inputPath, 'utf8'));
    if (!Array.isArray(inputs) || inputs.length > 100000) throw new Error('Expected bounded input array');
    for (const input of inputs) tick(run, input);
  }
  await mkdir(destination, { recursive: true });
  const stem = resolve(destination, String(loaded.metadata.number).padStart(3, '0'));
  await writeFile(`${stem}.json`, JSON.stringify(dump(run), null, 2));
  await writeFile(`${stem}.svg`, await renderSvg(run));
  await writeFile(`${stem}-bottom.svg`, await renderSvg(run, { plane: 'bottom' }));
  if (snapshot(run).status === 'completed') await saveWinningReplay(run, `${stem}.tws`);
  console.log(JSON.stringify({ files: stem, name: loaded.metadata.name, snapshot: snapshot(run) }, null, 2));
}

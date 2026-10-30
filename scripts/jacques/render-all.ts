import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, loadLevel, createRun, dump, renderSvg } from './harness';
const levels = [186,288,376,379,402,431,527,628,643,660,668,672,675,723,732,756,791,909,910,914,915,920,925,931,932,937,939,945,949,952,955,970,972,974,978,981,982,984];
const output = process.argv[2] ?? join(ROOT, 'web/public/dev/solutions/jacques/maps');
await mkdir(output, { recursive: true });
for (const number of levels) {
  const run = createRun(await loadLevel(number));
  await writeFile(join(output, `${number}.json`), JSON.stringify(dump(run), null, 2));
  await writeFile(join(output, `${number}.svg`), await renderSvg(run));
  await writeFile(join(output, `${number}-bottom.svg`), await renderSvg(run, { plane: 'bottom' }));
}
console.log(`Wrote ${levels.length} initial JSON dumps and 76 sprite maps to ${output}`);

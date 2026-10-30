// From web/: node_modules/.bin/vite-node ../docs/solutions/jacques/analysis/early/931-reproduce-probes.ts
// Replays two diagnostic TWS files; neither is presented as a winning solution.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadLevel,verifyNativeReplay} from '../../../../../scripts/jacques/harness';
import {parseSolutionFile} from '../../../../../web/src/content/api/solution-file';
import {runMsReplayTrace} from '../../../../../web/src/ruleset-ms/impl/engine';
import {collectTraceMismatches} from '../../../../../web/src/replay-verifier/impl/engine/comparators/traceComparison';
const loaded=await loadLevel(931);
for(const name of ['931-598-prefix','931-walker-fatal-probe']) {
  const bytes=await readFile(new URL(`./${name}.tws`,import.meta.url));
  const certificate=JSON.parse(await readFile(new URL(`./${name}.tws.json`,import.meta.url),'utf8'));
  const entry=parseSolutionFile(bytes).entries[0];
  assert.equal(entry.levelNumber,931);
  assert.ok(entry.expandedSolution.moves.every(move=>[1,2,4,8].includes(move.dir)),'Only ordinary cardinal inputs');
  const replay={...entry.expandedSolution,bestTimeTicks:entry.bestTimeTicks};
  const maxTicks=certificate.typescript.stepCount;
  const ts=runMsReplayTrace(loaded.request,loaded.level,replay,maxTicks);
  const native=await verifyNativeReplay(loaded,bytes,maxTicks);
  const differences:any[]=[];
  for(const key of ['initialState','steps','result'] as const) collectTraceMismatches(JSON.parse(JSON.stringify(ts[key])),JSON.parse(JSON.stringify(native.trace[key])),`$.${key}`,differences,10);
  assert.deepEqual(differences,[]);assert.equal(native.stderr,'');assert.equal(native.exactInputBytesRead,true);
  assert.deepEqual(ts.result,certificate.typescript);
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(certificate.twsSha256)assert.equal(hash,certificate.twsSha256);
  console.log(JSON.stringify({name,sha256:hash,...ts.result,exactTraceParity:true,nativeStderr:native.stderr}));
}

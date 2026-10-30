import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serializeSolutionFile } from '../../web/src/content/api/solution-file';
import { runMsReplayTrace } from '../../web/src/ruleset-ms/impl/engine';
import { loadLevel, createRun, tick, snapshot, verifyNativeReplay, ROOT } from './harness';
for(const number of [732,756,955]) {
 const loaded=await loadLevel(number);const run=createRun(loaded);
 if(number===732)for(const d of 'NSWWE')tick(run,d as any,4);
 if(number===955)for(const d of ['E','S','S','N','W','E'])tick(run,d as any,4);
 const moves=number===756?[{when:500,dir:8}]:run.session.recordedMoves;
 const expandedSolution={flags:0,randomSlideDirection:1,stepping:0,randomSeed:0,moves};
 const bytes=serializeSolutionFile({ruleset:'MS',flags:0,extraHeader:new Uint8Array(),setName:'Jacques-MS.dac',entries:[{levelNumber:number,password:loaded.metadata.password,bestTimeTicks:1000,solutionData:null,expandedSolution}]});
 await writeFile(`/tmp/jacques-${number}-probe.tws`,bytes);
 const native=await verifyNativeReplay(loaded,bytes,number===756?100:number===732?20:24);
 const trace=runMsReplayTrace(loaded.request,loaded.level,{...expandedSolution,bestTimeTicks:1000} as any,number===756?100:number===732?20:24);
 const selected=native.trace.steps.filter(s=>number===955?s.currentTime%4===3:s.currentTime%4===0).map(s=>({tick:s.currentTime,status:s.status,chip:s.chip,actors:s.creatures?.filter(a=>a.id===72||a.id===80||a.id===108)}));
 const evidence={level:number,datSha256:native.datSha256,probeOnlyNotWinning:true,nativeResult:native.trace.result,typescriptResult:trace.result,nativeStderr:native.stderr,exactInputBytesRead:native.exactInputBytesRead,moves,selected};
 const output=join(ROOT,'web/public/dev/solutions/jacques/evidence');await mkdir(output,{recursive:true});await writeFile(join(output,`${number}-native-probe.json`),JSON.stringify(evidence,null,2));
 console.log(number,JSON.stringify({native:native.trace.result,typescript:trace.result,moves:moves.length}));
}

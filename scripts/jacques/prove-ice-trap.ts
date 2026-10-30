import assert from 'node:assert/strict';
import{mkdir,readFile,writeFile}from'node:fs/promises';import{join}from'node:path';
import{loadLevel,createRun,tick,snapshot,verifyNativeReplay,ROOT,DAT_SHA256}from'./harness';
import{MS_TILE as T,isMsCreature}from'../../web/src/ruleset-ms/api/tiles';
import{serializeSolutionFile}from'../../web/src/content/api/solution-file';
const output=join(ROOT,'web/public/dev/solutions/jacques/evidence');await mkdir(output,{recursive:true});
for(const number of[972,974]){
 const loaded=await loadLevel(number),cells=loaded.level.cells;
 const floor=(p:number)=>isMsCreature(cells[p]!.top.id)?cells[p]!.bottom.id:cells[p]!.top.id;
 assert.equal(floor(10+8*32),T.ICChip);assert.equal(cells[10+8*32]!.bottom.id,T.Empty);
 const horizontal=Array.from({length:11},(_,i)=>({x:8+i,y:8})),vertical=Array.from({length:11},(_,i)=>({x:10,y:6+i}));
 for(const p of horizontal)if(p.x!==10)assert.equal(floor(p.x+32*p.y),T.Ice);
 for(const p of vertical)if(p.y!==8&&p.y!==11)assert.equal(floor(p.x+32*p.y),T.Ice);
 assert.equal(floor(10+11*32),T.BlueWall_Fake);assert.equal(cells[10+11*32]!.bottom.id,T.Ice);
 for(const p of[7+8*32,19+8*32,10+5*32,10+17*32])assert.ok(new Set<number>([T.Wall,T.BlueWall_Real]).has(floor(p)));
 const forbidden=new Set<number>([T.Boots_Ice,T.Block_Static,T.IceWall_Northwest,T.IceWall_Northeast,T.IceWall_Southwest,T.IceWall_Southeast]);assert.ok(cells.every(c=>!forbidden.has(c.top.id)&&!forbidden.has(c.bottom.id)));
 const count=cells.reduce((n,c)=>n+Number(c.top.id===T.ICChip)+Number(c.bottom.id===T.ICChip),0);assert.equal(count,loaded.level.chipsNeeded);
 assert.equal(cells[29+30*32]!.top.id,T.Exit);assert.equal(cells[30+30*32]!.top.id,T.Socket);assert.equal(cells.filter(c=>c.top.id===T.Exit||c.bottom.id===T.Exit).length,1);
 if(number===972){assert.equal(cells[29+29*32]!.top.id,T.Wall_South);assert.equal(cells[28+30*32]!.top.id,T.Wall_East);}else{assert.equal(cells[29+29*32]!.top.id,T.Wall);assert.equal(cells[28+30*32]!.top.id,T.Wall);}
 assert.equal(cells[29+31*32]!.top.id,T.Wall);
 const evidence={level:number,datSha256:DAT_SHA256,kind:'mandatory-chip-one-way-ice-trap',requiredChips:count,totalChips:count,mandatoryChip:{x:10,y:8},oneUsePivot:{x:10,y:11,top:'BlueWall_Fake',bottom:'Ice'},horizontal,vertical,exit:{x:29,y:30},argument:'The chip at (10,8) is collectable, but collecting it prevents a win. Its horizontal ice track runs from (8,8) to (18,8), bounded by permanent walls at (7,8) and (19,8). Its vertical track runs from (10,6) to (10,16), bounded by permanent walls at (10,5) and (10,17). Apart from the chip itself, the sole non-ice stopping point in either track is a fake blue wall at (10,11), with ice underneath. A first approach to the chip must use that fake wall as a pivot; there is no horizontal entry from either end or other turn point in the row. MS permits a turn when the fake wall is removed, but removal exposes plain ice permanently. After collecting the chip, its cell becomes the only stopping point in the cross. Any departure slides to one of the four permanent end walls and reverses along the same axis, returning to the chip cell; side inputs cannot turn on plain ice. Thus Chip can change axis only at (10,8) and can never leave these 21 cells. No skates, ice corners or blocks exist, and no teleporter lies in the cross. Walkers can block a path or kill Chip, but cannot remove a wall, create a safe turn, or push Chip out. The exit lies outside the cross, so a winning run cannot collect this mandatory chip. All chips are needed by the socket guarding the exit.',sourceReferences:[{path:'legacy_c/mslogic.c',lines:'1631-1633',reason:'entering fake blue wall pops its top tile'},{path:'legacy_c/mslogic.c',lines:'1846-1863',reason:'floor movement starts from the encountered floor kind; fake-wall arrival permits the one-time pivot'},{path:'legacy_c/mslogic.c',lines:'1930-1955',reason:'plain ice blockage reverses movement and reinstates slipping'},{path:'legacy_c/mslogic.c',lines:'1347-1390',reason:'direction input is discarded during ice slipping'}]};
 await writeFile(join(output,`${number}-impossibility.json`),JSON.stringify(evidence,null,2));
}
// A concrete counterexample to the tempting but false claim that the chip is unreachable.
const attempt=JSON.parse(await readFile(join(output,'974-navigation-attempt.json'),'utf8'));
const loaded=await loadLevel(974),run=createRun(loaded);for(const input of attempt.inputs)tick(run,input);
assert.equal(snapshot(run).chipsNeeded,0);assert.equal(run.session.state.internal.chipPos,266);assert.equal(snapshot(run).status,'playing');assert.equal(run.session.state.engine.map.cells[10+11*32]!.top.id,T.Ice);
const expandedSolution={flags:0,randomSlideDirection:1,stepping:0,randomSeed:0,moves:run.session.recordedMoves};
const bytes=serializeSolutionFile({ruleset:'MS',flags:0,extraHeader:new Uint8Array(),setName:'Jacques-MS.dac',entries:[{levelNumber:974,password:loaded.metadata.password,bestTimeTicks:1000,solutionData:null,expandedSolution}]});
const native=await verifyNativeReplay(loaded,bytes,run.inputs.length);assert.equal(native.trace.result.status,'playing');assert.equal(native.trace.steps.at(-1)!.chipsNeeded,0);assert.equal(native.trace.steps.at(-1)!.chip?.position.pos,266);
await writeFile(join(output,'974-all-chips-native-probe.json'),JSON.stringify({level:974,datSha256:DAT_SHA256,probeOnlyNotWinning:true,result:native.trace.result,finalState:native.trace.steps.at(-1),exactInputBytesRead:native.exactInputBytesRead,nativeStderr:native.stderr,recordedMoves:expandedSolution.moves},null,2));
console.log('Checked 972/974 one-way ice-cross trap; native974 collects every chip but remains trapped at tick',native.trace.result.finalTick);

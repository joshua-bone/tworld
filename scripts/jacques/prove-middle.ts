import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serializeSolutionFile } from '../../web/src/content/api/solution-file';
import { MS_TILE as T } from '../../web/src/ruleset-ms/api/tiles';
import { loadLevel, createRun, snapshot, verifyNativeReplay, ROOT, DAT_SHA256 } from './harness';
const output=join(ROOT,'web/public/dev/solutions/jacques/evidence');await mkdir(output,{recursive:true});
const bazzar=await loadLevel(732),cells=bazzar.level.cells;
const redKeys=cells.flatMap(c=>(['top','bottom'] as const).filter(p=>c[p].id===T.Key_Red).map(p=>({position:c.position,plane:p})));
assert.equal(redKeys.length,45);
const pockets=[...([22,24,26,28,30].map(y=>({x:19,y,left:true}))),...([25,27,29,31].map(y=>({x:31,y,left:false})))].map(p=>{
 const doors=Array.from({length:5},(_,i)=>({x:p.left?20+i:26+i,y:p.y}));
 for(const d of doors)assert.equal(cells[d.x+32*d.y]!.top.id,T.Door_Red);
 const chip=cells[p.x+32*p.y]!;assert.equal(chip.top.id,T.ICChip);assert.equal(chip.bottom.id,T.ICChip);
 // Every side around each one-cell-wide chip/door pocket is a fixed wall or map edge.
 const lo=p.left?19:26,hi=p.left?24:31;
 for(let x=lo;x<=hi;x++)for(const y of [p.y-1,p.y+1])if(y>=0&&y<32)assert.equal(cells[x+32*y]!.top.id,T.Wall);
 const sealedX=p.left?18:32;if(sealedX<32)assert.equal(cells[sealedX+32*p.y]!.top.id,T.Wall);
 return {chip:{x:p.x,y:p.y},doors};
});
const chipCount=cells.reduce((n,c)=>n+Number(c.top.id===T.ICChip)+Number(c.bottom.id===T.ICChip),0);assert.equal(chipCount,52);assert.equal(bazzar.level.chipsNeeded,52);
const initial=createRun(bazzar);assert.equal(initial.session.state.internal.chipPos,16+11*32);
const seen=new Set<number>(),q=[16+11*32];
while(q.length){const p=q.pop()!;if(seen.has(p))continue;seen.add(p);for(const delta of [-32,32,-1,1]){const n=p+delta;if(n<0||n>=1024||Math.abs(n%32-p%32)>1)continue;if(new Set<number>([T.Wall,T.Door_Red]).has(cells[n]!.top.id))continue;q.push(n);}}
const exits=[...seen].flatMap(p=>[-32,32,-1,1].map(d=>p+d).filter(n=>n>=0&&n<1024&&Math.abs(n%32-p%32)<=1&&cells[n]!.top.id===T.Door_Red));
assert.deepEqual([...new Set(exits)],[15+11*32]);
const exitCell=cells[14+7*32]!;assert.equal(exitCell.top.id,T.Exit);for(const p of [14+6*32,15+7*32])assert.equal(cells[p]!.top.id,T.Wall);for(const p of [13+7*32,14+8*32])assert.equal(cells[p]!.top.id,T.Socket);
await writeFile(join(output,'732-impossibility.json'),JSON.stringify({level:732,datSha256:DAT_SHA256,kind:'resource-lower-bound',requiredChips:52,totalChips:chipCount,availableRedKeys:redKeys.length,minimumRequiredRedKeys:46,pockets,startingRegion:[...seen],onlyStartingExit:{x:15,y:11},exit:{x:14,y:7},redKeys,argument:'All 52 chips are mandatory because both entrances to the sole exit are sockets. Nine sealed chip alcoves each require opening five red doors (45 total). The starting chamber has a different red door as its sole exit, costing at least one more key. Only 45 red keys exist across both layers, so at least 46 are needed but at most 45 can be obtained. The second red door under the starting doorway is not counted in this lower bound. There are no blocks, cloners or teleporters; monsters cannot open red doors or create red keys.'},null,2));
const leve=await loadLevel(756),timing=[];
for(let stepping=0;stepping<8;stepping++){
 const expandedSolution={flags:0,randomSlideDirection:1,stepping,randomSeed:0,moves:[{when:500,dir:8}]};
 const bytes=serializeSolutionFile({ruleset:'MS',flags:0,extraHeader:new Uint8Array(),setName:'Jacques-MS.dac',entries:[{levelNumber:756,password:leve.metadata.password,bestTimeTicks:1000,solutionData:null,expandedSolution}]});
 const native=await verifyNativeReplay(leve,bytes,100);assert.equal(native.trace.result.status,'failed');assert.ok(native.trace.result.finalTick<=36);timing.push({stepping,...native.trace.result});
}
await writeFile(join(output,'756-impossibility.json'),JSON.stringify({level:756,datSha256:DAT_SHA256,kind:'unavoidable-remote-collision',nativeTiming:timing,realChip:{x:5,y:4},dummySwimmingChip:{x:22,y:5},tankStart:{x:22,y:10,direction:'south'},blueButton:{x:22,y:12},gliderStart:{x:19,y:12,direction:'east'},exit:{x:31,y:1},argument:'The south-facing tank is blocked by a real blue wall at (22,11). A glider confined to the four-cell horizontal passage (19..22,12) reaches the only blue button at (22,12) on tick 12, reversing the tank. It advances north along its column and hits the stationary Swimming Chip tile at (22,5) on tick 32. MS treats collision with this extra Chip image as loss of the whole game. All eight stepping settings reproduce loss on tick 32. The real Chip begins at (5,4): even ignoring every wall, reaching the assembly at x=19 or greater takes at least 14 ordinary moves (52 ticks for the fourteenth move), and reaching the only exit requires at least 29 moves. No forced floors or teleporters exist. The sole reachable early button is brown at (2,2), connected only to the unrelated trap (7,3); it cannot alter the isolated tank/glider assembly. The blue-button glider passage is sealed. The tank column is open to the east, but the only random actor, the blob at (14,8), needs at least eight moves just to reach that column, at eight ticks per blob move; every wall only increases this bound. Other mobile actors also cannot reach the column or its button before tick 32. Therefore seed choice cannot prevent the collision.'},null,2));
console.log('Checked structural resource proof732 and native stepping cases756',timing);

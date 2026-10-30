import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadLevel,createRun,tick,snapshot,ROOT,renderSvg,saveWinningReplay,type Run} from './harness';
import {MS_TILE as T,isMsCreature} from '../../web/src/ruleset-ms/api/tiles';
import {msChipMovementMask,msExitMovementMask} from '../../web/src/ruleset-ms/impl/catalog';
const run=createRun(await loadLevel(910));
const dirs=[{d:1,dx:0,dy:-1},{d:2,dx:-1,dy:0},{d:4,dx:0,dy:1},{d:8,dx:1,dy:0}];
function distance(r:Run,target:number){const s=r.session.state,cells=s.engine.map.cells,inventory=snapshot(r).inventory;
 const floor=(p:number)=>isMsCreature(cells[p]!.top.id)?cells[p]!.bottom.id:cells[p]!.top.id;
 const pass=(p:number,d:number)=>{const t=floor(p);if(t===T.Wall||t===T.BlueWall_Real||t===T.Bomb||t===T.Socket&&snapshot(r).chipsNeeded>0||t===T.Water&&!inventory.boots[3]||t===T.Fire&&!inventory.boots[2])return false;if(t>=T.Door_Red&&t<=T.Door_Green&&!inventory.keys[t-T.Door_Red])return false;return !!(msChipMovementMask(t)&d);};
 const dist=new Map<number,number>([[target,0]]),q=[target];for(let i=0;i<q.length;i++){const p=q[i]!;for(const v of dirs){const n=p-v.dx-v.dy*32;if(n<0||n>=1024||Math.abs(n%32-p%32)>1||dist.has(n)||!pass(p,v.d)||!(msExitMovementMask(floor(n))&v.d))continue;dist.set(n,dist.get(p)!+1);q.push(n);}}return dist;}
let pulseMode=false;
function step(r:Run,d:number){if(pulseMode){tick(r,d,1);tick(r,0,3);}else tick(r,d,4);}
function go(x:number,y:number){const target=x+y*32,visits=new Map<string,number>();let count=0;while(run.session.state.internal.chipPos!==target&&count++<100){let best:{d:number,rank:number}|undefined;for(const d of[1,2,4,8,0]){const candidate={...run,inputs:[]};step(candidate,d);if(snapshot(candidate).status!=='playing')continue;const future={...candidate,inputs:[]};tick(future,0);if(snapshot(future).status!=='playing')continue;const p=candidate.session.state.internal.chipPos,dist=distance(candidate,target).get(p);if(dist===undefined)continue;const key=`${p}:${snapshot(candidate).currentTime%8}:${candidate.session.state.internal.creatures.map(a=>a.pos).join(',')}`;const rank=dist+(visits.get(key)??0)*10+(d===0?.3:0);if(!best||rank<best.rank)best={d,rank};}if(!best)throw new Error(`No safe one-step continuation toward ${x},${y}`);step(run,best.d);const p=run.session.state.internal.chipPos,key=`${p}:${snapshot(run).currentTime%8}:${run.session.state.internal.creatures.map(a=>a.pos).join(',')}`;visits.set(key,(visits.get(key)??0)+1);}
 console.log('WAYPOINT',x,y,'at',run.session.state.internal.chipPos,'tick',snapshot(run).currentTime,'chips',snapshot(run).chipsNeeded,'keys',snapshot(run).inventory.keys);if(count>=100)throw new Error('Waypoint safety policy stalled');}
try{
 // A: blue key inside the false wall, then both buried chips and the first door.
 for(const p of[[4,0],[4,2],[3,2],[2,2]])go(...p as[number,number]);
 tick(run,0,24); // Let the bug bounce off the still-covered chip before opening its alcove.
 for(const p of[[3,2],[4,2],[4,4],[4,3],[4,4],[4,2],[5,2],[6,2],[5,2],[6,2]])go(...p as[number,number]);
 // B: consume the permanently closing b-shaped chip cluster in a continuous pass.
 for(const p of[[7,1],[7,2],[7,3],[8,3],[9,3],[9,2],[8,2],[8,1],[10,3],[11,2],[12,2]])go(...p as[number,number]);
 // C: circle the teeth, collect the yellow key, then enter D.
 for(const p of[[14,2],[13,3],[14,3],[15,3],[16,3],[17,3],[17,0],[16,1],[15,1],[14,1],[13,1],[13,2],[17,2],[18,2],[19,2],[18,2],[19,2]])go(...p as[number,number]);
 for(const p of[[20,2],[20,3],[21,3],[21,2],[21,1],[21,0],[22,2],[23,2],[24,2],[23,2],[24,2]])go(...p as[number,number]);
 for(const p of[[24,3],[25,3],[26,3],[25,2],[24,1],[24,0],[25,0],[26,0],[26,1],[25,1],[26,2],[27,2],[28,2],[27,2],[28,2]])go(...p as[number,number]);
 for(const p of[[29,2],[29,3],[28,3],[29,3],[30,3],[30,1],[29,0],[28,0],[29,0],[31,4],[31,6]])go(...p as[number,number]);
 // L and K: collect the next yellow/blue keys before crossing into J.
 for(const p of[[30,6],[29,6],[28,6],[28,7],[29,7],[30,7],[30,8],[29,8],[28,8],[30,9],[30,10],[29,10],[28,10],[29,6],[27,6],[25,6],[26,8],[27,8],[26,8]])go(...p as[number,number]);
 for(const p of[[25,8],[24,8],[23,8],[23,7],[23,6],[25,9],[25,10],[23,10],[23,9],[21,6],[20,6],[21,6],[20,6]])go(...p as[number,number]);
 // J's three chips and red key fund its western gravel door.
 for(const p of[[19,6],[19,8],[19,9],[19,10],[16,6],[15,6]])go(...p as[number,number]);
 // I and H: follow the covered death-tile strokes once, preserving exits from each pocket.
 for(const p of[[14,6],[13,6],[12,6],[11,6],[11,7]])go(...p as[number,number]);
 for(const d of [4, 2, 4, 2, 8, 8, 8, 1, 1, 4, 4, 1, 2, 1, 1, 2, 2, 4])tick(run,d,4);
 for(const p of[[10,7],[9,7]])go(...p as[number,number]);
 // H: local semantic model found a bounded teeth-lure route; replayed stepwise
 // against the production engine before adopting these exact four-tick inputs.
 for(const d of [4, 4, 2, 2, 2, 1, 2, 4, 4, 4, 4, 1, 2, 1, 8, 8, 8, 4, 8, 1, 1, 2, 0, 2, 2, 1, 1, 1, 1, 1, 1, 4, 4, 8, 8, 1, 1, 1, 1, 1, 4, 2, 2, 2, 0, 0, 2])tick(run,d,4);
 console.log('H EXIT',snapshot(run).currentTime,snapshot(run).chipsNeeded,run.session.state.internal.chipPos);
 // G fire boots and six chips, then M's one-use m stroke and blue key.
 for(const p of[[3,7],[3,8],[1,6],[1,7],[1,8],[1,9],[2,9],[3,9],[4,7],[5,7],[4,7],[3,7],[0,12],[0,16],[1,16],[1,15],[1,14],[2,14],[3,14],[3,15],[3,16],[4,16],[4,15],[4,14],[5,14],[5,15],[5,16],[6,16],[8,15],[9,15],[8,15],[9,15]])go(...p as[number,number]);
 // N: obtain red/yellow keys, sweep the temporary socket ring, then the red door chip.
 for(const p of[[10,15],[11,15],[11,16],[10,16],[9,16],[10,16],[11,16],[12,16],[12,15],[12,14],[11,14],[10,14]])go(...p as[number,number]);
 tick(run,0,8);go(10,13);
 // Release the glider into O's north bomb, then finish I from its lower doorway.
 for(const p of[[11,13],[12,12],[13,12],[14,12],[13,12],[14,12],[15,12]])go(...p as[number,number]);
 for(const p of[[15,13],[15,14],[16,14],[16,15],[15,15],[16,15],[16,14],[17,14],[18,14],[19,14],[20,14],[21,14],[20,14],[21,14],[22,14],[23,14],[22,14],[23,14]])go(...p as[number,number]);
 // P: expose the blue false-wall chips and walk each row a second time.
 for(const d of [1, 2, 2, 2, 8, 8, 8, 4, 4, 2, 2, 2, 8, 8, 8, 2, 2, 2, 1, 1, 8, 8, 8, 4, 8])tick(run,d,4);
 pulseMode=true;
 for(const p of[[26,14],[26,13],[26,15],[26,14]])go(...p as[number,number]);
 // Take the buried door chip last, then leave the ice ring ahead of the freed teeth.
 tick(run,0,10);tick(run,2);tick(run,0,3);tick(run,8);tick(run,0,3);tick(run,0,2);tick(run,8);tick(run,0,3);
 console.log('Q EXIT',snapshot(run).currentTime,snapshot(run).chipsNeeded,run.session.state.internal.chipPos);
 pulseMode=false;
 for(const p of[[29,14],[29,13],[29,14],[29,15],[29,16],[29,17],[29,18]])go(...p as[number,number]);
 // Open the green-door elbow while its remaining buried chip holds back the pursuers.
 for(const p of[[30,18],[29,18],[29,19],[29,20]])go(...p as[number,number]);
 // S: collect the key as part of the circuit, then draw the four teeth away
 // from the two green-door chips and Q's dead-end extension before returning.
 for(const d of [1, 4, 2, 2, 2, 1, 2, 4, 4, 8, 4, 8, 4, 1, 4, 2, 4, 4, 2, 1, 0, 1, 2, 8, 1, 1, 8, 8, 1, 8, 1, 4, 4, 4, 8, 8, 1, 1, 8, 2, 4, 4, 2, 4, 0, 2, 2, 2, 2, 4, 4, 2, 2, 8, 2])tick(run,d,4);
 console.log('S EXIT',snapshot(run).currentTime,snapshot(run).chipsNeeded,run.session.state.internal.chipPos);
 // T's key and seven lower chips before the blue door.
 for(const p of[[21,23],[20,23],[19,23],[19,22],[19,21],[19,20],[18,21],[19,21],[20,21],[19,21],[19,22],[19,23],[19,24],[19,25],[18,25],[17,26],[16,26],[17,26],[16,26]])go(...p as[number,number]);
 // V's three tank lanes stay horizontal; cross at their clear endpoints.
 for(const p of[[15,26],[14,26],[13,26],[12,26],[11,26],[11,24],[12,24],[13,24],[13,22],[12,22],[11,22],[11,23],[11,24],[11,26],[10,26],[9,26],[10,26],[9,26]])go(...p as[number,number]);
 // W: exact local route uses gravel anchors and the westward slide.
 for(const d of [2, 1, 1, 2, 2, 2, 1, 1, 4, 4, 4, 4, 8, 8, 1, 1, 8, 8, 1, 1, 2, 1, 2, 8, 2, 2, 2, 1, 1]){tick(run,d);tick(run,0,3);}
 console.log('W EXIT',snapshot(run).currentTime,snapshot(run).chipsNeeded,run.session.state.internal.chipPos);
 // Lure the teeth off the checkerboard before crossing the upper corridor.
 go(6,19);tick(run,0,4);
 for(const p of[[7,19],[8,19],[7,19],[7,18],[6,18],[7,18],[8,18],[9,18],[10,18]])go(...p as[number,number]);
 for(const d of [4, 8, 8, 1, 4, 2, 8, 8, 8, 8])tick(run,d,4);
 // Collect U and open the T corridor, then draw its Tooth west.
 for(const d of [8, 1, 2, 1, 4, 4, 4, 4, 1, 8, 1, 4, 8, 4, 1, 1, 1, 1, 8, 8, 8, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4, 0, 0, 0, 0, 0, 1])tick(run,d,4);
 // Use the green-door chips as barriers while preparing the lower rooms.
 for(const p of [[4,18],[3,18],[2,18],[1,18],[0,18],[0,19],[0,20],[0,21],[0,22]])go(...p as[number,number]);
 // Keep the three approaching Teeth west of the W entrance before descending.
 tick(run,0,16);for(const p of[[0,23],[1,23],[2,23],[3,23],[3,22],[3,21],[2,21],[2,22],[3,22],[3,23],[3,24]])go(...p as[number,number]);
for(const p of[[3,23],[2,23],[2,22],[2,21],[3,21],[3,22],[3,23],[2,23],[1,23]])go(...p as[number,number]);
tick(run,2,4);tick(run,1,4);tick(run,0,16);for(const p of[[0,23],[1,23],[2,23],[3,23],[3,24],[3,25],[3,26],[3,27],[3,28],[4,29],[4,30],[5,30],[6,30],[7,30],[8,30],[8,29],[6,29]])go(...p as[number,number]);
for(const d of[8,8,4,4,2,2,2,1,2,2,2,1,2]){tick(run,d);tick(run,0,3);}
for(const p of[[1,28],[1,27],[1,26],[1,25],[0,25],[0,26],[0,27],[0,28],[0,29],[0,30],[0,31],[1,31],[1,30]])go(...p as[number,number]);
for(const d of[4,8,4,1,1,1,1,1,4,4,4,1,2,1,1,8,8,1]){tick(run,d);tick(run,0,3);}
for(const p of[[3,23],[0,23],[0,22],[0,21],[0,20],[0,19],[1,19],[2,19],[1,19],[0,19],[0,18],[1,18],[2,18],[3,18],[4,18],[4,19],[4,18],[5,18],[6,18],[14,18],[17,18],[22,18],[22,21],[22,18],[14,18]])go(...p as[number,number]);
for(const p of[[0,19],[0,23],[1,23]])go(...p as[number,number]);
// Draw the green-passage Teeth upstairs, loop through W, then return behind them.
for(const d of[2, 0, 1, 0, 1, 0, 1, 0, 1, 2, 8, 8, 4, 1, 8, 8, 4, 8, 8, 2, 4, 4, 2, 8, 8, 8, 2, 4, 2, 4, 0, 8, 0, 4, 1, 1, 1, 8, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 4, 4, 4, 4])tick(run,d,4);
for(const p of[[1,23],[2,23],[3,23],[3,28],[8,31],[9,31],[10,31],[9,31],[10,31]])go(...p as[number,number]);
// X: traverse each closing wall-chip once, leaving a route around both Teeth.
// This local 45-move plan was checked stepwise against the full engine.
for(const d of[8, 1, 1, 1, 8, 8, 4, 8, 4, 8, 4, 2, 2, 8, 8, 8, 4, 8, 1, 8, 8, 8, 8, 1, 2, 1, 2, 2, 2, 4, 2, 4, 1, 2, 1, 1, 8, 8, 8, 8, 8, 8, 4, 4, 4])tick(run,d,4);
// Y: spend eight blue keys, return over the exposed chips, then finish Z.
for(const p of[[22, 31], [23, 31], [22, 31], [23, 31], [23, 30], [23, 29], [23, 28], [23, 27], [24, 27], [24, 26], [24, 25], [25, 25], [24, 25], [24, 26], [24, 27], [23, 27], [23, 28], [23, 29], [23, 30], [23, 31], [23, 30], [23, 29], [23, 28], [23, 27], [24, 27], [24, 26], [24, 25], [25, 25], [26, 25], [26, 26], [26, 27], [26, 28], [26, 29], [26, 30], [26, 31], [25, 31], [26, 31], [27, 31], [28, 31], [29, 31], [30, 31], [31, 31], [29, 30], [30, 29], [31, 28], [31, 27], [30, 27], [29, 27], [28, 27], [31, 27], [31, 26], [31, 25], [31, 24], [31, 23], [31, 22], [31, 21], [31, 20]])go(...p as[number,number]);
tick(run,1,4);
}catch(error){throw new Error('910 route did not complete', {cause:error});}
if(snapshot(run).status!=='completed')throw new Error('910 route did not reach completion');
await writeFile(join(ROOT,'web/public/dev/solutions/jacques/evidence/910-winning-route.json'),JSON.stringify({level:910,datSha256:run.loaded.datSha256,status:snapshot(run).status,tick:snapshot(run).currentTime,chipsRemaining:snapshot(run).chipsNeeded,inputs:run.inputs},null,2));
await writeFile('/tmp/jacques-910-progress.svg',await renderSvg(run));
if(snapshot(run).status==='completed')console.log(await saveWinningReplay(run,join(ROOT,'web/public/dev/solutions/jacques/replays/910.tws')));

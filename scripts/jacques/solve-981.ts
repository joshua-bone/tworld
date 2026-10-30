import{loadLevel,createRun,tick,snapshot,ROOT,saveWinningReplay}from'./harness';import{MS_TILE as T,isMsCreature}from'../../web/src/ruleset-ms/api/tiles';import{msChipMovementMask,msExitMovementMask}from'../../web/src/ruleset-ms/impl/catalog';import{writeFile}from'node:fs/promises';import{join}from'node:path';
const run=createRun(await loadLevel(981));const dirs=[{d:1,dx:0,dy:-1},{d:2,dx:-1,dy:0},{d:4,dx:0,dy:1},{d:8,dx:1,dy:0}];
function go(x:number,y:number){const target=x+y*32;let steps=0;while(run.session.state.internal.chipPos!==target&&snapshot(run).status==='playing'&&steps++<120){const cells=run.session.state.engine.map.cells,start=run.session.state.internal.chipPos,q=[start],prev=new Map<number,{p:number,d:number}>();prev.set(start,{p:-1,d:0});const floor=(p:number)=>isMsCreature(cells[p]!.top.id)?cells[p]!.bottom.id:cells[p]!.top.id;
 for(let i=0;i<q.length&&!prev.has(target);i++){const p=q[i]!;for(const v of dirs){const nx=p%32+v.dx,ny=Math.floor(p/32)+v.dy,n=nx+ny*32;if(nx<0||nx>31||ny<0||ny>31||prev.has(n))continue;const tile=floor(n);if(tile===T.Wall||tile===T.Socket&&snapshot(run).chipsNeeded>0||tile===T.Door_Green&&!snapshot(run).inventory.keys[3])continue;if(!(msExitMovementMask(floor(p))&v.d)||!(msChipMovementMask(tile)&v.d))continue;prev.set(n,{p,d:v.d});q.push(n);}}
 if(!prev.has(target))throw new Error(`No walk path to${x},${y} from${start}`);let n=target;while(prev.get(n)!.p!==start)n=prev.get(n)!.p;const old=snapshot(run).chipsNeeded;tick(run,prev.get(n)!.d,4);if(snapshot(run).chipsNeeded!==old)console.log('chip',run.session.state.internal.chipPos,'remaining',snapshot(run).chipsNeeded,'tick',snapshot(run).currentTime);
 }
 console.log('waypoint',x,y,'at',run.session.state.internal.chipPos,'tick',snapshot(run).currentTime,'status',snapshot(run).status,'teeth',run.session.state.internal.creatures.map(a=>a.pos));
}
// Collect the reusable green key and the three unguarded starting chips.
for(const p of[[16,26],[16,25],[16,26],[15,26],[16,26],[17,26],[16,26],[16,28],[19,27]])go(...p as[number,number]);
// Open the southeast inner chamber, draw its teeth up the outside loop, then enter behind it.
for(const p of[[19,22],[18,22],[19,22],[19,13],[17,12],[13,12],[13,16],[14,20],[17,20],[19,20],[18,22],[17,22],[17,24],[17,22],[19,22]]){go(...p as[number,number]);if(snapshot(run).status!=='playing')break;}
await writeFile(join(ROOT,'web/public/dev/solutions/jacques/evidence/981-route-attempt.json'),JSON.stringify({level:981,status:snapshot(run).status,tick:snapshot(run).currentTime,chipsRemaining:snapshot(run).chipsNeeded,inputs:run.inputs},null,2));
if(snapshot(run).status==='completed')console.log(await saveWinningReplay(run,join(ROOT,'web/public/dev/solutions/jacques/replays/981.tws')));

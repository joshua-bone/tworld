import{loadLevel,createRun,tick,snapshot,ROOT,saveWinningReplay}from'./harness';import{MS_TILE as T,isMsCreature}from'../../web/src/ruleset-ms/api/tiles';import{msChipMovementMask,msExitMovementMask}from'../../web/src/ruleset-ms/impl/catalog';import{writeFile,readFile}from'node:fs/promises';import{join}from'node:path';
const run=createRun(await loadLevel(981));const dirs=[{d:1,dx:0,dy:-1},{d:2,dx:-1,dy:0},{d:4,dx:0,dy:1},{d:8,dx:1,dy:0}];
function go(x:number,y:number){const target=x+y*32;let steps=0;while(run.session.state.internal.chipPos!==target&&snapshot(run).status==='playing'&&steps++<120){const cells=run.session.state.engine.map.cells,start=run.session.state.internal.chipPos,q=[start],prev=new Map<number,{p:number,d:number}>();prev.set(start,{p:-1,d:0});const floor=(p:number)=>isMsCreature(cells[p]!.top.id)?cells[p]!.bottom.id:cells[p]!.top.id;
 for(let i=0;i<q.length&&!prev.has(target);i++){const p=q[i]!;for(const v of dirs){const nx=p%32+v.dx,ny=Math.floor(p/32)+v.dy,n=nx+ny*32;if(nx<0||nx>31||ny<0||ny>31||prev.has(n))continue;const tile=floor(n);if(tile===T.Wall||tile===T.Socket&&snapshot(run).chipsNeeded>0||tile===T.Door_Green&&!snapshot(run).inventory.keys[3])continue;if(!(msExitMovementMask(floor(p))&v.d)||!(msChipMovementMask(tile)&v.d))continue;prev.set(n,{p,d:v.d});q.push(n);}}
 if(!prev.has(target))throw new Error(`No walk path to${x},${y} from${start}`);let n=target;while(prev.get(n)!.p!==start)n=prev.get(n)!.p;const old=snapshot(run).chipsNeeded;tick(run,prev.get(n)!.d,4);if(snapshot(run).chipsNeeded!==old)console.log('chip',run.session.state.internal.chipPos,'remaining',snapshot(run).chipsNeeded,'tick',snapshot(run).currentTime);
 }
 console.log('waypoint',x,y,'at',run.session.state.internal.chipPos,'tick',snapshot(run).currentTime,'status',snapshot(run).status,'teeth',run.session.state.internal.creatures.map(a=>a.pos));
}
// Collect the key and three starting chips, then open the southeast inner door.
for(const p of [[16,26],[16,25],[16,26],[15,26],[16,26],[17,26],[16,26],[16,28],[19,27],[19,22],[18,22],[19,22]])go(...p as [number,number]);
// Local loop found within the documented 20k-node / 45-second search bound.
for(const d of [4,8,8,8,1,8,2,2,2,2,4,4,1,1,8,1,1,1,1,8])tick(run,d,4);
// Hand-derived dodge loop: lead the free teeth onto the East thin wall at21,20.
for(const d of [8,8,2,2,4,4,4,4,8,8,8,8,8,1,1,2,2]){tick(run,d,4);console.log("lure",snapshot(run).currentTime,run.session.state.internal.chipPos,snapshot(run).status,run.session.state.internal.creatures.map(c=>c.pos));}
await writeFile(join(ROOT,"web/public/dev/solutions/jacques/evidence/981-partial-route.json"),JSON.stringify({level:981,datSha256:run.loaded.datSha256,probeOnlyNotWinning:true,status:snapshot(run).status,inputs:run.inputs,tick:snapshot(run).currentTime,chipsRemaining:snapshot(run).chipsNeeded,teeth:run.session.state.internal.creatures.map(c=>({x:c.pos%32,y:Math.floor(c.pos/32)}))},null,2));

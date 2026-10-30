/** Bounded waypoint navigation; graph paths are plans, engine/native outcomes are authority. */
import {loadLevel,createRun,tick,snapshot,saveWinningReplay,ROOT,type Run}from'./harness';
import{MS_TILE as T,isMsCreature}from'../../web/src/ruleset-ms/api/tiles';
import{msChipMovementMask,msExitMovementMask}from'../../web/src/ruleset-ms/impl/catalog';
import{writeFile,mkdir}from'node:fs/promises';import{join}from'node:path';
const dirs=[1,2,4,8],back:Record<number,number>={1:4,4:1,2:8,8:2};
const delta:Record<number,number>={1:-32,2:-1,4:32,8:1};
const neighbor=(p:number,d:number)=>{const n=p+delta[d]!;return n<0||n>=1024||Math.abs(n%32-p%32)>1?-1:n;};
function plan(run:Run,goals:Set<number>){
 const cells=run.session.state.engine.map.cells,inventory=run.session.state.engine.inventory;
 const floor=cells.map(c=>isMsCreature(c.top.id)?c.bottom.id:c.top.id);
 const arrivalFloor=(p:number)=>[T.ICChip,T.Boots_Water,T.Dirt].includes(floor[p]! as any)?cells[p]!.bottom.id:floor[p];
 const pass=(p:number,n:number,d:number)=>n>=0&&(msExitMovementMask(floor[p]!)&d)!==0&&(msChipMovementMask(floor[n]!)&d)!==0&&![T.Fire,T.Bomb,T.Beartrap,T.CloneMachine,T.BlueWall_Real,T.HiddenWall_Perm,T.Wall].includes(floor[n]! as any)&&(floor[n]!==T.Water||!!inventory.boots[3])&&(floor[n]!==T.Socket||inventory.chipsNeeded===0);
 const start=run.session.state.internal.chipPos,forced=run.session.state.internal.floorMovement==='ice'?run.session.state.internal.floorMovementDir:0,key=`${start}:${forced}`;
 const q=[key],prev=new Map<string,{from:string,d:number}>();prev.set(key,{from:'',d:0});
 let found:string|null=null;
 for(let i=0;i<q.length;i++){const k=q[i]!,[p,f]=k.split(':').map(Number) as[number,number];if(goals.has(p)){found=k;break;}
  for(let d of f?[f]:dirs){let n=neighbor(p,d);if(!pass(p,n,d)){if(!f)continue;d=back[d]!;n=neighbor(p,d);if(!pass(p,n,d))continue;}
   if(floor[n]===T.Teleport){let selected=-1;for(let off=1;off<=1024;off++){const tp=(n-off+1024)%1024;if(floor[tp]!==T.Teleport)continue;const exit=neighbor(tp,d);if(pass(tp,exit,d)){selected=exit;break;}}if(selected>=0)n=selected;}
   const nf=arrivalFloor(n)===T.Ice?d:0,nk=`${n}:${nf}`;if(!prev.has(nk)){prev.set(nk,{from:k,d:f?0:d});q.push(nk);}
  }
 }
 if(!found)return null;const path:{pos:number,input:number}[]=[];let k=found;while(k!==key){const p=prev.get(k)!;path.unshift({pos:Number(k.split(':')[0]),input:p.d});k=p.from;}return path;
}
function advanceCell(run:Run,input:number){const start=run.session.state.internal.chipPos;const next={...run,inputs:run.inputs.slice()};for(let i=0;i<8;i++){tick(next,input);if(next.session.state.engine.status!=='playing'||next.session.state.internal.chipPos!==start)break;}return next;}
const number=Number(process.argv[2]??972);let run=createRun(await loadLevel(number));tick(run,0,Number(process.argv[3]??0));const skipped=new Set<number>();let attempts=0;let exitDelayApplied=false;
const initialGoals=number===974?new Set([12+7*32]):null;
while(attempts++<3000&&snapshot(run).status==='playing'){
 if(snapshot(run).chipsNeeded===0&&!exitDelayApplied){tick(run,0,Number(process.argv[4]??0));exitDelayApplied=true;}
 const needsFlippers=number===974&&!run.session.state.engine.inventory.boots[3];
 const goals=needsFlippers?initialGoals!:new Set(run.session.state.engine.map.cells.filter(c=>c.top.id===T.ICChip&&!skipped.has(c.position.pos)).map(c=>c.position.pos));
 if(!goals.size)goals.add(29+30*32);
 const path=plan(run,goals);if(!path||!path.length){console.log('no path',snapshot(run).currentTime,'chips',snapshot(run).chipsNeeded,'at',run.session.state.internal.chipPos);break;}
 const before=run.session.state.internal.chipPos;let trial=advanceCell(run,path[0]!.input);
 if(snapshot(trial).status==='failed'){
  let rescued=false;
  for(const wait of[2,4,6,8,12]){let delayed={...run,inputs:run.inputs.slice()};tick(delayed,0,wait);if(snapshot(delayed).status!=='playing')continue;const newPath=plan(delayed,goals);if(!newPath?.length)continue;delayed=advanceCell(delayed,newPath[0]!.input);if(snapshot(delayed).status!=='failed'){trial=delayed;rescued=true;break;}}
  if(!rescued){console.log('timing failed',snapshot(run).currentTime,before,path[0]);break;}
 }
 if(trial.session.state.internal.chipPos===before){console.log('blocked',before,path[0]);skipped.add(path.at(-1)!.pos);if(skipped.size>40)break;}else{const old=snapshot(run).chipsNeeded;run=trial;if(snapshot(run).chipsNeeded!==old)console.log('pickup',run.session.state.internal.chipPos,'remaining',snapshot(run).chipsNeeded,'tick',snapshot(run).currentTime);}
 if(run.inputs.length>12000)break;
}
const output=join(ROOT,'web/public/dev/solutions/jacques/evidence');await mkdir(output,{recursive:true});await writeFile(join(output,`${number}-navigation-attempt.json`),JSON.stringify({level:number,result:snapshot(run).status,chipsRemaining:snapshot(run).chipsNeeded,tick:snapshot(run).currentTime,attempts,inputs:run.inputs},null,2));
if(snapshot(run).status==='completed')console.log(await saveWinningReplay(run,join(ROOT,`web/public/dev/solutions/jacques/replays/${number}.tws`)));
console.log('final',number,snapshot(run).status,snapshot(run).chipsNeeded,snapshot(run).currentTime,run.session.state.internal.chipPos);

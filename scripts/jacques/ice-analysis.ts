import {loadLevel,createRun,ROOT}from'./harness';
import{MS_TILE as T,isMsCreature}from'../../web/src/ruleset-ms/api/tiles';
import{writeFile}from'node:fs/promises';
import{join}from'node:path';
const vectors=[{d:1,dx:0,dy:-1},{d:2,dx:-1,dy:0},{d:4,dx:0,dy:1},{d:8,dx:1,dy:0}];const back:any={1:4,4:1,2:8,8:2};
for(const n of[972,974]){
 const loaded=await loadLevel(n),run=createRun(loaded),cells=loaded.level.cells;
 const floor=cells.map(c=>isMsCreature(c.top.id)?c.bottom.id:c.top.id);
 const walls=new Set<number>([T.Wall,T.BlueWall_Real,T.HiddenWall_Perm]);
 const seen=new Set<string>(),q=[`${run.session.state.internal.chipPos}:0`];
 const prev=new Map<string,string>();
 function neighbor(p:number,d:number){const v=vectors.find(v=>v.d===d)!;const x=p%32+v.dx,y=Math.floor(p/32)+v.dy;return x<0||x>31||y<0||y>31?-1:x+y*32;}
 function push(from:string,p:number,d:number){const key=`${p}:${d}`;if(!seen.has(key)){seen.add(key);q.push(key);prev.set(key,from);}}
 for(let i=0;i<q.length;i++){
  const key=q[i]!,[p,dir]=key.split(':').map(Number) as[number,number];
  if(floor[p]===T.Teleport)for(let t=0;t<floor.length;t++)if(floor[t]===T.Teleport&&t!==p)push(key,t,0);
  if(dir===0){for(const v of vectors){const target=neighbor(p,v.d);if(target>=0&&!walls.has(floor[target]!))push(key,target,floor[target]===T.Ice?v.d:0);}}
  else{let target=neighbor(p,dir),d=dir;if(target<0||walls.has(floor[target]!)){d=back[dir];target=neighbor(p,d);}if(target>=0&&!walls.has(floor[target]!))push(key,target,floor[target]===T.Ice?d:0);else push(key,p,d);}
 }
 const reachable=new Set([...seen].map(s=>Number(s.split(':')[0])));
 const chips=cells.filter(c=>c.top.id===T.ICChip||c.bottom.id===T.ICChip);
 const unreachable=chips.filter(c=>!reachable.has(c.position.pos)).map(c=>c.position);
 const evidence={level:n,model:'optimistic plain-ice directional reachability, ignoring actors, keys, sockets, thin walls and pickup consumption; teleports connect freely; water always passable, fake walls removable',states:seen.size,unreachableChips:unreachable};
 await writeFile(join(ROOT,`web/public/dev/solutions/jacques/evidence/${n}-optimistic-ice.json`),JSON.stringify(evidence,null,2));console.log(evidence);
}

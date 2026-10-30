// From web/: node_modules/.bin/vite-node ../docs/solutions/jacques/analysis/early/931-reproduce-cut.ts
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadLevel,createRun,renderSvg} from '../../../../../scripts/jacques/harness';
import {MS_TILE as T} from '../../../../../web/src/ruleset-ms/api/tiles';
const loaded=await loadLevel(931),run=createRun(loaded),cells=run.session.state.engine.map.cells;
const p=(x:number,y:number)=>x+32*y,ids=(x:number,y:number)=>[cells[p(x,y)].top.id,cells[p(x,y)].bottom.id],xy=(n:number)=>[n%32,Math.floor(n/32)];
assert.equal(run.session.state.internal.chipPos,p(0,3));
for(let y=27;y<=31;y++)for(let x=18;x<=31;x++)assert.ok(ids(x,y).every(id=>id!==T.Teleport&&(id<2||id>11)));
const chips=cells.reduce((n,c)=>n+Number(c.top.id===T.ICChip)+Number(c.bottom.id===T.ICChip),0);
assert.equal(chips,621);assert.equal(loaded.metadata.chipsRequired,599);
assert.ok(cells.every(c=>c.top.id!==T.Boots_Water&&c.bottom.id!==T.Boots_Water));
const oddWater:number[]=[];
for(let x=20;x<=30;x++){assert.equal(cells[p(x,27)].top.id,T.Wall);for(let y=28;y<=31;y++){assert.deepEqual(ids(x,y),[T.Water,T.ICChip]);if(y%2)oddWater.push(p(x,y));}}
for(const y of[29,31]){assert.deepEqual(ids(18,y),[T.Block+3,T.CloneMachine]);assert.deepEqual(ids(19,y),[T.ICChip,T.Empty]);}
assert.deepEqual(ids(0,25),[T.BlueWall_Fake,T.Empty]);assert.deepEqual(ids(0,27),[T.BlueWall_Fake,T.Empty]);assert.deepEqual(ids(1,26),[T.BlueWall_Fake,T.ICChip]);assert.deepEqual(ids(0,26),[T.Walker,T.BlueWall_Fake]);
assert.ok(run.session.state.internal.creatures.some(c=>c.id===T.Walker&&c.pos===p(0,26)&&!c.hidden));
assert.deepEqual(cells.flatMap((c,i)=>c.top.id===T.Exit||c.bottom.id===T.Exit?[i]:[]),[p(0,1),p(29,18)]);
assert.equal(cells[p(0,0)].top.id,T.Wall);assert.equal(cells[p(0,2)].top.id,T.BlueWall_Real);assert.equal(cells[p(1,1)].top.id,T.Socket);
// Block only exposed immutable walls, never covered walls.
const walls=new Set([T.Wall,T.HiddenWall_Perm,T.HiddenWall_Temp,T.BlueWall_Real]),component=new Set([p(29,18)]),queue=[...component];
for(const q of queue)for(const n of[q-32,q+32,...(q%32?[q-1]:[]),...(q%32<31?[q+1]:[])]){if(n<0||n>=1024||component.has(n)||walls.has(cells[n].top.id))continue;component.add(n);queue.push(n);}
assert.deepEqual([...component].sort((a,b)=>a-b),[p(28,18),p(29,18),p(29,19),p(29,20)].sort((a,b)=>a-b));
assert.ok(!component.has(run.session.state.internal.chipPos));assert.ok([...component].every(q=>![cells[q].top.id,cells[q].bottom.id].includes(T.Teleport)));
const evidence={level:931,datSha256:loaded.datSha256,chipsPresent:chips,chipsRequired:599,noFlippers:true,oddWaterChips:oddWater.map(xy),boxedWalker:[0,26],fatalChipForWinningPlay:[1,26],secondaryExitComponent:[...component].map(xy),winningPlayChipUpperBound:598,note:'The bound requires the accompanying source-level invariants; map assertions alone are not a proof.'};
await writeFile(new URL('./931-cut.json',import.meta.url),JSON.stringify(evidence,null,2));
let svg=await renderSvg(run,{title:'931 AGE DJ: red = boxed Walker; orange = inaccessible odd water rows'});
const box=(x:number,y:number,w:number,h:number,color:string)=>`<rect x="${20+x*32}" y="${40+y*32}" width="${w*32}" height="${h*32}" fill="none" stroke="${color}" stroke-width="4"/>`;
svg=svg.slice(0,-6)+box(0,25,2,3,'#ff4242')+box(20,29,11,1,'#ffb23e')+box(20,31,11,1,'#ffb23e')+box(28,18,2,3,'#6acbff')+'</svg>';
await writeFile(new URL('./931-cut.svg',import.meta.url),svg);console.log(JSON.stringify(evidence));

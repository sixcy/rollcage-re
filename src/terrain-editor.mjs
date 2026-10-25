import {parseScene} from './scene.mjs';
import {parseCollisionGrid} from './collision-grid.mjs';
import {buildTerrainCandidates} from './terrain-candidates.mjs';
import {compileSpeedPadPatterns,speedPadPatterns} from './speed-pad-patterns.mjs';

export const emptyTerrainDraft=()=>({heights:[],surfaces:[]});
const key=(s,v)=>`${s}:${v}`;
const append=(data,bytes)=>{const offset=Math.ceil(data.length/4)*4,out=Buffer.alloc(offset+bytes.length);if(out.length>128*1024*1024)throw Error('Terrain resource exceeds 128 MiB.');out.set(data);out.set(bytes,offset);return {data:out,offset};};
const fields=(value,keys)=>value&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const subtract=(a,b)=>a.slice(0,3).map((n,i)=>n-b[i]);
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);

export function inspectTerrain(data) {
  const scene=parseScene(data),vertices=new Map(),parents=new Map(),storage=new Map(),edges=new Map(),locked=new Set();
  const root=id=>{let p=parents.get(id);if(p!==id){p=root(p);parents.set(id,p);}return p;};
  const union=(a,b)=>{a=root(a);b=root(b);if(a!==b)parents.set(b,a);};
  for(const s of scene.segments){
    if(data[s.offset+6]&63)locked.add(s.index);
    for(const [i,p]of s.vertices.entries()){
      const id=key(s.index,i),offset=s.verticesOffset+i*8;parents.set(id,id);vertices.set(id,{sector:s.index,vertex:i,position:p.slice(0,3),offset});
      if(storage.has(offset))union(id,storage.get(offset));else storage.set(offset,id);
    }
    const edge=(a,b)=>{const pa=s.vertices[a].slice(0,3).join(','),pb=s.vertices[b].slice(0,3).join(','),id=[pa,pb].sort().join(':');if(!edges.has(id))edges.set(id,[]);edges.get(id).push({sector:s.index,a:key(s.index,a),b:key(s.index,b),pa,pb});};
    for(let col=0;col<s.columns;col++){edge(col,col+1);const start=s.rows*(s.columns+1)+col;edge(start,start+1);}
    for(let row=0;row<s.rows;row++){const start=row*(s.columns+1);edge(start,start+s.columns+1);edge(start+s.columns,start+2*s.columns+1);}
  }
  // 44a5c0's authored animation cells, separate from 494c80 sector flags.
  const count=data[0xfc],base=data.readUInt32LE(0x100);
  if(count&&base+count*4>data.length)throw Error('Terrain animation cells exceed resource bounds.');
  for(let i=0;i<count;i++)locked.add(data[base+i*4+2]);
  const neighbors=new Map(scene.segments.map(s=>[s.index,new Set()]));
  for(const list of edges.values())if(list.length===2&&list[0].sector!==list[1].sector){const [a,b]=list;union(a.a,a.pa===b.pa?b.a:b.b);union(a.b,a.pb===b.pb?b.b:b.a);neighbors.get(a.sector).add(b.sector);neighbors.get(b.sector).add(a.sector);}
  const seams=new Map();for(const id of vertices.keys()){const r=root(id);if(!seams.has(r))seams.set(r,[]);seams.get(r).push(id);}
  const seamFor=new Map();for(const group of seams.values())for(const id of group)seamFor.set(id,group);
  const isLocked=id=>seamFor.get(id)?.some(ref=>locked.has(vertices.get(ref).sector));
  return {scene,vertices,seamFor,neighbors,locked,isLocked};
}

export function validateTerrainDraft(data,draft=emptyTerrainDraft(),info=inspectTerrain(data)) {
  if((!fields(draft,['heights','surfaces'])&&!fields(draft,['heights','surfaces','patterns']))||!Array.isArray(draft.heights)||!Array.isArray(draft.surfaces)||draft.patterns!==undefined&&!Array.isArray(draft.patterns))throw Error('Invalid terrain draft.');
  const heights=[],surfaces=[],seen=new Set(),sourceSeen=new Map();
  for(const row of draft.heights){
    if(!fields(row,['sector','vertex','height'])||!Number.isInteger(row.sector)||!Number.isInteger(row.vertex)||!Number.isInteger(row.height)||row.height< -32768||row.height>32767)throw Error('Terrain height requires a valid vertex and signed 16-bit value.');
    const id=key(row.sector,row.vertex),v=info.vertices.get(id);if(!v||seen.has(id))throw Error('Missing or duplicate terrain vertex.');seen.add(id);
    if(info.isLocked(id))throw Error('Animated terrain and its linked seams are locked.');
    const previous=sourceSeen.get(v.offset);if(previous!==undefined&&previous!==row.height)throw Error('Shared terrain storage has conflicting heights.');sourceSeen.set(v.offset,row.height);
    heights.push({...row});
  }
  const byId=new Map(heights.map(row=>[key(row.sector,row.vertex),row.height]));
  for(const row of heights)for(const ref of info.seamFor.get(key(row.sector,row.vertex))){const original=info.vertices.get(ref).position[1];if((byId.get(ref)??original)!==row.height)throw Error('Terrain seam heights must remain linked.');}
  seen.clear();
  for(const row of draft.surfaces){
    if(!fields(row,['sector','cell','sourceSector','sourceCell'])||Object.values(row).some(n=>!Number.isInteger(n)))throw Error('Invalid terrain surface reference.');
    const cell=info.scene.segments[row.sector]?.faces[row.cell],source=info.scene.segments[row.sourceSector]?.faces[row.sourceCell],id=key(row.sector,row.cell);
    if(!cell||!source||seen.has(id))throw Error('Missing or duplicate terrain surface cell.');seen.add(id);
    if(info.locked.has(row.sector))throw Error('Animated terrain surfaces are locked.');
    if(info.locked.has(row.sourceSector)||(source.pageWord&~0x7f))throw Error('Animated or packed surface preset is unsupported.');
    surfaces.push({...row});
  }
  return {heights:heights.sort((a,b)=>a.sector-b.sector||a.vertex-b.vertex),surfaces:surfaces.sort((a,b)=>a.sector-b.sector||a.cell-b.cell),...(draft.patterns?{patterns:structuredClone(draft.patterns)}:{})};
}

function packedNormal(points,old) {
  let n=cross(subtract(points[1],points[0]),subtract(points[2],points[0])),length=Math.hypot(...n);
  if(length<1e-8)throw Error('Terrain edit creates a degenerate collision face.');
  if(old[1]&&n[1]){if(Math.sign(n[1])!==Math.sign(old[1]))n=n.map(v=>-v);}else if(dot(n,old)<0)n=n.map(v=>-v);
  const q=n.map(v=>Math.round(v/length*256));return (((q[0]&1023)<<20)|((q[1]&1023)<<10)|(q[2]&1023))>>>0;
}

// Offline editor compiler, not a reconstruction of the original track builder.
// Existing XZ topology remains fixed. 4287f0's existing height chains receive
// conservative region membership; route fallback/model-list words stay intact.
function extendHeightCoverage(data,grid,changed) {
  const regionMap=new Map(grid.regions.map(r=>[r.index,r])),zoneMap=new Map(grid.zones.map(z=>[z.root,z]));
  const extra=new Map(grid.spatial.nodes.map(n=>[n.index,new Map()]));
  const affected=region=>changed.has(region.index);
  for(const row of grid.spatial.rows)for(let i=0;i<row.cells;i++){
    let index=data.readUInt16LE(row.mapPointer+i*2)/12;const chain=[];
    do{chain.push(index);}while(grid.spatial.nodes[index++].continues);
    const regions=new Map();for(const n of chain)for(const id of zoneMap.get(grid.spatial.nodes[n].zone).regions){const r=regionMap.get(id);if(affected(r))regions.set(id,r);}
    for(const n of chain)for(const [id,r]of regions)extra.get(n).set(id,r);
  }
  const bytes=[],groups=new Map(),roots=[];
  for(const node of grid.spatial.nodes){
    const original=zoneMap.get(node.zone).regions,ids=[...new Set([...original,...extra.get(node.index).keys()])];
    if(ids.length>128)throw Error('Height edit exceeds the native 128-region spatial group limit.');
    const signature=ids.join(',');let root=groups.get(signature);
    if(root===undefined){root=bytes.length/6;if(root>16383)throw Error('Height edit exceeds the native spatial-region offset limit.');groups.set(signature,root);
      for(const [i,id]of ids.entries()){
        const r=regionMap.get(id),raw=Buffer.from(data.subarray(r.offset,r.offset+6));raw.writeUInt16LE((r.control&0x1ff)|(i===0?(ids.length-1)<<9:0),2);
        const delta=changed.get(r.index)??0,padding=r.padding+delta;if(padding>255)throw Error('Height change exceeds this collision region’s padding capacity. Reduce the height difference.');raw[4]=padding;
        bytes.push(...raw);
      }
    }roots.push(root);
  }
  const added=append(data,Buffer.from(bytes));data=added.data;data.writeUInt32LE(added.offset,0x28);
  for(const [i,root]of roots.entries()){const node=grid.spatial.nodes[i];data.writeUInt32LE(((node.referenceWord&0xc000ffff)|(root<<16))>>>0,node.offset+4);}
  return data;
}

export function compileTerrainEdits(source,draft=emptyTerrainDraft(),{validateContacts=true,originalGeometry=source,patterns}={}) {
  if(fields(draft,['heights','surfaces'])&&Array.isArray(draft.heights)&&Array.isArray(draft.surfaces)&&!draft.heights.length&&!draft.surfaces.length)return Buffer.from(source);
  const info=inspectTerrain(source),checked=validateTerrainDraft(source,draft,info);
  const heights=checked.heights.filter(r=>info.vertices.get(key(r.sector,r.vertex)).position[1]!==r.height),surfaces=checked.surfaces.filter(r=>info.scene.segments[r.sector].faces[r.cell].textureRecord!==info.scene.segments[r.sourceSector].faces[r.sourceCell].textureRecord);
  const finish=data=>compileSpeedPadPatterns(data,checked.patterns??[],{originalGeometry,patterns:patterns??speedPadPatterns(originalGeometry,originalGeometry),locked:info.locked});
  if(!heights.length&&!surfaces.length)return finish(Buffer.from(source));
  let data=Buffer.from(source);const changed=new Map(),changedVertices=new Set();
  for(const row of heights){const v=info.vertices.get(key(row.sector,row.vertex));data.writeInt16LE(row.height,v.offset+2);changedVertices.add(v.offset);changed.set(row.sector,Math.max(changed.get(row.sector)??0,Math.abs(row.height-v.position[1])));}
  for(const row of surfaces){const sector=info.scene.segments[row.sector],preset=info.scene.segments[row.sourceSector].faces[row.sourceCell];data.writeUInt32LE(preset.textureRecord,sector.packetsOffset+row.cell*8+4);}
  if(!heights.length)return finish(data);
  const grid=parseCollisionGrid(source);if(!grid.available)throw Error('Terrain height editing requires collision spatial data.');
  const edited=parseScene(data),normalWords=grid.normals.map(n=>n.packed),pairs=new Map(),touched=[];
  const pair=(a,b)=>{const id=`${a}:${b}`;if(pairs.has(id))return pairs.get(id);const index=normalWords.length;if(index+1>65534)throw Error('Terrain edit exceeds native normal-index capacity.');normalWords.push(a,b);pairs.set(id,index);return index;};
  for(const s of edited.segments){
    if(!changed.has(s.index))continue;
    const original=info.scene.segments[s.index],oldMax=Math.max(...original.vertices.map(v=>v[1])),newMax=Math.max(...s.vertices.map(v=>v[1])),margin=Math.max(0,source.readInt16LE(s.offset+0x14)-oldMax),height=newMax+margin;
    if(height>32767)throw Error('Terrain sector recovery height exceeds signed 16-bit storage.');data.writeInt16LE(height,s.offset+0x14);
    for(const cell of grid.sectors[s.index].cells){
      const face=original.faces[cell.index];if(!face.gridIndices.some(v=>changedVertices.has(original.verticesOffset+v*8)))continue;
      if(!cell.covered)continue;const [tl,tr,bl,br]=face.gridIndices,indices=face.vertexFlags&4?[[tl,tr,bl],[tr,br,bl]]:[[tl,tr,br],[tl,br,bl]],old=grid.normals[cell.rawNormalIndex];
      const normals=indices.map((ids,i)=>(packedNormal(ids.map(v=>s.vertices[v]),grid.normals[cell.forms[Math.min(i,cell.forms.length-1)].normal].components)|(old.packed&0xc0000000))>>>0);
      const normalIndex=pair(...normals);data.writeUInt16LE(normalIndex,s.packetsOffset+cell.index*8+2);const flagsOffset=s.verticesOffset+br*8+6;data.writeUInt16LE(data.readUInt16LE(flagsOffset)|2,flagsOffset);touched.push({sector:s.index,cell:cell.index});
    }
  }
  const bytes=Buffer.alloc(normalWords.length*4);normalWords.forEach((n,i)=>bytes.writeUInt32LE(n>>>0,i*4));const added=append(data,bytes);data=added.data;data.writeUInt32LE(added.offset,0x34);data.writeUInt32LE(normalWords.length,0x38);
  const regionChanges=new Map();for(const r of grid.regions){if(!changed.has(r.sector))continue;const s=edited.segments[r.sector],original=info.scene.segments[r.sector];let delta=0;
    for(let row=r.row;row<=r.row+r.rows;row++)for(let col=r.column;col<=r.column+r.columns;col++){const v=row*(s.columns+1)+col;delta=Math.max(delta,Math.abs(s.vertices[v][1]-original.vertices[v][1]));}
    if(delta)regionChanges.set(r.index,delta);
  }
  data=extendHeightCoverage(data,grid,regionChanges);
  const result=parseCollisionGrid(data);
  if(validateContacts)for(const {sector,cell}of touched){const s=result.sectors[sector],c=s.cells[cell];for(const form of c.forms){
    const points=form.indices.map(i=>s.vertices[i]),center=[0,1,2].map(axis=>points.reduce((sum,p)=>sum+p[axis],0)/points.length),normal=result.normals[form.normal].components;
    const body={flags:3,position:center.map((v,i)=>Math.round((v+normal[i]/8)*65536)),linearVelocity:normal.map(n=>-n*32768)},candidates=buildTerrainCandidates(result,body,{radiusQ8:64*256});
    if(candidates.candidates.length>=64||!candidates.candidates.some(v=>v.sector===sector&&v.row===c.row&&v.column===c.column))throw Error('Edited terrain cannot be reached safely within the native collision candidate limits. Reduce the edited area or height change.');
  }}
  return finish(data);
}

export function terrainSurfacePresets(low,high) {
  const a=parseScene(low),b=parseScene(high),seen=new Set(),presets=[];
  const lowInfo=inspectTerrain(low),highInfo=inspectTerrain(high);
  for(const s of a.segments)for(const cell of s.faces){
    const other=b.segments[s.index]?.faces[cell.index];if(!other||lowInfo.locked.has(s.index)||highInfo.locked.has(s.index)||(cell.pageWord&~0x7f)||(other.pageWord&~0x7f))continue;
    const raw=low.subarray(a.uvTable+cell.textureRecord*16,a.uvTable+cell.textureRecord*16+16),rawHigh=high.subarray(b.uvTable+other.textureRecord*16,b.uvTable+other.textureRecord*16+16),id=raw.toString('hex')+rawHigh.toString('hex');if(seen.has(id))continue;seen.add(id);
    const flags=raw.readUInt32LE(12);presets.push({sector:s.index,cell:cell.index,page:cell.page,uv:cell.uv,category:flags&255,gripReduction:(flags>>>8)&31,label:`S${s.index} / cell ${cell.index} · page ${cell.page} · category ${flags&255} · grip ${(flags>>>8)&31}`});
  }return presets;
}

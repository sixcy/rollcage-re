import {parseCollisionGrid} from './collision-grid.mjs';
import {parseScene} from './scene.mjs';
import {parseRespawnRoutes} from './respawn-routes.mjs';
import {parseGFXM} from './gfxm.mjs';
import {parsePlacements} from './placements.mjs';
import {parseModelCollision,readPlacementCollision} from './model-collision.mjs';

const append=(data,bytes)=>{const offset=Math.ceil(data.length/4)*4;if(offset+bytes.length>128*1024*1024)throw Error('Terrain resource exceeds 128 MiB.');const out=Buffer.alloc(offset+bytes.length);out.set(data);out.set(bytes,offset);return {data:out,offset};};
const range=(data,offset,size,label)=>{if(!Number.isSafeInteger(offset)||offset<0||offset+size>data.length)throw Error(`${label} exceeds terrain resource bounds.`);};

// 48cc30: start row11/count5, sector7/last bit, count bytes (rows6/LOD2).
export function readTerrainVisibility(data,node) {
  const base=data.readUInt32LE(0x20),start=base+(node.referenceWord&65535)*2,entries=[];let cursor=start;
  do{range(data,cursor,4,'Visibility record');const word=data.readUInt16LE(cursor),id=data[cursor+2],count=word>>>11;range(data,cursor+3,count,'Visibility segments');const steps=[...data.subarray(cursor+3,cursor+3+count)];entries.push({sector:id>>>1&127,row:word&2047,steps});cursor=Math.floor((cursor+4+count)/2)*2;if(id&1)break;if(entries.length>128)throw Error('Visibility list does not terminate.');}while(true);
  return entries;
}

// 44d230's separate lighting coverage program, addressed relative to the same
// visibility root. It can describe at most four sector/row intervals.
export function readTerrainLightCoverage(data,node,firstRegion) {
  if(node.boundsWord&1)return [{sector:firstRegion.sector,start:firstRegion.row-(node.boundsWord>>>7&63),end:firstRegion.row+(node.boundsWord>>>1&63)}];
  const base=data.readUInt32LE(0x20)+(node.referenceWord&65535)*2+(node.boundsWord&8191),result=[];let cursor=base;
  for(let i=0;i<4;i++){
    range(data,cursor,2,'Light coverage');const a=data.readUInt16LE(cursor);let sector,start,end,stop;
    if(a&1){sector=firstRegion.sector;start=firstRegion.row-(a>>>7&63);end=firstRegion.row+(a>>>1&63);stop=Boolean(a&8192);cursor+=2;}
    else{range(data,cursor,4,'Light coverage');const b=data.readUInt16LE(cursor+2),local=(a|b<<16)>>>0,packed=(((a&0xffe)<<7)^(((local&0xff000)+(a&0xffe)*0x800)*0x100))>>>0;sector=b>>>4&127;start=packed>>>8&4095;end=packed>>>20;stop=Boolean(b&2048);cursor+=4;}
    result.push({sector,start,end});if(stop)break;
  }return result;
}

function encodeVisibility(entries) {
  const parts=[];for(const [index,entry]of entries.entries()){if(entry.steps.length>31||entry.row>2047)throw Error('Native visibility record capacity exceeded.');const bytes=Buffer.alloc(Math.floor((4+entry.steps.length)/2)*2);bytes.writeUInt16LE(entry.row|entry.steps.length<<11);bytes[2]=entry.sector<<1|Number(index===entries.length-1);bytes.set(entry.steps,3);parts.push(bytes);}return concatenate(parts);
}
const concatenate=parts=>{const out=Buffer.alloc(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;};
function encodeLights(intervals) {
  const merged=new Map();for(const row of intervals)merged.set(`${row.sector}:${row.start}:${row.end}`,{...row});
  const rows=[...merged.values()];if(rows.length>4)throw Error('New terrain exceeds native four-sector lighting coverage for a spatial cell. Shorten or move the road.');
  const result=Buffer.alloc(rows.length*4);for(const [index,row]of rows.entries()){const span=row.end-row.start;if(row.start<0||row.start>2047||span<0||span>255||row.end>4095)throw Error('Native lighting interval capacity exceeded.');result.writeUInt16LE(row.start<<1|(span&15)<<12,index*4);result.writeUInt16LE((span>>>4)|(row.sector<<4)|(index===rows.length-1?2048:0),index*4+2);}return result;
}

export function rebuildTerrainSpatial(source,geometry,newSectorIndices,{texture}={}) {
  if(!newSectorIndices.length)return Buffer.from(geometry);
  const grid=parseCollisionGrid(source),scene=parseScene(geometry);if(!grid.available)throw Error('New roads require an existing native spatial index.');
  const newSet=new Set(newSectorIndices),newSectors=scene.segments.filter(s=>newSet.has(s.index)),regions=grid.regions.map(r=>({sector:r.sector,row:r.row,column:r.column,rows:r.rows,columns:r.columns,padding:r.padding,control:r.control&511})),regionIds=new Map(grid.regions.map((r,i)=>[r.index,i])),zones=new Map(grid.zones.map(z=>[z.root,z.regions.map(i=>regionIds.get(i))]));
  const additions=new Map();
  for(const s of newSectors){
    let padding=0;for(const face of s.faces){const p=face.gridIndices.map(i=>s.vertices[i]);padding=Math.max(padding,...p.flatMap(a=>p.map(b=>Math.hypot(...a.slice(0,3).map((n,i)=>n-b[i])))));}
    padding=Math.ceil(padding);if(padding>255)throw Error('New road exceeds native collision padding capacity.');
    const regionIndices=[];for(let column=0;column<s.columns;column+=15){regionIndices.push(regions.length);regions.push({sector:s.index,row:0,column,rows:s.rows,columns:Math.min(15,s.columns-column),padding,control:s.index});}
    const xs=s.vertices.map(v=>v[0]),zs=s.vertices.map(v=>v[2]),minX=Math.max(0,Math.floor((Math.min(...xs)-256)/256)+128),maxX=Math.min(255,Math.floor((Math.max(...xs)+256)/256)+128),minZ=Math.max(0,Math.floor((Math.min(...zs)-256)/256)+128),maxZ=Math.min(255,Math.floor((Math.max(...zs)+256)/256)+128);
    for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){const key=`${x}:${z}`;if(!additions.has(key))additions.set(key,[]);additions.get(key).push(...regionIndices);}
  }
  const oldCells=new Map();for(const row of grid.spatial.rows)for(const span of row.ranges)for(let x=span.start;x<=span.end;x++){const pointer=row.mapPointer+(span.cellStart+x-span.start)*2;oldCells.set(`${x}:${row.index}`,source.readUInt16LE(pointer)/12);}
  const fallbackTable=source.readUInt32LE(0xac),fallbackCount=source.readUInt16LE(0x96);range(source,fallbackTable,fallbackCount*4,'Model/fallback table');
  const modelSequence=node=>{const count=node.boundsWord>>>19&7,start=node.boundsWord>>>22;range(source,fallbackTable+start*4,(count+1)*4,'Model/fallback sequence');return Array.from({length:count+1},(_,i)=>source.readUInt32LE(fallbackTable+(start+i)*4));};
  const routes=parseRespawnRoutes(source),nearestRoute=(x,z)=>{let best=Infinity,word=0;for(const group of routes.groups.slice(1))for(const [i,p]of group.points.entries()){const distance=(p.position[0]-x)**2+(p.position[2]-z)**2;if(distance<best){best=distance;word=(group.index<<16|i)>>>0;}}return word;};
  const modelBounds=[];if(texture){const models=parseGFXM(source).models,placements=parsePlacements(texture,models);for(const p of placements.records){if(p.type!==0||!models[p.modelIndex])continue;const collision=parseModelCollision(source,models[p.modelIndex]);if(!collision.available)continue;const settings=readPlacementCollision(source,p,collision);if(!settings.configurations.some(c=>![0,2,3,5].includes(c.type)))continue;const radius=Math.ceil(Math.max(0,...collision.vertices.map(v=>Math.hypot(v[0],v[2])),...collision.shapes.map(s=>Math.hypot(s.center[0],s.center[2]))))+256;modelBounds.push({index:p.index,minX:p.position[0]-radius,maxX:p.position[0]+radius,minZ:p.position[2]-radius,maxZ:p.position[2]+radius});}}
  const allNewVisibility=newSectors.map(s=>({sector:s.index,row:0,steps:[s.rows<<2]}));
  const nodes=grid.spatial.nodes.map(n=>({bounds:n.boundsWord,reference:n.referenceWord,links:n.linksWord,regions:[...zones.get(n.zone)],visibility:[...readTerrainVisibility(source,n),...allNewVisibility],lights:readTerrainLightCoverage(source,n,regions[zones.get(n.zone)[0]]),models:modelSequence(n)})),cells=new Map(oldCells),chains=new Map();
  for(const [key,extra]of additions){const old=oldCells.get(key),ids=[],original=[];if(old!==undefined){let i=old;do{ids.push(i);original.push(nodes[i]);}while(grid.spatial.nodes[i++].continues);}else if(!texture&&source.readUInt16LE(0x2c))throw Error('Standalone road construction requires original scenery texture/placement data.');
    const signature=`${old??'new'}:${extra.join(',')}`;if(chains.has(signature)){cells.set(key,chains.get(signature));continue;}const start=nodes.length,parts=original.length?original:[{bounds:32<<13,reference:0,links:0,regions:[],visibility:[],lights:[],models:[0]}],allRegions=[...new Set([...parts.flatMap(n=>n.regions),...extra])];
    if(allRegions.length>128)throw Error('New terrain exceeds 128 collision regions in one spatial group.');
    const [x,z]=key.split(':').map(Number),px=(x-128)*256+128,pz=(z-128)*256+128,nearModels=old===undefined?modelBounds.filter(b=>px>=b.minX-128&&px<=b.maxX+128&&pz>=b.minZ-128&&pz<=b.maxZ+128).map(b=>b.index):[];
    for(const [part,n]of parts.entries())nodes.push({...n,regions:[...new Set([...n.regions,...extra])],visibility:old===undefined?allNewVisibility:n.visibility,lights:[...n.lights,...extra.map(i=>({sector:regions[i].sector,start:0,end:regions[i].rows}))],models:[old===undefined?nearestRoute(px,pz):n.models[0],...new Set([...n.models.slice(1),...nearModels])],reference:((n.reference&0x7fffffff)|(part<parts.length-1?0x80000000:0))>>>0});
    chains.set(signature,start);cells.set(key,start);
  }
  if(nodes.length*12>65536)throw Error('New terrain exceeds native 16-bit spatial-node displacement capacity.');
  const zoneParts=[],zoneRoots=new Map(),modelWords=[],modelStarts=new Map(),visibilityGroups=new Map();let zoneCount=0;
  for(const node of nodes){
    const signature=node.regions.join(',');let root=zoneRoots.get(signature);if(root===undefined){root=zoneCount;if(root>16383)throw Error('New terrain exceeds native collision-zone capacity.');zoneRoots.set(signature,root);for(const [i,id]of node.regions.entries()){const r=regions[id];if(r.rows>15||r.columns>15)throw Error('New terrain collision region must fit 4-bit dimensions.');const bytes=Buffer.alloc(6);bytes.writeUInt16LE(r.row|r.column<<10);bytes.writeUInt16LE((r.control&511)|(i===0?(node.regions.length-1)<<9:0),2);bytes[4]=r.padding;bytes[5]=r.rows|r.columns<<4;zoneParts.push(bytes);zoneCount++;}}
    node.zone=root;const sequence=node.models.join(',');let model=modelStarts.get(sequence);if(model===undefined){model=modelWords.length;modelStarts.set(sequence,model);modelWords.push(...node.models);}if(model>1023||node.models.length>8||modelWords.length>65535)throw Error('New terrain exceeds native model/fallback capacity.');node.modelStart=model;
    if(node.visibility.length>100)throw Error('New terrain exceeds the conservative 100-entry native visibility capacity.');const visible=encodeVisibility(node.visibility),vkey=visible.toString('hex');if(!visibilityGroups.has(vkey))visibilityGroups.set(vkey,{visible,lights:new Map(),nodes:[]});const group=visibilityGroups.get(vkey),light=encodeLights(node.lights),lkey=light.toString('hex');group.lights.set(lkey,light);group.nodes.push({node,lkey});
  }
  // Original PVS lists share suffixes. Preserve that compression property:
  // expanding each HIGH list independently can exceed the 16-bit word root.
  const visibilityBuffer=Buffer.alloc(0x22000),writtenVisibility=[],writtenLights=new Map();let visibilityBytes=0;
  const writeVisibility=bytes=>{if(visibilityBytes+bytes.length>visibilityBuffer.length)throw Error('New terrain exceeds native visibility-root capacity.');const offset=visibilityBytes;visibilityBuffer.set(bytes,offset);visibilityBytes+=bytes.length;return offset;};
  const matches=(bytes,offset)=>bytes.every((n,i)=>n===visibilityBuffer[offset+i]);
  for(const group of [...visibilityGroups.values()].sort((a,b)=>b.visible.length-a.visible.length)){
    const required=[...group.lights.values()].reduce((sum,b)=>sum+b.length,0);let start;
    for(const prior of writtenVisibility){const offset=prior.start+prior.length-group.visible.length;if(offset>=prior.start&&visibilityBytes-offset+required<=8191&&matches(group.visible,offset)){start=offset;break;}}
    if(start===undefined){start=writeVisibility(group.visible);writtenVisibility.push({start,length:group.visible.length});}
    if(start/2>65535)throw Error('New terrain exceeds native visibility-root capacity.');
    for(const [key,bytes]of group.lights){let offset=(writtenLights.get(key)??[]).find(offset=>offset>=start&&offset-start<=8191);if(offset===undefined){offset=writeVisibility(bytes);if(!writtenLights.has(key))writtenLights.set(key,[]);writtenLights.get(key).push(offset);}if(offset-start>8191)throw Error('New terrain exceeds native lighting-program displacement.');for(const entry of group.nodes.filter(n=>n.lkey===key)){entry.node.visibilityRoot=start/2;entry.node.lightOffset=offset-start;}}
  }
  const nodeBytes=Buffer.alloc(nodes.length*12);for(const [i,node]of nodes.entries()){nodeBytes.writeUInt32LE(((node.bounds&0x7e000)|node.lightOffset|(node.models.length-1)<<19|node.modelStart<<22)>>>0,i*12);nodeBytes.writeUInt32LE(((node.reference&0xc0000000)|node.zone<<16|node.visibilityRoot)>>>0,i*12+4);nodeBytes.writeUInt32LE(node.links>>>0,i*12+8);}
  const rowBytes=Buffer.alloc(256*16),map=[];for(let z=0;z<256;z++){const columns=[...cells.keys()].filter(k=>k.endsWith(`:${z}`)).map(k=>Number(k.split(':')[0])).sort((a,b)=>a-b),spans=[];for(const x of columns){const last=spans.at(-1);if(last&&x===last.end+1)last.end=x;else spans.push({start:x,end:x});}if(spans.length>6)throw Error('New terrain exceeds native six spatial spans per row.');rowBytes.writeUInt32LE(map.length+1,z*16+12);for(let i=0;i<6;i++)rowBytes.writeUInt16LE(i<spans.length?spans[i].start|spans[i].end<<8:255,z*16+i*2);for(const x of columns)map.push(cells.get(`${x}:${z}`)*12);}
  const mapBytes=Buffer.alloc(map.length*2);map.forEach((n,i)=>mapBytes.writeUInt16LE(n,i*2));const models=Buffer.alloc(modelWords.length*4);modelWords.forEach((n,i)=>models.writeUInt32LE(n>>>0,i*4));
  let data=geometry;for(const [header,bytes]of [[0x20,visibilityBuffer.subarray(0,visibilityBytes)],[0x24,rowBytes],[0x28,concatenate(zoneParts)],[0x68,nodeBytes],[0x6c,mapBytes],[0xac,models]]){const added=append(data,bytes);data=added.data;data.writeUInt32LE(added.offset,header);}data.writeUInt32LE(nodes.length,0xc);data.writeUInt16LE(modelWords.length,0x96);
  const parsed=parseCollisionGrid(data);for(const index of newSectorIndices)if(parsed.sectors[index].cells.some(c=>!c.covered))throw Error('New road collision coverage is incomplete.');return data;
}

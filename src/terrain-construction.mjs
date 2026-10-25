import {parseScene} from './scene.mjs';
import {parseCollisionGrid} from './collision-grid.mjs';
import {generateSplineRoad} from './spline-road.mjs';
import {rebuildTerrainSpatial} from './terrain-spatial-builder.mjs';
import {buildTerrainCandidates} from './terrain-candidates.mjs';
import {queryTerrainRay} from './terrain-query.mjs';
import {extendSplineRoadPacketInitializers} from './spline-road-textures.mjs';

const append=(data,bytes)=>{const offset=Math.ceil(data.length/4)*4;if(offset+bytes.length>128*1024*1024)throw Error('Terrain resource exceeds 128 MiB.');const out=Buffer.alloc(offset+bytes.length);out.set(data);out.set(bytes,offset);return {data:out,offset};};
const concatenate=parts=>{const result=Buffer.alloc(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;};
const normal=(a,b,c)=>{const u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);if(length<1e-8||n[1]<=0)throw Error('New road must remain nondegenerate and face upwards.');const q=n.map(n=>Math.round(-n/length*256));return (((q[0]&1023)<<20)|((q[1]&1023)<<10)|(q[2]&1023))>>>0;};

// Offline sector construction. 44c6a0..44c712 relocates the generated resource
// pointers and publishes +4c as a row index into the 28-byte state table +c4.
// The visibility builder emits LOD1 exclusively; lower-LOD buffers stay valid
// bounded aliases and are not selected by generated visibility descriptors.
export function compileSplineRoads(source,roads=[],{texture,validateContacts=true}={}) {
  if(!Array.isArray(roads)||roads.length>64)throw Error('Invalid road list (maximum64).');
  if(!roads.length)return {data:Buffer.from(source),texture:texture?Buffer.from(texture):undefined,roads:[],generated:[],changed:false};
  const ids=new Set();for(const road of roads){if(ids.has(road.id))throw Error('Road identities must be unique.');ids.add(road.id);}
  const original=parseScene(source),grid=parseCollisionGrid(source),generated=roads.map(road=>generateSplineRoad(source,road)),parts=generated.flatMap(g=>g.segments);
  if(original.segments.length+parts.length>128)throw Error('Roads exceed the native 128 terrain-sector limit.');
  const normalWords=grid.normals.map(n=>n.packed),sectorOffsets=original.segments.map(s=>s.offset),newIndices=[],packetEntries=[];
  let data=Buffer.from(source),packetCount=source.readUInt32LE(8),runtimeRows=original.segments.reduce((max,s)=>Math.max(max,source.readUInt32LE(s.offset+0x4c)+s.rows+1),0),runtimeBase=source.readUInt32LE(0xc4),instanceBase=source.readUInt32LE(0x3c),oldInstanceBytes=Math.max(0,...original.segments.map(s=>source.readUInt32LE(s.offset+0x48)+(s.rows+1)*2));
  const oldRows=runtimeRows,instanceParts=[];if(instanceBase<0x120||instanceBase+oldInstanceBytes>source.length)throw Error('Native terrain instance-row table is unavailable.');instanceParts.push(Buffer.from(source.subarray(instanceBase,instanceBase+oldInstanceBytes)));let instanceBytes=oldInstanceBytes;
  const byRoad=new Map(generated.map(g=>[g.road.id,{roadId:g.road.id,sectors:[],centerline:g.centerline,bounds:g.bounds,seams:g.seams}]));
  for(const part of parts){
    const template=original.segments[part.sourceSurface.sector],face=template.faces[part.sourceSurface.cell],header=Buffer.from(source.subarray(template.offset,template.offset+0x60)),vertices=Buffer.alloc(part.vertices.length*8),packets=Buffer.alloc(part.columns*part.rows*8),lodColumns=Buffer.alloc(4+(part.columns+1)*2),lighting=Buffer.alloc(Math.ceil(part.columns*part.rows/2),0x44),instances=Buffer.alloc((part.rows+1)*2);
    const copiedFlags=template.vertices[face.gridIndices[3]][3];
    part.vertices.forEach((p,index)=>{p.forEach((n,axis)=>vertices.writeInt16LE(n,index*8+axis*2));vertices.writeUInt16LE((copiedFlags&~3)|2,index*8+6);});
    lodColumns.writeUInt32LE(part.columns+1);for(let i=0;i<=part.columns;i++)lodColumns.writeUInt16LE(8,4+i*2);
    for(let row=0;row<part.rows;row++)for(let column=0;column<part.columns;column++){
      const i=row*part.columns+column,tl=row*(part.columns+1)+column,tr=tl+1,bl=tl+part.columns+1,br=bl+1,index=normalWords.length;if(index+1>65534)throw Error('Road exceeds native collision-normal capacity.');
      const triangles=copiedFlags&4?[[tl,tr,bl],[tr,br,bl]]:[[tl,tr,br],[tl,br,bl]];normalWords.push(...triangles.map(ids=>normal(...ids.map(id=>part.vertices[id]))));if(packetCount>65535)throw Error('Road exceeds native render-packet index capacity.');packetEntries.push({index:packetCount,sourcePacket:face.template});packets.writeUInt16LE(packetCount++,i*8);packets.writeUInt16LE(index,i*8+2);packets.writeUInt32LE(face.textureRecord,i*8+4);
    }
    let added=append(data,vertices);data=added.data;header.writeUInt32LE(added.offset,0x20);
    added=append(data,packets);data=added.data;for(const offset of [0x10,0x50,0x54,0x58,0x5c])header.writeUInt32LE(added.offset,offset);
    added=append(data,lodColumns);data=added.data;for(const offset of [0x28,0x2c,0x30])header.writeUInt32LE(added.offset,offset);
    added=append(data,lighting);data=added.data;for(const offset of [0x3c,0x40,0x44])header.writeUInt32LE(added.offset,offset);
    header.writeUInt32LE((source.readUInt32LE(template.offset+4)&65535)|1,4);header.writeUInt32LE(part.columns,8);header.writeUInt32LE(part.rows,12);header.writeInt16LE(Math.max(...part.vertices.map(p=>p[1]))+128,0x14);header.writeUInt32LE(0,0x38);header.writeUInt32LE(instanceBytes,0x48);header.writeUInt32LE(runtimeRows,0x4c);runtimeRows+=part.rows+1;instanceBytes+=instances.length;instanceParts.push(instances);
    added=append(data,header);data=added.data;const sector=sectorOffsets.length;sectorOffsets.push(added.offset);newIndices.push(sector);byRoad.get(part.roadId).sectors.push(sector);
  }
  const table=Buffer.alloc(sectorOffsets.length*4);sectorOffsets.forEach((n,i)=>table.writeUInt32LE(n,i*4));let added=append(data,table);data=added.data;data.writeUInt32LE(added.offset,0x14);data.writeUInt32LE(sectorOffsets.length,0x10);
  data.writeUInt32LE(packetCount,8);
  const normals=Buffer.alloc(normalWords.length*4);normalWords.forEach((n,i)=>normals.writeUInt32LE(n>>>0,i*4));added=append(data,normals);data=added.data;data.writeUInt32LE(added.offset,0x34);data.writeUInt32LE(normalWords.length,0x38);
  const runtime=Buffer.alloc(runtimeRows*28);if(runtimeBase>=0x120&&runtimeBase+oldRows*28<=source.length)runtime.set(source.subarray(runtimeBase,runtimeBase+oldRows*28));else throw Error('Native terrain row-state storage is unavailable.');added=append(data,runtime);data=added.data;data.writeUInt32LE(added.offset,0xc4);
  added=append(data,concatenate(instanceParts));data=added.data;data.writeUInt32LE(added.offset,0x3c);
  data=rebuildTerrainSpatial(source,data,newIndices,{texture});
  const parsed=parseCollisionGrid(data);
  if(validateContacts)for(const sector of newIndices){const s=parsed.sectors[sector];for(const c of s.cells)for(const form of c.forms){const center=[0,1,2].map(axis=>form.indices.reduce((sum,i)=>sum+s.vertices[i][axis],0)/form.indices.length),n=parsed.normals[form.normal].components,originQ8=center.map((v,i)=>Math.round(v*256+n[i]*8)),deltaQ8=n.map(n=>-n*16),body={flags:3,position:originQ8.map(n=>n*256),linearVelocity:deltaQ8.map(n=>n*256)},candidates=buildTerrainCandidates(parsed,body,{radiusQ8:64*256});if(candidates.candidates.length>=64||!candidates.candidates.some(v=>v.sector===sector&&v.row===c.row&&v.column===c.column))throw Error('New terrain cannot be reached within native collision candidate limits. Shorten or move the road.');const hit=queryTerrainRay(parsed,candidates.candidates,{originQ8,deltaQ8,radiusQ8:0});if(!hit.flags||(hit.cellRef&255)!==sector)throw Error('New road fails its actual terrain contact check. Avoid intersecting another road or degenerate grid.');}}
  const packetInitializers={oldCount:source.readUInt32LE(8),newCount:packetCount,entries:packetEntries};
  return {data,texture:texture?extendSplineRoadPacketInitializers(texture,packetInitializers):undefined,packetInitializers,roads:generated.map(g=>g.road),generated:[...byRoad.values()],changed:true};
}

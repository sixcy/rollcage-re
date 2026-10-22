// 424ff0 storage adapter. Writes happen at native decision points, including
// retained candidate, plane, border and shared cross/normalization scratch.
import {queryTerrainRay} from './terrain-query.mjs';
import {queryTerrainSphere} from './terrain-sphere-query.mjs';
export function createRawTerrainGrid(grid,terrainVerticesFor,{memory}){
 const sectorAt=index=>memory.readUInt32LE(memory.readUInt32LE(memory.readUInt32LE(0x90b98c))+index*4);
 const sectors=grid.sectors.map(sector=>{
  const address=terrainVerticesFor(sector.index),vertices=new Proxy(Array(sector.vertices.length).fill(null),{get:(target,key,receiver)=>{
   if(typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)){const i=Number(key);if(i>=target.length)return undefined;return new Proxy(Array(4).fill(0),{get:(lanes,lane,other)=>typeof lane==='string'&&/^[0-3]$/.test(lane)?memory.readInt16LE(address+i*8+Number(lane)*2):Reflect.get(lanes,lane,other)});}return Reflect.get(target,key,receiver);
  }}),result={...sector,vertices};Object.defineProperty(result,'rows',{enumerable:true,get:()=>memory.readInt32LE(sectorAt(sector.index)+12)});return result;
 });return {...grid,sectors};
}

export function queryRawTerrain(bodyAddress,recordAddress,outputAddress,parameter,{memory,views,grid,roundingMode,scratch={},trace,maxCandidates=64,scratchBase}={}){
 if(!Buffer.isBuffer(memory)||typeof views?.candidateAt!=='function'||!grid?.sectors)throw Error('Raw terrain query requires coherent memory, candidate views and grid.');
 const get=p=>memory.readInt32LE(p),ptr=p=>memory.readUInt32LE(p),vector=p=>[0,4,8].map(o=>get(p+o));
 const store=(address,width,value)=>{trace?.({address,width,value:width===8?value&255:width===16?value&65535:value|0});if(width===8)memory[address]=value&255;else if(width===16)memory.writeUInt16LE(value&65535,address);else memory.writeInt32LE(value|0,address);};
 const count=memory.readUInt16LE(bodyAddress+0x15c),base=ptr(bodyAddress+0x154),radius=get(recordAddress+64);if(!Number.isInteger(maxCandidates)||maxCandidates<0||maxCandidates>65535||count>maxCandidates)throw Error('Raw terrain query count exceeds the declared native candidate workflow bound.');
 const candidates=Array.from({length:count},(_,i)=>views.candidateAt(base+i*16)),output={flags:0,fractionQ16:parameter|0};
 for(const[name,offset]of[['pointQ8',0],['normalQ16',12]])Object.defineProperty(output,name,{enumerable:true,get:()=>vector(outputAddress+offset)});
 for(const[name,offset]of[['distanceQ8',24],['cellRef',32]])Object.defineProperty(output,name,{enumerable:true,get:()=>get(outputAddress+offset)});
 const planeAt=index=>{const p=0x91e7a0+index*40;return {get pointQ8(){return vector(p);},get normalQ8(){return vector(p+12);},get distanceQ8(){return get(p+24);},get fractionQ16(){return get(p+36);}};};
 let captured=false;
 const nativeState={
  bodyFlags:()=>get(bodyAddress),distanceQ8:()=>get(outputAddress+24),captureQuery:()=>{captured=true;return {originQ8:vector(recordAddress+8),deltaQ8:vector(recordAddress+20),radiusQ8:radius};},
  writeCandidateFlags:(candidate,value)=>{store(candidate.address,8,value);if(captured&&(value&16)&&Number.isInteger(scratchBase))memory.writeInt32LE(candidate.id|0,scratchBase-12);}, //4251c6 localF8h survives at nativeentryESP-12;49b690 later copies it as notification-address padding.
  writeCandidateEdge:(candidate,value)=>store(candidate.address+2,8,value),planeAt,
  writePlane:(index,plane)=>{const p=0x91e7a0+index*40;for(const[offset,value]of[[4,plane.pointQ8[1]],[12,plane.normalQ8[0]],[16,plane.normalQ8[1]],[20,plane.normalQ8[2]],[24,plane.distanceQ8],[0,plane.pointQ8[0]],[8,plane.pointQ8[2]],[36,plane.fractionQ16]])store(p+offset,32,value);},
  polygonCross:(a,b,cross)=>{for(const[p,value]of[[0x91d360,a[0]],[0x91d40c,b[1]],[0x91d410,b[2]],[0x91d368,a[1]],[0x91d370,a[2]],[0x91d408,b[0]]])store(p,16,value);cross.forEach((value,i)=>store(0x91d448+i*4,32,value));},
  primitiveCross:(a,b,cross)=>{a.forEach((value,i)=>store(0x91d360+i*8,32,value));b.forEach((value,i)=>store(0x91d408+i*4,16,value));cross.forEach((value,i)=>store(0x91d448+i*4,32,value));},
  normalizeReduction:(bits,leading)=>{store(0x91d45c,32,bits);store(0x91d460,32,0);store(0x91d460,32,leading);},
  sqrtLookup:value=>{store(0x91d45c,32,value);const absolute=value<0?-value|0:value;store(0x91d45c,32,absolute);store(0x91d460,32,0);for(let i=1;i<=Math.clz32(absolute);i++)store(0x91d460,32,i);},
  writeContact:value=>{for(let i=0;i<3;i++)store(outputAddress+12+i*4,32,value.normalQ16[i]);store(outputAddress+24,32,value.distanceQ8);for(let i=0;i<3;i++)store(outputAddress+i*4,32,value.pointQ8[i]);store(outputAddress+32,32,value.cellRef);},
  writeBorder:(point,anchor)=>{for(let i=0;i<3;i++)store(0x911c10+i*4,32,point[i]);const y=anchor[1],z=anchor[2],x=anchor[0];store(0x911c20,16,x);store(0x911c22,16,y);store(0x911c24,16,z);const normal=output.normalQ16;store(0x911c00,32,normal[0]);const clock=get(0x90a548);store(0x911c04,32,normal[1]);store(0x911c08,32,normal[2]);store(0x911c0c,32,clock);},
  smoothEdge:(candidate,neighbor,plane,other,normal,otherNormal,result)=>{
   const y=((plane.pointQ8[1]+other.pointQ8[1])|0)>>1,z=((plane.pointQ8[2]+other.pointQ8[2])|0)>>1,x=((plane.pointQ8[0]+other.pointQ8[0])|0)>>1;store(outputAddress,32,x);
   for(let i=0;i<3;i++)store(outputAddress+12+i*4,32,(normal[i]+otherNormal[i])<<7);store(outputAddress+8,32,z);store(outputAddress+4,32,y);
   const distance=plane.distanceQ8,closer=distance<other.distanceQ8;store(outputAddress+24,32,distance);result.fractionQ16=plane.fractionQ16;store(outputAddress+32,32,closer?candidate.id:neighbor.id);result.flags=result.fractionQ16===0?2:1;return result;
  },
  edgeContact:(candidate,value)=>{store(outputAddress+16,32,value.normal[1]<<8);store(outputAddress+20,32,value.normal[2]<<8);store(outputAddress,32,value.point[0]);store(outputAddress+4,32,value.point[1]);store(outputAddress+8,32,value.point[2]);store(outputAddress+12,32,value.normal[0]<<8);store(outputAddress+32,32,candidate.id);store(outputAddress+24,32,value.scalar);},
  finish:flags=>store(outputAddress+28,32,flags)
 };
 const query={radiusQ8:radius},options={parameter,bodyFlags:get(bodyAddress),roundingMode,scratch,nativeState,output,maxCandidates};
 const result=radius?queryTerrainSphere(grid,candidates,query,options):queryTerrainRay(grid,candidates,query,options);return result.fractionQ16;
}

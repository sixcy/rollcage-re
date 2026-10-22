import {parseSpatialIndex} from '../../src/spatial-index.mjs';
import {createRawTerrainGrid} from '../../src/raw-terrain-query.mjs';
import {createPhysicsRuntimeViews} from '../../src/physics-runtime-views.mjs';
import {buildFrameCandidates} from '../../src/frame-candidates.mjs';

//Explicit authored single-sector world mapped into the constructor fixture.
//These are coherent resource/previous-physics inputs, not a race asset loader.
//build() receives the candidate parent's own entry ESP independently from the
//weapon-stage/outer entry. Its declared incoming ESI defaults to the fixture's
//zero preserved register;428808 saves it at entry−72. The actual lookup below
//also publishes42870f's saved EDI (half Z velocity) at parent entry−112.
export function mapWeaponStageTerrain(f) {
  const m=f.memory,a=f.addresses,pack=a.pack,put=(p,v)=>m.writeInt32LE(v|0,p),word=(p,v)=>m.writeUInt16LE(v&65535,p),bucket=0x92000,vertices=0x97000,normals=0x9d100,regions=0x9d000,borders=0x9d400,packets=0x9d500;
  //The small constructor fixture's settings overlap the new full row table;
  //relocate this declared input before publishing the spatial bytes.
  const oldSettings=m.readUInt32LE(0x5ecefc);m.copy(m,0x150000,oldSettings,oldSettings+0x2000);put(0x5ecefc,0x150000);
  const spatialBytes=Buffer.alloc(0x1500);spatialBytes.write('GFXM');spatialBytes.writeUInt32LE(1,0xc);spatialBytes.writeUInt32LE(1,0x10);spatialBytes.writeUInt32LE(0x120,0x68);spatialBytes.writeUInt32LE(0x200,0x24);spatialBytes.writeUInt32LE(0x1200,0x6c);
  for(let i=0;i<256;i++){const p=0x200+i*16;spatialBytes.writeUInt16LE(0xff00,p);spatialBytes.writeUInt16LE(255,p+2);spatialBytes.writeUInt32LE(1,p+12);spatialBytes.copy(m,0x90000+i*16,p,p+16);put(0x9000c+i*16,0x91000);}spatialBytes.copy(m,0x91000,0x1200,0x1400);put(0x909254,0x90000);put(0x909278,bucket);put(bucket,0);put(bucket+4,0);
  const spatial=parseSpatialIndex(spatialBytes),normalValues=[[0,-256,0],[-256,0,0],[256,0,0]],normalRecords=normalValues.map((components,index)=>{const[x,y,z]=components,packed=(((x&1023)<<20)|((y&1023)<<10)|(z&1023))>>>0;put(normals+index*4,packed);return{packed,components};});
  put(pack+0x1c,normals);put(pack+0x80,regions);put(0x909240,0x95000);put(0x90925c,normals);put(0x9092c0,regions);put(0x96004,1);put(0x96008,1);put(0x9600c,3);put(0x96038,borders);put(0x96050,packets);word(regions,0);word(regions+2,0);word(regions+4,0x1378);
  const vertexValues=[];for(let row=0;row<4;row++)for(let column=0;column<2;column++){const vertex=[column*100,-30,200-row*100,0];vertexValues.push(vertex);vertex.forEach((v,lane)=>word(vertices+(row*2+column)*8+lane*2,v));}
  const borderValues=[];for(let row=0;row<3;row++){word(borders+row*4,1);word(borders+row*4+2,2);word(packets+row*8+2,0);borderValues.push({left:{type:6,column:0,normal:1},right:{type:7,column:1,normal:2}});}
  const sector={index:0,columns:1,rows:3,vertices:vertexValues,cells:Array.from({length:3},()=>({forms:[{type:0,normal:0,point:null}]})),borders:borderValues,flags:1,left:0,right:1};
  const parsedGrid={available:true,sectors:[sector],normals:normalRecords,regions:[{index:0,sector:0,row:0,column:0,rows:3,columns:1,padding:120}],zones:[{root:0,regions:[0]}],spatial},grid=createRawTerrainGrid(parsedGrid,()=>vertices,{memory:m});
  const views=createPhysicsRuntimeViews({memory:m,bodyAt:p=>{if(p<a.arena||p>=a.arena+0x40000)throw Error('Weapon-stage body is outside declared object arena.');return{address:p,bytes:m.subarray(p,p+0x800)};},bodyLists:[{address:a.list,capacity:32}],bucketAt:p=>{if(p!==bucket)throw Error('Weapon-stage spatial pointer is outside its declared single bucket.');return spatial.nodes[0];},candidateMapping:{terrainVerticesFor:index=>index===0?vertices:undefined}});
  const models={spatial,links:{nodes:[{placementIndices:[]}]},instances:new Map()};put(0x91e788,0x500000);m.fill(0xa5,0x500000,0x508000);
  return {grid,views,build({scratchBase=0x9000,entryRegisters={ESI:0}}={}){if(Number.isInteger(entryRegisters.ESI))put(scratchBase-72,entryRegisters.ESI);const bodies=views.physicalGroup.bodies.slice(0,views.physicalGroup.count);return buildFrameCandidates(bodies,{grid,models,lookup:(position,body)=>{put(scratchBase-112,(body.linearVelocity[2]>>8)>>1);return grid.spatial.lookup(position);},records:views.records,arena:views.candidateArena,nativeState:{beforeAppendRegion:({body,radiusSquared})=>{put(scratchBase-52,radiusSquared);put(scratchBase-92,body.address);},sqrtLookup:value=>{const v=value<0?-value|0:value;put(0x91d45c,v);put(0x91d460,Math.clz32(v));}}});}};
}

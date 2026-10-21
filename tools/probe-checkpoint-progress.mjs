import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {buildTerrainCandidates} from '../src/terrain-candidates.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {parseCheckpointProgression,updateRespawnProgress} from '../src/respawn-progress.mjs';
import {readVehicleTrackBasis} from '../src/track-basis.mjs';
const summary={resources:0,scenarios:0,basisCalls:0,lapMarkers:0,negativeTerrain:0,fallbackRegistrations:0,failures:[]},resources=[],samples=[];
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try{for(const entry of archive.entries){
 const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;let current;
 try{
  const grid=parseCollisionGrid(data);if(!grid.available)continue;
  const routes=parseRespawnRoutes(data),pack=parseCheckpointProgression(data),counts={resource:entry.index,scenarios:0};assert(pack.checkpointCount44>0);
  for(const route of routes.groups.slice(1).filter(route=>route.count>=2))for(const speed of [0,4]){
   current={route:route.index,speed};const point=route.points[Math.floor(route.count/2)],body={bytes:Buffer.alloc(0x4000,0xa5),position:point.position.map(value=>value<<16),linearVelocity:[0,0,65536],flags:0x803},record={bytes:Buffer.alloc(780,0xa5),body00:body};
   body.bytes.writeInt32LE(body.flags,0);body.position.forEach((value,index)=>body.bytes.writeInt32LE(value,0x34+index*4));body.linearVelocity.forEach((value,index)=>body.bytes.writeInt32LE(value,0x68+index*4));[4096,0,0,0,4096,0,0,0,4096].forEach((value,index)=>body.bytes.writeInt16LE(value,0xc4+index*2));body.bytes.writeInt16LE(speed,0x668);body.bytes[0x66c]=0;
   const spatial=grid.spatial.lookup(body.position);assert(spatial.found);const terrain=buildTerrainCandidates(grid,body,{radiusQ8:32*256,spatialState:spatial});let closest=terrain.closest;
   if(!closest){const zone=grid.zones.find(zone=>zone.root===spatial.node.zone),region=grid.regions.find(region=>region.index===zone.regions[0]);closest={sector:region.sector,row:region.row,column:region.column};summary.fallbackRegistrations++;}
   const cellRef=((closest.row<<16)|(closest.column<<8)|closest.sector)|0;body.bytes.writeInt32LE(cellRef,0x11c);if(cellRef<0)summary.negativeTerrain++;
   record.bytes[0x1c]=record.bytes[0x1e]=1;record.bytes[0x1f]=0;record.bytes.fill(0,0x20,0x2c);record.bytes[0x249]=1;
   for(let row=0;row<4;row++)record.bytes.writeInt32LE(row===0?12345*2048:-1,0x2c+row*4);
   const runtime={pack,session:{mode579:0},clock90a548:600},before=Buffer.from(body.bytes);
   const result=updateRespawnProgress(record,runtime,{trackBasis:original=>{assert.equal(original,body);summary.basisCalls++;return readVehicleTrackBasis(data,grid,original.bytes.readInt32LE(0x11c),{mode:runtime.session.mode579,progressStage:record.bytes[0x20],routeIndex:record.bytes[0x22]});}});
   assert.equal(result,0);assert(record.bytes.readInt32LE(0x24)>=0&&record.bytes.readInt32LE(0x24)<=65535);assert(record.bytes[0x20]<pack.checkpointCount44);assert(record.bytes[0x21]<pack.checkpointCount44);assert.equal(record.bytes[0x249],1);
   const marker=body.bytes[0x66c];if(marker){assert([0x4f,0xbf].includes(marker));summary.lapMarkers++;before[0x66c]=marker;}assert.deepEqual(body.bytes,before);
   summary.scenarios++;counts.scenarios++;if(samples.length<12)samples.push({resource:entry.index,...current,cellRef,progress:record.bytes.readInt32LE(0x24),indices:Array.from(record.bytes.subarray(0x20,0x24)),lapMarker:marker});
  }
  resources.push(counts);
 }catch(error){summary.failures.push({resource:entry.index,...current,error:error.message});}
}}finally{await archive.close();}
summary.resources=resources.length;
await writeFile('analysis/checkpoint-progress-probes.json',JSON.stringify({method:'Installed GFXM checkpoints/ID words and route midpoints, actual44a2e0+449d40 progression, fixed-point interpolation, actual417210 track basis with context from raw record20/22, and actual44a560/4459f0 lap formatting. Declared synthetic mode0 runtime, lap bytes1, clocks600, timers12345 centiseconds/-1, speeds0/4, identity rotation, +Z unit velocity and initial index bytes0. Initial cell comes from actual ordinary terrain candidate selection or explicitly reported region-start fallback. Record249 bit1 is set to mark an already finished fixture and legitimately exclude separate449760 race-completion callbacks. No pose application, physics tick, live runtime capture, original process execution or complete race equivalence. Full body bytes unchanged except reached66c lap marker.',summary,resources,samples},null,2));console.log(JSON.stringify(summary));if(summary.failures.length)process.exitCode=1;

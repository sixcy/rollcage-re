import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {parseCheckpointProgression} from '../src/respawn-progress.mjs';
import {buildTerrainCandidates} from '../src/terrain-candidates.mjs';
import {readVehicleTrackBasis} from '../src/track-basis.mjs';
import {BodySpatialRegistry} from '../src/body-spatial.mjs';
import {createRespawnRuntime} from '../src/respawn-runtime.mjs';

const BODY=0x10000,SESSION=0x50000,PACK=0x60000,GROUPS=0x61000,POINTS=0x62000,CHECKPOINTS=0x90000,IDS=0x92000,BUCKETS=0xa0000,RECORD=0x909300;
const summary={resources:0,scenarios:0,ordinaryProgressCalls:0,basisCalls:0,lapCalls:0,finishCalls:0,spatialRemovals:0,spatialInsertions:0,fallbackRegistrations:0,lapMarkers:0,failures:[]},resources=[],samples=[];
const limit=Number(process.argv[3]??Infinity);if(!(limit>0))throw Error('Arguments: gamePath maxResources.');
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try{
 for(const entry of archive.entries){
  if(resources.length>=limit)break;const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;let current;
  try{
   const grid=parseCollisionGrid(data);if(!grid.available)continue;const authoredRoutes=parseRespawnRoutes(data),checkpoints=parseCheckpointProgression(data),memory=Buffer.alloc(0xa00000),counts={resource:entry.index,scenarios:0};
   const pointEnd=Math.max(authoredRoutes.pointBaseOffset,...authoredRoutes.groups.map(route=>route.pointsOffset+route.count*16)),pointSpan=pointEnd-authoredRoutes.pointBaseOffset;assert(POINTS+pointSpan<CHECKPOINTS);
   data.copy(memory,GROUPS,authoredRoutes.tableOffset,authoredRoutes.tableOffset+authoredRoutes.countByte46*12);data.copy(memory,POINTS,authoredRoutes.pointBaseOffset,pointEnd);
   const routeAddresses=new Map();authoredRoutes.groups.forEach((route,index)=>{const address=GROUPS+index*12;memory.writeUInt32LE(POINTS+route.pointsOffset-authoredRoutes.pointBaseOffset,address+8);routeAddresses.set(route,address);});
   const ids=checkpoints.checkpointIds90,maximumId=Math.max(...Array.from(ids).filter(id=>id!==255)),checkpointBytes=(maximumId+1)*20;assert(CHECKPOINTS+checkpointBytes<IDS);checkpoints.checkpoints70.copy(memory,CHECKPOINTS,0,checkpointBytes);ids.copy(memory,IDS);
   memory.writeUInt32LE(SESSION,0x5ecb1c);memory.writeUInt32LE(PACK,0x90b98c);memory.writeUInt32LE(BODY,0x902eec);memory.writeInt32LE(600,0x90a548);memory[SESSION+0x54d]=1;memory[SESSION+0x551]=0;memory[SESSION+0x579]=0;memory[SESSION+0x586]=3;memory.writeInt32LE(4,SESSION+0x57c);
   memory[PACK+0x44]=checkpoints.checkpointCount44;memory[PACK+0x46]=authoredRoutes.countByte46;memory.writeUInt32LE(GROUPS,PACK+0x60);memory.writeUInt32LE(CHECKPOINTS,PACK+0x70);memory.writeUInt32LE(IDS,PACK+0x90);
   let registry;const adapter=createRespawnRuntime({memory,recordCount:1,bodyStorage:[{address:BODY,length:0x4000}],routeAddresses,scratchBase:0x94000,trackBasis:(body,record,runtime)=>{summary.basisCalls++;return readVehicleTrackBasis(data,grid,body.closestTerrain11c,{mode:runtime.session.mode579,progressStage:record.bytes[0x20],routeIndex:record.bytes[0x22]});},spatialHandlers:{removeSpatial:body=>{registry.remove(body);summary.spatialRemovals++;},insertSpatial:body=>{registry.insert(body);summary.spatialInsertions++;}}});
   const body=adapter.bodyAt(BODY),buckets=grid.spatial.nodes.map((_,index)=>adapter.bucketAt(BUCKETS+index*12));registry=new BodySpatialRegistry([{body,poolOffset:0}],body=>{const found=grid.spatial.lookup(body.position);assert(found.found);return{bucket:buckets[found.node.index],outside:found.outside};});
   for(const route of authoredRoutes.groups.slice(1).filter(route=>route.count>=2))for(const speed of [0,4]){
    current={route:route.index,speed};memory.fill(0xa5,BODY,BODY+0x4000);memory.fill(0,RECORD,RECORD+0x30c);memory.writeUInt32LE(BODY,RECORD);memory.writeUInt32LE(0x12345678,RECORD+0x18);memory[RECORD+0x1c]=memory[RECORD+0x1e]=1;memory.writeInt32LE(50000,RECORD+0x24);memory.writeInt32LE(12345<<11,RECORD+0x2c);memory.writeInt32LE(-1,RECORD+0x30);
    const position=route.points[Math.floor(route.count/2)].position.map(value=>value<<16);body.flags=0x803;body.position=position;body.linearVelocity=[0,0,65536];body.quaternion=[65536,0,0,0];body.rotation=[4096,0,0,0,4096,0,0,0,4096];body.vehicleIndex65e=0;body.speed668=speed;body.mode718=8;memory[BODY+0x671]=1;memory.writeUInt32LE(0,BODY+0x660);body.collisionFlags=0x81234567|0;body.collisionState128=32;
    const state=adapter.vehicleStateFor(body);state.field650=100;state.wheels.forEach((wheel,index)=>wheel.spin=100+index);
    const spatial=grid.spatial.lookup(body.position);assert(spatial.found);const terrain=buildTerrainCandidates(grid,body,{radiusQ8:32*256,spatialState:spatial});let closest=terrain.closest;
    if(!closest){const zone=grid.zones.find(zone=>zone.root===spatial.node.zone),region=grid.regions.find(region=>region.index===zone.regions[0]);closest={sector:region.sector,row:region.row,column:region.column};summary.fallbackRegistrations++;}
    const cellRef=((closest.row<<16)|(closest.column<<8)|closest.sector)|0;body.closestTerrain11c=cellRef;registry.insert(body);
    const previousStats={...adapter.stats},matrixPadding=memory.readUInt16LE(BODY+0xd6),positionAlias=body.position,record=adapter.runtime.records[0];
    adapter.apply(BODY,{position,quaternion:[65536,0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096],progressionPointer:route,progressionValue:Math.floor(route.count/2),closestTerrain11c:cellRef});
    assert.equal(adapter.stats.progressCalls-previousStats.progressCalls,1);assert.equal(body.position,positionAlias);assert.deepEqual(body.position.slice(),position);assert.equal(memory.readUInt16LE(BODY+0xd6),matrixPadding);assert.equal(record.respawn54,adapter.routeAt(routeAddresses.get(route)));assert.equal(record.respawn58,Math.floor(route.count/2));assert.equal(body.checkpoint6c0,route.byte05);assert.equal(body.checkpoint6c2,Math.floor(route.count/2));assert(record.progress24>=0&&record.progress24<=65535);assert(record.bytes[0x20]<checkpoints.checkpointCount44);assert(record.bytes[0x21]<checkpoints.checkpointCount44);assert.equal(record.controller18,0x12345678);assert(state.wheels.every(wheel=>wheel.spin===0));assert.equal(state.field650,0);
    for(const name of ['linearVelocity','momentum','angularVelocity','force','torque','angularMomentum'])assert.deepEqual(body[name].slice(),[0,0,0]);assert.equal(body.spatialBucket,buckets[grid.spatial.lookup(body.position).node.index]);
    if(memory[BODY+0x66c]!==0xa5){assert([0x4f,0xbf].includes(memory[BODY+0x66c]));summary.lapMarkers++;}
    registry.remove(body);assert(buckets.every(bucket=>bucket.headId===0));summary.scenarios++;counts.scenarios++;
    if(samples.length<12)samples.push({resource:entry.index,...current,cellRef,progress:record.progress24,lap:record.lap1c,indices:Array.from(record.bytes.subarray(0x20,0x24)),stageCalls:{progress:adapter.stats.progressCalls-previousStats.progressCalls,lap:adapter.stats.lapCalls-previousStats.lapCalls,finish:adapter.stats.finishCalls-previousStats.finishCalls}});
   }
   summary.ordinaryProgressCalls+=adapter.stats.progressCalls;summary.lapCalls+=adapter.stats.lapCalls;summary.finishCalls+=adapter.stats.finishCalls;resources.push(counts);
  }catch(error){summary.failures.push({resource:entry.index,...current,error:error.message,stack:error.stack?.split('\n').slice(0,4)});}
 }
}finally{await archive.close();}
summary.resources=resources.length;const report={method:'Installed-data coherent-memory47d440→44a2e0→449d40 progression in declared normal session mode0, using mapped actual authored route/checkpoint tables and real417210 track basis. One supplied pose per usable route midpoint at speeds0/4. Complete synthetic body/record storage aliases a caller-owned native address map; no manual synchronization occurs during the chain. Raw inputs declare full0x4000-byte body storage extent, retaineda5 body bytes, zeroed records with lap/upper1, timer12345Q11, progress50000, clock600, identity pose, source+Z velocity, actual supplied registration and mode718=8. Mode551is0, notspecial3/8; every scenario executes ordinary progression. Mode718=8 is a declared finished-body fixture setting, not a recovered upstream producer. Nativefinish/lap are bound if reached; absence of reached markers is reported, with those branches exercised by separate integration/instruction tests. No placement query, complete physics tick, nativeconstructor, live-process capture or original executable execution. Controller sentinel excludescontrollerwrite; real spatial lists, wheel resets, source matrix padding, progress/index bounds and byte-backed aliases are checked.',summary,resources,samples};
await writeFile('analysis/respawn-runtime-probes.json',JSON.stringify(report,null,2));console.log(JSON.stringify(summary));if(summary.failures.length)process.exitCode=1;

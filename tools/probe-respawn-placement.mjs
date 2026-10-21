import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {createModelCollisionContext,buildModelCandidates} from '../src/model-candidates.mjs';
import {BodyShapePool,registerBodyCollisionShapes} from '../src/body-shape-registration.mjs';
import {initializeVehicleContacts} from '../src/vehicle-contacts.mjs';
import template from '../src/vehicle-contact-template.json' with {type:'json'};
import {appendRespawnRegionCandidates} from '../src/respawn-terrain-candidates.mjs';
import {probeRespawnPlacementBytes,queryRespawnObstruction} from '../src/respawn-query.mjs';
import {queryTerrainSphere} from '../src/terrain-sphere-query.mjs';
import {queryPlacedModelSphere} from '../src/placed-model-sphere-query.mjs';
const U=65536,put=(bytes,p,values)=>values.forEach((value,index)=>bytes.writeInt32LE(value|0,p+index*4)),get=(bytes,p)=>[0,4,8].map(offset=>bytes.readInt32LE(p+offset));
const decode=record=>({originQ8:get(record,8),deltaQ8:get(record,0x14),radiusQ8:record.readInt32LE(0x40),tag:record.readUInt16LE(0x46),surfaceRef:record.readInt32LE(0x38)});
const geometry=initializeVehicleContacts(),descriptors=Buffer.from(template.shapes.hex,'hex'),profiles=[{name:'high',height:80,mode:1},{name:'overlap',height:10,mode:1},{name:'reduced_bound',height:40,mode:2}],resources=[],failures=[],samples=[];
const summary={resources:0,scenarios:0,accepted:0,rejected:0,outside:0,terrainCandidates:0,modelCandidates:0,terrainQueries:0,modelQueries:0,terrainHits:0,modelHits:0,temporaryShapes:0,effectCalls:0};
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try{
 for(const entry of archive.entries){
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;let current;
  try{
   const grid=parseCollisionGrid(data);if(!grid.available)continue;
   const {data:btp}=await archive.readResource(entry.index+1),modelContext=createModelCollisionContext(data,btp,{spatial:grid.spatial}),counts={resource:entry.index,scenarios:0,accepted:0,rejected:0};
   for(const sector of grid.sectors){
    const active=sector.cells.filter(cell=>cell.covered);if(!active.length)continue;const cell=active[Math.floor(active.length/2)],form=cell.forms[0],point=[0,1,2].map(axis=>Math.trunc(form.indices.reduce((sum,index)=>sum+sector.vertices[index][axis],0)/form.indices.length));
    const physical=[],pool=new BodyShapePool(Buffer.alloc(72*32),Array.from({length:32},(_,index)=>index)),body={flags:0x803,position:point.map((value,axis)=>(value-(axis===1?40:0))<<16),linearVelocity:[0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096]},source={bytes:Buffer.alloc(0x4000,0xa5)},clone={bytes:Buffer.alloc(0x4000,0x36)};
    const aggregate=registerBodyCollisionShapes(body,descriptors,pool,physical);aggregate.writeInt32LE(Math.max(aggregate.readInt32LE(0x40),geometry.wheelRadiusQ8),0x40);
    source.bytes.writeInt32LE(body.flags,0);source.bytes.writeInt8(body.collisionCount10c,0x10c);source.bytes.writeInt32LE(0,0x118);source.bytes.writeInt32LE(-1,0x11c);source.bytes.writeInt32LE(-1,0x6bc);put(source.bytes,0x34,body.position);put(source.bytes,0x58,[U,0,0,0]);put(source.bytes,0x68,[0,0,0]);put(source.bytes,0xb8,[0,0,0]);body.rotation.forEach((value,index)=>source.bytes.writeInt16LE(value,0xc4+index*2));body.collisionIds.forEach((value,index)=>source.bytes[0x140+index]=value);
    const priorSpatial=grid.spatial.lookup(body.position),quaternion=Buffer.alloc(16);quaternion.writeInt32LE(U,0);
    const terrainState={count:0,candidates:[],createSlot:()=>({flagsByte0:0xa0,byte2:0x5a}),scratch:{nearestId:-1}},output={value:-1},queryOutput={flags:0,point:[0,0,0],normal:[0,0,0],scalar:0,contactTime:-1};let modelCandidates=[];
    const effects={onClass1Contact:()=>{summary.effectCalls++;return false;},onClass2Contact:()=>summary.effectCalls++,onObjectContact:()=>{summary.effectCalls++;return false;},onClass4Break:()=>summary.effectCalls++};
    const terrainQuery=(record,probe,bound,out)=>{
     summary.terrainQueries++;const result=queryTerrainSphere(grid,terrainState.candidates.slice(0,terrainState.count),decode(record),{parameter:bound,bodyFlags:probe.bytes.readInt32LE(0),roundingMode:'nearest-even',output:{pointQ8:out.point.slice(),normalQ16:out.normal.slice(),distanceQ8:out.scalar,cellRef:out.contactTime}});out.flags=result.flags;
     if(result.flags){summary.terrainHits++;out.point=result.pointQ8;out.normal=result.normalQ16;out.scalar=result.distanceQ8;out.contactTime=result.cellRef|0;}
    };
    const modelQuery=(record,probe,bound,out)=>{
     summary.modelQueries++;const query=decode(record),scratch={flags:out.flags,point:out.point.slice(),normal:out.normal.slice(),scalar:out.scalar,cellRef:out.contactTime};queryPlacedModelSphere(modelCandidates,query,scratch,{maxFractionQ16:bound,vehicleFlags:probe.bytes.readInt32LE(0),activeTag:probe.bytes.readInt8(0x10c),specialType4:false,roundingMode:'nearest-even',effects});record.writeInt32LE(query.surfaceRef,0x38);out.flags=scratch.flags;out.point=scratch.point;out.normal=scratch.normal;out.scalar=scratch.scalar;out.contactTime=scratch.cellRef|0;if(out.flags)summary.modelHits++;
    };
    for(const profile of profiles){
     current={sector:sector.index,cell:cell.index,profile:profile.name};modelCandidates=[];const position=point.map((value,axis)=>(value-(axis===1?profile.height:0))<<16),before=Buffer.from(source.bytes),initialCount=pool.allocatedCount,initialTop=pool.activeTop,free=Buffer.from(pool.freeIds),activeIds=Buffer.from(pool.activeIds.subarray(0,initialTop+1));let outside=false;
     const accepted=probeRespawnPlacementBytes(source,position,{pool,clone,quaternion,rotation:source.bytes.subarray(0xc4,0xd6),mode:profile.mode,output,terrainState,handlers:{
      lookup:point=>{const found=grid.spatial.lookup(point);assert(found.found);outside=found.outside;const zone=grid.zones.find(zone=>zone.root===found.node.zone);return {...found,regions:zone.regions.map(index=>grid.regions.find(region=>region.index===index))};},
      appendTerrain:(probe,sphere,region,center,radius,state)=>appendRespawnRegionCandidates(grid,region,decode(sphere),center,radius,state),
      appendModels:(probe,sphere)=>{const query=decode(sphere),result=buildModelCandidates(modelContext,{flags:probe.bytes.readInt32LE(0),position:query.originQ8.map(value=>value<<8),linearVelocity:query.deltaQ8.map(value=>value<<8)},{radiusQ8:query.radiusQ8,spatialState:priorSpatial});modelCandidates=result.candidates;probe.bytes.writeUInt16LE(modelCandidates.length&65535,0x15e);},
      testGeometry:(probe,original,mode)=>queryRespawnObstruction(probe,original,pool,{mode,physicalGroup:{bodies:[source]},terrainQuery,modelQuery,output:queryOutput})
     }});
     assert.equal(pool.allocatedCount,initialCount);assert.equal(pool.activeTop,initialTop);assert.deepEqual(Buffer.from(pool.freeIds),free);assert.deepEqual(Buffer.from(pool.activeIds.subarray(0,initialTop+1)),activeIds);assert.deepEqual(source.bytes,before);
     summary.scenarios++;counts.scenarios++;summary.temporaryShapes+=6;summary.terrainCandidates+=terrainState.count;summary.modelCandidates+=modelCandidates.length;summary[accepted?'accepted':'rejected']++;counts[accepted?'accepted':'rejected']++;if(outside)summary.outside++;
     if(samples.length<12)samples.push({resource:entry.index,...current,positionQ16:position,mode:profile.mode,aggregateRadiusQ8:pool.records.readInt32LE(clone.bytes[0x145]*72+0x40),terrainCandidates:terrainState.count,modelCandidates:modelCandidates.length,closestTerrain11c:output.value,accepted});
    }
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,...current,error:error.message,stack:error.stack?.split('\n').slice(0,4)});}
 }
}finally{await archive.close();}
summary.resources=resources.length;summary.failures=failures;
const report={method:'Installed-data respawn47d040 integration using real raw-body copy, temporary shape allocation/cache/free, respawn-specific terrain47d9c0, original model append, actual sphere geometry and47d710 obstruction caller. Three declared target heights80/10/40 per covered sector with mode1/1/2, identity quaternion, five original spheres and wheel-extended aggregate, zero velocities, retained candidate bytesa0/5a, explicit pool order and scratch. Mode2 aggregate override8000 is native. Original registration for model lists is the declared initial40-unit-high source lookup. The dynamic list contains only the original source, excluded by identity; dynamic screening is verified separately against native instructions. Effects are explicitly inert; no post-frame lifecycle/progression, captured runtime state, original process execution or complete race equivalence. Every query restores free IDs/counts/active source prefix and preserves the original body bytes.',summary,profiles,resources,samples};
await writeFile('analysis/respawn-placement-probes.json',JSON.stringify(report,null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;

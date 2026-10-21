import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {createModelCollisionContext,buildModelCandidates} from '../src/model-candidates.mjs';
import {buildTerrainCandidates} from '../src/terrain-candidates.mjs';
import {BodyShapePool,registerBodyCollisionShapes} from '../src/body-shape-registration.mjs';
import {BodySpatialRegistry,createBodySpatialSelector} from '../src/body-spatial.mjs';
import {initializeVehicleContacts} from '../src/vehicle-contacts.mjs';
import template from '../src/vehicle-contact-template.json' with {type:'json'};
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {runPostFrameBodyStates} from '../src/post-frame-body-states.mjs';
import {checkPostFrameVehicles} from '../src/post-frame-vehicle-check.mjs';
import {appendRespawnRegionCandidates} from '../src/respawn-terrain-candidates.mjs';
import {probeRespawnPlacementBytes,queryRespawnObstruction} from '../src/respawn-query.mjs';
import {queryTerrainSphere} from '../src/terrain-sphere-query.mjs';
import {queryPlacedModelSphere} from '../src/placed-model-sphere-query.mjs';
import {applyRespawn} from '../src/respawn-apply.mjs';
import {allocateRespawnParticle,emitRespawnParticle,emitVehicleRespawnRing} from '../src/respawn-effects.mjs';

const U=65536,put=(bytes,p,values)=>values.forEach((value,index)=>bytes.writeInt32LE(value|0,p+index*4)),get=(bytes,p)=>[0,4,8].map(offset=>bytes.readInt32LE(p+offset)),decode=record=>({originQ8:get(record,8),deltaQ8:get(record,0x14),radiusQ8:record.readInt32LE(0x40),tag:record.readUInt16LE(0x46),surfaceRef:record.readInt32LE(0x38)});
const limit=Number(process.argv[3]??Infinity);if(!(limit>0))throw Error('Arguments: gamePath maxResources.');
const geometry=initializeVehicleContacts(),descriptors=Buffer.from(template.shapes.hex,'hex'),resources=[],failures=[],samples=[];
const summary={resources:0,scenarios:0,bodyStates:0,prepassChecks:0,prepassHeightMarks:0,prepassSlowMarks:0,queries:0,acceptedQueries:0,rejectedQueries:0,fallbacks:0,terrainCandidates:0,modelCandidates:0,terrainQueries:0,modelQueries:0,terrainHits:0,modelHits:0,dynamicRejections:0,temporaryShapesFreed:0,appliedBodies:0,spatialRemovals:0,spatialInsertions:0,sessionCounterDecrements:0,vehicleRings:0,particles:0,particleReuses:0,emittedEvents:0,modelEffectCallbacks:0};
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try{
 for(const entry of archive.entries){
  if(resources.length>=limit)break;
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;let current;
  try{
   const grid=parseCollisionGrid(data);if(!grid.available)continue;const routes=parseRespawnRoutes(data),usable=routes.groups.slice(1).filter(route=>route.count>=2);assert(usable.length);
   const {data:btp}=await archive.readResource(entry.index+1),modelContext=createModelCollisionContext(data,btp,{spatial:grid.spatial}),sectorHeights=grid.scene.segments.map(segment=>data.readInt16LE(segment.offset+0x14)),counts={resource:entry.index,scenarios:0,bodyStates:0,accepted:0,rejected:0,fallbacks:0};
   //One persistent32-particle pool per resource exercises real active-list reuse
   //after the first two rings. Positions/registers come from the actual helpers.
   const particles=Array.from({length:32},()=>({field94:0,fieldB0:0,fieldB4:0,nextA8:null}));particles.forEach((particle,index)=>particle.previousAC=particles[index+1]??null);
   const effectRuntime={freeHead6e65b4:particles[0],activeHead6e65c0:null,activeTail6e65c8:null,seed5ec958:1,time9153e8:0},particleBuckets=grid.spatial.nodes.map(()=>({headId:0}));
   const particleRegistry=new BodySpatialRegistry(particles.map((particle,index)=>({body:particle,poolOffset:index*256})),particle=>{const found=grid.spatial.lookup(particle.position88);assert(found.found);return{bucket:particleBuckets[found.node.index],outside:found.outside};});
   const particleHandlers={allocate435df0:()=>allocateRespawnParticle(effectRuntime,{removeSpatial:particle=>{particleRegistry.remove(particle);summary.particleReuses++;}}),register474670:particle=>particleRegistry.insert(particle)};
   for(const targetRoute of usable){
    const targetPoint=targetRoute.points[Math.floor(targetRoute.count/2)];current={route:targetRoute.index,point:Math.floor(targetRoute.count/2)};
    const physical=[],pool=new BodyShapePool(Buffer.alloc(72*64),Array.from({length:64},(_,index)=>index)),states=[];
    for(let index=0;index<3;index++){
     const position=targetPoint.position.map(value=>value<<16),body={flags:0x803,position,linearVelocity:[U,2*U,3*U],momentum:[4*U,5*U,6*U],angularVelocity:[0,0,0],force:[7*U,8*U,9*U],torque:[U,U,U],angularMomentum:[2*U,2*U,2*U],quaternion:[U,0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096],frameTimeQ16:U,collisionCache114:-1,collisionFlags:0x81234567|0,collisionState128:index===0?32:0,speed668:index===1?0:2,vehicleIndex65e:index,mode718:8,checkpoint6c0:0,checkpoint6c2:0,field699:0};
     const state=initializeVehicleContacts();state.field650=123;state.wheels.forEach((wheel,wheelIndex)=>Object.assign(wheel,{flags:wheelIndex===0?0:1,spin:100+wheelIndex}));states.push(state);
     const aggregate=registerBodyCollisionShapes(body,descriptors,pool,physical);aggregate.writeInt32LE(Math.max(aggregate.readInt32LE(0x40),geometry.wheelRadiusQ8),0x40);
     const registered=grid.spatial.lookup(body.position);assert(registered.found);const nearest=buildTerrainCandidates(grid,body,{radiusQ8:geometry.wheelRadiusQ8,spatialState:registered});
     //The real candidate builder supplies the initial reference when available;
     //a valid region start is explicit synthetic state if none is selected.
     const zone=grid.zones.find(zone=>zone.root===registered.node.zone),region=grid.regions.find(region=>region.index===zone.regions[0]);body.closestTerrain11c=nearest.closest?((nearest.closest.row<<16)|(nearest.closest.column<<8)|nearest.closest.sector)|0:((region.row<<16)|(region.column<<8)|region.sector)|0;
     if(index===2){const height=sectorHeights[body.closestTerrain11c&255]+513;if(height<=32767){body.position[1]=height<<16;}else body.collisionState128=32;}
     body.raw={bytes:Buffer.alloc(0x4000,0xa5)};
    }
    const buckets=grid.spatial.nodes.map(()=>({headId:0})),registry=new BodySpatialRegistry(physical.map((body,index)=>({body,poolOffset:index*0x4000})),createBodySpatialSelector(grid.spatial,buckets));physical.forEach(body=>registry.insert(body));
    const runtime={session:{vehicleCount54d:3,mode551:3,counters08:[2,2,2]},records:physical.map((body,index)=>({body00:body,field248:index===1?90:0,controller18:0x12345678,respawn54:null,respawn58:-1}))},routeState={currentPoint:null,position:[0,0,0],direction:[0,0,0]},queries=new Map(),applies=new Map();
    const encode=body=>{const bytes=body.raw.bytes;for(const [name,p]of [['flags',0],['frameTimeQ16',0x118],['collisionCache114',0x114],['collisionFlags',0x110],['collisionState128',0x128],['closestTerrain11c',0x11c]])bytes.writeInt32LE(body[name],p);for(const [name,p]of [['position',0x34],['momentum',0x40],['angularMomentum',0x4c],['quaternion',0x58],['linearVelocity',0x68],['force',0x74],['torque',0x80],['angularVelocity',0xb8]])put(bytes,p,body[name]);body.rotation.forEach((value,index)=>bytes.writeInt16LE(value,0xc4+index*2));bytes.writeInt8(body.collisionCount10c,0x10c);body.collisionIds.forEach((value,index)=>bytes[0x140+index]=value);bytes.writeInt32LE(-1,0x6bc);bytes.writeUInt16LE(body.vehicleIndex65e,0x65e);bytes.writeInt16LE(body.speed668,0x668);bytes[0x718]=body.mode718;};physical.forEach(encode);
    const queryOutput={flags:0,point:[0,0,0],normal:[0,0,0],scalar:0,contactTime:-1},clone={bytes:Buffer.alloc(0x4000,0x36)};
    const effects={onClass1Contact:()=>{summary.modelEffectCallbacks++;return false;},onClass2Contact:()=>summary.modelEffectCallbacks++,onObjectContact:()=>{summary.modelEffectCallbacks++;return false;},onClass4Break:()=>summary.modelEffectCallbacks++};
    let prepass,lastRingEcx;
    const result=runPostFrameBodyStates({bodies:physical,count:3},{routes,routeState,slots36:new Uint8Array(36),handlers:{
     prepass:()=>{prepass=checkPostFrameVehicles(runtime,{sectorHeights,vehicleStateFor:body=>states[physical.indexOf(body)]});summary.prepassChecks+=prepass.checkedVehicles;summary.prepassHeightMarks+=prepass.heightFailures;summary.prepassSlowMarks+=prepass.slowFailures;physical.forEach(encode);},
     query:(body,request)=>{
      encode(body);const before=Buffer.from(body.raw.bytes),quaternion=Buffer.alloc(16);put(quaternion,0,request.quaternion);
      const terrainState={count:0,candidates:[],createSlot:()=>({flagsByte0:0xa0,byte2:0x5a}),scratch:{nearestId:-1}},output={value:-1},priorSpatial={found:true,outside:body.spatialOutside,node:grid.spatial.nodes[buckets.indexOf(body.spatialBucket)]};let modelCandidates=[],terrainCollision=false,modelCollision=false;
      const terrainQuery=(record,probe,bound,out)=>{summary.terrainQueries++;const answer=queryTerrainSphere(grid,terrainState.candidates.slice(0,terrainState.count),decode(record),{parameter:bound,bodyFlags:probe.bytes.readInt32LE(0),roundingMode:'nearest-even',output:{pointQ8:out.point.slice(),normalQ16:out.normal.slice(),distanceQ8:out.scalar,cellRef:out.contactTime}});out.flags=answer.flags;if(answer.flags){summary.terrainHits++;terrainCollision=true;out.point=answer.pointQ8;out.normal=answer.normalQ16;out.scalar=answer.distanceQ8;out.contactTime=answer.cellRef|0;}};
      const modelQuery=(record,probe,bound,out)=>{summary.modelQueries++;const query=decode(record),scratch={flags:out.flags,point:out.point.slice(),normal:out.normal.slice(),scalar:out.scalar,cellRef:out.contactTime};queryPlacedModelSphere(modelCandidates,query,scratch,{maxFractionQ16:bound,vehicleFlags:probe.bytes.readInt32LE(0),activeTag:probe.bytes.readInt8(0x10c),specialType4:false,roundingMode:'nearest-even',effects});record.writeInt32LE(query.surfaceRef,0x38);out.flags=scratch.flags;out.point=scratch.point;out.normal=scratch.normal;out.scalar=scratch.scalar;out.contactTime=scratch.cellRef|0;if(out.flags){summary.modelHits++;modelCollision=true;}};
      const initialCount=pool.allocatedCount,initialTop=pool.activeTop,free=Buffer.from(pool.freeIds),active=Buffer.from(pool.activeIds.subarray(0,initialTop+1));
      const accepted=probeRespawnPlacementBytes(body.raw,request.position,{pool,clone,quaternion,rotation:body.raw.bytes.subarray(0xc4,0xd6),mode:request.mode,output,terrainState,handlers:{
       lookup:position=>{const found=grid.spatial.lookup(position);assert(found.found);const zone=grid.zones.find(zone=>zone.root===found.node.zone);return{...found,regions:zone.regions.map(index=>grid.regions.find(region=>region.index===index))};},
       appendTerrain:(probe,sphere,region,center,radius,state)=>appendRespawnRegionCandidates(grid,region,decode(sphere),center,radius,state),
       appendModels:(probe,sphere)=>{const query=decode(sphere),answer=buildModelCandidates(modelContext,{flags:probe.bytes.readInt32LE(0),position:query.originQ8.map(value=>value<<8),linearVelocity:query.deltaQ8.map(value=>value<<8)},{radiusQ8:query.radiusQ8,spatialState:priorSpatial});modelCandidates=answer.candidates;probe.bytes.writeUInt16LE(modelCandidates.length&65535,0x15e);},
       testGeometry:(probe,original,mode)=>{const rejected=queryRespawnObstruction(probe,original,pool,{mode,physicalGroup:{bodies:physical.map(body=>body.raw),count:3},terrainQuery,modelQuery,output:queryOutput});if(rejected&&!terrainCollision&&!modelCollision)summary.dynamicRejections++;return rejected;}
      }});
      const matrix=Array.from({length:9},(_,index)=>body.raw.bytes.readInt16LE(0xc4+index*2));matrix.forEach((value,index)=>request.rotation[index]=value);body.raw.bytes.copy(before,0xc4,0xc4,0xd6);assert.deepEqual(body.raw.bytes,before,'query changes only supplied original rotation');assert.equal(pool.allocatedCount,initialCount);assert.equal(pool.activeTop,initialTop);assert.deepEqual(Buffer.from(pool.freeIds),free);assert.deepEqual(Buffer.from(pool.activeIds.subarray(0,initialTop+1)),active);
      request.queryValue.value=output.value;queries.set(body,{accepted,point:routeState.currentPoint,position:request.position.slice(),quaternion:request.quaternion.slice(),rotation:matrix,closest:output.value});summary.queries++;summary[accepted?'acceptedQueries':'rejectedQueries']++;counts[accepted?'accepted':'rejected']++;summary.terrainCandidates+=terrainState.count;summary.modelCandidates+=modelCandidates.length;summary.temporaryShapesFreed+=body.collisionCount10c+1;return accepted;
     },
     apply:(body,request)=>{
      const index=physical.indexOf(body),query=queries.get(body),counter=runtime.session.counters08[index];assert.deepEqual(request.rotation,query.rotation);assert.deepEqual(request.quaternion,query.quaternion);assert.equal(request.queryValue,query.closest);
      if(!query.accepted){summary.fallbacks++;counts.fallbacks++;}else assert.equal(routeState.currentPoint,query.point);
      const chosen=request.route.pointAt(request.index);assert.equal(chosen,routeState.currentPoint);assert.deepEqual(request.position,chosen.position.map(value=>value<<16));
      applyRespawn(body,{position:request.position,quaternion:request.quaternion,rotation:request.rotation,progressionPointer:request.route,progressionValue:request.index,closestTerrain11c:request.queryValue,vehicleState:states[index],runtime,handlers:{removeSpatial:target=>{registry.remove(target);summary.spatialRemovals++;},insertSpatial:target=>{registry.insert(target);summary.spatialInsertions++;}}});
      assert.deepEqual(body.position,request.position);assert.deepEqual(body.quaternion,query.quaternion);assert.deepEqual(body.rotation,query.rotation);for(const name of ['linearVelocity','momentum','angularVelocity','force','torque','angularMomentum'])assert.deepEqual(body[name],[0,0,0]);assert.equal(body.closestTerrain11c,query.closest);assert.equal(body.checkpoint6c0,request.route.byte05);assert.equal(body.checkpoint6c2,request.index&65535);assert.equal(runtime.session.counters08[index],counter-1);assert(states[index].wheels.every(wheel=>wheel.spin===0));assert.equal(states[index].field650,0);assert.equal(body.collisionState128,32);
      encode(body);applies.set(body,{route:request.route,index:request.index});summary.appliedBodies++;summary.sessionCounterDecrements++;
      //Type3 always runs the real tail next;47d440's leakedECX is consequently
      //overwritten before outer emission and is never used by this fixture.
      return{registerEcx:0};
     },
     vehicleTail:(body,code)=>{assert.equal(code,0);const result=emitVehicleRespawnRing(body,code,{emitParticle:(position,velocity,options)=>{summary.particles++;return emitRespawnParticle(position,velocity,{...options,runtime:effectRuntime,handlers:particleHandlers});}});lastRingEcx=result.registerEcx;assert.equal(body.field699,31);summary.vehicleRings++;return result;},
     emit:({code,registerEdx,args})=>{assert.equal(code,43);assert.equal(registerEdx,0);assert.deepEqual(args,[0,-1,9000,6,lastRingEcx,0,0]);summary.emittedEvents++;}
    }});
    assert.equal(result.visitedBodies,3);assert.equal(result.respawnedBodies,3);assert.equal(result.retiredBodies,0);assert.equal(result.stoppedByType4,false);assert.equal(queries.size,3);assert.equal(applies.size,3);assert.equal(pool.allocatedCount,18);
    for(const body of physical){const selected=grid.spatial.lookup(body.position);assert.equal(body.spatialBucket,buckets[selected.node.index]);assert.equal(body.spatialOutside,selected.outside);}
    const seen=new Set();let last=null;for(let particle=effectRuntime.activeHead6e65c0;particle;particle=particle.nextA8){assert(!seen.has(particle));assert.equal(particle.previousAC,last);assert.equal(particle.field94,1);assert.equal(particle.flags,23);assert.equal(particle.timestampA4,effectRuntime.time9153e8);seen.add(particle);last=particle;}assert.equal(seen.size,32);assert.equal(last,effectRuntime.activeTail6e65c8);
    summary.scenarios++;summary.bodyStates+=3;counts.scenarios++;counts.bodyStates+=3;
    if(samples.length<16)samples.push({resource:entry.index,...current,prepass,queryAcceptance:physical.map(body=>queries.get(body).accepted),selected:physical.map(body=>({route:applies.get(body).route.index,index:applies.get(body).index,positionQ16:body.position,closestTerrain11c:body.closestTerrain11c})),rng:effectRuntime.seed5ec958,lastEmitterEcx:lastRingEcx});effectRuntime.time9153e8++;
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,...current,error:error.message,stack:error.stack?.split('\n').slice(0,5)});}
 }
}finally{await archive.close();}
summary.resources=resources.length;summary.failures=failures;
const report={method:'Installed-data postphysics integration: actual authored route tables,47ccc0 persistent closest/second selection and fallback,47e180 numeric vehicle checks using actual sector+14 headers,47d040 complete rawbody clone/orientation/temp-shape/free path,47d9c0 region append, actual model append and sphere geometry,47d710 terrain/model/dynamic obstruction,47d440 pose/reset/special-mode counters/registration,47d900+436920+435df0 ring/particles/allocator with actual spatial lists and exact emitterECX. One3-body scenario per nonheader routegroup with at least2points. Complete synthetic0x4000 body storage has declareda5 retained bytes and explicitly encoded known fields, five original shape descriptors, wheel-extended aggregate, mode3 session/counters/controller sentinel, identity initial quaternion and declared initial velocities/forces. Initial closest reference comes from the ordinary candidate builder or an explicitly declared region-start fallback. Profiles are prior state32, slowcounter90/missingwheel and signedheight+513 (priorstate32 if that height is unrepresentable). No fixture is captured live game state. Source matrix mutation is synchronized before apply; fallback retains first orientation/query output. Body/pool/list/reset/counter/ring/ECX invariants checked. The final484bb0 event is an inspected explicit boundary; model effects are explicitly inert, progression callees are legitimately unvisited by declared mode3, and lifecycle retirement/type4 paths are outside these type3 fixtures. No physics/attachment execution, original executable execution, rendered particles or complete race equivalence.',summary,resources,samples};
await writeFile('analysis/post-frame-respawn-probes.json',JSON.stringify(report,null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;

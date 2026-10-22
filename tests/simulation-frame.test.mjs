import test from 'node:test';
import assert from 'node:assert/strict';
import {stepSimulationFrame,stepPhysicsAndAttachments,stepPhysicsAttachmentsAndBodyStates} from '../src/simulation-frame.mjs';
import {applyRespawn} from '../src/respawn-apply.mjs';
import {ATTACHMENT_SCRATCH_LENGTH} from '../src/body-attachments.mjs';
import {BodyShapePool,registerBodyCollisionShapes} from '../src/body-shape-registration.mjs';
import {BodySpatialRegistry,createBodySpatialSelector} from '../src/body-spatial.mjs';
import {CollisionEventQueue} from '../src/collision-events.mjs';
import {updateBodyDerived} from '../src/body-physics.mjs';
import {initializeVehicleContacts} from '../src/vehicle-contacts.mjs';
import {initializeWheelForceCoefficients} from '../src/wheel-forces.mjs';
import {readVehicleDriveConfiguration} from '../src/wheel-drive.mjs';

const U=65536;
function fixture({height=-6,velocity=8,gravity=0,terrain=true}={}) {
 const node={index:0,zone:0},vertices=[[0,0,0,0],[200,0,0,0],[0,0,-200,0],[200,0,-200,0]];
 const spatial={available:true,nodes:[node],lookup:()=>({found:true,outside:false,node})};
 const grid={available:true,spatial,zones:[{root:0,regions:terrain?[0]:[]}],regions:[{index:0,sector:0,row:0,column:0,rows:1,columns:1,padding:200}],normals:[{packed:((768<<10)>>>0),components:[0,-256,0]}],sectors:[{index:0,columns:1,rows:1,vertices,cells:[{forms:[{type:0,normal:0,point:null,indices:[0,1,3,2]}]}],flags:1}]};
 const modelContext={spatial,links:{nodes:[{placementIndices:[]}]},instances:new Map()};
 const body={flags:0x1803,integrationFlags:1,position:[50*U,height*U,-50*U],momentum:[0,velocity*U,0],angularMomentum:[0,0,0],quaternion:[U,0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096],inverseInertia:[U,U,U],mass:U,inverseMass:U,coefficient7c:0,force:[0,0,0],torque:[0,0,0],collisionFlags:0,attachmentCount:0,contactFrictionB4:0,closestTerrain11c:null,pairCollisionContext:{stateByte6bc:null,field3d00:0}};
 updateBodyDerived(body);const physical=[],pool=new BodyShapePool(Buffer.alloc(72*8),[0,1,2,3,4,5,6,7]),descriptor=Buffer.alloc(20);descriptor.writeInt32LE(2*256,12);registerBodyCollisionShapes(body,descriptor,pool,physical);
 const buckets=[{headId:0}],registry=new BodySpatialRegistry([{body,poolOffset:0}],createBodySpatialSelector(spatial,buckets));registry.insert(body);
 const calls=[],context={environment:{data:null,grid,modelContext},records:pool.records,queue:new CollisionEventQueue(16),candidateArena:{entries:[],startOffset:0},candidateGroups:{groups:[{bodies:[],count:0},{bodies:[],count:0}],count:0,refreshGroup:{bodies:[],count:0}},effectFlags:{first:0,second:0},gravityQ16:gravity,roundingMode:'nearest-even',spatialStateFor:()=>({found:true,outside:false,node}),selectionCounter:0,
  staticScratch:{contact:{point:[0,0,0],normal:[0,0,0],scalar:0,field38:-1,flags44:0},tag:{value:0}},queryOutput:{point:[0,0,0],normal:[0,0,0],scalar:0,contactTime:-1,flags:0},
  handlers:{...registry.handlers(),externalWorld:()=>calls.push('world'),removeBody:()=>calls.push('remove')}};
 return {body,group:{bodies:physical,count:1},pool,context,calls,registry,buckets};
}
function vehicleFixture(){
 const f=fixture({terrain:false,height:-100,velocity:0}),state=initializeVehicleContacts();state.airSpinCounter=0;state.driveEffects=Array.from({length:6},()=>({status:0,payload:[0,0,0,0,0,0]}));
 state.wheels.forEach(wheel=>Object.assign(wheel,{spin:0,angle:0,effectFlags:0,effectSpeed:0,slipSpeed:0,leverArm:[0,0,0],relativeHit:[0,0,0],slipVector:[0,0,0],tractionCorrection:[0,0,0],slipWithSpin:[0,0,0]}));initializeWheelForceCoefficients(f.body,state);
 f.body.collisionCooldown66f=64;f.body.closestTerrain11c=-1;
 Object.assign(f.context.handlers,{onSurfaceParticles:()=>{},onTractionEffects:()=>{},onEmitEffect:()=>{},onSpecialEvent:()=>{},onBreakableContact:()=>false});
 const vehicle={body:f.body,state,drive:readVehicleDriveConfiguration(0),steeringAngleQ16:0,reverseSteering:false,trackContext:{mode:0,progressStage:0,routeIndex:0},driveContext:{gameMode:0,modeFlags:0,specialMode:false,effectLevel:0,effectMode:0}};
 return {...f,vehicle};
}

test('a geometry-derived impact stores contact state and regeneration preserves the resting pose next frame',()=>{
 const f=fixture(),first=stepSimulationFrame(f.group,[],f.context);
 assert.equal(first.preparedBodies,1);assert.equal(first.initialEvents,1);assert.ok(first.processedEvents>=1);assert.ok(first.storedContacts>=1);assert.ok(first.terrainHits>=1);
 assert.equal(f.body.frameTimeQ16,U);assert.equal(f.body.linearVelocity[1],0);assert.ok(f.body.position[1]<=-2*U);assert.equal(f.context.queue.count,0);assert.equal(first.ordinary[0].contacts,0);
 // The final regenerated no-hit query clears this shape's consumed-contact
 // marker. A stored aggregate alone must not invent next-frame friction.
 assert.equal(f.pool.records.readUInt16LE(f.body.collisionIds[0]*72+0x44)&0x100,0);
 const afterImpact=f.body.position.slice(),second=stepSimulationFrame(f.group,[],f.context);
 assert.equal(second.ordinary[0].contacts,0);assert.equal(f.body.frameTimeQ16,U);assert.deepEqual(f.body.position,afterImpact);assert.equal(f.context.queue.count,0);
 assert.deepEqual(f.calls,['world','world']);assert.equal(f.buckets[0].headId,f.registry.idFor(f.body));
});

test('consecutive empty-world frames retain momentum, apply gravity once and reset their frame clocks',()=>{
 const f=fixture({height:-100,velocity:0,gravity:U/4,terrain:false});
 const positions=[];for(let frame=0;frame<4;frame++){const result=stepSimulationFrame(f.group,[],f.context);positions.push(f.body.position[1]);assert.equal(result.processedEvents,0);assert.equal(f.body.frameTimeQ16,U);assert.equal(f.body.force[1],0);}
 assert.deepEqual(positions,[-100*U+U/4,-100*U+3*U/4,-100*U+6*U/4,-100*U+10*U/4]);assert.equal(f.body.momentum[1],U);
});

test('the same per-body time scale reaches gravity, shape cache and final movement',()=>{
 const f=fixture({height:-100,velocity:0,gravity:U,terrain:false});f.context.timeOptionsFor=()=>({timeScaleActive:true,timeScaleExempt:false,timeScaleQ16:U/2});
 stepSimulationFrame(f.group,[],f.context);assert.equal(f.body.momentum[1],U/2);assert.equal(f.body.position[1],-100*U+U/4);assert.equal(f.body.frameTimeQ16,U);
 const aggregate=f.pool.records.subarray(f.body.collisionIds[1]*72,(f.body.collisionIds[1]+1)*72);assert.equal(aggregate.readInt32LE(24),128);
});

test('external-world mutations precede candidates and effect globals clear before those stages',()=>{
 const f=fixture({height:-100,velocity:0,terrain:false});f.context.effectFlags.first=1;f.context.handlers.applyEffect91cd90=body=>{body.force[0]=2*U;};
 f.context.handlers.externalWorld=()=>{assert.equal(f.context.effectFlags.first,1);f.body.position[0]+=U;};
 stepSimulationFrame(f.group,[],f.context);assert.deepEqual(f.context.effectFlags,{first:0,second:0});assert.equal(f.body.position[0],53*U);
 const aggregate=f.pool.records.subarray(f.body.collisionIds[1]*72,(f.body.collisionIds[1]+1)*72);assert.equal(aggregate.readInt32LE(8),51*256);assert.equal(aggregate.readInt32LE(20),2*256);
});

test('required external world and registration boundaries fail before mutating frame state',()=>{
 const f=fixture();f.body.frameTimeQ16=123;delete f.context.handlers.externalWorld;
 assert.throws(()=>stepSimulationFrame(f.group,[],f.context),/external world/);assert.equal(f.body.frameTimeQ16,123);
 f.context.handlers.externalWorld=()=>{};delete f.context.spatialStateFor;
 assert.throws(()=>stepSimulationFrame(f.group,[],f.context),/registration/);assert.equal(f.body.frameTimeQ16,123);
});

test('vehicle surface registration retains packed cell zero and the negative sentinel',()=>{
 for(const packed of [-1,0]){
  const f=vehicleFixture();f.body.closestTerrain11c=packed;
  // Cell zero has a valid vertex word; -1 exits before consulting this data.
  f.context.environment.data=Buffer.alloc(0x100);f.context.environment.grid.scene={segments:[{columns:1,rows:1,verticesOffset:0x80}]};
  stepSimulationFrame(f.group,[f.vehicle],f.context);assert.equal(f.vehicle.registeredCellRef,packed);
 }
});

test('derivative refresh reads the physical list after wheel effect callbacks replace it',()=>{
 const f=vehicleFixture();f.context.handlers.onSurfaceParticles=()=>{f.body.angularMomentum=[U,0,0];f.group.bodies=[];f.group.count=0;};
 const result=stepSimulationFrame(f.group,[f.vehicle],f.context);
 assert.equal(result.preparedBodies,1);assert.deepEqual(f.body.angularMomentum,[U,0,0]);assert.deepEqual(f.body.angularVelocity,[0,0,0]);assert.equal(result.finishedBodies,0);
});

test('a vehicle with a read-only runtime timeOptions getter receives the frame provider',()=>{
 const f=vehicleFixture();let reads=0;
 Object.defineProperty(f.vehicle,'timeOptions',{get:()=>{reads++;return {timeScaleActive:false};}});
 f.context.timeOptionsFor=body=>{assert.equal(body,f.body);return {timeScaleActive:true,timeScaleExempt:false,timeScaleQ16:U/2};};
 const result=stepSimulationFrame(f.group,[f.vehicle],f.context);
 assert.equal(result.preparedBodies,1);assert.equal(f.body.frameTimeQ16,U);assert.equal(reads,0);
});

test('scripted kinematic bodies retain bytecode progress across frames and bypass ordinary gravity and time scaling',()=>{
 const f=fixture({height:-100,velocity:0,gravity:U,terrain:false}),bytecode=Buffer.alloc(10);bytecode.writeInt16LE(256,2);bytecode.writeInt16LE(8,8);
 Object.assign(f.body,{flags:0xa203,scriptOffset138:0,scriptTimer13a:0,scriptActionTimer13c:0,scriptSegment13e:0,scriptSpawnIndex13f:0});
 f.context.scriptOptionsFor=()=>({bytecode});f.context.timeOptionsFor=()=>({timeScaleActive:true,timeScaleQ16:U/2,timeScaleExempt:false});
 for(let frame=0;frame<2;frame++){const result=stepSimulationFrame(f.group,[],f.context);assert.equal(result.scriptedBodies,1);assert.equal(result.ordinaryBodies,0);assert.equal(f.body.scriptOffset138,8);assert.equal(f.body.position[0],(51+frame)*U);assert.equal(f.body.position[1],-100*U);assert.equal(f.body.frameTimeQ16,U);}
});

test('outside static rejection completes clock and state without destroying or advancing an ordinary body',()=>{
 const f=fixture(),node=f.context.spatialStateFor(f.body).node,position=f.body.position.slice();f.body.spatialOutside=true;
 f.context.spatialStateFor=()=>({found:true,outside:true,node});f.context.environment.grid.spatial.lookup=()=>({found:true,outside:true,node});
 const result=stepSimulationFrame(f.group,[],f.context);
 assert.equal(result.rejectedContacts,1);assert.equal(result.processedEvents,1);assert.equal(f.body.frameTimeQ16,U);assert.equal(f.body.collisionState128,32);assert.deepEqual(f.body.position,position);
 assert.equal(f.group.bodies[0],f.body);assert.equal(f.buckets[0].headId,f.registry.idFor(f.body));assert.deepEqual(f.calls,['world']);
});

test('nonzero world effect flag2 updates records while skipping the ordinary exact-one effect gate',()=>{
 const f=fixture({terrain:false,height:-100,velocity:0}),records=Buffer.alloc(16);records.writeInt16LE(400,0);records[6]=100;f.context.effectFlags.first=2;
 delete f.context.handlers.externalWorld;f.context.worldEffectState={records,count:1,originS16:[0,0,0],strength:1};
 const result=stepSimulationFrame(f.group,[],f.context);assert.equal(result.worldUpdatedRecords,1);assert.equal(records[6],98);assert.deepEqual(f.context.effectFlags,{first:0,second:0});assert.deepEqual(f.calls,[]);
});

test('actual ordinary impulse then damping apply before force integration and the world pass',()=>{
 const f=fixture({terrain:false,height:-100,velocity:0}),origin=f.body.position.slice(),globals={field91cd60:0,field91cd64:0,field91cd68:0,field91cd6c:0,field91cd70:0,field91cd74:0};
 f.body.flags=(f.body.flags&~511)|7;f.body.momentum=[8*U,0,0];f.body.linearVelocity=[8*U,0,0];f.context.effectFlags={first:1,second:1};
 f.context.bodyEffectImpulse={originQ16:[origin[0]-16*U,origin[1],origin[2]],strength:4};f.context.bodyEffectDamping={originQ16:origin,timeScaleActive:false,globals};
 delete f.context.handlers.externalWorld;f.context.worldEffectState={records:Buffer.alloc(0),count:0,originS16:[34,-100,-50],strength:4};
 stepSimulationFrame(f.group,[],f.context);
 // Type7 halves the impulse:2 units added after the second effect halves
 // the existing8-unit momentum. Both stages therefore produce6, not5.
 assert.equal(f.body.momentum[0],6*U);assert.equal(f.body.position[0],56*U);assert.equal(globals.field91cd60,1);assert.equal(globals.field91cd64,31);assert.equal(globals.field91cd68,2);assert.deepEqual(f.context.effectFlags,{first:0,second:0});
});

test('a script release action enables ordinary dynamics for the following frame without deleting the body',()=>{
 const f=fixture({terrain:false,height:-100,velocity:0,gravity:U/4}),bytecode=Buffer.alloc(64),rng={seed:1},effects=[];bytecode.writeInt16LE(3,0);bytecode.writeInt16LE(1,2);bytecode.writeUInt16LE(2,22);
 Object.assign(f.body,{flags:0x3803,scriptOffset138:0,scriptTimer13a:0,scriptActionTimer13c:0,scriptSegment13e:0,scriptSpawnIndex13f:0});
 f.context.scriptOptionsFor=()=>({bytecode});f.context.scriptedReleaseState={rng,handlers:{onReleaseEffect:({body,code})=>effects.push([body,code])}};
 const first=stepSimulationFrame(f.group,[],f.context);assert.equal(first.scriptedBodies,1);assert.equal(f.body.flags&0x2000,0);assert.equal(f.body.integrationFlags&1,0);assert.equal(rng.seed,16807);assert.equal(effects[0][0],f.body);assert.equal(effects[0][1],16);assert.equal(f.body.position[1],-100*U);
 const second=stepSimulationFrame(f.group,[],f.context);assert.equal(second.ordinaryBodies,1);assert.equal(second.scriptedBodies,0);assert.equal(f.body.position[1],-100*U+U/4);assert.equal(f.group.bodies[0],f.body);
});

test('an active vehicle routes the radial effect into target state instead of ordinary force',()=>{
 const f=fixture({terrain:false,height:-100,velocity:0}),state=Buffer.alloc(265),lookup=Buffer.alloc(64);state[8]=1;
 f.body.pairCollisionContext.stateByte6bc=1;f.context.effectFlags.first=1;
 f.context.bodyEffectImpulse={originQ16:[f.body.position[0]-16*U,...f.body.position.slice(1)],strength:4};
 f.context.activeVehicleEffectFor=body=>{assert.equal(body,f.body);return {state,lookup};};
 const position=f.body.position.slice();stepSimulationFrame(f.group,[],f.context);
 assert.equal(state[9],0x70);assert.equal(state[8],1);assert.deepEqual(f.body.momentum,[0,0,0]);assert.deepEqual(f.body.position,position);
});

test('queued attachments use the completed pose and their storage is reused on the following frame',()=>{
 const f=fixture({terrain:false,height:-100,velocity:8}),records=Buffer.alloc(16,0xa5),queue={entries:[],count:0};
 delete f.body.attachmentCount;Object.assign(f.body,{attachmentHandles:[0x1001,0,0,0,0],rotationPaddingD6:0});
 f.context.handlers.attachmentQueue=queue;f.context.attachments={pointsFor:()=>Buffer.alloc(8),type1Records:records,scratch:Buffer.alloc(ATTACHMENT_SCRATCH_LENGTH,0xa5),roundingMode:'nearest-even'};
 for(const expectedY of [-92,-84]){
  const result=stepPhysicsAndAttachments(f.group,[],f.context);assert.equal(result.attachments.type1Writes,1);assert.deepEqual([8,10,12].map(offset=>records.readInt16LE(offset)),[50,expectedY,-50]);assert.equal(records.readUInt16LE(14),1);assert.equal(queue.count,0);assert.equal(queue.entries.length,1);assert.equal(queue.entries[0],f.body);
 }
});

function attachFixture(f){
 const records=Buffer.alloc(16,0xa5),queue={entries:[],count:0};
 delete f.body.attachmentCount;Object.assign(f.body,{attachmentHandles:[0x1001,0,0,0,0],rotationPaddingD6:0});
 f.context.handlers.attachmentQueue=queue;f.context.attachments={pointsFor:()=>Buffer.alloc(8),type1Records:records,scratch:Buffer.alloc(ATTACHMENT_SCRATCH_LENGTH,0xa5),roundingMode:'nearest-even'};
 return records;
}

test('the actual vehicle prepass observes completed physics after attachment writes, then dispatches state32',()=>{
 const f=fixture({terrain:false,height:-100,velocity:8}),records=attachFixture(f);
 f.body.flags=(f.body.flags&~511)|4;f.body.controller164={body:f.body,timer3a:0,flags39:0};
 f.body.collisionFlags=0x80000000;f.body.closestTerrain11c=0;
 f.context.postFrame={vehicleCheck:{runtime:{session:{vehicleCount54d:1},records:[{body00:f.body,field248:51}]},sectorHeights:[-1000]}};
 const result=stepPhysicsAttachmentsAndBodyStates(f.group,[],f.context);
 assert.equal(records.readInt16LE(10),-92);assert.equal(f.body.position[1],-92*U);
 assert.equal(result.postFrameVehicleCheck.heightFailures,1);assert.equal(result.postFrame.stoppedByType4,true);
 assert.equal(f.body.collisionState128,32);assert.equal(f.body.collisionFlags&0x80000000,0);
 assert.equal(f.body.controller164.timer3a,20);assert.equal(f.body.controller164.flags39,0x80);assert.ok(f.body.flags&0x200);
});

test('state dispatch applies the selected respawn after attachments and reinserts the actual spatial body',()=>{
 const f=fixture({terrain:false,height:-100,velocity:8}),records=attachFixture(f),trace=[];
 f.body.flags=(f.body.flags&~511)|5;f.body.quaternionDerivative=[123,456,789,1011];
 const points=[{position:[50,-110,-50]},{position:[50,-90,-40]}],route={count:2,reverseByte2:0,points};
 f.context.postFrame={routes:{countByte46:2,groups:[{},route]},routeState:{currentPoint:null},handlers:{
  prepass:()=>{trace.push('prepass');assert.equal(records.readInt16LE(10),-92);f.body.collisionState128=32;},
  query:(body,query)=>{trace.push('query');assert.equal(body.position[1],-92*U);body.quaternionDerivative=[123,456,789,1011];query.queryValue.value=0;return 1;},
  apply:(body,selected)=>{trace.push('apply');applyRespawn(body,{...selected,closestTerrain11c:selected.queryValue,spatialRegistry:f.registry});return {registerEcx:0x1234};},
  emit:event=>{trace.push('emit');assert.equal(event.args[4],0x1234);assert.equal(f.body.position[1],-90*U);}
 }};
 const result=stepPhysicsAttachmentsAndBodyStates(f.group,[],f.context);
 assert.deepEqual(trace,['prepass','query','apply','emit']);assert.equal(result.postFrame.respawnedBodies,1);
 assert.equal(records.readInt16LE(10),-92);assert.deepEqual(f.body.position,[50*U,-90*U,-40*U]);assert.deepEqual(f.body.momentum,[0,0,0]);
 assert.deepEqual(f.body.quaternionDerivative,[123,456,789,1011]);assert.equal(f.body.closestTerrain11c,0);assert.equal(f.buckets[0].headId,f.registry.idFor(f.body));
 assert.equal(f.context.handlers.attachmentQueue.count,0);
});

test('post-frame context is required before any composed physics mutation',()=>{
 const f=fixture();f.body.frameTimeQ16=123;
 assert.throws(()=>stepPhysicsAttachmentsAndBodyStates(f.group,[],f.context),/Post-frame composition/);assert.equal(f.body.frameTimeQ16,123);
});

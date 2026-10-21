import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import template from '../src/vehicle-contact-template.json' with {type:'json'};
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {createModelCollisionContext} from '../src/model-candidates.mjs';
import {BodyShapePool,registerBodyCollisionShapes} from '../src/body-shape-registration.mjs';
import {BodySpatialRegistry,createBodySpatialSelector} from '../src/body-spatial.mjs';
import {initializeVehicleContacts} from '../src/vehicle-contacts.mjs';
import {initializeWheelForceCoefficients} from '../src/wheel-forces.mjs';
import {readVehicleDriveConfiguration} from '../src/wheel-drive.mjs';
import {updateBodyDerived} from '../src/body-physics.mjs';
import {CollisionEventQueue} from '../src/collision-events.mjs';
import {stepPhysicsAndAttachments} from '../src/simulation-frame.mjs';
import {ATTACHMENT_SCRATCH_LENGTH} from '../src/body-attachments.mjs';
const limit=Number(process.argv[3]??Infinity),frames=Number(process.argv[4]??8);if(!(limit>0)||!Number.isInteger(frames)||frames<2||frames>16)throw Error('Arguments: gamePath maxResources frames(2..16).');
const descriptors=Buffer.from(template.shapes.hex,'hex'),resources=[],failures=[],samples=[],summary={resources:0,scenarios:0,frames:0,bodyFrames:0,initialEvents:0,regeneratedEvents:0,processedEvents:0,invalidatedEvents:0,terrainQueries:0,terrainHits:0,modelQueries:0,modelHits:0,storedContacts:0,rejectedContacts:0,frictionBodies:0,consumedContacts:0,wheelHits:0,worldEffectPasses:0,worldUpdatedRecords:0,attachmentEntries:0,attachmentType1Writes:0,spatialMoves:0,preservedPositionTransitions:0,preservedWheelAngleTransitions:0,cooldownDecays:0,airCounterTransitions:0,effectCallbacks:0};let attemptedResources=0;
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
 for(const entry of archive.entries) {
  if(attemptedResources>=limit)break;const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  let current;
  try {
   const grid=parseCollisionGrid(data);if(!grid.available)continue;attemptedResources++;
   const {data:btp}=await archive.readResource(entry.index+1),modelContext=createModelCollisionContext(data,btp,{spatial:grid.spatial}),counts={resource:entry.index,scenarios:0,frames:0,initialEvents:0,regeneratedEvents:0,processedEvents:0,frictionBodies:0,wheelHits:0,rejectedContacts:0};
   for(const sector of grid.sectors) {
    const active=sector.cells.filter(cell=>cell.covered);if(!active.length)continue;
    const cell=active[Math.floor(active.length/2)],form=cell.forms[0],point=[0,1,2].map(axis=>Math.trunc(form.indices.reduce((sum,index)=>sum+sector.vertices[index][axis],0)/form.indices.length));point[1]-=40;
    const physical=[],vehicles=[],pool=new BodyShapePool(Buffer.alloc(72*32),Array.from({length:32},(_,id)=>id));
    for(let index=0;index<2;index++) {
     const body={flags:index?0x1c03:0x1803,integrationFlags:0,frameTimeQ16:0,attachmentCount:1,position:point.map((value,axis)=>(value+(axis===0?index*64:0))<<16),momentum:[0,0,(index?-1:1)*65536],angularMomentum:[0,0,0],quaternion:[65536,0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096],inverseInertia:[21671,17762,31930],mass:65536,inverseMass:65536,coefficient7c:0,force:[0,0,0],torque:[0,0,0],collisionFlags:0,collisionCooldown66f:255,closestTerrain11c:null,contactFrictionB4:32768,dragCoefficient2f38:0};updateBodyDerived(body);
     const state=initializeVehicleContacts();Object.assign(state,{airSpinCounter:0,reverseByte64f:0,rememberedSide654:0,airCounter655:0,speed664:0,driveEffects:Array.from({length:6},()=>({status:0,payload:[0,0,0,0,0,0]}))});
     state.wheels.forEach(wheel=>Object.assign(wheel,{spin:0,angle:0,effectFlags:0,effectSpeed:0,slipSpeed:0,leverArm:[0,0,0],relativeHit:[0,0,0],slipVector:[0,0,0],tractionCorrection:[0,0,0],slipWithSpin:[0,0,0]}));initializeWheelForceCoefficients(body,state);
     const aggregate=registerBodyCollisionShapes(body,descriptors,pool,physical);aggregate.writeInt32LE(Math.max(aggregate.readInt32LE(64),state.wheelRadiusQ8),64);
     const drive=readVehicleDriveConfiguration((entry.index>>1)%7);Object.assign(drive,{multiplierQ16:0,capacityOverride:0,specialTimer:40});body.pairCollisionContext={field3d00:drive.field3d00,stateByte6bc:null};
     vehicles.push({body,state,drive,steeringAngleQ16:index?512:0,reverseSteering:false,registeredCellRef:(cell.row<<16)|(cell.column<<8)|sector.index,trackContext:{mode:0,progressStage:0,routeIndex:0},driveContext:{gameMode:0,modeFlags:0,specialMode:false,effectLevel:0,effectMode:0}});
     delete body.attachmentCount;body.attachmentHandles=[0x1000|index,0,0,0,0];body.rotationPaddingD6=0;
    }
    const buckets=grid.spatial.nodes.map(()=>({headId:0})),select=createBodySpatialSelector(grid.spatial,buckets),registry=new BodySpatialRegistry(physical.map((body,index)=>({body,poolOffset:index*0x4000})),select),spatial=registry.handlers();physical.forEach(body=>registry.insert(body));
    const attachmentQueue={entries:[],count:0},queue=new CollisionEventQueue(32),candidateGroups={groups:Array.from({length:4},()=>({bodies:[],count:0,spatialBucket:null})),count:0,refreshGroup:{bodies:[],count:0,spatialBucket:null}},context={environment:{data,grid,modelContext},records:pool.records,queue,candidateArena:{entries:[],startOffset:0},candidateGroups,effectFlags:{first:0,second:0},gravityQ16:0x4000,roundingMode:'nearest-even',selectionCounter:0,spatialStateFor:body=>({found:true,outside:body.spatialOutside,node:grid.spatial.nodes[buckets.indexOf(body.spatialBucket)]}),vehiclePreparationStateFor:body=>vehicles.find(vehicle=>vehicle.body===body).state,staticScratch:{contact:{point:[0,0,0],normal:[0,0,0],scalar:0,field38:-1,flags44:0},tag:{value:0}},queryOutput:{point:[0,0,0],normal:[0,0,0],scalar:0,contactTime:-1,flags:0}};
    context.attachments={pointsFor:()=>Buffer.alloc(8),type1Records:Buffer.alloc(16,0xa5),type2Objects:[],type4Records:Buffer.alloc(0),scratch:Buffer.alloc(ATTACHMENT_SCRATCH_LENGTH,0xa5),roundingMode:'nearest-even'};
    const effects={onClass1Contact:()=>{summary.effectCallbacks++;return false;},onClass2Contact:()=>summary.effectCallbacks++,onObjectContact:()=>{summary.effectCallbacks++;return false;},onClass4Break:()=>summary.effectCallbacks++};
    context.worldEffectState={records:Buffer.alloc(0),count:0,originS16:[0,0,0],strength:0};
    context.handlers={attachmentQueue,removeSpatial:spatial.removeSpatial,insertSpatial:body=>{spatial.insertSpatial(body);summary.spatialMoves++;},modelEffects:effects,onBreakableContact:()=>false,onTractionEffects:({wheel,measuredSpeed,surfaceReduction})=>{wheel.effectSpeed=measuredSpeed>0x40000&&(surfaceReduction>>>0)<=2?measuredSpeed:0;},onEmitEffect:()=>summary.effectCallbacks++,onSurfaceParticles:()=>summary.effectCallbacks++,onSpecialEvent:()=>summary.effectCallbacks++};
    const invalidate=queue.invalidate.bind(queue);let invalidated=0;queue.invalidate=(...args)=>{const count=invalidate(...args);invalidated+=count;return count;};
    const initialPositions=physical.map(body=>body.position.slice()),ids=physical.map(body=>body.collisionIds.slice());let lastReport;
    for(let frame=0;frame<frames;frame++) {
     current={sector:sector.index,cell:cell.index,frame};const prior=vehicles.map(vehicle=>({position:vehicle.body.position.slice(),angle:vehicle.state.wheels.map(wheel=>wheel.angle),cooldown:vehicle.body.collisionCooldown66f,air:vehicle.state.airCounter655,selectedContacts:vehicle.body.collisionIds.slice(0,5).filter(id=>pool.records.readUInt16LE(id*72+0x44)&0x100).length}));
     const priorInvalidated=invalidated,result=stepPhysicsAndAttachments({bodies:physical},vehicles,context);lastReport=result;
     summary.attachmentEntries+=result.attachments.processedBodies;summary.attachmentType1Writes+=result.attachments.type1Writes;assert.equal(attachmentQueue.count,0);
     for(const body of attachmentQueue.entries.slice(0,result.attachments.processedBodies)){const target=(body.attachmentHandles[0]&0xfff)*8;for(let axis=0;axis<3;axis++)assert.equal(context.attachments.type1Records.readInt16LE(target+axis*2),body.position[axis]>>16);assert.equal(context.attachments.type1Records.readUInt16LE(target+6),1);}
     summary.worldEffectPasses++;summary.worldUpdatedRecords+=result.worldUpdatedRecords;assert.equal(result.worldUpdatedRecords,0);
     assert.equal(result.preparedBodies,2);assert.equal(result.initialEvents+result.regeneratedEvents,result.processedEvents+invalidated-priorInvalidated);assert.equal(queue.count,0);summary.invalidatedEvents+=invalidated-priorInvalidated;
     for(let index=0;index<vehicles.length;index++) {
      const {body,state}=vehicles[index];assert.equal(body.frameTimeQ16,65536);assert.deepEqual(body.collisionIds,ids[index]);assert.equal(body.collisionCount10c,5);assert.equal(result.ordinary[index].contacts,prior[index].selectedContacts);
      for(const field of ['position','momentum','angularMomentum','linearVelocity','angularVelocity','force','torque','quaternion','quaternionDerivative'])for(const value of body[field])assert(Number.isInteger(value)&&value>=-2147483648&&value<=2147483647,`${field} invalid`);
      const selected=select(body);assert.equal(selected.bucket,body.spatialBucket);assert.equal(selected.outside,body.spatialOutside);
      if(frame&&body.position.some((value,axis)=>value!==prior[index].position[axis]))summary.preservedPositionTransitions++;
      if(frame&&state.wheels.some((wheel,wheelIndex)=>wheel.angle!==prior[index].angle[wheelIndex]))summary.preservedWheelAngleTransitions++;
      if(body.collisionCooldown66f<prior[index].cooldown)summary.cooldownDecays++;if(state.airCounter655!==prior[index].air)summary.airCounterTransitions++;
      const hits=state.wheels.filter(wheel=>wheel.flags&1).length;summary.wheelHits+=hits;counts.wheelHits+=hits;
     }
     const linked=new Set();for(const bucket of buckets){let id=bucket.headId,previous=0;while(id){assert(!linked.has(id),'spatial cycle/duplicate');linked.add(id);const body=registry.bodyFor(id);assert.equal(body.spatialBucket,bucket);assert.equal(body.spatialPreviousId,previous);previous=id;id=body.spatialNextId;}}assert.equal(linked.size,2);
     for(const key of ['initialEvents','regeneratedEvents','processedEvents','terrainQueries','terrainHits','modelQueries','modelHits','storedContacts','rejectedContacts']){summary[key]+=result[key];if(key in counts)counts[key]+=result[key];}
     for(const ordinary of result.ordinary){summary.consumedContacts+=ordinary.contacts;if(ordinary.friction){summary.frictionBodies++;counts.frictionBodies++;}}
     summary.frames++;counts.frames++;summary.bodyFrames+=2;
    }
    if(samples.length<8)samples.push({resource:entry.index,sector:sector.index,frames,initialPositions,final:vehicles.map(vehicle=>({position:vehicle.body.position,momentum:vehicle.body.momentum,quaternion:vehicle.body.quaternion,cooldown:vehicle.body.collisionCooldown66f,airCounter655:vehicle.state.airCounter655,wheelAngles:vehicle.state.wheels.map(wheel=>wheel.angle)})),lastFrameEvents:{initial:lastReport.initialEvents,regenerated:lastReport.regeneratedEvents,processed:lastReport.processedEvents}});
    physical.forEach(body=>registry.remove(body));assert.equal(buckets.some(bucket=>bucket.headId),false);summary.scenarios++;counts.scenarios++;
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,...current,error:error.message,stack:error.stack?.split('\n').slice(0,4)});}
 }
}finally{await archive.close();}
summary.resources=resources.length;summary.failures=failures;
const method=[
 'Connected stepPhysicsAndAttachments reconstruction with body, wheel, drive, shape, arena, queue, group and scratch state retained across frames.',
 'Two vehicles per covered sector start above its middle covered cell, separated64 units in X, at height40, with opposite1-unit Z momentum.',
 'Declared inputs: flags1c03/1803, actual five-sphere geometry and wheel-extended aggregate, speed664=0, drag0, unit mass, recovered inertia, gravity0x4000, friction32768, identity initial orientation with quaternion integration, drive0, steering0/512, ordinary time, nearest-even conversion, explicit allocation/registration and route0.',
 'Recovered preparation/friction, world-record pass413fc0 with an explicitly empty table and zero effect flags, candidate construction, vehicle stages, static/pair detection, event refresh/response, rejected-contact completion47cc20 and final advancement are connected.',
 'Actual44f050 attachment processing follows physics with retained native queue storage, one declared synthetic origin point per body, type1 handles1000/1001 and explicit matrix padding0. Every queued target write must equal the completed body position high words; the queue count clears while entries remain reusable.',
 'Checks signed body state, clocks, events, IDs and spatial chains each frame. Emission/destruction callbacks remain explicit inert boundaries. Class16 completes clock/state without deleting objects.',
 'Original process execution, captured runtime inputs, authored runtime attachment-point producers, post-frame47ccc0 respawn/lifecycle processing, scripted corpus bodies and complete race equivalence are outside this probe.'
].join(' ');
await writeFile('analysis/simulation-frame-probes.json',JSON.stringify({method,requestedFramesPerScenario:frames,maxResources:Number.isFinite(limit)?limit:null,summary,resources,samples},null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;

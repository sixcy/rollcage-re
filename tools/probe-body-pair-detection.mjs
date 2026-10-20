import {writeFile} from 'node:fs/promises';
import template from '../src/vehicle-contact-template.json' with {type:'json'};
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {BodySpatialRegistry,createBodySpatialSelector} from '../src/body-spatial.mjs';
import {BodyShapePool,registerBodyCollisionShapes} from '../src/body-shape-registration.mjs';
import {initializeVehicleContacts} from '../src/vehicle-contacts.mjs';
import {buildBodyCandidateGroups} from '../src/body-candidate-groups.mjs';
import {buildInitialCollisionEvents,refreshCollisionCandidates} from '../src/collision-candidates.mjs';
import {buildStaticCollisionEvents} from '../src/static-collision-candidates.mjs';
import {queryTerrainBodyShapes,queryModelBodyShapes} from '../src/static-shape-queries.mjs';
import {storeBodyShapeContact} from '../src/body-shape-cache.mjs';
import {CollisionEventQueue,decodeCollisionEventKey,processCollisionEvents} from '../src/collision-events.mjs';
import {dispatchCollisionResponse} from '../src/collision-dispatch.mjs';
import {finishBodyAdvancement} from '../src/body-advancement.mjs';
import {beginPhysicsFrame} from '../src/physics-frame-state.mjs';
import {readVehicleDriveConfiguration} from '../src/wheel-drive.mjs';

const profiles=[
 {name:'closing',separation:48,speed:12,expectedClass:1},
 {name:'overlapping',separation:24,speed:4,expectedClass:2},
 {name:'separating',separation:60,speed:-12,expectedClass:0},
];
function makeBody(point,side,profile,variant) {
 const velocity=[0,side*profile.speed*65536,0];
 return {flags:0x803,integrationFlags:1,frameTimeQ16:0,attachmentCount:1,
  position:point.map((value,axis)=>((value+(axis===1?side*-profile.separation/2:0))*65536)|0),
  rotation:[4096,0,0,0,4096,0,0,0,4096],momentum:velocity.slice(),angularMomentum:[0,0,0],linearVelocity:velocity,angularVelocity:[0,0,0],
  quaternion:[65536,0,0,0],quaternionDerivative:[0,0,0,0],mass:65536,inverseMass:65536,coefficient7c:65536,
  collisionCounter168:0,collisionFlags:0,collisionCooldown66f:64,terrainWord15c:0,modelCandidateCount15e:0,force:[0,0,0],torque:[0,0,0],
  worldInverseInertia:[21671,0,0,0,17762,0,0,0,31930],
  pairCollisionContext:{field3d00:readVehicleDriveConfiguration(variant).field3d00,stateByte6bc:null}};
}
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[],samples=[],times={},processedClasses={},processedTimes={};
const summary={resources:0,scenarios:0,bodies:0,registeredShapes:0,candidateGroups:0,generatedEvents:0,regeneratedEvents:0,processedEvents:0,futureImpacts:0,overlapCorrections:0,misses:0,spatialMoves:0,attachmentEntries:0,refreshRequests:0,staticPasses:0,storedContacts:0};
const geometry=initializeVehicleContacts(),descriptors=Buffer.from(template.shapes.hex,'hex');
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const grid=parseCollisionGrid(data);if(!grid.available)continue;
   const buckets=grid.spatial.nodes.map(()=>({headId:0})),select=createBodySpatialSelector(grid.spatial,buckets),counts={resource:entry.index,scenarios:0,generatedEvents:0};
   for(const sector of grid.sectors) {
    const active=sector.cells.filter(cell=>cell.covered);if(!active.length)continue;
    for(let index=0;index<profiles.length;index++) {
     const profile=profiles[index],cell=active[Math.floor((active.length-1)*index/2)],form=cell.forms[0],point=sector.vertices[form.point??form.indices[0]].slice(0,3);
     const bodies=[makeBody(point,1,profile,entry.index%7),makeBody(point,-1,profile,(entry.index+1)%7)],physical=[];
     const pool=new BodyShapePool(Buffer.alloc(72*32),Array.from({length:32},(_,id)=>id));
     for(const body of bodies){const aggregate=registerBodyCollisionShapes(body,descriptors,pool,physical);aggregate.writeInt32LE(Math.max(aggregate.readInt32LE(0x40),geometry.wheelRadiusQ8),0x40);}
     const registry=new BodySpatialRegistry(bodies.map((body,slot)=>({body,poolOffset:slot*0x4000})),select),spatial=registry.handlers(),attachments=[];
     for(const body of bodies)registry.insert(body);beginPhysicsFrame(physical,bodies);
     const handlers={attachmentQueue:attachments,removeSpatial:spatial.removeSpatial,
      insertSpatial:body=>{spatial.insertSpatial(body);summary.spatialMoves++;},
      storeContact:(body,contact)=>{storeBodyShapeContact(body,contact,pool.records);summary.storedContacts++;}};
     const queue=new CollisionEventQueue(4),context={groups:Array.from({length:3},()=>({bodies:[],count:0,spatialBucket:null})),count:0,refreshGroup:{bodies:[],count:0,spatialBucket:null}};
     buildBodyCandidateGroups(physical,context);if(context.count!==2)throw Error('Native grouping did not register both eligible bodies.');
     const lowQuery=()=>{throw Error('This pair-only probe explicitly declares zero static candidates.');},queryOutput={point:[0,0,0],normal:[0,0,0],scalar:0,flags:0,contactTime:-1},staticScratch={contact:{point:[0,0,0],normal:[0,0,0],scalar:0,field38:-1,flags44:0},tag:{value:0}};
     const options={buildStaticEvents:group=>{summary.staticPasses++;return buildStaticCollisionEvents(group,{records:pool.records,queue,selectionCounter:0,scratch:staticScratch,terrainBatch:(entries,count)=>queryTerrainBodyShapes(entries,pool.records,{query:lowQuery,output:queryOutput,count}),modelBody:body=>queryModelBodyShapes(body,pool.records,{query:lowQuery,output:queryOutput})});},pairOptions:{records:pool.records,queue,queryOptions:{roundingMode:'nearest-even'}}};
     const generated=buildInitialCollisionEvents({bodies:physical},context,options);
     if(generated!==(profile.expectedClass?1:0)||queue.count!==generated)throw Error(`${profile.name}: unexpected generated event count ${generated}.`);
     let eventSample=null;
     if(generated){const key=queue.heap[1],event=queue.events[key>>>20],time=decodeCollisionEventKey(key).timeQ16;
      if(event.classFlags!==profile.expectedClass)throw Error(`${profile.name}: unexpected event class ${event.classFlags}.`);
      if(profile.expectedClass===1&&!(time>0&&time<65536&&time%256===0))throw Error('Future collision time did not follow native quantization.');
      if(profile.expectedClass===2&&time!==0)throw Error('Initial overlap should produce zero-time correction.');
      times[time]=(times[time]??0)+1;eventSample={timeQ16:time,classFlags:event.classFlags,point:event.point.slice(),normal:event.normal.slice(),scalar:event.scalar,auxiliaryVector:event.auxiliaryVector.slice()};
     }
     let regenerated=0,responses=0;
     const processed=processCollisionEvents(queue,{respond:(event,delta)=>{if(++responses>16)throw Error('Unexpected event growth.');const time=event.object1.frameTimeQ16+delta;processedClasses[event.classFlags]=(processedClasses[event.classFlags]??0)+1;processedTimes[time]=(processedTimes[time]??0)+1;dispatchCollisionResponse(event,delta,{handlers});},refresh:(first,second)=>{summary.refreshRequests++;regenerated+=refreshCollisionCandidates(first,second,context,options);},finish:()=>finishBodyAdvancement(physical,handlers)});
     if(processed!==generated+regenerated||queue.count)throw Error('Generated pair events were not consumed.');
     for(const body of bodies){if(body.frameTimeQ16!==65536)throw Error('Body did not reach frame completion.');
      for(const value of [...body.position,...body.momentum,...body.angularMomentum,...body.linearVelocity,...body.angularVelocity,...body.quaternionDerivative])if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw Error('Pair pipeline produced a non-signed body value.');
      const location=select(body);if(location.bucket!==body.spatialBucket||location.outside!==body.spatialOutside)throw Error('Spatial registry disagrees with final body position.');
     }
     const reachable=new Set();for(const bucket of new Set(bodies.map(body=>body.spatialBucket))){let previous=0,id=bucket.headId;while(id){const body=registry.bodyFor(id);if(reachable.has(body)||body.spatialPreviousId!==previous||body.spatialBucket!==bucket)throw Error('Invalid spatial body chain.');reachable.add(body);previous=id;id=body.spatialNextId;}}
     if(reachable.size!==2)throw Error('Spatial list lost a body.');
     if(entry.index===30&&samples.length<9)samples.push({resource:entry.index,sector:sector.index,profile:profile.name,point,event:eventSample,bodies:bodies.map(body=>({position:body.position,linearVelocity:body.linearVelocity,angularMomentum:body.angularMomentum,frameTimeQ16:body.frameTimeQ16,collisionCounter168:body.collisionCounter168,spatialNode:buckets.indexOf(body.spatialBucket),outside:body.spatialOutside}))});
     for(const body of bodies)registry.remove(body);if(buckets.some(bucket=>bucket.headId))throw Error('Spatial cleanup left a body.');
     summary.scenarios++;summary.bodies+=2;summary.registeredShapes+=pool.allocatedCount;summary.candidateGroups+=context.count;summary.generatedEvents+=generated;summary.regeneratedEvents+=regenerated;summary.processedEvents+=processed;summary.attachmentEntries+=attachments.length;
     summary[profile.expectedClass===1?'futureImpacts':profile.expectedClass===2?'overlapCorrections':'misses']++;counts.scenarios++;counts.generatedEvents+=generated;
    }
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
summary.resources=resources.length;summary.failures=failures;
await writeFile('analysis/body-pair-detection-probes.json',JSON.stringify({method:'Synthetic two-vehicle fields at authored terrain vertices in every available level pack. Native five-sphere vehicle descriptors and wheel-extended aggregate radius; recovered registration, cache, native group creation, pair exclusion/query/event builder, initial/refresh candidate scheduling, static scheduling with explicitly empty static candidate lists, queue, dispatcher, frame completion and parsed-index spatial registration. Pair event classes/times and follow-up contacts are computed, not supplied. Declared identity rotations, unit masses, drive class rows, velocities/separations, free-ID order, initial buckets, attachment counts, zero terrain/model candidate counts, static selection counter0 and nearest-even x87 conversion. Nonzero-radius terrain/model detection, wheel stages, attachment processing and lifecycle/effects are absent. Static contact storage is available but not reached by these pair-only scenarios. No original process execution or race-equivalence claim.',summary,initialTimeHistogram:times,processedClassHistogram:processedClasses,processedTimeHistogram:processedTimes,resources,samples},null,2));
console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;

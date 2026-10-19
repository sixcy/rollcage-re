import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {BodySpatialRegistry,createBodySpatialSelector} from '../src/body-spatial.mjs';
import {CollisionEventQueue,insertCollisionEvent,processCollisionEvents} from '../src/collision-events.mjs';
import {dispatchCollisionResponse} from '../src/collision-dispatch.mjs';
import {finishBodyAdvancement} from '../src/body-advancement.mjs';
import {beginPhysicsFrame} from '../src/physics-frame-state.mjs';
import {readVehicleDriveConfiguration} from '../src/wheel-drive.mjs';
function makeBody(point,normal,side,profile,variant) {
 const pair=profile===2,velocity=normal.map(value=>-value*(pair?4:profile===0?4:1)*side|0),position=point.map((value,index)=>(value*65536+(profile===1?-(normal[index]>>3):normal[index]*2*side))|0);
 return {flags:3,integrationFlags:1,frameTimeQ16:0,attachmentCount:1,position,momentum:velocity.slice(),angularMomentum:[0,0,0],linearVelocity:velocity,angularVelocity:[0,0,0],quaternion:[65536,0,0,0],quaternionDerivative:[0,0,0,0],mass:65536,inverseMass:65536,coefficient7c:65536,collisionCount10c:2,collisionCounter168:0,collisionFlags:0,collisionCooldown66f:64,force:[0,0,0],torque:[0,0,0],worldInverseInertia:[21671,0,0,0,17762,0,0,0,31930],pairCollisionContext:{field3d00:readVehicleDriveConfiguration(variant).field3d00,stateByte6bc:null}};
}
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage'),resources=[],failures=[],samples=[];
const summary={resources:0,scenarios:0,bodies:0,staticImpacts:0,overlapCorrections:0,pairImpacts:0,processedEvents:0,spatialMoves:0,outsideRegistrations:0,contactRecords:0,attachmentEntries:0};
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const grid=parseCollisionGrid(data);if(!grid.available)continue;const buckets=grid.spatial.nodes.map(()=>({headId:0})),select=createBodySpatialSelector(grid.spatial,buckets),counts={resource:entry.index,scenarios:0,bodies:0,spatialMoves:0};
   for(const sector of grid.sectors) {
    const active=sector.cells.filter(cell=>cell.covered);
    for(const [profile,slot]of [[0,0],[1,Math.floor(active.length/2)],[2,active.length-1]]) {
     const cell=active[slot];if(!cell)continue;const form=cell.forms[0],point=sector.vertices[form.point??form.indices[0]].slice(0,3),normal=grid.normals[form.normal].components.map(value=>value<<8),first=makeBody(point,normal,1,profile,entry.index%7),bodies=profile===2?[first,makeBody(point,normal,-1,profile,(entry.index+1)%7)]:[first];
     const registry=new BodySpatialRegistry(bodies.map((body,index)=>({body,poolOffset:index*0x4000})),select),attachments=[],stored=[],spatial=registry.handlers();for(const body of bodies)registry.insert(body);beginPhysicsFrame(bodies,bodies);
     const handlers={attachmentQueue:attachments,removeSpatial:spatial.removeSpatial,insertSpatial:body=>{spatial.insertSpatial(body);summary.spatialMoves++;counts.spatialMoves++;},storeContact:(body,contact)=>stored.push({body,point:contact.point.slice(),normal:contact.normal.slice(),scalar:contact.scalar})},queue=new CollisionEventQueue(4),relativeQ8=profile===2?first.linearVelocity.map((value,index)=>(value-bodies[1].linearVelocity[index])>>8):null;
     insertCollisionEvent(queue,{object1:first,object2:bodies[1]??null,contact:{point:point.map(value=>value*256),normal,scalar:profile===1?-32:0,field38:0},flags:{value:profile===1?2:1},tag:0,auxiliaryVector:relativeQ8,deltaQ16:profile===1?0:32768});
     const processed=processCollisionEvents(queue,{respond:(event,delta)=>dispatchCollisionResponse(event,delta,{handlers}),refresh:()=>{},finish:()=>finishBodyAdvancement(bodies,handlers)});if(processed!==1||queue.count)throw Error('Declared single-event scenario did not finish.');
     for(const body of bodies){if(body.frameTimeQ16!==65536)throw Error('Body did not reach frame completion.');for(const value of [...body.position,...body.momentum,...body.angularMomentum,...body.linearVelocity,...body.angularVelocity,...body.quaternionDerivative])if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw Error('Collision response produced a non-signed body value.');const location=select(body);if(location.bucket!==body.spatialBucket||location.outside!==body.spatialOutside)throw Error('Body registry disagrees with final position lookup.');if(body.spatialOutside)summary.outsideRegistrations++;}
     const reachable=new Set();for(const bucket of new Set(bodies.map(body=>body.spatialBucket))){let previous=0,id=bucket.headId;while(id){const body=registry.bodyFor(id);if(reachable.has(body)||body.spatialPreviousId!==previous||body.spatialBucket!==bucket)throw Error('Invalid spatial body chain.');reachable.add(body);previous=id;id=body.spatialNextId;}}if(reachable.size!==bodies.length)throw Error('Spatial list lost a body.');
     if(samples.length<6&&entry.index===30)samples.push({resource:entry.index,sector:sector.index,profile:['static_impact','overlap_correction','body_pair'][profile],point,normal,bodies:bodies.map(body=>({position:body.position,linearVelocity:body.linearVelocity,angularMomentum:body.angularMomentum,frameTimeQ16:body.frameTimeQ16,collisionCounter168:body.collisionCounter168,spatialNode:buckets.indexOf(body.spatialBucket),outside:body.spatialOutside})),attachmentEntries:attachments.length});
     for(const body of bodies)registry.remove(body);if(buckets.some(bucket=>bucket.headId))throw Error('Runtime buckets were not emptied after scenario cleanup.');
     summary.scenarios++;counts.scenarios++;summary.bodies+=bodies.length;counts.bodies+=bodies.length;summary.processedEvents+=processed;summary.contactRecords+=stored.length;summary.attachmentEntries+=attachments.length;summary[['staticImpacts','overlapCorrections','pairImpacts'][profile]]++;
    }
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
summary.resources=resources.length;summary.failures=failures;
await writeFile('analysis/collision-response-probes.json',JSON.stringify({method:'Declared synthetic single-event static impacts, overlap corrections and body-pair impacts at sampled authored terrain vertices using their original packed normals, recovered vehicle class rows, native frame initialization, queue, full response dispatcher, frame completion and actual parsed-index spatial registration. Pool offsets, event times, control/body/attachment state and empty runtime buckets are explicit synthetic inputs. Candidate refresh is inert; contact storage is an observable copy in place of the original global cache. No time-of-impact generation, wheel stage, attachment processing, original process execution or race-equivalence claim.',summary,resources,samples},null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;

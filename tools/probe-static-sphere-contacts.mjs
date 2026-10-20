import {writeFile} from 'node:fs/promises';
import template from '../src/vehicle-contact-template.json' with {type:'json'};
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {buildTerrainCandidates} from '../src/terrain-candidates.mjs';
import {createModelCollisionContext,buildModelCandidates} from '../src/model-candidates.mjs';
import {queryTerrainSphere} from '../src/terrain-sphere-query.mjs';
import {queryPlacedModelSphere} from '../src/placed-model-sphere-query.mjs';
import {rotateModelYaw,rotateModelYawPoint} from '../src/model-transforms.mjs';
import {BodyShapePool,registerBodyCollisionShapes} from '../src/body-shape-registration.mjs';
import {initializeVehicleContacts} from '../src/vehicle-contacts.mjs';
import {storeBodyShapeContact} from '../src/body-shape-cache.mjs';
import {queryTerrainBodyShapes,queryModelBodyShapes} from '../src/static-shape-queries.mjs';
import {buildStaticCollisionEvents} from '../src/static-collision-candidates.mjs';
import {refreshCollisionCandidates} from '../src/collision-candidates.mjs';
import {CollisionEventQueue,decodeCollisionEventKey,processCollisionEvents} from '../src/collision-events.mjs';
import {dispatchCollisionResponse} from '../src/collision-dispatch.mjs';
import {finishBodyAdvancement} from '../src/body-advancement.mjs';
import {beginPhysicsFrame} from '../src/physics-frame-state.mjs';
import {BodySpatialRegistry,createBodySpatialSelector} from '../src/body-spatial.mjs';
import {readVehicleDriveConfiguration} from '../src/wheel-drive.mjs';
import {dotQ16} from '../src/fixed-integer.mjs';
import {verifyTerrainSphere} from './verify-terrain-sphere-query-instructions.mjs';
const profiles=[{name:'closing',offset:26,speed:16},{name:'overlap',offset:14,speed:4},{name:'separating',offset:26,speed:-16}];
const geometry=initializeVehicleContacts(),descriptors=Buffer.from(template.shapes.hex,'hex'),roundingMode='nearest-even';
const fromRecord=record=>({originQ8:[8,12,16].map(p=>record.readInt32LE(p)),deltaQ8:[20,24,28].map(p=>record.readInt32LE(p)),radiusQ8:record.readInt32LE(64),tag:record.readUInt16LE(70)});
function makeBody(pointQ8,normalQ8,profile,variant){
 const velocity=normalQ8.map(value=>-Math.imul(value,profile.speed*256)|0);
 return {flags:0x803,integrationFlags:1,frameTimeQ16:0,attachmentCount:1,
  position:pointQ8.map((value,axis)=>((value+Math.imul(normalQ8[axis],profile.offset))<<8)),
  rotation:[4096,0,0,0,4096,0,0,0,4096],momentum:velocity.slice(),angularMomentum:[0,0,0],linearVelocity:velocity,angularVelocity:[0,0,0],quaternion:[65536,0,0,0],quaternionDerivative:[0,0,0,0],mass:65536,inverseMass:65536,coefficient7c:0,
  collisionCounter168:0,collisionFlags:0,collisionCooldown66f:64,terrainWord15c:0,modelCandidateCount15e:0,force:[0,0,0],torque:[0,0,0],worldInverseInertia:[21671,0,0,0,17762,0,0,0,31930],
  pairCollisionContext:{field3d00:readVehicleDriveConfiguration(variant).field3d00,stateByte6bc:null}};
}
const summary={resources:0,scenarios:0,bodies:0,registeredShapes:0,terrainCandidates:0,modelCandidates:0,terrainQueries:0,modelQueries:0,terrainHits:0,modelHits:0,initialEvents:0,regeneratedEvents:0,processedEvents:0,zeroTimeEvents:0,futureEvents:0,noInitialEvent:0,refreshRequests:0,staticPasses:0,storedContacts:0,removalRequests:0,spatialMoves:0,attachmentEntries:0,nativeTerrainChecks:0,instructionSteps:0,effectCalls:{class1:0,class2:0,object:0,class4Break:0}};
const resources=[],failures=[],samples=[],removalSamples=[],removalDiagnostics={zeroNormalSum:0,zeroPenetrationProjection:0,noSelectedShapes:0,other:0},eventClasses={},eventTimes={},terrainFlags={},modelFlags={},byInput={};
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try{
 for(const entry of archive.entries){
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  let current;
  try{
   const grid=parseCollisionGrid(data);if(!grid.available)continue;
   const {data:btp}=await archive.readResource(entry.index+1),modelContext=createModelCollisionContext(data,btp,{spatial:grid.spatial}),buckets=grid.spatial.nodes.map(()=>({headId:0})),select=createBodySpatialSelector(grid.spatial,buckets),counts={resource:entry.index,scenarios:0,initialEvents:0,regeneratedEvents:0,processedEvents:0,terrainHits:0,modelHits:0};let nativeChecked=false;
   function exercise(pointQ8,normalQ8,profile,input,source){
    current={input,profile:profile.name,...source};const body=makeBody(pointQ8,normalQ8,profile,entry.index%7),physical=[],pool=new BodyShapePool(Buffer.alloc(72*16),Array.from({length:16},(_,id)=>id)),aggregate=registerBodyCollisionShapes(body,descriptors,pool,physical);
    aggregate.writeInt32LE(Math.max(aggregate.readInt32LE(64),geometry.wheelRadiusQ8),64);
    const registry=new BodySpatialRegistry([{body,poolOffset:0}],select),spatial=registry.handlers(),attachments=[];registry.insert(body);beginPhysicsFrame(physical,[body]);
    const terrain=buildTerrainCandidates(grid,body,{radiusQ8:aggregate.readInt32LE(64)}),models=buildModelCandidates(modelContext,body,{radiusQ8:aggregate.readInt32LE(64)});
    body.terrainWord15c=terrain.candidates.length;body.modelCandidateCount15e=models.candidates.length;
    const queue=new CollisionEventQueue(4),queryOutput={point:[0,0,0],normal:[0,0,0],scalar:0,flags:0,contactTime:-1},terrainOutput={pointQ8:[0,0,0],normalQ16:[0,0,0],distanceQ8:0,cellRef:0,flags:0},modelOutput={point:[0,0,0],normal:[0,0,0],scalar:0,cellRef:-4,flags:0},scratch={contact:{point:[0,0,0],normal:[0,0,0],scalar:0,field38:-1,flags44:0},tag:{value:0}};
    const effects={onClass1Contact:()=>{summary.effectCalls.class1++;return false;},onClass2Contact:()=>{summary.effectCalls.class2++;},onObjectContact:()=>{summary.effectCalls.object++;return false;},onClass4Break:()=>{summary.effectCalls.class4Break++;}};
    const terrainQuery=(record,object,bound,output)=>{
     const query=fromRecord(record),result=queryTerrainSphere(grid,terrain.candidates,query,{parameter:bound,bodyFlags:object.flags,roundingMode,output:terrainOutput});summary.terrainQueries++;terrainFlags[result.flags]=(terrainFlags[result.flags]??0)+1;
     if(!nativeChecked&&terrain.candidates.length){const checked=verifyTerrainSphere(grid,terrain.candidates,query,{parameter:bound,bodyFlags:object.flags,roundingMode});nativeChecked=true;summary.nativeTerrainChecks++;summary.instructionSteps+=checked.steps;}
     output.flags=result.flags;if(result.flags){output.point=result.pointQ8.slice();output.normal=result.normalQ16.slice();output.scalar=result.distanceQ8;output.contactTime=result.cellRef|0;summary.terrainHits++;counts.terrainHits++;}
     return result.fractionQ16;
    };
    const modelQuery=(record,object,bound,output)=>{
     const query=fromRecord(record),time=queryPlacedModelSphere(models.candidates,query,modelOutput,{maxFractionQ16:bound,vehicleFlags:object.flags,activeTag:geometry.activeTag,specialType4:false,roundingMode,effects});summary.modelQueries++;modelFlags[modelOutput.flags]=(modelFlags[modelOutput.flags]??0)+1;
     output.flags=modelOutput.flags;if(output.flags){output.point=modelOutput.point.slice();output.normal=modelOutput.normal.slice();output.scalar=modelOutput.scalar;output.contactTime=modelOutput.cellRef|0;summary.modelHits++;counts.modelHits++;}
     return time;
    };
    let removalCallbacks=0;
    const handlers={attachmentQueue:attachments,removeSpatial:spatial.removeSpatial,insertSpatial:object=>{spatial.insertSpatial(object);summary.spatialMoves++;},storeContact:(object,contact)=>{storeBodyShapeContact(object,contact,pool.records);summary.storedContacts++;},removeBody:object=>{summary.removalRequests++;removalCallbacks++;
     const mask=object.collisionFlags&0xffffff,selected=[];for(let index=0;index<object.collisionCount10c;index++)if(mask&(1<<index)){const id=object.collisionIds[index],record=pool.records.subarray(id*72,(id+1)*72),normalQ16=[44,48,52].map(offset=>record.readInt32LE(offset));selected.push({index,normalQ16,penetrationProjectionQ16:dotQ16(scratch.contact.normal,normalQ16),pointQ8:[32,36,40].map(offset=>record.readInt32LE(offset)),cellRef:record.readInt32LE(56)});}
     const normalSumQ16=[0,1,2].map(axis=>selected.reduce((sum,item)=>(sum+item.normalQ16[axis])|0,0)),diagnostic=!selected.length?'noSelectedShapes':normalSumQ16.every(value=>value===0)?'zeroNormalSum':selected.some(item=>item.penetrationProjectionQ16===0)?'zeroPenetrationProjection':'other';removalDiagnostics[diagnostic]++;
     if(removalSamples.length<8&&removalCallbacks===1)removalSamples.push({resource:entry.index,input,profile:profile.name,...source,diagnostic,selectedMask:mask,selected,normalSumQ16,mergedNormalQ16:scratch.contact.normal.slice(),boundary:'Inert removeBody callback retains the fixture body for completion; native object removal state is not reconstructed.'});
    }};
    const build=group=>{summary.staticPasses++;return buildStaticCollisionEvents(group,{records:pool.records,queue,selectionCounter:0,scratch,terrainBatch:(entries,count)=>queryTerrainBodyShapes(entries,pool.records,{query:terrainQuery,output:queryOutput,count}),modelBody:object=>queryModelBodyShapes(object,pool.records,{query:modelQuery,output:queryOutput})});};
    const initial=build({bodies:physical}),initialSample=queue.count?(()=>{const key=queue.heap[1],event=queue.events[key>>>20];return {timeQ16:decodeCollisionEventKey(key).timeQ16,classFlags:event.classFlags,point:event.point.slice(),normal:event.normal.slice(),scalar:event.scalar,cellRef:event.field44};})():null;
    let regenerated=0,responses=0;const context={groups:[],count:0,refreshGroup:{bodies:[],count:0,spatialBucket:null}},processed=processCollisionEvents(queue,{respond:(event,delta)=>{if(++responses>4)throw Error('Native signed collision counter failed to bound static regeneration.');const time=(body.frameTimeQ16+delta)|0;if(time<0||time>65536)throw Error('Computed static event outside frame clock.');eventClasses[event.classFlags]=(eventClasses[event.classFlags]??0)+1;eventTimes[time]=(eventTimes[time]??0)+1;if(time===0)summary.zeroTimeEvents++;else summary.futureEvents++;dispatchCollisionResponse(event,delta,{handlers,gravityQ16:0x10000});},refresh:(first,second)=>{summary.refreshRequests++;regenerated+=refreshCollisionCandidates(first,second,context,{buildStaticEvents:build});},finish:()=>finishBodyAdvancement(physical,handlers)});
    if(processed!==initial+regenerated||queue.count)throw Error('Static queue did not consume its generated events.');
    if(body.frameTimeQ16!==65536)throw Error('Static body did not reach frame completion.');
    for(const value of [...body.position,...body.momentum,...body.angularMomentum,...body.linearVelocity,...body.angularVelocity,...body.quaternionDerivative])if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw Error('Static response produced a non-signed body state.');
    const selected=select(body),id=registry.idFor(body);if(selected.bucket!==body.spatialBucket||selected.outside!==body.spatialOutside||body.spatialBucket.headId!==id||body.spatialPreviousId||body.spatialNextId||registry.bodyFor(id)!==body||buckets.filter(bucket=>bucket.headId).length!==1)throw Error('Static response violated spatial list integrity.');
    if((entry.index===30&&samples.length<12)||(input==='modelFaces'&&initialSample&&samples.filter(item=>item.input==='modelFaces').length<6))samples.push({resource:entry.index,input,profile:profile.name,...source,initialPositionQ16:makeBody(pointQ8,normalQ8,profile,entry.index%7).position,normalQ8,terrainCandidates:terrain.candidates.length,modelCandidates:models.candidates.length,event:initialSample,regenerated,processed,finalPositionQ16:body.position,finalLinearVelocity:body.linearVelocity,frameTimeQ16:body.frameTimeQ16,collisionCounter168:body.collisionCounter168});
    registry.remove(body);if(buckets.some(bucket=>bucket.headId))throw Error('Static spatial cleanup retained a body.');
    summary.scenarios++;summary.bodies++;summary.registeredShapes+=pool.allocatedCount;summary.terrainCandidates+=terrain.candidates.length;summary.modelCandidates+=models.candidates.length;summary.initialEvents+=initial;summary.regeneratedEvents+=regenerated;summary.processedEvents+=processed;summary.attachmentEntries+=attachments.length;if(!initial)summary.noInitialEvent++;counts.scenarios++;counts.initialEvents+=initial;counts.regeneratedEvents+=regenerated;counts.processedEvents+=processed;
    const key=`${input}:${profile.name}`;byInput[key]??={scenarios:0,initialEvents:0,processedEvents:0,removalCallbacks:0,removalScenarios:0};byInput[key].scenarios++;byInput[key].initialEvents+=initial;byInput[key].processedEvents+=processed;byInput[key].removalCallbacks+=removalCallbacks;if(removalCallbacks)byInput[key].removalScenarios++;
   }
   for(const sector of grid.sectors){const active=sector.cells.filter(cell=>cell.covered);if(!active.length)continue;for(let index=0;index<profiles.length;index++){const cell=active[Math.floor((active.length-1)*index/2)],form=cell.forms[0],vertices=form.indices.map(id=>sector.vertices[id]),point=[0,1,2].map(axis=>Math.trunc(vertices.reduce((sum,vertex)=>sum+vertex[axis]*256,0)/vertices.length));exercise(point,grid.normals[form.normal].components,profiles[index],'terrainCells',{sector:sector.index,cell:cell.index});}}
   let modelTargets=0;for(const {collision,settings}of modelContext.instances.values()){
    let selected;for(const shape of collision.shapes)if(shape.faceCount>2){for(const recordIndex of shape.records){const record=collision.faceRecords[recordIndex],face=collision.faces[record.faceIndex];if(face.normalQ8[1]<-64){selected={shape,face};break;}}if(selected)break;}if(!selected)continue;
    const vertices=selected.face.indices.filter(Boolean).map(index=>collision.vertices[index-1]),positionQ16=settings.position.map(value=>value<<16),local=[0,1,2].map(axis=>Math.trunc(vertices.reduce((sum,vertex)=>sum+vertex[axis]*256,0)/vertices.length)+(positionQ16[axis]>>8)),point=rotateModelYawPoint(local,positionQ16,settings.yaw),normal=rotateModelYaw(selected.face.normalQ8,settings.yaw);
    for(const profile of profiles)exercise(point,normal,profile,'modelFaces',{placement:settings.placementIndex,shape:selected.shape.index});if(++modelTargets===3)break;
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,...current,error:error.message});}
 }
}finally{await archive.close();}
summary.resources=resources.length;summary.failures=failures;
const report={method:'Installed-data synthetic one-vehicle static detection and response. Actual five-sphere PE descriptors, wheel-extended aggregate, shape pool/cache, parsed-index spatial registration, initial terrain/model candidate builders, full terrain and placed-model sphere queries, sphere-list wrappers, default real static-contact merge, queue, dispatcher, contact storage, signed-counter-bounded candidate regeneration and frame completion. Three declared profiles at sampled covered terrain cells and up to three upward model faces per pack: normal offsets26/14/26 units and normal speeds-16/-4/+16 units per frame. All contact classes/times are computed from geometry, never supplied. Unit mass/inverse mass, zero restitution, recovered inertia, identity rotation with rotation integration disabled, recovered drive-class row, explicit pool order, zeroed scratch, selection counter0, ordinary time scaling, nearest-even conversion and active tag5. Candidate geometry lists are retained from the initial broad phase throughout response; no cache rebuild, wheel forces, gravity integration, attachment execution, captured runtime state, original process execution or complete race equivalence. Object/class1 destruction callbacks return false; class2 callback is inert but native class2 damping is preserved. Class16 removal requests from static-contact merger rejection (including zero penetration projection) are recorded through an explicit inert lifecycle callback: the synthetic body remains registered for frame-completion validation, so this does not reconstruct object removal or native post-removal behavior. Sampled complete retained-x86 terrain checks compare actual corpus geometry and scratch state.',summary,byInput,eventClassHistogram:eventClasses,eventTimeHistogram:eventTimes,terrainFlagHistogram:terrainFlags,modelFlagHistogram:modelFlags,resources,samples,removalDiagnostics,removalSamples};
await writeFile('analysis/static-sphere-contact-probes.json',JSON.stringify(report,null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;

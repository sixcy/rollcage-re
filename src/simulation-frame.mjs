// Concrete composition of the recovered frame stages. Runtime inputs, emission
// callbacks and the surrounding gameplay tick remain caller-owned.
import {runPhysicsFrame} from './physics-frame.mjs';
import {beginPhysicsFrame} from './physics-frame-state.mjs';
import {prepareOrdinaryBody} from './body-preparation.mjs';
import {stepScriptedMotion} from './scripted-motion.mjs';
import {buildFrameCandidates,candidateArenaView} from './frame-candidates.mjs';
import {buildBodyCandidateGroups} from './body-candidate-groups.mjs';
import {updateVehicleWheelFrame,updateFrameBodyDerivatives} from './vehicle-frame.mjs';
import {updateBodyDerived} from './body-physics.mjs';
import {prepareBodyShapeCache,storeBodyShapeContact} from './body-shape-cache.mjs';
import {queryTerrainRay} from './terrain-query.mjs';
import {queryTerrainSphere} from './terrain-sphere-query.mjs';
import {queryRawTerrain} from './raw-terrain-query.mjs';
import {queryRawPlacedModelSphere} from './raw-model-sphere-query.mjs';
import {queryPlacedModelSphere} from './placed-model-sphere-query.mjs';
import {queryTerrainBodyShapes,queryModelBodyShapes} from './static-shape-queries.mjs';
import {buildStaticCollisionEvents} from './static-collision-candidates.mjs';
import {buildInitialCollisionEvents,refreshCollisionCandidates} from './collision-candidates.mjs';
import {buildBodyPairEvents} from './body-pair-events.mjs';
import {dispatchCollisionResponse} from './collision-dispatch.mjs';
import {finishBodyAdvancement,completeRejectedCollisionBody} from './body-advancement.mjs';
import {updateWorldEffectRecords} from './world-effect-records.mjs';
import {applyBodyEffectImpulse} from './body-effect-impulse.mjs';
import {applyBodyEffectDamping} from './body-effect-damping.mjs';
import {releaseScriptedBody} from './scripted-release.mjs';
import {updateBodyAttachments} from './body-attachments.mjs';
import {applyActiveVehicleEffect} from './active-vehicle-effect.mjs';
import {runPostFrameBodyStates} from './post-frame-body-states.mjs';
import {checkPostFrameVehicles} from './post-frame-vehicle-check.mjs';
import {multiplyQ16} from './fixed-integer.mjs';

const decodeQuery=record=>({originQ8:[8,12,16].map(p=>record.readInt32LE(p)),deltaQ8:[20,24,28].map(p=>record.readInt32LE(p)),radiusQ8:record.readInt32LE(64),tag:record.readUInt16LE(70),surfaceRef:record.readInt32LE(56)});
const specialVehicle=body=>{const state=body.pairCollisionContext?.stateByte6bc;return state!==null&&state!==undefined&&state!==0;};

// Storage is retained across calls: arena, queue, group lists and both scratch
// objects preserve native stale fields rather than being silently reset here.
export function stepSimulationFrame(physicalGroup,vehicles,context) {
 const {environment,records,queue,candidateArena,candidateGroups,effectFlags,gravityQ16,roundingMode,spatialStateFor,staticScratch,queryOutput,selectionCounter,handlers={}}=context;
 if(typeof spatialStateFor!=='function')throw Error('Simulation frame requires the runtime registration to parsed-node mapping.');
 if(typeof handlers.externalWorld!=='function'&&!context.worldEffectState)throw Error('Simulation frame requires explicit world effect state or its external world override.');
 const raw=context.nativePhysicsStack,sharedMath=raw?{
  cacheRotation:body=>{
   for(const offset of[0,4,8,12,16])raw.memory.writeInt32LE(raw.memory.readInt32LE(body.address+0xc4+offset),0x91d360+offset);
   const scale=raw.memory.readFloatLE(0x5dc5f4);for(let i=0;i<9;i++)raw.memory.writeFloatLE(Math.fround(Math.fround(raw.memory.readInt16LE(0x91d360+i*2))*scale),0x91cdc0+Math.floor(i/3)*16+i%3*4);
  },
  shapeTransform:(record,offset)=>{raw.memory.writeInt32LE(record.readInt32LE(0),0x91d3e4);raw.memory.writeInt32LE(record.readInt32LE(4),0x91d3e8);offset.forEach((value,i)=>raw.memory.writeInt32LE(value,0x91d448+i*4));},
  fixedVectorLength:vector=>{let squares=vector.map(value=>multiplyQ16(value,value));if(squares.reduce((a,b)=>a|b,0)&0xe0000000)squares=squares.map(value=>value>>>2);const sum=squares.reduce((a,b)=>(a+b)|0,0),absolute=sum<0?-sum|0:sum;raw.memory.writeInt32LE(absolute,0x91d45c);raw.memory.writeInt32LE(Math.clz32(absolute),0x91d460);},
  normalizeReduction:(bits,leading)=>{raw.memory.writeInt32LE(bits,0x91d45c);raw.memory.writeInt32LE(leading,0x91d460);},
  sqrtLookup:value=>{const absolute=value<0?-value|0:value;raw.memory.writeInt32LE(absolute,0x91d45c);raw.memory.writeInt32LE(Math.clz32(absolute),0x91d460);}
 }:undefined;
 const providedTimeOptions=context.timeOptionsFor??(()=>({})),timeOptionsFor=raw?body=>({...providedTimeOptions(body),nativeState:sharedMath}):providedTimeOptions,bodies=()=>physicalGroup.bodies.slice(0,physicalGroup.count??physicalGroup.bodies.length);
 const effectHandlers={...handlers,onActiveVehicleEffect:handlers.onActiveVehicleEffect??(({body,directionQ8,effectCode})=>{
  if(typeof context.activeVehicleEffectFor!=='function')throw Error('Active vehicle effect requires explicit target state and lookup.');
  return applyActiveVehicleEffect(body,directionQ8,effectCode,{...context.activeVehicleEffectFor(body),handlers});
 })};
 const preparationHandlers={...handlers,
  applyEffect91cd90:handlers.applyEffect91cd90??(body=>{if(!context.bodyEffectImpulse)throw Error('First frame effect requires explicit impulse effect state.');return applyBodyEffectImpulse(body,{...context.bodyEffectImpulse,roundingMode,handlers:effectHandlers});}),
  applyEffect9153d0:handlers.applyEffect9153d0??(body=>{if(!context.bodyEffectDamping)throw Error('Second frame effect requires explicit damping effect state.');return applyBodyEffectDamping(body,context.bodyEffectDamping);})};
 const prepare=(body,time,pool)=>prepareBodyShapeCache(body,time,pool,timeOptionsFor(body));
 const report={ordinary:[],scripted:[],candidates:null,vehicles:null,worldUpdatedRecords:null,initialEvents:0,regeneratedEvents:0,storedContacts:0,rejectedContacts:0,terrainQueries:0,terrainHits:0,modelQueries:0,modelHits:0,finishedBodies:0};
 const terrainQuery=(record,body,bound,output)=>{
  if(context.nativeTerrain) {
   const native=context.nativeTerrain,recordAddress=record.byteOffset-native.memory.byteOffset;
   if(record.buffer!==native.memory.buffer||native.views.bodyAt(body.address)!==body||!Number.isInteger(output.address))throw Error('Native terrain simulation requires shared body, shape and output storage.');
   const time=queryRawTerrain(body.address,recordAddress,output.address,bound,{...native,roundingMode});
   report.terrainQueries++;if(output.flags)report.terrainHits++;return time;
  }
  const query=decodeQuery(record),candidates=candidateArenaView(candidateArena,body),scratch={pointQ8:output.point.slice(),normalQ16:output.normal.slice(),distanceQ8:output.scalar,cellRef:output.contactTime,flags:output.flags};
  const result=query.radiusQ8?queryTerrainSphere(environment.grid,candidates,query,{parameter:bound,bodyFlags:body.flags,roundingMode,output:scratch}):queryTerrainRay(environment.grid,candidates,query,{parameter:bound,bodyFlags:body.flags});
  report.terrainQueries++;output.flags=result.flags;
  if(result.flags){output.point=result.pointQ8.slice();output.normal=result.normalQ16.slice();output.scalar=result.distanceQ8;output.contactTime=result.cellRef|0;report.terrainHits++;}
  return result.fractionQ16;
 };
 const modelQuery=(record,body,bound,output)=>{
  if(context.nativeModels){
   const native=context.nativeModels,recordAddress=record.byteOffset-native.memory.byteOffset;
   if(record.buffer!==native.memory.buffer||native.views.bodyAt(body.address)!==body||!Number.isInteger(output.address))throw Error('Native model simulation requires shared body, shape and output storage.');
   const time=queryRawPlacedModelSphere(body.address,recordAddress,output.address,bound,{...native,scratchBase:output.address-0x3c,roundingMode,handlers});
   report.modelQueries++;if(output.flags)report.modelHits++;return time;
  }
  const scratch={point:output.point.slice(),normal:output.normal.slice(),scalar:output.scalar,cellRef:output.contactTime,flags:output.flags};
  const query=decodeQuery(record),time=queryPlacedModelSphere(candidateArenaView(candidateArena,body,'model'),query,scratch,{maxFractionQ16:bound,vehicleFlags:body.flags,activeTag:body.collisionCount10c,specialType4:specialVehicle(body),roundingMode,effects:handlers.modelEffects});
  record.writeInt32LE(query.surfaceRef,56);
  // The model routine can write contact fields and later reject the candidate.
  // Preserve those writes even if its final returned classification is zero.
  output.point=scratch.point;output.normal=scratch.normal;output.scalar=scratch.scalar;output.contactTime=scratch.cellRef|0;output.flags=scratch.flags;
  report.modelQueries++;if(output.flags)report.modelHits++;return time;
 };
 const buildStaticEvents=group=>{
  const native=context.nativePhysicsStack,refresh=group.isRefreshGroup;
  //427870/427910 enter427bd0 with different stack depths. Its uninitialized
  //contact fields deliberately retain earlier derivative/query temporaries.
  const scratch=native?{contact:native.views.contactAt(native.scratchBase-(refresh?0x7c:0x84)),tag:native.views.wordAt(native.scratchBase-(refresh?0x80:0x88))}:staticScratch;
  const output=native?native.views.outputAt(native.scratchBase-(refresh?0xdc:0xe4)):queryOutput;
  return buildStaticCollisionEvents(group,{records,queue,selectionCounter,scratch,prepare,
   terrainBatch:(list,count)=>queryTerrainBodyShapes(list,records,{count,query:terrainQuery,output}),
   modelBody:body=>queryModelBodyShapes(body,records,{query:modelQuery,output})});
 };
 const pairOptions={records,queue,prepare,queryOptions:{roundingMode,nativeState:sharedMath}};
 const buildPairEvents=raw?(first,second)=>{
  //4279d0's contact block aliases the preceding427bd0 block at both depths.
  //In particular a nonpenetrating sphere hit preserves the old scalar word.
  const base=raw.scratchBase-(first.isRefreshGroup?0x7c:0x84),output=Object.create(raw.views.contactAt(base)),auxiliary=[0,0,0];
  for(let i=0;i<3;i++)Object.defineProperty(auxiliary,i,{get:()=>raw.memory.readInt32LE(base-12+i*4),set:value=>raw.memory.writeInt32LE(value|0,base-12+i*4)});
  Object.defineProperty(output,'flags',{get:()=>raw.memory.readInt32LE(base-0x2c),set:value=>raw.memory.writeInt32LE(value|0,base-0x2c)});output.auxiliaryVector=auxiliary;
  return buildBodyPairEvents(first,second,{...pairOptions,output});
 }:undefined;
 const candidateOptions={buildStaticEvents,buildPairEvents,pairOptions};
 const advancementHandlers={...handlers,storeContact:(body,event)=>{storeBodyShapeContact(body,event,records);report.storedContacts++;},removeBody:body=>{
  // The dispatcher's historical handler name predates inspection of47cc20.
  completeRejectedCollisionBody(body,advancementHandlers,timeOptionsFor(body));report.rejectedContacts++;handlers.onRejectedContact?.(body);
 }};
 const stages={queue,effectFlags,
  begin:()=>beginPhysicsFrame(bodies(),vehicles.map(vehicle=>vehicle.body)),
  prepareOrdinary:body=>report.ordinary.push(prepareOrdinaryBody(body,{records,gravityQ16,effectFlags,timeOptions:timeOptionsFor(body),specialVehicleState:context.vehiclePreparationStateFor?.(body),handlers:preparationHandlers})),
  stepScripted:body=>{if(typeof context.scriptOptionsFor!=='function')throw Error('Scripted simulation bodies require their native bytecode and state inputs.');const options=context.scriptOptionsFor(body),destroyBody=target=>{const state=context.scriptedReleaseState;if(!state)throw Error('Scripted release requires explicit runtime state.');return releaseScriptedBody(target,{...state,handlers:{...handlers,...state.handlers}});};report.scripted.push(stepScriptedMotion(body,{...options,roundingMode,handlers:{destroyBody,...handlers,...context.scriptHandlers,...options.handlers}}));},
  externalWorld:()=>{if(typeof handlers.externalWorld==='function')return handlers.externalWorld({physicalGroup,vehicles});const state=context.worldEffectState;report.worldUpdatedRecords=updateWorldEffectRecords(state.records,{...state,effectFlag:effectFlags.first});},
  collectCandidates:()=>{report.candidates=buildFrameCandidates(physicalGroup.bodies,{count:physicalGroup.count??physicalGroup.bodies.length,records,grid:environment.grid,models:environment.modelContext,arena:candidateArena,spatialStateFor,nativeState:sharedMath});},
  updateGroups:()=>buildBodyCandidateGroups(bodies(),candidateGroups),
  updateVehicles:()=>{
   for(const vehicle of vehicles){const body=vehicle.body,closest=body.closestTerrain11c;vehicle.spatialState=spatialStateFor(body);vehicle.specialType4=specialVehicle(body);
    vehicle.registeredCellRef=Number.isInteger(closest)?closest|0:closest?((closest.row<<16)|(closest.column<<8)|closest.sector):-1;
   }
   report.vehicles=updateVehicleWheelFrame(vehicles,{...environment,timeOptionsFor},handlers);
   //475760 captures its physical list/count after47ab30. Wheel/effect
   // callbacks may replace the list or change its count before this read.
   const native=context.nativePhysicsStack;
   updateFrameBodyDerivatives(bodies(),native?body=>updateBodyDerived(body,{nativeScratch:{memory:native.memory,scratchBase:native.scratchBase-0x28}}):undefined);
  },
  buildInitialEvents:()=>{report.initialEvents=buildInitialCollisionEvents(physicalGroup,candidateGroups,candidateOptions);},
  respond:(event,delta)=>dispatchCollisionResponse(event,delta,{handlers:advancementHandlers,gravityQ16,timeOptionsFor}),
  //475630 saves main EBP (the filtered delta) at S-40h. The next4279d0
  //refresh consumes that same word as its intentionally uninitialized scalar.
  beforeInvalidate:raw?(_first,_second,delta)=>raw.memory.writeInt32LE(delta|0,raw.scratchBase-0x40):undefined,
  refresh:(first,second)=>{report.regeneratedEvents+=refreshCollisionCandidates(first,second,candidateGroups,candidateOptions);},
  finish:()=>{for(const body of physicalGroup.bodies){if(!body)break;report.finishedBodies+=finishBodyAdvancement([body],advancementHandlers,timeOptionsFor(body));}}
 };
 return {...runPhysicsFrame(physicalGroup,stages),...report};
}

//450e50 calls4749e0 and44f050 consecutively. Later body-state processing
//47ccc0 and the rest of the surrounding game tick are separate stages.
export function stepPhysicsAndAttachments(physicalGroup,vehicles,context) {
 const queue=context.handlers?.attachmentQueue;
 if(!context.attachments||!Array.isArray(queue?.entries)||!Number.isInteger(queue.count))throw Error('Physics and attachments require retained native queue storage and explicit attachment context.');
 const frame=stepSimulationFrame(physicalGroup,vehicles,context),attachments=updateBodyAttachments(queue,context.attachments);
 return {...frame,attachments};
}

//450e50:4749e0,44f050,47ccc0 are consecutive calls. This composition ends
//after those calls; route/runtime producers and the surrounding race tick
//remain explicit. Query/apply/emit contracts must preserve register outputs.
export function stepPhysicsAttachmentsAndBodyStates(physicalGroup,vehicles,context) {
 const post=context.postFrame;
 if(!post||(typeof post.handlers?.prepass!=='function'&&!post.vehicleCheck))throw Error('Post-frame composition requires explicit body-state context and vehicle prepass inputs.');
 let postFrameVehicleCheck=null;
 const prepass=post.handlers?.prepass??(()=>postFrameVehicleCheck=checkPostFrameVehicles(post.vehicleCheck.runtime,post.vehicleCheck));
 const frame=stepPhysicsAndAttachments(physicalGroup,vehicles,context);
 const postFrame=runPostFrameBodyStates(physicalGroup,{...post,handlers:{...post.handlers,prepass}});
 return {...frame,postFrameVehicleCheck,postFrame};
}

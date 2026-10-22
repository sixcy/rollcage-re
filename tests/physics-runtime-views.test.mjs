import test from 'node:test';
import assert from 'node:assert/strict';
import {createRespawnRuntime} from '../src/respawn-runtime.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {createVehicleRuntimeViews} from '../src/vehicle-runtime-views.mjs';
import {initializeWheelEffectTables} from '../src/wheel-effects.mjs';
import {buildBodyCandidateGroups} from '../src/body-candidate-groups.mjs';
import {buildFrameCandidates} from '../src/frame-candidates.mjs';
import {insertCollisionEvent,processCollisionEvents} from '../src/collision-events.mjs';
import {unregisterPhysicalBody} from '../src/body-retirement.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';
import {initializeVehicleContacts} from '../src/vehicle-contacts.mjs';

const A=0x10000,B=0x18000,SHAPES=0x40000,SHAPEFREE=0x45000,ACTIVE=0x45100,REVERSE=0x45200,LIST=0x46000,GROUPS=0x47000,BUCKET=0x49000,EVENTS=0x50000,HEAP=0x52000,FREE=0x53000,SESSION=0x55000,CONFIG=0x56000,ARENA=0x60000,VERTICES=0x61000,OTHERLIST=0x62000,MATERIAL=0x63000,ROWS=0x64000,INDICES=0x66000,EFFECTBUCKET=0x68000,PARTICLES=0x100000,STACK=0x9000;
function fixture(){
 const memory=initializeWheelEffectTables(Buffer.alloc(0xa00000)),put=(p,value)=>memory.writeInt32LE(value|0,p),word=(p,value)=>memory.writeUInt16LE(value&65535,p),vector=(p,value)=>value.forEach((x,i)=>put(p+i*4,x));
 for(const[value,p]of[[SHAPES,0x91e79c],[SHAPEFREE,0x91e780],[ACTIVE,0x91e78c],[REVERSE,0x91e790],[LIST,0x902bc0],[EVENTS,0x902ba8],[HEAP,0x902bac],[FREE,0x902bb0],[ARENA,0x91e788],[SESSION,0x5ecb1c],[CONFIG,0x5ecefc]])put(p,value);
 put(0x91e794,63);put(0x91e784,-1);for(let i=0;i<64;i++)memory[SHAPEFREE+i]=i;for(let i=0;i<65;i++)put(0x902be0+i*12,GROUPS+i*132);put(0x902ba4,8);word(BUCKET+8,1);put(0x81118c,65536);
 for(const address of[A,B]){put(address,0x9803);put(address+12,BUCKET);put(address+0xa8,65536);put(address+0xac,65536);put(address+0x108,1);put(address+0x6bc,-1);put(address+0x58,65536);vector(address+0x9c,[65536,65536,65536]);[4096,0,0,0,4096,0,0,0,4096].forEach((v,i)=>word(address+0xc4+i*2,v));[65536,0,0,0,65536,0,0,0,65536].forEach((v,i)=>put(address+0xe4+i*4,v));}
 const respawn=createRespawnRuntime({memory,recordCount:2,bodyStorage:[A,B].map(address=>({address,length:0x4000})),scratchBase:STACK});
 const views=createPhysicsRuntimeViews({memory,bodyAt:respawn.bodyAt,bucketAt:respawn.bucketAt,bodyLists:[{address:LIST,capacity:16},{address:OTHERLIST,capacity:16},...Array.from({length:65},(_,i)=>({address:GROUPS+i*132,capacity:33}))],shapeCapacity:64,candidateMapping:{terrainVerticesFor:sector=>sector===0?VERTICES:undefined}});
 const register=address=>{const descriptors=Buffer.alloc(20);descriptors.writeInt32LE(512,12);descriptors.writeUInt16LE(1,16);views.registerShapes(address,descriptors);return views.bodyAt(address);};
 return {memory,put,word,vector,respawn,views,register};
}
function environment(){
 const node={index:0,zone:0},spatial={available:true,lookup:()=>({found:true,outside:false,node})},vertices=[[0,0,0,0],[200,0,0,0],[0,0,-200,0],[200,0,-200,0]];
 const grid={available:true,spatial,zones:[{root:0,regions:[0]}],regions:[{index:0,sector:0,row:0,column:0,rows:1,columns:1,padding:200}],normals:[{packed:768<<10,components:[0,-256,0]}],sectors:[{index:0,columns:1,rows:1,vertices,cells:[{forms:[{type:0,normal:0,point:null,indices:[0,1,3,2]}]}],flags:1}],scene:{uvTable:0x100,segments:[{columns:1,rows:1,packetsOffset:0x80,verticesOffset:0x180}]}};
 const data=Buffer.alloc(0x200);data.writeUInt16LE(400,0x66);return {data,grid,modelContext:{spatial,links:{nodes:[{placementIndices:[]}]},instances:new Map()}};
}
function contextFor(f,env){return {environment:env,records:f.views.records,queue:f.views.queue,candidateArena:f.views.candidateArena,candidateGroups:f.views.candidateGroups,effectFlags:f.views.effectFlags,gravityQ16:0,roundingMode:'nearest-even',selectionCounter:0,timeOptionsFor:f.views.timeOptionsFor,spatialStateFor:()=>({found:true,outside:false,node:{index:0,zone:0}}),staticScratch:{contact:f.views.contactAt(0x70000),tag:f.views.wordAt(0x70048)},queryOutput:f.views.outputAt(0x70100),worldEffectState:{records:Buffer.alloc(0),count:0,originS16:[0,0,0],strength:0}};}

test('raw registration, grouping and native unregister share body/list/shape identities',()=>{
 const f=fixture(),first=f.register(A),second=f.register(B),captured=f.views.physicalGroup.bodies;
 assert.equal(first,f.respawn.bodyAt(A));buildBodyCandidateGroups(captured.slice(0,f.views.physicalGroup.count),f.views.candidateGroups);assert.equal(first.collisionGroup130,f.views.candidateGroups.groups[0]);
 assert.equal(f.memory.readUInt32LE(A+0x130),0x902be0);assert.equal(f.views.shapePool.allocatedCount,4);
 unregisterPhysicalBody(A,{memory:f.memory});assert.equal(f.views.physicalGroup.count,1);assert.equal(captured[0],second);assert.equal(captured[1],null);assert.equal(first.collisionGroup130.count,0);assert.equal(f.views.shapePool.allocatedCount,2);assert.equal(first.flags&0x8000,0x8000);
 f.put(OTHERLIST,A);f.put(0x902bc0,OTHERLIST);assert.notEqual(f.views.physicalGroup.bodies,captured);assert.equal(captured[0],second);assert.equal(f.views.physicalGroup.bodies[0],first);
});

test('raw event records retain stale bytes while real heap invalidation and response callbacks mutate live bodies',()=>{
 const f=fixture(),a=f.register(A),b=f.register(B),q=f.views.queue;q.reset();f.memory.fill(0x6a,EVENTS,EVENTS+8*104);
 const contact={point:[0,0,0],normal:[0,65536,0],scalar:0,field38:0};insertCollisionEvent(q,{object1:a,contact,flags:{value:1},tag:1,deltaQ16:100});insertCollisionEvent(q,{object1:b,contact,flags:{value:1},tag:2,deltaQ16:200});
 const first=q.events[q.heap[1]>>>20],oldDamping=first.damping;assert.equal(first.object1,a);assert.equal(f.memory.readUInt32LE(first.address+4),A);assert.equal(oldDamping,0x6a6a);
 const visited=[];assert.equal(processCollisionEvents(q,{respond:(event,delta)=>{visited.push(event.object1.address);event.object1.frameTimeQ16+=delta;event.scalar++;},refresh:()=>{},finish:()=>{}}),2);
 assert.deepEqual(visited,[A,B]);assert.equal(a.frameTimeQ16,100);assert.equal(b.frameTimeQ16,200);assert.equal(first.scalar,1);assert.equal(first.damping,oldDamping);assert.equal(f.memory.readInt32LE(0x902ba0),0);
});

test('candidate producer writes raw pointers and packed closest terrain through existing respawn body',()=>{
 const f=fixture(),body=f.register(A),env=environment();body.position=[50*65536,-6*65536,-50*65536];body.linearVelocity=[0,8*65536,0];body.collisionBound120=0x7fffffff;
 f.memory.fill(0xa0,ARENA,ARENA+32);buildFrameCandidates([body],{records:f.views.records,grid:env.grid,models:env.modelContext,arena:f.views.candidateArena,spatialStateFor:()=>({found:true,outside:false,node:{index:0,zone:0}})});
 assert.equal(body.terrainWord15c,1);assert.equal(f.memory.readUInt32LE(A+0x154),ARENA);assert.equal(f.memory.readUInt32LE(ARENA+12),VERTICES);assert.equal(f.memory[ARENA],0xa0);assert.equal(f.memory[ARENA+2],0xa0);assert.equal(body.closestTerrain11c,0);
 const candidate=f.views.candidateArena.entries[0];assert.equal(candidate.vertexBase,0);assert.equal(candidate.type,0);assert.deepEqual(candidate.normalQ8,[0,-256,0]);assert.equal({...candidate,edgeCode:1}.vertexBase,0);f.memory[ARENA]=0xa3;assert.equal(candidate.type,3);f.views.candidateArena.entries[1]=candidate;assert.deepEqual(f.memory.subarray(ARENA+16,ARENA+32),candidate.bytes);
});

test('packed terrain setter validates signed components and keeps the integer getter byte-backed',()=>{
 const f=fixture(),body=f.respawn.bodyAt(A);body.closestTerrain11c={sector:255,column:-128,row:-32768};assert.equal(body.closestTerrain11c,-2147450625);assert.equal(f.memory.readUInt32LE(A+0x11c),0x800080ff);
 for(const value of[{sector:256,column:0,row:0},{sector:0,column:128,row:0},{sector:0,column:0,row:32768},null])assert.throws(()=>{body.closestTerrain11c=value;},/Native terrain reference/);
 body.closestTerrain11c=0xffffffff;assert.equal(body.closestTerrain11c,-1);
});

test('coherent raw simulation detects an impact and carries its cached contact into the next frame',()=>{
 const f=fixture(),body=f.register(A),env=environment(),context=contextFor(f,env);body.position=[50*65536,-6*65536,-50*65536];body.momentum=[0,8*65536,0];body.linearVelocity=[0,8*65536,0];
 const first=stepSimulationFrame(f.views.physicalGroup,[],context);assert.ok(first.processedEvents>0);assert.ok(first.storedContacts>0);assert.equal(body.frameTimeQ16,65536);assert.equal(body.linearVelocity[1],0);assert.ok(body.position[1]<=-2*65536);assert.equal(f.views.queue.count,0);assert.equal(f.memory.readInt32LE(A+0x118),65536);
 const position=body.position.slice();const second=stepSimulationFrame(f.views.physicalGroup,[],context);assert.equal(second.processedEvents,0);assert.deepEqual(body.position.slice(),position);assert.equal(second.finishedBodies,1);
});

test('simulation and wheel effects share the native read-only time getter without assigning snapshots',()=>{
 const f=fixture(),body=f.register(A),env=environment();body.position=[50*65536,-40*65536,-50*65536];body.momentum=[8*65536,0,0];body.linearVelocity=[8*65536,0,0];f.put(0x909300,A);f.memory[SESSION+0x54d]=1;f.memory[SESSION+0x579]=1;f.memory.writeFloatLE(4,CONFIG+0x68);f.put(0x811180,1);f.put(0x811184,A);f.put(0x81118c,32768);f.word(A+0x2f3a,4096);f.word(A+0x668,350);f.put(A+0x3cfc,3000000);f.put(0x5ec958,1);f.put(0x5ed2b8,256);f.put(0x5ed2c0,256);
 for(let i=0;i<4;i++){const d=A+0x180+i*28;f.word(d,(i%2?27:-27)*256);f.word(d+4,(i<2?32:-32)*256);f.word(d+10,256);f.put(d+16,i);f.put(A+0x324+i*200+0xb8,-1);}for(let i=0;i<6;i++)f.put(A+0x3dc8+i*28,1);
 f.put(0x909254,ROWS);f.put(0x909278,EFFECTBUCKET);for(let i=0;i<256;i++){f.word(ROWS+i*16,0xff00);f.put(ROWS+i*16+12,INDICES);}f.put(0x902eec,PARTICLES);f.put(0x6e65b4,PARTICLES);for(let i=0;i<8;i++)f.put(PARTICLES+i*256+0xac,i<7?PARTICLES+(i+1)*256:0);f.put(0x902b8c,-1);
 const wheelViews=createVehicleRuntimeViews({memory:f.memory,bodyAt:f.views.bodyAt,vehicleStateFor:f.respawn.vehicleStateFor,materialAddressFor:surface=>surface.offset===0x100?MATERIAL:undefined}),vehicle=wheelViews.vehicleFor(A);vehicle.state.bodyRadiusQ8=initializeVehicleContacts().bodyRadiusQ8;env.effectRuntime={views:wheelViews,driveScratchBase:STACK,forceScratchBase:STACK};
 assert.equal(Object.getOwnPropertyDescriptor(vehicle,'timeOptions').set,undefined);const result=stepSimulationFrame(f.views.physicalGroup,[vehicle],contextFor(f,env));
 assert.equal(result.vehicles[0].contacts.preparation.contact,true);assert.equal(vehicle.timeOptions.timeScaleExempt,true);assert.equal(vehicle.timeOptions.timeScaleQ16,32768);assert.equal(f.memory.readUInt32LE(0x6e65b4),PARTICLES+4*256);assert.equal(body.frameTimeQ16,65536);
});

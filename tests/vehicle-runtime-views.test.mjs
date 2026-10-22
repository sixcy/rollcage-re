import test from 'node:test';
import assert from 'node:assert/strict';
import {createRespawnRuntime} from '../src/respawn-runtime.mjs';
import {createVehicleRuntimeViews} from '../src/vehicle-runtime-views.mjs';
import {prepareWheelContactSides,applyWheelSuspension} from '../src/wheel-physics.mjs';
import {prepareWheelDriveDirections,updateWheelDrive} from '../src/wheel-drive.mjs';
import {applyWheelTractionForces} from '../src/wheel-forces.mjs';
import {initializeWheelEffectTables} from '../src/wheel-effects.mjs';
import {updateVehicleWheelFrame} from '../src/vehicle-frame.mjs';

const BODY=0x10000,SESSION=0x30000,CONFIG=0x31000,MATERIAL=0x32000,ROWS=0x40000,INDICES=0x43000,BUCKET=0x45000,PARTICLES=0x100000,STACK=0x9000;
function fixture(){
 const memory=initializeWheelEffectTables(Buffer.alloc(0xa00000)),put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p),vector=(p,v)=>v.forEach((x,i)=>put(p+i*4,x));
 put(0x5ecb1c,SESSION);put(0x5ecefc,CONFIG);memory[SESSION+0x54d]=1;memory[SESSION+0x579]=1;memory.writeFloatLE(4,CONFIG+0x68);put(0x909300,BODY);put(0x5ec958,1);put(0x81118c,65536);put(0x5ed2b8,256);put(0x5ed2c0,256);
 [4096,0,0,0,4096,0,0,0,4096].forEach((v,i)=>word(BODY+0xc4+i*2,v));[65536,0,0,0,65536,0,0,0,65536].forEach((v,i)=>put(BODY+0xe4+i*4,v));put(BODY+0xa8,65536);vector(BODY+0x68,[8*65536,0,0]);word(BODY+0x2f3a,4096);word(BODY+0x668,350);put(BODY+0x3cfc,3000000);put(BODY+0x664,0x100000);
 for(let i=0;i<4;i++){
  const d=BODY+0x180+i*28,w=BODY+0x324+i*200;word(d,(i%2?27:-27)*256);word(d+4,(i<2?32:-32)*256);word(d+10,256);put(d+16,i);put(d+24,MATERIAL);put(w+0xb8,-1);
 }
 for(let i=0;i<6;i++)put(BODY+0x3dc8+i*28,1);
 put(0x909254,ROWS);put(0x909278,BUCKET);for(let i=0;i<256;i++){word(ROWS+i*16,0xff00);put(ROWS+i*16+12,INDICES);}put(0x902eec,PARTICLES);put(0x6e65b4,PARTICLES);for(let i=0;i<8;i++)put(PARTICLES+i*256+0xac,i<7?PARTICLES+(i+1)*256:0);put(0x902b8c,-1);
 const respawn=createRespawnRuntime({memory,recordCount:1,bodyStorage:[{address:BODY,length:0x4000}],scratchBase:STACK}),metadata={resourceOffset:0x200};
 const views=createVehicleRuntimeViews({memory,bodyAt:respawn.bodyAt,vehicleStateFor:respawn.vehicleStateFor,materialAddressFor:surface=>surface===metadata||surface.offset===0x100?MATERIAL:surface.address});
 return {memory,put,word,vector,respawn,views,metadata};
}

test('existing respawn body/state/wheel identities survive live direction and drive writes',()=>{
 const f=fixture(),body=f.respawn.bodyAt(BODY),state=f.respawn.vehicleStateFor(body),wheel=state.wheels[0],views=f.views;
 assert.equal(views.bodyAt(BODY),body);assert.equal(views.stateFor(body),state);assert.equal(views.stateFor(body).wheels[0],wheel);
 prepareWheelDriveDirections(body,state.wheels,0);assert.deepEqual([0,4,8].map(o=>f.memory.readInt32LE(BODY+0x358+o)),[0,0,65536]);
 f.put(BODY+0x650,12345);assert.equal(views.driveFor(body).multiplierQ16,state.field650);views.driveFor(body).multiplierQ16=22222;assert.equal(state.field650,22222);
 body.position=[1,2,3];body.position[1]=9;assert.equal(f.memory.readInt32LE(BODY+0x38),9);assert.equal(body.bytes.readInt32LE(0x38),9);
});

test('contact-side preparation and suspension feed the actual drive and particle producers through one buffer',()=>{
 const f=fixture(),vehicle=f.views.vehicleFor(BODY),{body,state,drive}=vehicle;
 const hit={flags:1,fractionQ16:65536,pointQ8:[0,0,0],normalQ16:[0,-65536,0],cellRef:0};
 prepareWheelContactSides(body,state,()=>Array.from({length:4},()=>hit),{resolveSurface:()=>f.metadata});
 assert.equal(f.memory.readUInt32LE(BODY+0x198),MATERIAL);assert.equal(f.memory.readInt32LE(BODY+0x1f0+0x48),44*65536);assert.equal(f.memory[BODY+0x324]&1,1);
 applyWheelSuspension(body,state.wheels,state.contacts);assert.deepEqual(state.wheels[2].slipVector.slice(),[8*65536,0,0]);assert.equal(f.memory.readInt32LE(BODY+0x324+400+0x40),0);assert.equal(f.memory.readInt32LE(BODY+0x324+400+0x44),-65536);
 prepareWheelDriveDirections(body,state.wheels,0);
 updateWheelDrive(body,state,drive,{...vehicle.driveContext,surfaceMode:0},{timeOptions:vehicle.timeOptions,effectRuntime:{views:f.views,scratchBase:STACK}});
 assert.equal(f.memory.readInt32LE(BODY+0x324+400+0xc4),8*65536);assert.equal(state.wheels[2].effectSpeed,8*65536);assert.equal(state.driveEffects[2].status,0);assert.equal(state.driveEffects[4].status,0);
 assert.equal(f.memory.readUInt32LE(0x6e65b4),PARTICLES+4*256);assert.equal(f.memory.readUInt16LE(BUCKET+10),7);assert.equal(f.memory[PARTICLES+0x94],1);
 applyWheelTractionForces(body,state.wheels);f.views.effectHandlers({body,scratchBase:STACK-0x48,positionAddress:STACK-24,directionAddress:STACK-36}).onSurfaceParticles();assert.ok(body.momentum[0]<0);assert.equal(state.driveEffects[2].lastPosition[0],-27*65536);
});

test('ordinary vehicle frame binds rear particles and surface debris without effect callbacks',()=>{
 const f=fixture(),vehicle=f.views.vehicleFor(BODY),vertices=[];for(let row=0;row<3;row++)for(let col=0;col<3;col++)vertices.push([-128+col*128,0,128-row*128,4]);
 const registration={found:true,outside:false,node:{index:0,zone:0}},spatial={available:true,lookup:()=>registration};
 const cells=Array.from({length:4},(_,index)=>({forms:[{type:0,normal:0,point:null}],row:index>>1,column:index&1}));
 const grid={available:true,spatial,normals:[{packed:768<<10,components:[0,-256,0]}],sectors:[{index:0,columns:2,rows:2,vertices,cells,flags:1}],regions:[{index:0,sector:0,row:0,column:0,rows:2,columns:2,padding:200}],zones:[{root:0,regions:[0]}],scene:{uvTable:0x100,segments:[{columns:2,rows:2,packetsOffset:0x80}]}};
 const data=Buffer.alloc(0x180),modelContext={spatial,links:{nodes:[{placementIndices:[]}]},instances:new Map()};f.put(0x91e79c,0x48000);f.put(0x48040,15520);f.memory[BODY+0x10c]=5;vehicle.registeredCellRef=-1;vehicle.body.position=[0,-40*65536,0];
 const environment={data,grid,modelContext,effectRuntime:{views:f.views,driveScratchBase:STACK,forceScratchBase:STACK}};
 const first=updateVehicleWheelFrame([vehicle],environment);assert.equal(first[0].contacts.preparation.contact,true);assert.equal(f.memory.readUInt32LE(0x6e65b4),PARTICLES+4*256);assert.equal(vehicle.state.driveEffects[4].status,0);
 data.writeUInt32LE(5,0x10c);f.put(MATERIAL+12,5);f.put(0x5ec958,4);f.put(0x902b7c,0x47000);f.put(0x902b80,0x47200);f.put(0x902b84,0x110000);f.put(0x902b8c,15);for(let i=0;i<16;i++)f.word(0x47000+i*2,i);
 const second=updateVehicleWheelFrame([vehicle],environment);assert.equal(second[0].contacts.preparation.contact,true);assert.ok(f.memory.readInt32LE(0x902b88)>0);assert.equal(vehicle.state.driveEffects[4].status,1);assert.equal(f.memory[0x110000+15*128+0x6c],0);
 assert.throws(()=>updateWheelDrive(vehicle.body,{...vehicle.state},vehicle.drive,{...vehicle.driveContext,surfaceMode:0},{effectRuntime:{views:f.views,scratchBase:STACK}}),/coherent native/);
});

test('descriptor material pointers retain explicit mapping and live packed metadata',()=>{
 const f=fixture(),state=f.views.stateFor(BODY);state.descriptors[0].surface=f.metadata;
 const material=state.descriptors[0].surface;assert.equal(material,f.views.materialAt(MATERIAL));f.put(MATERIAL+12,0x1b09);assert.equal(material.category,9);assert.equal(material.gripReduction,27);
 material.gripReduction=3;assert.equal(f.memory.readUInt32LE(MATERIAL+12),0x0309);state.descriptors[0].surface=null;assert.equal(f.memory.readUInt32LE(BODY+0x198),0);assert.equal(state.descriptors[0].surface,null);
 assert.throws(()=>{state.descriptors[0].surface={resourceOffset:123};},/exceeds supplied/);
});

test('session pointer reloads and shared speed/parameter aliases are visible to the driver',()=>{
 const f=fixture(),vehicle=f.views.vehicleFor(BODY),context=vehicle.driveContext;f.memory[SESSION+0x587]=1;assert.equal(context.specialMode,true);
 const next=0x34000;f.put(0x5ecb1c,next);f.put(next+0x57c,7);f.memory[next+0x553]=2;f.memory[next+0x579]=11;assert.equal(context.gameMode,7);assert.equal(context.modeFlags,2);assert.equal(context.effectMode,11);
 f.word(BODY+0x668,65535);assert.equal(vehicle.drive.effectParameter,-1);assert.equal(vehicle.body.speed668,-1);vehicle.state.side=1;assert.equal(vehicle.reverseSteering,true);f.put(0x811184,BODY);assert.equal(vehicle.timeOptions.timeScaleExempt,true);
});

test('views reject copied storage and preserve fixed native array widths',()=>{
 const f=fixture();assert.throws(()=>createVehicleRuntimeViews({memory:f.memory,bodyAt:p=>({address:p,bytes:Buffer.alloc(0x4000)})}).bodyAt(BODY),/must alias/);
 const state=f.views.stateFor(BODY);assert.throws(()=>{state.wheels[0].slipVector=[1,2];},/3 native lanes/);assert.throws(()=>{state.wheels[0].slipVector.push(4);},/fixed span/);
});

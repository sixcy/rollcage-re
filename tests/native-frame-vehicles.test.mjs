import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {createNativeFrameVehicles,createNativeFrameVehicleBindings,readNativeFrameSurfaceMode} from '../tools/lib/native-frame-vehicles.mjs';
import {runVehicleWheelStages,updateVehicleWheelFrame} from '../src/vehicle-frame.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationVehicleFixture} from '../tools/lib/simulation-vehicle-fixtures.mjs';

const MODULE=0x600000,DELTA=MODULE-0x400000,SESSION=0x33000000,CONFIG=0x44000000,STACK=0xe00000;
const MATERIAL=0x22000000,ROUTES=0x22100000,NORMALS=0x22200000,VERTICES=0x55000000,SECTOR=0x66000000,SECTORS=0x77000000;
const addresses=Array.from({length:6},(_,i)=>0x11000000+i*0x10000);
let retainedProgram;
const programForFixture=()=>retainedProgram??=loadRetainedNativeProgram();
function fixture() {
  const globals=[[0x5ecb1c,4],[0x5ecefc,4],[0x90b98c,4],[0x909240,0xc0],[0x909300,6*0x30c],[0x902bc0,0x340],[0x811180,16]];
  const rows=[...globals.map(([p,n])=>({address:p+DELTA,bytes:Buffer.alloc(n)})),
    ...[[SESSION,0x600],[CONFIG,0x70],[STACK-0x400,0x500],[MATERIAL,16],[ROUTES,40],[NORMALS,4],[VERTICES,72],[SECTOR,0x60],[SECTORS,4],...addresses.map(p=>[p,0x3e78])].map(([address,n])=>({address,bytes:Buffer.alloc(n)}))];
  const {memory,span}=createCapturedMemory(rows,{aliases:globals.map(([address,length])=>({address,targetAddress:address+DELTA,length}))});
  const put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p);
  put(0x5ecb1c,SESSION); put(0x5ecefc,CONFIG); memory[SESSION+0x54d]=6; put(SESSION+0x57c,4); memory.writeFloatLE(1,CONFIG+0x68);
  put(0x90b98c,0x909240+DELTA); put(0x909240,SECTORS); put(0x90925c,NORMALS); put(0x9092b0,ROUTES); word(0x90929c,400);
  put(SECTORS,SECTOR); put(SECTOR+8,2); put(SECTOR+12,2); put(SECTOR+0x20,VERTICES); put(SECTOR+0x50,ROUTES);
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){const p=VERTICES+(row*3+col)*8;word(p,col*10);word(p+2,0);word(p+4,-row*20);}
  put(NORMALS,(-256&1023)<<10); word(ROUTES+16,-1);
  for(const[p,i]of addresses.map((p,i)=>[p,i])){put(0x909300+i*0x30c,p); put(p,0x1c03);word(p+0x65e,i);put(p+0x11c,-1);put(p+0x6bc,-1);put(p+0x148,MODULE+0x1e080);put(p+0x198,MATERIAL);}
  put(MATERIAL+12,0x705); //Category5, live grip reduction7.
  const views=createPhysicsRuntimeViews({memory,bodyStorage:addresses.map(address=>({address,length:0x3e78})),bodyLists:[]});
  const geometry={grid:{sectors:[{index:0,columns:2,rows:2}]},modelContext:{instances:new Map()}};
  const options={memory,views,geometry,scratchBase:STACK,moduleBaseAddress:MODULE};
  return {memory,span,rows,put,word,views,geometry,options};
}

test('six captured participants bind without initialization and retain actual body/material identities',()=>{
  const f=fixture(),before=f.rows.map(({address,bytes})=>Buffer.from(f.span(address,bytes.length))),binding=createNativeFrameVehicles(f.options);
  assert.equal(Array.isArray(binding.vehicles),true);assert.equal(binding.vehicles.length,6);
  assert.deepEqual(binding.vehicles.map(v=>v.body.address),addresses);
  for(let i=0;i<6;i++){const v=binding.vehicles[i];assert.equal(v.body,f.views.bodyAt(addresses[i]));assert.equal(binding.vehiclePreparationStateFor(v.body),v.state);}
  const surface=binding.vehicles[0].state.descriptors[0].surface;assert.equal(surface.address,MATERIAL);assert.equal(surface.category,5);assert.equal(surface.gripReduction,7);
  f.put(MATERIAL+12,0xb08);assert.equal(surface.category,8);assert.equal(surface.gripReduction,11);
  f.put(MATERIAL+12,0x705);
  f.rows.forEach(({address,bytes},i)=>assert.deepEqual(f.span(address,bytes.length),before[i]));
  assert.equal(binding.environment.wheelRuntime.scratchBase,STACK-56);assert.equal(binding.environment.effectRuntime.driveScratchBase,STACK-56);
  assert.equal(binding.filterRuntime.scratchBase,STACK-52);assert.deepEqual([...binding.collisionFilters.keys()],[MODULE+0x1e080]);
  assert.equal(typeof binding.handlers.onSpecialEvent,'function');assert.equal(binding.handlers.externalWorld,undefined);
});

test('participant and session roots reload between stages while the four tail calls retain one body',()=>{
  const f=fixture(),binding=createNativeFrameVehicles(f.options),list=binding.vehicles,events=[];
  f.memory[SESSION+0x54d]=1;
  const stages=Object.fromEntries(['directions','contacts','suspension','drive','rest','airSpin','orientation','special'].map(key=>[key,(v,i)=>{
    events.push([key,i,v.body.address]);
    if(key==='directions'&&i===0){f.put(0x909300,addresses[2]);f.memory[SESSION+0x54d]=2;}
    if(key==='rest'&&i===0)f.put(0x909300,addresses[3]);
  }]));stages.forces=()=>{};runVehicleWheelStages(list,stages);
  assert.deepEqual(events.slice(0,4),[['directions',0,addresses[0]],['directions',1,addresses[1]],['contacts',0,addresses[2]],['contacts',1,addresses[1]]]);
  assert.deepEqual(events.filter(([key,i])=>i===0&&['rest','airSpin','orientation','special'].includes(key)).map(x=>x[2]),[addresses[2],addresses[2],addresses[2],addresses[2]]);
  assert.equal(list[0].body.address,addresses[3]);
  f.memory[SESSION+0x54d]=7;assert.throws(()=>list.length,/six/);
});

test('native surface reads actual vertex flags and published threshold without an authored data facade',()=>{
  const f=fixture(),binding=createNativeFrameVehicles(f.options),vehicle=binding.vehicles[0];
  assert.equal(binding.environment.surfaceModeFor(vehicle),0);
  f.put(addresses[0]+0x11c,0);
  for(const[code,expected]of[[399,0],[400,1],[975,1],[976,2],[1007,2],[1008,0]]){f.put(VERTICES+4,code<<22);assert.equal(readNativeFrameSurfaceMode(addresses[0],{memory:f.memory}),expected);}
  f.word(0x90929c,990);f.put(VERTICES+4,980<<22);assert.equal(binding.environment.surfaceModeFor(vehicle),0);
});

test('native basis reads captured routes/normals and retains the original parent output addresses',()=>{
  const f=fixture(),binding=createNativeFrameVehicles(f.options),vehicle=binding.vehicles[0];
  assert.equal(binding.environment.trackBasisFor(vehicle),null);
  f.put(addresses[0]+0x11c,0);f.word(ROUTES+2,0);f.word(ROUTES+16,-1);
  const basis=binding.environment.trackBasisFor(vehicle);
  assert.deepEqual(basis,{tangentQ16:[0,0,20<<12],normalQ16:[0,-65536,0]});
  assert.deepEqual([0,4,8].map(o=>f.memory.readInt32LE(STACK-0x5c+o)),basis.tangentQ16);
  assert.deepEqual([0,4,8].map(o=>f.memory.readInt32LE(STACK-0x50+o)),basis.normalQ16);
  f.word(ROUTES+16,1);assert.deepEqual(binding.environment.trackBasisFor(vehicle).tangentQ16,[0,0,-20<<12]);
});

test('root wrapper requires observed numerical context and incomplete body capture fails closed',()=>{
  const f=fixture(),numericalContext=decodePhysicsNumericalContext({x87ControlWord:0x7f,mxcsr:0x1f80});
  const opts={memory:f.memory,physicsViews:f.views,geometry:f.geometry,entryEsp:STACK,moduleBaseAddress:MODULE,numericalContext};
  assert.equal(createNativeFrameVehicleBindings(opts).vehicles.length,6);
  assert.throws(()=>createNativeFrameVehicleBindings({...opts,numericalContext:decodePhysicsNumericalContext({x87ControlWord:0x27f,mxcsr:0x1f80})}),/PC24/);
  assert.throws(()=>createNativeFrameVehicleBindings({...opts,numericalContext:decodePhysicsNumericalContext({x87ControlWord:0x7f,mxcsr:0x9f80})}),/flush/);
  f.put(0x909300,0x12345000);assert.throws(()=>createNativeFrameVehicles(f.options),/Uncaptured/);
});

test('wheel-frame reports admit a participant first reached after the drive pass',async()=>{
  const program=await programForFixture(),f=createSimulationVehicleFixture(program,0,{vehicleCount:2,effects:false}),vehicles=[f.vehicles[0]];
  const result=updateVehicleWheelFrame(vehicles,{...f.context.environment,surfaceModeFor:()=>0,trackBasisFor:()=>null},{onSurfaceParticles:({index})=>{if(index===0)vehicles.push(f.vehicles[1]);}});
  assert.equal(result.length,2);assert.equal(result[1].directions,undefined);assert.equal(result[1].contacts,undefined);assert.equal(result[1].rest,false);assert.equal(result[1].special.active,false);
});

test('bound wheel/effect contexts preserve the existing native-parent fixture bytes',async()=>{
  const program=await programForFixture(),before=createSimulationVehicleFixture(program,1,{vehicleCount:2}),after=createSimulationVehicleFixture(program,1,{vehicleCount:2});
  const binding=createNativeFrameVehicles({memory:after.memory,views:after.views,geometry:{grid:after.context.environment.grid,modelContext:after.context.environment.modelContext},scratchBase:0x9000,moduleBaseAddress:0x400000});
  updateVehicleWheelFrame(before.vehicles,before.context.environment);
  updateVehicleWheelFrame(binding.vehicles,binding.environment,binding.handlers);
  assert.deepEqual(after.memory.subarray(0x10000),before.memory.subarray(0x10000));
  const allocated=after.memory.readUInt32LE(0x6e65b4),vehicle=binding.vehicles[0];
  binding.handlers.onSpecialEvent({body:vehicle.body,code:2});
  assert.notEqual(after.memory.readUInt32LE(0x6e65b4),allocated);
  let particles=0;
  for(let p=after.memory.readUInt32LE(0x6e65c0);p;p=after.memory.readUInt32LE(p+0xa8))if(after.memory.readUInt32LE(p)===23)particles++;
  assert.equal(particles,16);
});

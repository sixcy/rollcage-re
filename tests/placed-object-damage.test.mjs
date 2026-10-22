import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from '../tools/lib/simulation-runtime-fixtures.mjs';
import {damagePlacedObject,queueDestroyedPlacedObjects,selectModelDestructionObserver,computeModelCameraDuration} from '../src/placed-object-damage.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';
const program=await loadRetainedNativeProgram(),OBJECT=0x250000,VELOCITY=0x79000,STACK=0x9000;
const fixture=()=>{const f=createSimulationRuntimeFixture(program,0,{models:true,breakable:true});return {...f,put:(p,v)=>f.memory.writeInt32LE(v|0,p),context:{memory:f.memory,scratchBase:STACK},frameContext:f.context};};

test('ordinary configuration and an empty linked tail reject before reading velocity',()=>{
 const f=fixture(),config=f.memory.readUInt32LE(OBJECT+0x194);f.put(config,0);
 assert.equal(damagePlacedObject(OBJECT,f.bodies[0].address,0,0xffffffff,f.context),0);
 f.put(config,0x4000000);f.put(OBJECT+0x1b0,OBJECT+0x1000);f.memory[OBJECT+0x1198]=0;
 assert.equal(damagePlacedObject(OBJECT,f.bodies[0].address,0,0xffffffff,f.context),0);assert.equal(f.memory.readUInt32LE(config),0x4000000);
});

test('real model damage disables its shape, reduces velocity and emits particles/debris before queueing destruction',()=>{
 const f=fixture(),body=f.bodies[0].address,config=f.memory.readUInt32LE(OBJECT+0x194);f.put(VELOCITY,8*65536);
 assert.equal(damagePlacedObject(OBJECT,body,0,VELOCITY,f.context),1);
 assert.equal(f.memory.readUInt32LE(config),0x5000000);assert.equal(f.memory.readUInt16LE(OBJECT+8)&1,1);assert.equal(f.memory[OBJECT+0x198],0);
 assert.equal(f.memory.readInt32LE(VELOCITY),1024);assert.equal(f.memory.readInt32LE(0x9153dc),2);
 assert.ok(f.memory.readUInt32LE(0x6e65c0));assert.equal(f.memory.readInt32LE(0x902b88),48);
 assert.equal(f.memory.readUInt32LE(0x9205e0),OBJECT);assert.equal(f.memory.readUInt32LE(0x9205e4),255);
});

test('heavy body destruction visits the tail configurations and repeatedly shifts the same velocity',()=>{
 const f=fixture(),body=f.bodies[0].address,config=f.memory.readUInt32LE(OBJECT+0x194);f.put(body,17);f.put(VELOCITY,8*65536);
 for(let i=0;i<4;i++)f.put(config+i*4,0x4000000);
 assert.equal(damagePlacedObject(OBJECT,body,0,VELOCITY,f.context),1);
 for(let i=0;i<4;i++)assert.equal(f.memory.readUInt32LE(config+i*4),0x5000000);
 assert.equal(f.memory.readInt32LE(VELOCITY),0);assert.equal(f.memory.readInt32LE(0x9153dc),8);assert.equal(f.memory[OBJECT+0x198],0);
});

test('destruction queue links wrap at64 and publish their byte counters after the chain',()=>{
 const f=fixture();f.memory[f.extraAddresses.session+0x58c]=2;f.memory[0x9207e0]=255;f.memory[0x9207e1]=63;f.put(OBJECT+0x19c,OBJECT+0x1000);
 queueDestroyedPlacedObjects(OBJECT,f.context);
 assert.equal(f.memory.readUInt32LE(0x9205e0+63*8),OBJECT);assert.equal(f.memory.readUInt32LE(0x9205e4+63*8),0);
 assert.equal(f.memory.readUInt32LE(0x9205e0),OBJECT+0x1000);assert.equal(f.memory.readUInt32LE(0x9205e4),255);
 assert.equal(f.memory[0x9207e0],1);assert.equal(f.memory[0x9207e1],1);
});

test('observer fallback and duration preserve their native coordinate offsets and clamps',()=>{
 const f=fixture(),output=VELOCITY+16;f.put(VELOCITY,10*65536);f.put(VELOCITY+4,20*65536);f.put(VELOCITY+8,30*65536);
 selectModelDestructionObserver(VELOCITY,output,1500,f.context);
 assert.equal(f.memory.readUInt32LE(output),0x9205a0);assert.deepEqual([4,8,12].map(o=>f.memory.readInt32LE(0x9205a0+o)),[-40*65536,-180*65536,-20*65536]);
 assert.equal(computeModelCameraDuration(VELOCITY,VELOCITY,700,4,f.context),85);
 f.put(VELOCITY+32,0x7fffffff);assert.equal(computeModelCameraDuration(VELOCITY+32,VELOCITY,1,4,f.context),1024);
});

test('actual physics model contact reaches damage and its native effect pools through shared views',()=>{
 const f=fixture(),config=f.memory.readUInt32LE(OBJECT+0x194),result=stepSimulationFrame(f.views.physicalGroup,[],f.frameContext);
 assert.ok(result.modelHits);assert.ok(result.processedEvents);assert.equal(f.memory.readUInt32LE(config),0x5000000);
 assert.equal(f.grid.sectors[0].index,0);assert.equal(f.models.instances.get(0).settings.configurations[0].type,5);
 assert.ok(f.memory.readUInt32LE(0x6e65c0));assert.ok(f.memory.readInt32LE(0x902b88)>0);assert.ok(f.memory[0x9207e0]);
});

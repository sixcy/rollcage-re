import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createModelContactEffectFixture} from '../tools/lib/model-contact-effect-fixtures.mjs';
import {initializeModelContactFragments,emitModelContactFragments,updateModelContactFragments,breakClassOneModel,breakClassTwoModel} from '../src/model-contact-effects.mjs';
import {queryRawPlacedModelSphere} from '../src/raw-model-sphere-query.mjs';
const program=await loadRetainedNativeProgram(),OBJECT=0x250000,STACK=0x9000;
const fixture=(n=0,options)=>{const f=createModelContactEffectFixture(program,n,options);return {...f,runtime:{memory:f.memory,scratchBase:STACK}};};

test('fragment constructor uses the shared arena and preserves unrelated bank bytes',()=>{
 const f=fixture(0,{initialize:false}),cursor=f.memory.readUInt32LE(0x70dcf4);initializeModelContactFragments(f.runtime);
 assert.equal(f.memory.readUInt32LE(0x810924),f.effectAddresses.fragments);assert.equal(f.memory.readUInt32LE(0x70dcf4),cursor+0x6000);
 for(let i=0;i<64;i++){const p=f.effectAddresses.fragments+i*384;assert.equal(f.memory.readInt32LE(p),14);assert.equal(f.memory[p+0x2c],0);assert.equal(f.memory.readUInt32LE(p+0x50),0x12345678);assert.equal(f.memory[p+0x30],0x5a);}
 assert.equal(f.memory.readInt32LE(0x810930),0);
});

test('fragment ring reuses only occupied slots and retains one spatial link per active record',()=>{
 const f=fixture();emitModelContactFragments(2*65536,-6*65536,0,67,8,37,f.runtime);
 assert.equal(f.memory.readUInt32LE(0x810930),3);assert.equal(f.memory.readUInt32LE(0x810938),67);
 const bucket=f.memory.readUInt32LE(f.effectAddresses.fragments+12)&0xfffffffe,ids=new Set();let id=f.memory.readUInt16LE(bucket+10);
 while(id){assert.ok(!ids.has(id));ids.add(id);const p=f.memory.readUInt32LE(0x902eec)-128+id*128;id=f.memory.readUInt16LE(p+4);}
 assert.equal(ids.size,64);
 for(let i=0;i<64;i++){const p=f.effectAddresses.fragments+i*384;assert.equal(f.memory[p+0x2c],255);assert.equal(f.memory[p+0x2d],37);}
});

test('expiration unregisters the last record but still applies its final movement',()=>{
 const f=fixture();emitModelContactFragments(2*65536,-6*65536,0,1,8,3,f.runtime);const p=f.effectAddresses.fragments;
 for(let frame=0;frame<254;frame++)updateModelContactFragments(f.runtime);
 assert.equal(f.memory[p+0x2c],1);const before=[0,4,8].map(o=>f.memory.readInt32LE(p+0x10+o)),direction=[0,4,8].map(o=>f.memory.readInt32LE(p+0x1c+o)),speed=f.memory.readInt32LE(p+0x28);
 updateModelContactFragments(f.runtime);
 assert.equal(f.memory[p+0x2c],0);assert.equal(f.memory.readUInt32LE(p+4),0);
 assert.deepEqual([0,4,8].map(o=>f.memory.readInt32LE(p+0x10+o)),before.map((v,i)=>(v+Math.imul(direction[i]>>1,speed)+(i===1?0x48000:0))|0));
 const expired=Buffer.from(f.memory.subarray(p,p+384));updateModelContactFragments(f.runtime);assert.deepEqual(f.memory.subarray(p,p+384),expired);
});

test('class1 executes fragment/particle/debris producers and releases the actual script handle',()=>{
 const f=fixture(2),group=f.effectAddresses.groups;f.memory[group+6]=2;
 for(let i=0;i<2;i++)f.put(f.memory.readUInt32LE(OBJECT+0x194)+i*4,0x2000000);
 const expected=f.memory[f.effectAddresses.mesh+3]+f.memory[f.effectAddresses.mesh+11];
 assert.equal(breakClassOneModel(OBJECT,f.runtime),1);
 assert.equal(f.memory.readUInt32LE(0x810930),expected);assert.equal(f.memory.readInt32LE(0x9153dc),2);assert.equal(f.memory.readInt32LE(0x902b88),30);
 assert.equal(f.memory[OBJECT+0x19a],5);assert.equal(f.memory.readUInt16LE(OBJECT+0x16a),0);assert.equal(f.memory.readUInt16LE(f.effectAddresses.scripts),0xfff2);
});

test('class2 captures status row before release and reloads the model/configuration afterward',()=>{
 const f=fixture(),model=0x7e000,configuration=0x7e100;f.memory[model+0x27]=2;f.put(configuration,0xabc12345);f.put(configuration+4,0x4ff01234);
 breakClassTwoModel(OBJECT,{...f.runtime,handlers:{releaseAttachments44ef90:()=>{f.memory[OBJECT+0x19b]=7;f.put(OBJECT+0x10,model);f.put(OBJECT+0x194,configuration);}}});
 assert.equal(f.memory[0x920809],1);assert.equal(f.memory[0x920879],0);assert.equal(f.memory.readUInt32LE(configuration),(0xabc12345&0xf5ffffff|0x5000000)>>>0);assert.equal(f.memory.readUInt32LE(configuration+4),(0x4ff01234&0xf5ffffff|0x5000000)>>>0);
});

test('raw class2 query clears its status word before invoking the actual release stage',()=>{
 const f=fixture(),instance=f.models.instances.get(0),pointers=f.candidateMapping.modelPointersFor({settings:instance.settings,shape:instance.collision.shapes[0]}),body=f.bodies[0],record=f.addresses.records,out=f.extraAddresses.output;
 f.memory[OBJECT+0x19a]=2;f.put(f.memory.readUInt32LE(OBJECT+0x194),0);f.word(0x920806,0xabcd);f.put(body.address+0x158,f.addresses.arena);f.word(body.address+0x15e,1);f.put(f.addresses.arena+8,OBJECT);f.put(f.addresses.arena+12,pointers.shape);
 [0,-40*256,0].forEach((v,i)=>f.put(record+8+i*4,v));[0,80*256,0].forEach((v,i)=>f.put(record+20+i*4,v));f.put(record+64,2*256);f.word(record+70,0);
 let calls=0;queryRawPlacedModelSphere(body.address,record,out,65536,{...f.runtime,views:f.views,roundingMode:'nearest-even',handlers:{releaseAttachments44ef90:()=>{calls++;assert.equal(f.memory.readUInt16LE(0x920806),0);assert.equal(f.memory[OBJECT+0x19a],5);}}});
 assert.equal(calls,1);assert.equal(f.memory.readUInt32LE(out+28),0x240);assert.equal(f.memory[0x920809],1);
});

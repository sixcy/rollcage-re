import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createVehicleConstructionFixture} from '../tools/lib/vehicle-construction-fixtures.mjs';
import {constructVehicle,cloneSecondaryVehicleWheels,initializeVehicleController,initializeVehicleAnimationBody,initializeVehicleAnimationRange,resetVehicleParticipant,initializeVehicleConstructionTables} from '../src/vehicle-construction.mjs';
import {verifyVehicleConstruction} from '../tools/verify-vehicle-construction-instructions.mjs';
import {verifyVehicleConstructionPhysics} from '../tools/verify-vehicle-construction-physics-instructions.mjs';
import tables from '../src/vehicle-construction-tables.json' with {type:'json'};
const program=await loadRetainedNativeProgram();

test('vehicle construction publishes actual shapes, linked wheels, effects and native ownership',()=>{
 const f=createVehicleConstructionFixture(program,2),{memory:m,addresses:a}=f,p=constructVehicle(a.record,2,f.runtime);
 assert.equal(m.readUInt32LE(a.record),p);assert.equal(m.readInt32LE(p),0x1c03);assert.equal(m.readInt32LE(p+0x148),0x41e080);assert.equal(m[p+0x10c],5);assert.equal(m.readUInt16LE(0x902bc4),1);assert.equal(m.readUInt32LE(a.list),p);assert.equal(m.readUInt16LE(p+0x65e),2);assert.equal(m.readInt32LE(p+0xb4),0);assert.equal(m.readUInt32LE(0x7130e0),p+0x728);assert.equal(m.readUInt32LE(0x82e880),p);assert.equal(m.readUInt32LE(0x8495e0+2*0x8c+0x6c),p);
 for(let i=0;i<4;i++){const wheel=p+0x324+i*200,render=m.readUInt32LE(wheel+0x6c);assert.equal(m.readUInt32LE(render+0x164),wheel);assert.equal(m[wheel+0x9c],2);assert.equal(m.readInt32LE(wheel+0x80),0x240000);}assert.equal(m.readUInt32LE(p+0x660),a.session+0x12a0);assert.equal(m.readInt32LE(a.session+0x1fb20),5);assert.equal(f.allocations[0].size,0x13800);
});

test('mode-four presentation construction owns six bodies and a copied panel buffer',()=>{
 const f=createVehicleConstructionFixture(program,0),{memory:m,addresses:a}=f,p=constructVehicle(a.record,0,f.runtime),presentation=m.readUInt32LE(p+0x3e70),first=m.readUInt32LE(0x902018),second=m.readUInt32LE(0x90201c);
 assert.equal(f.allocations.length,3);assert.deepEqual(f.allocations.map(x=>x.size),[0x13800,0x121c,0x14c0]);assert.equal(second-first,0xa60);assert.ok(m.subarray(first,second).equals(m.subarray(second,second+0xa60)));for(let i=0;i<6;i++){assert.ok(m.readUInt32LE(presentation+i*4));assert.ok(m.readUInt32LE(presentation+24+i*0x300+4));}assert.equal(m.readUInt32LE(p+0x660),0);
});

test('secondary wheel clones retain independent objects and the captured registration cap',()=>{
 const f=createVehicleConstructionFixture(program,1),{memory:m,addresses:a}=f;m.writeInt32LE(0x220000,a.record+0x250);m.writeInt32LE(510,0x6e6b44);m.writeInt32LE(12345,a.body+0x324+0x78);cloneSecondaryVehicleWheels(a.record,0,f.runtime);
 assert.equal(m.readInt32LE(0x220000+0x324+0x78),12345);assert.equal(m.readInt32LE(0x6e6b44),512);for(let i=0;i<4;i++){const render=m.readUInt32LE(0x220000+0x324+i*200+0x6c);assert.equal(m.readInt32LE(render),0xc00);assert.equal(m.readUInt16LE(render+0x10e),i<2?510+i:65535);assert.equal(m.readInt32LE(render+0x164),-1);}
});

test('exhausted controller search preserves the native body-address fallback',()=>{
 const f=createVehicleConstructionFixture(program,1),{memory:m,addresses:a}=f;for(let i=0;i<6;i++)m.writeInt32LE(7,a.session+0x1fb20+i*0x1e884);assert.equal(initializeVehicleController(a.body,1,f.runtime),a.body);assert.equal(m.readUInt32LE(a.body+0x660),a.body);assert.equal(m.readInt32LE(a.body+0x1e880),2);assert.equal(m.readInt32LE(a.body),0);
});

test('participant reset skips group zero and retains null selection when no other group exists',()=>{
 const f=createVehicleConstructionFixture(program,1),{memory:m,addresses:a}=f;m[a.pack+0x46]=1;m.writeInt32LE(0x76543210,a.record+0x54);resetVehicleParticipant(a.record,f.runtime);assert.equal(m.readInt32LE(a.record+0x54),0);assert.equal(m.readInt32LE(a.record+0x58),0);assert.equal(m[a.record+0x21],2);assert.equal(m[a.record+0x23],2);assert.equal(m[a.body+0x671],1);
});

test('large primary model changes shared translation tables once per type',()=>{
 const f=createVehicleConstructionFixture(program,1),{memory:m,addresses:a}=f;m.writeUInt16LE(251,f.models[0]+6);m.writeUInt16LE(7,0x5ecfc4);m.writeUInt16LE(8,0x5ecfc6);m.writeUInt16LE(9,0x5ecfc8);const vertex=f.models[0]+0x200,before=m.readInt16LE(vertex);initializeVehicleAnimationBody(a.body,2,f.runtime);assert.equal(m.readUInt32LE(0x5ecff4),0x5ecfc4);assert.equal(m.readInt16LE(vertex),before+7);assert.equal(m.readInt16LE(vertex+4),7);const once=Buffer.from(m.subarray(vertex,vertex+32));initializeVehicleAnimationBody(a.body,2,f.runtime);assert.ok(m.subarray(vertex,vertex+32).equals(once));
});

test('equal-depth animation vertices produce no polygon selections and retain unused bytes',()=>{
 const f=createVehicleConstructionFixture(program,1),{memory:m,addresses:a}=f,state=a.body+0x2b88;m.writeInt32LE(a.body,state+4);for(let i=0;i<4;i++)m.writeInt16LE(12,f.models[0]+0x204+i*8);m[state+0x2fe]=0x5a;initializeVehicleAnimationRange(state,f.runtime);assert.equal(m[state+0x2dc],0);assert.equal(m.readUInt16LE(state+2),28);assert.equal(m.readInt32LE(state+0x2f6),-1);assert.equal(m.readInt32LE(state+0x2fa),-1);assert.equal(m[state+0x2fe],0x5a);
});

test('constructor table initialization restores original mutable templates only when requested',()=>{
 const memory=Buffer.alloc(0xa00000,0x5a);initializeVehicleConstructionTables(memory);for(const table of tables)assert.equal(memory.subarray(Number(table.address),Number(table.address)+table.bytesHex.length/2).toString('hex'),table.bytesHex);assert.equal(memory[0x100000],0x5a);
});

test('constructor parents and children match native instructions with allocator mutations',async()=>{const r=await verifyVehicleConstruction({fixtures:8,output:null});assert.equal(r.matched,true);assert.equal(r.calls,112);});
test('native constructed vehicles consume actual controls and wheel physics across ticks',async()=>{const r=await verifyVehicleConstructionPhysics({fixtures:3,frames:4,output:null});assert.equal(r.matched,true);assert.equal(r.physicsCalls,12);assert.equal(r.controlCalls,12);assert.ok(r.wheelContacts>0);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRaceWeaponStage} from '../src/race-weapon-stage.mjs';
import {initializeProjectileConstructionTables, initializeProjectilePools} from '../src/projectile-construction.mjs';
import {initializeWormholeVisualTables} from '../src/wormhole-visuals.mjs';
import {createVehicleConstructionFixture} from '../tools/lib/vehicle-construction-fixtures.mjs';

function fixture(){const f=createVehicleConstructionFixture({initializeMemory:m=>m}),m=f.memory,session=f.addresses.session;initializeProjectileConstructionTables(m);initializeWormholeVisualTables(m);m.writeFloatLE(1,0x5dc774);m.writeFloatLE(4096,0x5dca88);f.runtime.roundingMode='nearest-even';f.runtime.entryRegisters={EDI:0};initializeProjectilePools(f.runtime);m[session+0x54d]=3;m.writeInt32LE(0,0x811180);m.writeInt32LE(0,0x90cb80);m.writeInt32LE(0,0x902024);const bodies=[0x120000,0x125000,0x12a000];for(let i=0;i<3;i++){const b=bodies[i];m.writeUInt32LE(b,0x909300+i*0x30c);m[b+0x68c]=255;m[b+0x68d]=255;m[b+0x699]=10;m.writeInt32LE(-1,b+0x6bc);m.writeInt32LE(0x60000,b+0x6ac);}return{...f,m,session,bodies,put:(p,v)=>m.writeInt32LE(v|0,p),word:(p,v)=>m.writeUInt16LE(v&65535,p)};}
test('unknown launch states inherit the preceding participant age threshold',()=>{
 const f=fixture(),[a,b,c]=f.bodies;f.word(a+0x6a0,1);f.word(a+0x6a2,89);f.word(b+0x6a0,3);f.word(b+0x6a2,89);updateRaceWeaponStage(f.runtime);assert.equal(f.m.readInt16LE(a+0x6a2),90);assert.equal(f.m.readInt16LE(b+0x6a2),90);assert.equal(f.m.readInt16LE(b+0x6a0),3);assert.equal(f.m[c+0x699],9);
});
test('expiry breaks the first participant pass but still processes contact controllers',()=>{
 const f=fixture(),[a,b]=f.bodies,state=0x180000;f.word(a+0x6a0,3);f.put(b+0x6bc,state);f.m[state]=1;f.put(0x713184,0x190000);updateRaceWeaponStage(f.runtime);assert.equal(f.m.readInt32LE(a+0x6a0),0);assert.equal(f.m.readInt32LE(a+0x6ac),0x60000);assert.equal(f.m[b+0x699],10);assert.equal(f.m[state],0);
});
test('the incremented age is compared as signed16 after wrapping',()=>{
 const f=fixture(),[a]=f.bodies;f.word(a+0x6a0,3);f.word(a+0x6a2,32767);updateRaceWeaponStage(f.runtime);assert.equal(f.m.readInt16LE(a+0x6a2),-32768);assert.equal(f.m.readInt16LE(a+0x6a0),3);
});
test('decay can step below its base and clamps both values to the session cap',()=>{
 const f=fixture(),[a,b]=f.bodies;f.put(a+0x6a8,0x60001);f.put(b+0x6a8,0x100000);f.put(b+0x6ac,0xf0000);f.m[f.session+0x587]=0;updateRaceWeaponStage(f.runtime);assert.equal(f.m.readInt32LE(a+0x6a8),0x5fc01);assert.equal(f.m.readInt32LE(b+0x6a8),0xd0000);assert.equal(f.m.readInt32LE(b+0x6ac),0xd0000);
});
test('releasing the held launch mask transitions state1 before incrementing its age',()=>{
 const f=fixture(),[a]=f.bodies;f.word(a+0x6a0,1);f.word(a+0x6a2,1);f.word(a+0x6a4,4);f.put(a+0x710,0);updateRaceWeaponStage(f.runtime);assert.equal(f.m.readInt16LE(a+0x6a0),2);assert.equal(f.m.readInt16LE(a+0x6a2),2);
});

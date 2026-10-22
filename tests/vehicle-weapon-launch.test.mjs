import test from 'node:test';
import assert from 'node:assert/strict';
import {launchVehicleWeapon, requestHeldVehicleRecovery} from '../src/vehicle-weapon-launch.mjs';
import {createRawScriptFixture} from '../tools/lib/raw-scripted-motion-fixtures.mjs';

function fixture(kind=5){const f=createRawScriptFixture(),m=f.memory,record=0x20000,body=0x22000,session=0x28000;const put=(p,v)=>m.writeInt32LE(v|0,p);put(record,body);put(0x5ecb1c,session);m[body+0x718]=8;m[body+0x68c]=kind;m[body+0x68d]=255;return{...f,record,body,session,put};}
test('invalid and empty signed slot bytes preserve all public memory',()=>{
 for(const kind of[8,64,128,254,255]){const f=fixture(kind),before=Buffer.from(f.memory.subarray(0x10000));assert.equal(launchVehicleWeapon(f.record,0,1,0,0,f),0);assert.deepEqual(f.memory.subarray(0x10000),before);}
});
test('new time effect retains active-slot bit40 for its owning participant',()=>{
 const f=fixture();assert.equal(launchVehicleWeapon(f.record,0,0,0,0,f),1);assert.equal(f.memory[f.body+0x68c],0x45);assert.equal(f.memory.readUInt32LE(0x811184),f.body);assert.equal(f.memory.readInt32LE(0x811180),2);
});
test('preempting another time-effect owner consumes the slot but keeps EAX success',()=>{
 const f=fixture();f.put(0x811180,2);f.put(0x811184,f.body+0x4000);assert.equal(launchVehicleWeapon(f.record,0,0,0,0,f),1);assert.equal(f.memory[f.body+0x68c],255);assert.equal(f.memory.readInt32LE(0x811180),4);assert.equal(f.memory.readInt32LE(0x811188),20);
});
test('same-owner time activation failure leaves the weapon available',()=>{
 const f=fixture();f.put(0x811180,2);f.put(0x811184,f.body);assert.equal(launchVehicleWeapon(f.record,0,0,0,0,f),0);assert.equal(f.memory[f.body+0x68c],5);
});
test('contact-color activation consumes only the selected second slot',()=>{
 const f=fixture(1),m=f.memory;f.put(f.body+0x6bc,0x30000);m[f.body+0x68d]=6;assert.equal(launchVehicleWeapon(f.record,1,0,0,0,f),1);assert.equal(m[f.body+0x68c],1);assert.equal(m[f.body+0x68d],255);assert.equal(m[0x30000],1);assert.equal(m[0x30001],10);
});
test('held recovery accepts any wheel at the exact signed speed cutoff',()=>{
 for(let wheel=0;wheel<4;wheel++){const f=fixture();f.put(f.body+0x664,0x200000);f.put(f.body+0x3d08,99);f.memory[f.body+0x324+wheel*200]=1;requestHeldVehicleRecovery(f.body,f);assert.equal(f.memory.readInt32LE(f.body+0x3d04),1);assert.equal(f.memory.readInt32LE(f.body+0x3d08),0);}
});
test('held recovery preserves its existing request and obeys session/speed gates',()=>{
 for(const gate of['session','mode3','mode8','speed','existing','no-contact']){const f=fixture();f.put(f.body+0x3d08,99);f.memory[f.body+0x324]=gate==='no-contact'?0:1;if(gate==='session')f.memory[f.session+0x585]=1;if(gate.startsWith('mode'))f.memory[f.session+0x551]=Number(gate.slice(4));if(gate==='speed')f.put(f.body+0x664,0x200001);if(gate==='existing')f.put(f.body+0x3d04,123);requestHeldVehicleRecovery(f.body,f);assert.equal(f.memory.readInt32LE(f.body+0x3d04),gate==='existing'?123:0);assert.equal(f.memory.readInt32LE(f.body+0x3d08),99);}
 const f=fixture();f.put(f.body+0x664,-2147483648);f.memory[f.body+0x324]=1;requestHeldVehicleRecovery(f.body,f);assert.equal(f.memory.readInt32LE(f.body+0x3d04),1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as source from '../src/weapon-targeting.mjs';
import {createRawScriptFixture} from '../tools/lib/raw-scripted-motion-fixtures.mjs';
import {verifyWeaponTargeting} from '../tools/verify-weapon-targeting-instructions.mjs';
function fixture(){
 const f=createRawScriptFixture(),m=f.memory,put=(p,v)=>m.writeInt32LE(v|0,p),record=0x909300,object=0x200000;put(record,f.body);for(const o of[0x34,0x38,0x3c])put(f.body+o,0);m[f.body+0x68c]=1;m[f.body+0x68d]=255;put(f.body+0x710,0);put(0x82e900,1);put(0x82e880,object);put(0x82e884,0);put(object+0x3c,1000*65536);put(0x5ecb1c,0x80000);m[0x8054d]=1;put(record+0x7c,0);return{...f,record,object,put};
}
test('body target selection writes identity, lock countdown and Q16 point',()=>{
 const f=fixture();source.updateVehicleWeaponTarget(f.record,f);assert.equal(f.memory.readInt32LE(f.record+0x7c),2);assert.equal(f.memory.readUInt16LE(f.record+0x6a),2);assert.equal(f.memory.readUInt16LE(f.record+0x68),6);assert.equal(f.memory.readUInt32LE(f.record+0x70),f.object);assert.equal(f.memory.readInt32LE(f.record+0x64),1000*65536);assert.equal(f.memory.readInt32LE(f.record+0x78),1048576);
});
test('scheduler decrements a newly acquired target timer in the same frame',()=>{
 const f=fixture();source.updateWeaponTargets(f);assert.equal(f.memory.readUInt16LE(f.record+0x68),5);
});
test('participant count zero preserves native division failure',()=>{
 const f=fixture();f.memory[0x8054d]=0;assert.throws(()=>source.updateWeaponTargets(f),/divides by zero/);
});
test('unavailable weapon clears state/type without changing stale point and identity',()=>{
 const f=fixture();f.memory[f.body+0x68c]=0x41;f.put(f.record+0x70,123);f.put(f.record+0x64,456);source.updateVehicleWeaponTarget(f.record,f);assert.equal(f.memory.readInt32LE(f.record+0x7c),0);assert.equal(f.memory.readUInt16LE(f.record+0x6a),0);assert.equal(f.memory.readInt32LE(f.record+0x70),123);assert.equal(f.memory.readInt32LE(f.record+0x64),456);
});
test('kind-one targets require held input1000 and cannot target the own body',()=>{
 const f=fixture();f.put(0x82e884,1);source.updateVehicleWeaponTarget(f.record,f);assert.equal(f.memory.readInt32LE(f.record+0x7c),0);f.put(f.body+0x710,0x1000);source.updateVehicleWeaponTarget(f.record,f);assert.equal(f.memory.readInt32LE(f.record+0x7c),2);
});
test('locked model target keeps its original point while its model moves',()=>{
 const f=fixture(),m=f.memory,shape=0x300000,model=0x301000;f.put(0x82e900,0);f.put(0x82e904,1);f.put(f.addresses.pack+0xec,0x302000);f.put(0x302000,shape);f.put(0x302004,model);f.put(model+0x194,0x303000);f.put(model+0x3c,1000*65536);source.updateVehicleWeaponTarget(f.record,f);assert.equal(m.readUInt16LE(f.record+0x6a),1);f.put(model+0x3c,1100*65536);source.updateVehicleWeaponTarget(f.record,f);assert.equal(m.readInt32LE(f.record+0x64),1000*65536);
});
test('terrain obstruction writes exact narrowed cross-product scratch',()=>{
 const f=fixture(),m=f.memory;f.put(0x90b98c,0x60000);f.put(0x60000,0x61000);f.put(0x6001c,0x62000);f.put(0x60080,0x63000);f.put(0x61000,0x64000);f.put(0x64020,0x65000);f.put(0x64050,0x66000);f.put(0x62000,256<<20);f.put(0x50000,0);f.put(0x50004,0);f.put(0x50008,256);f.put(0x50010,-1);f.put(0x50014,0);f.put(0x50018,-1);m.writeInt16LE(-1,0x50020);m.writeInt16LE(0,0x50022);m.writeInt16LE(1,0x50024);assert.equal(source.weaponTargetBucketObstructed(f.addresses.bucket,0x50000,0x50010,0x50020,f),1);assert.equal(m.readInt16LE(0x91d368),256);assert.equal(m.readInt32LE(0x91d448),65536);
});
test('actual populated target, normalization, spatial and terrain instruction closure',async()=>{const report=await verifyWeaponTargeting({fixtures:64,persistent:2,output:null});assert.equal(report.matched,true);assert.equal(report.calls,96);});

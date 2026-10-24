import test from 'node:test';
import assert from 'node:assert/strict';
import {registerNativeGlobalAddresses} from '../src/native-global-address.mjs';
import {createRawScriptFixture} from '../tools/lib/raw-scripted-motion-fixtures.mjs';
import {updateVehicleWeaponTarget} from '../src/weapon-targeting.mjs';

test('relocated target-registry operands preserve a candidate pointer inside the canonical registry domain',()=>{
  //Constructed modulebase320000: explicit globals move by−e0000, while an
  //actual native candidate at82e880 is still read as an ordinary object.
  const f=createRawScriptFixture(),m=f.memory,record=0x909300,target=0x82e880,actual=p=>p-0xe0000;
  const put=(p,v)=>m.writeInt32LE(v|0,p);
  registerNativeGlobalAddresses(m,[{address:0x82e880,targetAddress:actual(0x82e880),length:0x88}]);
  m.fill(0,target,target+0x180);m.fill(0,actual(0x82e880),actual(0x82e908));
  put(record,f.body);for(const o of[0x34,0x38,0x3c])put(f.body+o,0);
  m[f.body+0x68c]=1;m[f.body+0x68d]=255;put(f.body+0x710,0);
  put(actual(0x82e900),1);put(actual(0x82e880),target);put(actual(0x82e884),0);
  put(target+0x3c,1000*65536);put(record+0x7c,0);
  const before=Buffer.from(m.subarray(target,target+0x180));
  updateVehicleWeaponTarget(record,f);
  assert.equal(m.readUInt32LE(record+0x70),target);assert.equal(m.readUInt16LE(record+0x6a),2);
  assert.equal(m.readInt32LE(record+0x64),1000*65536);assert.equal(m.readUInt32LE(actual(0x82e880)),target);
  assert.equal(m.readUInt32LE(actual(0x82e900)),1);assert.deepEqual(m.subarray(target,target+0x180),before);
});

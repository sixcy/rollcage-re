import test from 'node:test';
import assert from 'node:assert/strict';
import {updateVehicleSurfaceDrive} from '../src/vehicle-control-state.mjs';
const body=0x1000,record=0x2000,material=0x3000;
function fixture(){const memory=Buffer.alloc(0x4000);memory.writeUInt32LE(body,record);return memory;}
test('category1 contact adds drive once even when several wheels touch it',()=>{
 const memory=fixture();memory[material+12]=1;
 for(let i=0;i<4;i++)memory.writeUInt32LE(material,body+0x198+i*28);
 updateVehicleSurfaceDrive(record,{memory});assert.equal(memory.readInt32LE(body+0x6a8),0x5000);
 memory.writeUInt32LE(0x40,body+0x710);updateVehicleSurfaceDrive(record,{memory});assert.equal(memory.readInt32LE(body+0x6a8),0x8000);
});
test('nonnull material high flag bytes do not change category and later pointers stay unread after a hit',()=>{
 const memory=fixture();memory.writeUInt32LE(0xffffff01,material+12);memory.writeUInt32LE(material,body+0x198);
 memory.writeUInt32LE(0xffffffff,body+0x198+28);updateVehicleSurfaceDrive(record,{memory});assert.equal(memory.readInt32LE(body+0x6a8),0x5000);
});
test('null and other-category contacts preserve drive and the last wheel can supply the hit',()=>{
 const memory=fixture();memory.writeInt32LE(17,body+0x6a8);memory.writeUInt32LE(material,body+0x198+3*28);
 memory[material+12]=2;updateVehicleSurfaceDrive(record,{memory});assert.equal(memory.readInt32LE(body+0x6a8),17);
 memory[material+12]=1;updateVehicleSurfaceDrive(record,{memory});assert.equal(memory.readInt32LE(body+0x6a8),17+0x5000);
});
test('native drive adjustment wraps its signed32 accumulator',()=>{
 const memory=fixture();memory[material+12]=1;memory.writeUInt32LE(material,body+0x198);memory.writeInt32LE(0x7fffffff,body+0x6a8);
 updateVehicleSurfaceDrive(record,{memory});assert.equal(memory.readInt32LE(body+0x6a8),-0x7fffb001);
});

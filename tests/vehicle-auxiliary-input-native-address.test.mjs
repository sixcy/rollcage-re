import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {updateVehicleAuxiliaryInput} from '../src/vehicle-auxiliary-input.mjs';

function fixture(selected) {
  const base=0x6e0000,actual=p=>base+p-0x400000,body=0x11000000,config=0x12000000;
  const known=[[0x909300,6*0x30c],[0x6e9f70,4],[0x6eafe0,4],[0x5ecefc,4],[0x91ce90,4]];
  const captured=createCapturedMemory([...known.map(([p,length])=>({address:actual(p),bytes:Buffer.alloc(length)})),{address:body,bytes:Buffer.alloc(0x718)},{address:config,bytes:Buffer.alloc(0x30)}],{aliases:known.map(([address,length])=>({address,targetAddress:actual(address),length}))});
  const m=captured.memory;m.writeUInt32LE(body,actual(0x909300));m.writeUInt32LE(body,actual(0x909300+0x30c));m.writeInt32LE(selected,0x6e9f70);m.writeUInt32LE(config,0x5ecefc);m.writeUInt32LE(0xc0000000,body+0x714);
  return {...captured,actual,body,config};
}
test('42be80 selected participant resolves actualASLR record identity before display toggles',()=>{
  for(const selected of [-1,0]){const f=fixture(selected);updateVehicleAuxiliaryInput(f.actual(0x909300),{memory:f.memory});assert.equal(f.memory[f.config+0x25],1);assert.equal(f.memory.readUInt32LE(0x91ce90),4);}
});
test('42be80 preserves nonselected exclusion and canonical alias callers',()=>{
  const f=fixture(1);updateVehicleAuxiliaryInput(f.actual(0x909300),{memory:f.memory});assert.equal(f.memory[f.config+0x25],0);assert.equal(f.memory.readUInt32LE(0x91ce90),0);
  updateVehicleAuxiliaryInput(0x909300+0x30c,{memory:f.memory});assert.equal(f.memory[f.config+0x25],1);assert.equal(f.memory.readUInt32LE(0x91ce90),4);
});
test('42be80 compares an out-of-range selected address without dereferencing its uncaptured bytes',()=>{
  for(const selected of [-2,6,100]){const f=fixture(selected);updateVehicleAuxiliaryInput(f.actual(0x909300),{memory:f.memory});assert.equal(f.memory[f.config+0x25],0);assert.equal(f.memory.readUInt32LE(0x91ce90),0);}
});

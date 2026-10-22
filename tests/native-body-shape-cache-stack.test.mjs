import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationVehicleFixture} from '../tools/lib/simulation-vehicle-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {prepareBodyShapeCache} from '../src/body-shape-cache.mjs';
const program=await loadRetainedNativeProgram();
test('429820 surviving locals match retained stores at initial/refresh depths including time scaling',()=>{
 let cases=0;
 for(const entry of[0x9000-0xb8,0x9000-0xb0])for(const wheelVehicle of[true,false])for(const time of[0,16384])for(const scale of[0,32768,65536]){
  const f=createSimulationVehicleFixture(program,1,{vehicleCount:wheelVehicle?1:0,ordinaryCount:wheelVehicle?0:1,effects:false,vehicleFilters:false}),m=f.memory,body=f.bodies[0],F=entry-40,p=body.address;
  m.fill(0xa5,F,F+40);m.writeInt32LE(-1,entry);m.writeInt32LE(1,0x811180);m.writeInt32LE(0,0x811184);m.writeInt32LE(scale,0x81118c);m.writeInt32LE(3,p);m.writeInt32LE(0,p+0x118);
  const machine=new BoundedX86(program.instructions,{entry:0x429820,fpuPrecisionBits:24});m.copy(machine.bytes);Object.assign(machine.r,{ECX:p,EDX:time,ESP:entry,EBX:0x11223344,EBP:0x22334455,ESI:0x33445566,EDI:0x44556677});machine.run(100000);
  prepareBodyShapeCache(body,time,f.views.records,{timeScaleActive:true,timeScaleQ16:scale,nativeStack:{memory:m,scratchBase:entry}});
  assert.deepEqual(m.subarray(F+0x10,F+40),machine.bytes.subarray(F+0x10,F+40),`entry${entry.toString(16)}/wheel${wheelVehicle}/time${time}/scale${scale}`);
  //This is deliberately the surviving-local contract, not an invented set of
  //nonvolatile entry values or an entire429ab0 private-stack reconstruction.
  assert.equal(m.readUInt32LE(F),0xa5a5a5a5);cases++;
 }
 assert.equal(cases,24);
});

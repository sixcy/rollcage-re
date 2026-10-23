import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initializeWormholeConstructionTables} from '../src/wormhole-construction.mjs';
import {initializeProjectilePools} from '../src/projectile-construction.mjs';
import {initializeWormholeVisualTables} from '../src/wormhole-visuals.mjs';
import {createVehicleConstructionFixture} from '../tools/lib/vehicle-construction-fixtures.mjs';
import {loadRetainedNativeProgram,REDUX_SHA256} from '../tools/lib/retained-native-program.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

const configurationAddress=0x5ec408;
const executable='C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe';
async function originalConfiguration(){
  const reply=JSON.parse(await readFile('analysis/native-simulation/results/3162-wormhole-body-configuration.json'));
  const evidence=reply.structuredContent;
  assert.equal(evidence.subject.digest.sha256,REDUX_SHA256);
  assert.equal(evidence.operation,'read_bytes');
  assert.equal(evidence.evidence_id,'ev_7e90a726d7a555e601824bd1d784e2d8dc2a00183b62d6458a461a23d6f81d85');
  assert.equal(Number(evidence.raw_result.address),configurationAddress);
  assert.equal(evidence.raw_result.complete,true);
  assert.equal(evidence.raw_result.returned_bytes,128);
  const bytes=Buffer.from(evidence.raw_result.bytes_hex,'hex');
  assert.equal(bytes.length,128);
  assert.deepEqual(bytes,Buffer.from(evidence.normalized_result.bytes_hex,'hex'));
  return bytes;
}

test('projectile configuration reproduces all128 retained original bytes without writing the following DWORD',async()=>{
  const expected=await originalConfiguration(),memory=Buffer.alloc(0xa00000,0xa7);
  const trailing=Buffer.from([0x12,0x34,0x56,0x78]);trailing.copy(memory,configurationAddress+128);
  initializeWormholeConstructionTables(memory);
  assert.deepEqual(memory.subarray(configurationAddress,configurationAddress+128),expected);
  assert.deepEqual(memory.subarray(configurationAddress+128,configurationAddress+132),trailing);
  assert.equal(memory.readInt32LE(configurationAddress+0x74),8192);
  assert.equal(memory.readInt32LE(configurationAddress+0x78),524288);
});

test('retained128-byte configuration independently matches the SHA-verified shipped executable',{skip:!existsSync(executable)},async()=>{
  const expected=await originalConfiguration(),file=await readFile(executable);
  assert.equal(createHash('sha256').update(file).digest('hex'),REDUX_SHA256);
  const pe=file.readUInt32LE(0x3c);assert.equal(file.toString('ascii',pe,pe+4),'PE\0\0');
  const optional=pe+24;assert.equal(file.readUInt16LE(optional),0x10b);
  const imageBase=file.readUInt32LE(optional+28),rva=configurationAddress-imageBase;
  const sections=optional+file.readUInt16LE(pe+20);let observed;
  for(let i=0;i<file.readUInt16LE(pe+6);i++){
    const row=sections+i*40,start=file.readUInt32LE(row+12),size=file.readUInt32LE(row+16);
    if(rva>=start&&rva+128<=start+size){assert.equal(observed,undefined,'One source section must own the configuration.');const offset=file.readUInt32LE(row+20)+rva-start;observed=file.subarray(offset,offset+128);}
  }
  assert.notEqual(observed,undefined);assert.deepEqual(observed,expected);
});

test('all31 constructed projectile/master/wormhole bodies receive original mass and inverse mass independently of the source initializer',async()=>{
  const expected=await originalConfiguration(),program=await loadRetainedNativeProgram();
  const fixture=createVehicleConstructionFixture(program),m=fixture.memory;
  initializeWormholeConstructionTables(m);initializeWormholeVisualTables(m);
  fixture.runtime.roundingMode='nearest-even';
  const machine=new BoundedX86(program.instructions);m.copy(machine.bytes);
  //Decouple the instruction side from the initializer under test. Older125B
  //literals cannot pass merely because both executions copied their error.
  expected.copy(machine.bytes,configurationAddress);
  machine.entry=0x46a420;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);
  machine.externalCalls.set(0x568162,x=>assert.equal(x.r.ECX>>>0,x.bytes.readUInt32LE(0x5e8890)));
  machine.run(3000000);initializeProjectilePools(fixture.runtime);
  const pointerSlots=[...Array.from({length:24},(_,i)=>0x9034a0+i*4),...Array.from({length:6},(_,i)=>0x903480+i*4),0x80b5e0];
  assert.equal(new Set(pointerSlots.map(slot=>m.readUInt32LE(slot))).size,31);
  for(const slot of pointerSlots){
    const body=m.readUInt32LE(slot);assert.equal(body,machine.bytes.readUInt32LE(slot));
    for(const[offset,value]of[[0xa8,8192],[0xac,524288]]){
      assert.equal(m.readInt32LE(body+offset),value,`body0x${body.toString(16)} +0x${offset.toString(16)}`);
      assert.equal(m.readInt32LE(body+offset),machine.bytes.readInt32LE(body+offset));
    }
  }
});

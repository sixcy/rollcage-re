import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {runNativeRaceStepClock} from '../src/native-race-step-clock.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';

test('physical clock globals remain separate from actual stack bytes with identical preferred-address bits', async () => {
  const base=0x730000,C=0x6e6800,image=await loadRelocatedAudioFixture(base),G=image.actual;
  const fields=[[0x6e66b0,8],[0x6e66e4,4],[0x6e66f8,4],[0x6eafe0,4],[0x6e6c8c,4],
    [0x7135a4,16],[0x56e0fc,4],[0x56e114,4],[0x5dc6e0,8],[0x56f6a0,130]];
  const rows=[{address:C-512,bytes:Buffer.alloc(540,0x69)},...fields.map(([p,n])=>({address:G(p),bytes:Buffer.from(image.memory.subarray(G(p),G(p)+n))}))];
  assert.throws(()=>createCapturedMemory(rows,{aliases:fields.map(([p,n])=>({address:p,targetAddress:G(p),length:n}))}),/shadows actual/);
  const f=createCapturedMemory(rows),m=f.memory;
  m.writeUInt32LE(G(0x450df0),C);m.writeUInt32LE(101,G(0x6e66f8));m.writeUInt32LE(9,G(0x6e66e4));
  m.writeUInt32LE(0x83,G(0x6eafe0));m.writeUInt32LE(1,G(0x6e6c8c));m.writeBigInt64LE(0n,G(0x6e66b0));
  m.writeBigInt64LE(1000000n,G(0x7135a4));m.writeBigInt64LE(0n,G(0x7135ac));m.writeUInt32LE(0x1700000,G(0x56e0fc));
  const original=fields.filter(([p])=>p>=C-512&&p<C).map(([p,n])=>({address:p,bytes:Buffer.from(f.span(p,n))}));
  const events=[],entryRegisters={EBX:0x6e66b0,EBP:0x55667788,ESI:0x12345678,EDI:0xdeadbeef};
  const count=runNativeRaceStepClock({memory:m,moduleBaseAddress:base,scratchBase:C,entryRegisters,
    numericalContext:decodePhysicsNumericalContext({x87ControlWord:0x7f,mxcsr:0x1f80}),
    observeNativeClock:e=>events.push(e),services:{platformCall(name,[out],runtime){
      assert.equal(name,'QueryPerformanceCounter');assert.equal(m.readUInt32LE(runtime.scratchBase+4),out);
      m.writeBigInt64LE(3450000n,out);return 1;
    }}});
  assert.equal(count,2);assert.equal(m.readUInt32LE(G(0x6e66f8)),103);assert.equal(m.readUInt32LE(G(0x6e66e4)),10);
  for(const row of original)assert.deepEqual(f.span(row.address,row.bytes.length),row.bytes,'Actual overlapping stack remains actual, not relocated.');
  assert.equal(m.readUInt32LE(C-12),0x6e66b0);assert.equal(events.at(-1).registers.ebx,0x6e66b0);
  assert.equal(events.at(-1).registers.eip,G(0x450df0));assert.equal(events.at(-1).registers.esp,C+4);
});

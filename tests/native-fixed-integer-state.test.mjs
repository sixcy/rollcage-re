import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeFixedSqrtState} from '../src/native-fixed-integer-state.mjs';
import {createNativeControlNumericalState} from '../tools/lib/native-frame-control-continuation.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';

test('source-shared publisher preserves the existing tool identity and signed native domain',()=>{
  assert.equal(createNativeControlNumericalState,createNativeFixedSqrtState);const memory=Buffer.alloc(0xa00000),state=createNativeFixedSqrtState({memory});assert.ok(Object.isFrozen(state));
  for(const [value,input,leading]of [[0,0,32],[-1,1,31],[524074,524074,13],[-0x80000000,-0x80000000,0]]){state.fixedSqrtQ16(value);assert.equal(memory.readInt32LE(0x91d45c),input);assert.equal(memory.readInt32LE(0x91d460),leading);}
  const previous=Buffer.from(memory.subarray(0x91d45c,0x91d464));for(const value of [undefined,null,'1',NaN,Infinity,0.5,0x80000000,-0x80000001])assert.throws(()=>state.fixedSqrtQ16(value),/signed32-bit/);assert.deepEqual(memory.subarray(0x91d45c,0x91d464),previous);
});
test('sparse source publisher requires exact native image aliases and refuses missing words',()=>{
  const moduleBaseAddress=0x6e0000,address=0xbfd45c,aliases=[{address:0x91d45c,targetAddress:address,length:8}],captured=createCapturedMemory([{address,bytes:Buffer.alloc(8)}],{aliases});
  createNativeFixedSqrtState({memory:captured.memory,moduleBaseAddress}).fixedSqrtQ16(-255);assert.deepEqual([...captured.span(address,8)],[255,0,0,0,24,0,0,0]);
  assert.throws(()=>createNativeFixedSqrtState({memory:captured.memory,moduleBaseAddress:0x400000}),/actual aliased image/);
  const unaliased=createCapturedMemory([{address,bytes:Buffer.alloc(8)}]);assert.throws(()=>createNativeFixedSqrtState({memory:unaliased.memory,moduleBaseAddress}),/Uncaptured/);
  const short=createCapturedMemory([{address:0x91d45c,bytes:Buffer.alloc(4)}]);assert.throws(()=>createNativeFixedSqrtState({memory:short.memory}),/Uncaptured/);
  for(const invalid of [0,-1,NaN,Infinity,0x100000000])assert.throws(()=>createNativeFixedSqrtState({memory:captured.memory,moduleBaseAddress:invalid}),/valid observed module/);
});

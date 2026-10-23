import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {compareNativeControlOutput} from '../tools/check-native-frame-control-prefix.mjs';

test('control comparison protects full unchanged control outputs and ignores only explicit ABI',()=>{
  const source=createCapturedMemory([{address:0x11000000,bytes:Buffer.from([1,2,3,4,5,6,7,8])}]);source.manifest={requiredRegions:[{id:'control-state',address:0x11000000,length:4,comparison:'mutable'},{id:'stack-abi',address:0x11000004,length:4,comparison:'abi-input'}]};source.ownedRegions=[{id:'handling-owned',address:0x11000000,length:4}];
  const after={ranges:[{address:0x11000000,bytes:Buffer.from([1,2,3,4,9,9,9,9])}]};assert.equal(compareNativeControlOutput(source,after).matched,true);
  source.memory[0x11000002]=99;const mismatch=compareNativeControlOutput(source,after);assert.equal(mismatch.matched,false);assert.equal(mismatch.bytesCompared,4);assert.equal(mismatch.differingBytes,1);assert.equal(mismatch.owned[0].differingBytes,1);assert.equal(mismatch.firstDivergence.address,0x11000002);
});
test('control comparison fails on absent native expected bytes instead of dropping output coverage',()=>{
  const source=createCapturedMemory([{address:0x11000000,bytes:Buffer.alloc(8)}]);source.manifest={requiredRegions:[{id:'control-state',address:0x11000000,length:8,comparison:'mutable'}]};assert.throws(()=>compareNativeControlOutput(source,{ranges:[{address:0x11000000,bytes:Buffer.alloc(4)}]}),/Uncaptured/);
});
test('control comparison detects parent saved-register corruption despite private ABI exclusion',()=>{
  const source=createCapturedMemory([{address:0x11000000,bytes:Buffer.alloc(32)}]);source.manifest={requiredRegions:[{id:'stack-abi',address:0x11000000,length:32,comparison:'abi-input'}]};source.report={childEsp:0x11000000};const after={ranges:[{address:0x11000000,bytes:Buffer.alloc(32)}]};assert.equal(compareNativeControlOutput(source,after).matched,true);source.memory[0x11000004]=1;const result=compareNativeControlOutput(source,after);assert.equal(result.matched,false);assert.equal(result.bytesCompared,0);assert.equal(result.parentAbiBytesCompared,28);assert.equal(result.differingParentAbiBytes,1);assert.equal(result.firstDivergence.region,'parent-direct-call-abi');
});

test('control comparison distinguishes listed overlapping regions from unique semantic coverage',()=>{
  const source=createCapturedMemory([{address:0x11000000,bytes:Buffer.alloc(6)}]);
  source.manifest={requiredRegions:[{id:'first',address:0x11000000,length:4,comparison:'mutable'},{id:'overlapping',address:0x11000002,length:4,comparison:'mutable'}]};
  const result=compareNativeControlOutput(source,{ranges:[{address:0x11000000,bytes:Buffer.alloc(6)}]});
  assert.equal(result.matched,true);assert.equal(result.bytesCompared,8);assert.equal(result.uniqueBytesCompared,6);assert.equal(result.overlappingComparedBytes,2);
});

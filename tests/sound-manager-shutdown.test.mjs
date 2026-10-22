import test from 'node:test';
import assert from 'node:assert/strict';
import {stopSoundManager} from '../src/sound-manager-shutdown.mjs';
function fixture() {
  const memory = Buffer.alloc(0xa00000), manager = 0x100000, calls = [], put = (p, v) => memory.writeInt32LE(v | 0, p), ptr = p => memory.readUInt32LE(p), headers = new Map(), arrays = new Map();
  for (const [i, offset] of [0x82c, 0x830, 0x834, 0x838, 0x83c, 0x840, 0x844, 0x848, 0x84c].entries()) {
    const header = 0x110000 + i * 0x100, array = 0x120000 + i * 0x100;
    headers.set(offset, header); arrays.set(offset, array); put(manager + offset, header); put(header, array); put(header + 4, array); put(header + 8, array + 64);
  }
  function items(offset, values) {values.forEach((v, i) => put(arrays.get(offset) + i * 4, v)); put(headers.get(offset) + 4, arrays.get(offset) + values.length * 4);}
  put(manager, 0x5d4190); put(0x5d41b0, 0x4a7950); put(0x714b08, manager); put(0x5d3f60, 0x4ad8f0); put(0x5d3fbc, 0x4ad420); put(0x5d407c, 0x4afc00); put(0x5d3cc4, 0x4aa000);
  const runtime = {memory, scratchBase: 0x9000, services: {libraryCall(name, args) {calls.push([name, ...args]); if (name === '__RTDynamicCast') return args[0]; if (name === 'memmove') {Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory, args[0]); return args[0];} return 0;}, platformCall(name, args) {calls.push([name, ...args]); return name === 'GetCurrentThreadId' ? 73 : 1;}}};
  return {memory, manager, calls, put, ptr, headers, arrays, items, runtime};
}
test('stop preserves lock depth and retains the current owner only for a nonzero depth', () => {
  for (const depth of [0, 3]) {const f = fixture(); f.put(f.manager + 0x8ac, depth); f.put(f.manager + 0x8b0, 99); f.memory[f.manager + 0x820] = 1; stopSoundManager(f.manager, f.runtime); assert.equal(f.ptr(f.manager + 0x8ac), depth); assert.equal(f.ptr(f.manager + 0x8b0), depth ? 73 : 0); assert.equal(f.memory[f.manager + 0x820], 0);}
});
test('stop retires queued source before sample, cache, listener and mixer ownership', () => {
  const f = fixture(), queued = 0x200000, sample = 0x210000, wave = 0x220000, listener = 0x230000, mixer = 0x240000;
  f.put(queued + 44, sample); f.put(sample, 0x5d3f60); f.put(wave, 0x5d407c); f.put(listener, 0x5d3cc4);
  f.items(0x848, [queued]); f.items(0x834, [sample]); f.items(0x830, [wave]); f.items(0x82c, [listener]); f.items(0x84c, [mixer]);
  stopSoundManager(f.manager, f.runtime);
  assert.deepEqual(f.calls.filter(([name]) => name === 'operatorDelete').map(([, p]) => p), [queued, sample, wave, listener, mixer]);
  for (const offset of [0x848, 0x834, 0x830, 0x82c, 0x84c]) assert.equal(f.ptr(f.headers.get(offset) + 4), f.arrays.get(offset));
  assert.equal(f.ptr(f.headers.get(0x840) + 4), f.arrays.get(0x840) + 4, 'deferred source vector is deliberately retained');
  assert.equal(f.ptr(f.arrays.get(0x840)), sample);
});
test('stop resets auxiliary vector cursors while retaining their storage and stale data', () => {
  const f = fixture(); for (const offset of [0x838, 0x83c, 0x844]) f.items(offset, [11, 22]); stopSoundManager(f.manager, f.runtime);
  for (const offset of [0x838, 0x83c, 0x844]) {assert.equal(f.ptr(f.headers.get(offset) + 4), f.arrays.get(offset)); assert.equal(f.ptr(f.arrays.get(offset)), 11); assert.equal(f.ptr(f.headers.get(offset) + 8), f.arrays.get(offset) + 64);}
});
test('stop rejects an unclassified sample destructor at its reached native target', () => {
  const f = fixture(), sample = 0x200000; f.put(sample, 0x210000); f.put(0x210000, 0x12345678); f.items(0x834, [sample]);
  assert.throws(() => stopSoundManager(f.manager, f.runtime), /Unported SoundManager shutdown destructor0x12345678/);
});

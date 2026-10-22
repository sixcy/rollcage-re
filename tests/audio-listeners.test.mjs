import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioListener} from '../src/audio-listener-construction.mjs';
import {initializeRaceAudioListeners} from '../src/audio-listeners.mjs';
function fixture({nullListener = false, depth = 0} = {}) {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p), manager = 0x100000, vector = 0x110000, array = 0x120000;
  put(manager, 0x5d4190); put(0x5d4190 + 0x4c, 0x4a9b00); put(0x714b08, manager); put(manager + 0x82c, vector);
  put(vector, array); put(vector + 4, array); put(vector + 8, array + 64); put(manager + 0x86c, depth);
  put(0x5d0304, 0x40f2c0); put(0x5d0304 + 0x10, 0x40f2a0); put(0x5d0304 + 0x14, 0x40eea0);
  let heap = 0x300000; const calls = [];
  const runtime = {memory, scratchBase: 0x9000, services: {libraryCall(name, args) {
    calls.push([name, ...args]); if (name === 'operatorNew') {if (nullListener && args[0] === 0x58) return 0; const result = heap; heap += (args[0] + 31) & ~15; memory.fill(0xcd, result, heap); return result;}
    if (name === 'operatorDelete') return 0;
    if (name === 'memmove' || name === 'memcpy') {Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory, args[0]); return args[0];}
    if (name === 'memset') {memory.fill(args[1] & 255, args[0], args[0] + args[2]); return args[0];}
    throw Error(`Unexpected listener test service ${name}`);
  }, platformCall(name, args) {calls.push([name, ...args]); return name === 'GetCurrentThreadId' ? 77 : 1;}}};
  return {memory, put, manager, vector, array, runtime, calls};
}
test('real listener factory retains its own index callback and destroys the incoming callable', () => {
  const f = fixture(), words = [0x5d0304, 2, 0, 0, 0x9008, 0];
  const listener = createAudioListener(f.manager, 1, words, f.runtime);
  assert.equal(f.memory.readUInt32LE(f.manager + 0x828), listener); assert.equal(f.memory.readUInt32LE(f.array), listener);
  assert.equal(f.memory.readUInt32LE(listener), 0x5d3cc4); assert.equal(f.memory[listener + 4], 1);
  assert.equal(f.memory.readUInt32LE(listener + 24), listener + 8); assert.equal(f.memory.readUInt32LE(listener + 8), 0x5d0304); assert.equal(f.memory.readUInt32LE(listener + 12), 2);
  assert.equal(f.memory.readUInt32LE(0x9008), 0x5d02dc); assert.deepEqual([0, 4, 8, 12].map(o => f.memory.readUInt32LE(listener + 0x40 + o)), [0, 0, 0, 0x3f800000]);
  assert.equal(f.memory.readUInt32LE(f.manager + 0x86c), 0); assert.equal(f.memory.readUInt32LE(f.manager + 0x870), 0);
});
test('null listener allocation is still appended and preserves an enclosing lock depth', () => {
  const f = fixture({nullListener: true, depth: 1});
  assert.equal(createAudioListener(f.manager, 0, [0, 0, 0, 0, 0, 0], f.runtime), 0);
  assert.equal(f.memory.readUInt32LE(f.vector + 4), f.array + 4); assert.equal(f.memory.readUInt32LE(f.array), 0);
  assert.equal(f.memory.readUInt32LE(f.manager + 0x86c), 1); assert.equal(f.memory.readUInt32LE(f.manager + 0x870), 77);
});
test('four selected participants feed actual listener construction in their selected order', () => {
  const f = fixture(); f.put(0x5ecb1c, 0x170000); f.memory[0x170552] = 4;
  for (let i = 0; i < 4; i++) {f.put(0x5ec120 + i * 4, 3 - i); f.put(0x909318 + i * 0x30c, 0x180000 + i * 4); f.put(0x180000 + i * 4, 0x200000 + i * 0x1000);}
  f.put(0x6f2408, 0x190000); f.put(0x6f240c, 0x190000); f.put(0x6f2410, 0x190010);
  initializeRaceAudioListeners(f.runtime);
  assert.equal(f.memory.readUInt32LE(f.vector + 4), f.array + 16);
  for (let i = 0; i < 4; i++) {
    const body = 0x200000 + (3 - i) * 0x1000;
    assert.deepEqual([4, 8, 12].map(o => f.memory.readUInt32LE(0x849480 + i * 0x54 + o)), [body + 0x34, body + 0x68, body + 0xc4]);
    const wrapper = f.memory.readUInt32LE(0x190000 + i * 4), listener = f.memory.readUInt32LE(wrapper);
    assert.equal(f.memory.readUInt32LE(listener + 12), i);
  }
});

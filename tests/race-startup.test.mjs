import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeRace} from '../src/race-startup.mjs';
import {initializeRaceInputLatches, initializeVehicleExecutionModes, initializeRaceQuadStorage, initializeRaceRadialStorage, initializeRacePairedStripStorage, applyRaceLightingTint, initializeRaceContactPrimitiveStorage} from '../src/race-startup-storage.mjs';

const SESSION = 0x10000, ALT = 0x110000, CONFIG = 0x210000, PACK = 0x220000, AUX = 0x221000, META = 0x222000, MODELS = 0x223000, MATERIAL = 0x224000;
function fixture(count = 0) {
  const memory = Buffer.alloc(0xa00000), log = [], overrides = {}, omitted = new Set(), put = (p, v) => memory.writeInt32LE(v | 0, p);
  put(0x5ecb1c, SESSION); put(0x5ecefc, CONFIG); memory[SESSION + 0x54d] = count; put(0x90b98c, PACK); put(0x90b990, AUX); put(0x90b988, MATERIAL); put(PACK + 0x18, MODELS); put(PACK + 0x58, META); put(MODELS, 0x230000); put(0x5ed02c, -1); memory.writeFloatLE(1, 0x5dc774); memory.writeFloatLE(4 / 3, 0x5dc7a0); memory.writeFloatLE(104, 0x5dca1c);
  for (let i = 0; i < 6; i++) put(0x909300 + i * 0x30c, 0x300000 + i * 0x4000);
  const handlers = new Proxy({}, {get: (_, name) => {
    if (name === 'inputManagerCall') return () => 0;
    if (typeof name !== 'string' || !name.startsWith('call') || omitted.has(name)) return undefined;
    return r => {log.push([name, r]); if (overrides[name]) return overrides[name](r); return name === 'call44c2b0' ? 1 : name === 'call40aeb0' ? 480 : name === 'call40ad40' ? 640 : 0;};
  }});
  let cursor = 0x400000; const allocate = size => {const p = cursor; cursor += size; return p;};
  return {memory, put, log, overrides, omitted, run: (runtime = {}) => initializeRace({memory, scratchBase: 0x9000, handlers, allocate, ...runtime})};
}

test('failed track loading retains initial state but skips successful startup stages', () => {
  const f = fixture(2); f.memory[SESSION + 0x552] = 4; f.memory[SESSION + 0x551] = 4; f.overrides.call44c2b0 = () => 0;
  assert.equal(f.run(), 0); assert.equal(f.memory[SESSION + 0x552], 1); assert.equal(f.memory[SESSION + 0x586], 7);
  assert.equal(f.memory.readUInt16LE(0x920806), 255); assert(!f.log.some(([name]) => name === 'call450a90'));
});

test('live participant growth preserves the original camera eligibility count', () => {
  const f = fixture(1); f.overrides.call41dbb0 = r => {if (!r.edx) f.memory[SESSION + 0x54d] = 2;};
  assert.equal(f.run(), 1); assert.equal(f.log.filter(([name]) => name === 'call41dbb0').length, 2);
  assert.equal(f.log.filter(([name]) => name === 'call416180').length, 1); assert.equal(f.memory.readUInt32LE(0x909300 + 0x30c + 0x18), 0x12345678);
});

test('startup swaps material WORDs and initializes every history DWORD toFFFFFFFF', () => {
  const f = fixture(); f.memory.writeUInt16LE(0x1234, MATERIAL + 0x92 * 16 + 4); f.memory.writeUInt16LE(0xabcd, MATERIAL + 0x92 * 16 + 8);
  f.run(); assert.equal(f.memory.readUInt16LE(MATERIAL + 0x92 * 16 + 4), 0xabcd); assert.equal(f.memory.readUInt16LE(MATERIAL + 0x92 * 16 + 8), 0x1234);
  const history = f.memory.readUInt32LE(0x90cb60); assert(f.memory.subarray(history, history + 0x800).every(v => v === 255));
});

test('the final optional startup action reads the captured session after a callee replaces the global', () => {
  const f = fixture(); f.memory[SESSION + 0x555] = 1; f.overrides.call47f8c0 = () => f.put(0x5ecb1c, ALT); f.run();
  assert(f.log.some(([name]) => name === 'call497790'));
});

test('startup defaults to actual audio initialization with native saved registers before requesting CRT services', () => {
  const f = fixture(); f.omitted.add('call485250'); assert.throws(f.run, /Audio listeners require CRT memset/); assert.equal(f.memory.readInt32LE(SESSION + 0xb85b4), 8);
  const audioFrame = 0x9000 - 44 - 4 - 12;
  assert.deepEqual([0, 4, 8].map(offset => f.memory.readUInt32LE(audioFrame + offset)), [0, 0x57506e, 0]);
});

test('startup defaults to the real track loader with captured allocator and object-list registers', () => {
  const f = fixture(), stem = 0x230000, allocator = 0x765432;
  f.memory.write('TRACK\0', stem); f.memory.write('.BLP\0', 0x5d22e0); f.memory.write('.BTP\0', 0x5d22e8); f.put(0x56e258, allocator);
  f.overrides.call4797a0 = () => stem; f.omitted.add('call44c2b0');
  assert.throws(() => f.run({entryRegisters: {EBX: 0x123456, EBP: 0x345678}}), /requires/i);
  assert.equal(f.memory.subarray(0x90b920, 0x90b92a).toString(), 'TRACK.BLP\0');
  assert.equal(f.memory.subarray(0x90b8c0, 0x90b8ca).toString(), 'TRACK.BTP\0');
  const frame = 0x9000 - 44 - 4 - 76;
  assert.deepEqual([0, 4, 8, 12].map(offset => f.memory.readUInt32LE(frame + offset)), [allocator, f.memory.readUInt32LE(0x91e77c), 0x345678, 0x123456]);
  assert(!f.log.some(([name]) => name === 'call450a90'));
});

test('input latch initialization sets only marked latches and preserves the other latch', () => {
  const memory = Buffer.alloc(0xa00000, 0x55); memory[0x91e6c1] = 0x80; memory[0x91e701] = 0;
  initializeRaceInputLatches({memory}); assert.equal(memory.readInt32LE(0x91e734), 1); assert.equal(memory.readInt32LE(0x91e6f4), 0x55555555);
  assert(memory.subarray(0x91e6c0, 0x91e6f0).every(v => v === 0));
});

test('execution modes read authored bytes after clearing an aliased body destination', () => {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v, p); put(0x5ecb1c, SESSION); memory[SESSION + 0x54d] = 1; memory[SESSION] = 8; put(0x909300, SESSION - 0x708);
  initializeVehicleExecutionModes({memory}); assert.equal(memory[SESSION + 0x10], 10); assert.equal(memory[SESSION + 0x18], 16);
});

test('quad allocation failure retains the native unconditional primitive writes and zero final count', () => {
  const memory = Buffer.alloc(0xa00000); initializeRaceQuadStorage({memory, allocate: () => 0});
  assert.equal(memory[3], 12); assert.equal(memory[7], 0x8e); assert.equal(memory[255 * 0x210 + 3 * 132 + 7], 0x8e); assert.equal(memory.readInt32LE(0x80def4), 0);
});

test('radial storage subdivides source UVs by byte averages and doubles signed coordinate WORDs with wrap', () => {
  const f = fixture(), coordinates = 0x250000; f.put(0x920b30, coordinates);
  for (const [i, value] of [32767, 32768, 65535, 1].entries()) f.memory.writeUInt16LE(value, coordinates + i * 2);
  [10, 20, 0xcd, 0xab, 30, 40, 0x34, 0x12, 50, 60, 70, 80].forEach((v, i) => {f.memory[MATERIAL + i] = v;});
  let cursor = 0x400000; initializeRaceRadialStorage({memory: f.memory, allocate: size => {const p = cursor; cursor += size; return p;}});
  const base = f.memory.readUInt32LE(0x6f96e0);
  assert.deepEqual([0x20, 0x21, 0x3c, 0x3d, 0x58, 0x59, 0x74, 0x75].map(o => f.memory[base + o]), [10, 20, 20, 30, 30, 40, 40, 50]);
  assert.deepEqual([0, 2, 4, 6].map(o => f.memory.readInt16LE(coordinates + o)), [-2, 0, -2, 2]);
  assert.equal(f.memory.readUInt16LE(base + 0x3e), 0x1234);
});

test('paired strips allocate four16-pair banks and four17-row state banks with alternating materials', () => {
  const f = fixture(), sizes = []; f.memory.writeUInt32LE(0x11223344, MATERIAL + 0x14 * 16); f.memory.writeUInt32LE(0xaabbccdd, MATERIAL + 0x15 * 16);
  let cursor = 0x400000; initializeRacePairedStripStorage({memory: f.memory, scratchBase: 0x9000, allocate: size => {sizes.push(size); const p = cursor; cursor += size; return p;}});
  const base = f.memory.readUInt32LE(0x6fbad8); assert.deepEqual(sizes, [0x3c00, 0x440]);
  assert.equal(f.memory.readUInt32LE(base + 0x20), 0x11223344); assert.equal(f.memory.readUInt32LE(base + 240 + 0x20), 0xaabbccdd);
  assert.equal(f.memory.readUInt32LE(0x911ba4), 0xff0000); assert.equal(f.memory.readUInt32LE(0x911ba4 + 3 * 24), 0xff0000);
  const states = f.memory.readUInt32LE(0x6fbad4); assert(f.memory.subarray(states, states + 0x440).every(v => !v));
});

test('environment tint scales RGB bytes, preserves alpha and wraps doubled background channels', () => {
  const f = fixture(); f.memory[SESSION + 0x553] = 2; f.put(AUX + 0x4c, 0x250000); f.put(0x6f96e0, 0x260000); f.put(0x6f96f8, 0x270000);
  f.memory.set([255, 255, 128, 0x7f], 0x250000); f.memory.set([255, 255, 128], AUX + 0x30);
  applyRaceLightingTint({memory: f.memory}); assert.deepEqual([...f.memory.subarray(0x250000, 0x250004)], [191, 95, 96, 0x7f]);
  assert.deepEqual([...f.memory.subarray(0x91d5b9, 0x91d5bc)], [126, 190, 192]); assert.equal(f.memory.readUInt32LE(0x91ce1c), 0x7ebec0);
});

test('contact primitive quality2 allocates300 records; other qualities allocate150 with actual color endpoints', () => {
  for (const quality of [1, 2, 3]) {
    const f = fixture(), sizes = []; f.memory[CONFIG + 0x2c] = quality;
    f.memory.writeUInt32LE(0x11223344, MATERIAL + 0x8f * 16); f.memory.writeUInt32LE(0x55667788, MATERIAL + 0x8f * 16 + 4);
    initializeRaceContactPrimitiveStorage({memory: f.memory, scratchBase: 0x9000, allocate: size => {sizes.push(size); return 0x400000;}});
    const count = quality === 2 ? 300 : 150; assert.deepEqual(sizes, [count * 0x124]); assert.equal(f.memory.readInt32LE(0x5ecb24), count);
    assert.equal(f.memory.readUInt32LE(0x713188), 0x8e000000); assert.equal(f.memory.readUInt32LE(0x71318c), 0x8e9f9f9f);
    assert.equal(f.memory.readUInt32LE(0x40003c), 0x11223344); assert.equal(f.memory.readUInt32LE(0x40005c), 0x55e67788); assert.equal(f.memory.readUInt32LE(0x8495d8), 0x400000 + count * 0x124);
  }
});

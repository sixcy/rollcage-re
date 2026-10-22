import test from 'node:test';
import assert from 'node:assert/strict';
import {initializePeriodicBodyConstants, initializePeriodicBody, spawnPeriodicBody, updatePeriodicBody, handlePeriodicBodyContact} from '../src/periodic-body-spawn.mjs';
import {initializeBodyRetirementEffectTables} from '../src/body-retirement-effects.mjs';

const SESSION = 0x30000, PLAYER = 0x40000, POOL = 0x100000, PARTICLES = 0x110000;
function fixture() {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p);
  initializePeriodicBodyConstants(memory); initializeBodyRetirementEffectTables(memory);
  put(0x5ecb1c, SESSION); memory[SESSION + 0x554] = 1; put(0x902eec, POOL);
  put(0x909254, 0x50000); put(0x909278, 0x55000);
  for (let row = 0; row < 256; row++) {word(0x50000 + row * 16, 0xff00); word(0x50002 + row * 16, 255); put(0x5000c + row * 16, 0x53000);}
  put(0x909240, 0x56000); put(0x56000, 0x57000); put(0x9092c0, 0x58000);
  put(0x91e79c, 0x180000); put(0x91e780, 0x190000); put(0x91e78c, 0x190100); put(0x91e790, 0x190200);
  put(0x91e794, 255); put(0x91e784, -1); put(0x902bc0, 0x170000);
  for (let i = 0; i < 256; i++) memory[0x190000 + i] = i;
  for (let i = 0; i < 2; i++) {const p = PLAYER + i * 0x400; put(0x909300 + i * 0x30c, p); put(p + 0x34, i * 1000 * 65536); word(p + 0xc8, 128); word(p + 0xd4, 128);}
  put(0x6e65b4, PARTICLES); for (let i = 0; i < 8; i++) put(PARTICLES + i * 256 + 0xac, i < 7 ? PARTICLES + (i + 1) * 256 : 0);
  put(0x9153c4, PARTICLES); put(0x9153d4, PARTICLES); put(0x91900c, PARTICLES + 8 * 256);
  const runtime = {memory, scratchBase: 0x9000}; return {memory, put, word, runtime};
}

test('disabled constructor leaves the body arena and controller untouched', () => {
  const f = fixture(); f.memory[SESSION + 0x554] = 0; f.put(0x903510, 123); f.put(0x70dcf4, 7);
  initializePeriodicBody(f.runtime); assert.equal(f.memory.readUInt32LE(0x903510), 123); assert.equal(f.memory.readInt32LE(0x70dcf4), 7);
});

test('constructor allocates one dormant type33 body with its contact and controller pointers', () => {
  const f = fixture(); initializePeriodicBody(f.runtime);
  assert.equal(f.memory.readUInt32LE(0x903510), POOL); assert.equal(f.memory.readInt32LE(0x70dcf4), 384);
  assert.equal(f.memory.readUInt32LE(POOL), 0x821); assert.equal(f.memory.readUInt32LE(POOL + 0x148), 0x46a2c0);
  assert.equal(f.memory.readUInt32LE(POOL + 0x164), 0x903510); assert.equal(f.memory.readInt32LE(0x903514), 0);
  assert.equal(f.memory.readUInt16LE(0x55008), 0); assert.equal(f.memory.readUInt16LE(0x902bc4), 0); assert.equal(f.memory.readInt32LE(0x903518), 127);
});

test('constructor publishes its explicit collision callback at the observed module address', () => {
  const f = fixture(); initializePeriodicBody({...f.runtime, moduleBaseAddress: 0x6e0000});
  assert.equal(f.memory.readUInt32LE(POOL + 0x148), 0x74a2c0);
});

test('rejected sector retains partial pose/RNG writes without registering collision shapes', () => {
  const f = fixture(); initializePeriodicBody(f.runtime); f.memory[0x57004] = 8; f.put(0x5ec954, 1);
  spawnPeriodicBody(PLAYER + 0x34, f.runtime);
  assert.equal(f.memory.readInt32LE(0x5ec954), 16807); assert.equal(f.memory.readInt32LE(POOL + 0x38), -7200 * 65536);
  assert.equal(f.memory.readInt32LE(POOL + 0x44), 150 * 65536); assert.equal(f.memory.readInt32LE(0x903514), 0);
  assert.equal(f.memory.readUInt16LE(0x902bc4), 0); assert.equal(f.memory.readInt32LE(0x91e798), 0);
});

test('successful spawn limits velocity and registers the authored and aggregate collision shapes', () => {
  const f = fixture(); initializePeriodicBody(f.runtime); spawnPeriodicBody(PLAYER + 0x34, f.runtime);
  assert.equal(f.memory.readInt32LE(0x903514), 1); assert.equal(f.memory.readUInt16LE(0x902bc4), 1); assert.equal(f.memory.readInt32LE(0x91e798), 2);
  assert(f.memory.readInt32LE(POOL + 0x6c) <= 128 * 65536); assert.equal(f.memory[POOL + 0x10c], 1);
  const before = Buffer.from(f.memory); spawnPeriodicBody(PLAYER + 0x34, f.runtime); assert.deepEqual(f.memory, before);
});

test('strict cooldown gate precedes RNG and a successful attempt toggles the selected player', () => {
  const f = fixture(); initializePeriodicBody(f.runtime); f.memory[SESSION + 0x552] = 1; f.put(0x90a548, 600);
  updatePeriodicBody(f.runtime); assert.equal(f.memory.readInt32LE(0x903514), 0); assert.equal(f.memory.readInt32LE(0x5ec954), 0);
  f.put(0x90a548, 601); updatePeriodicBody(f.runtime);
  assert.equal(f.memory.readInt32LE(0x6e6af8), 1); assert.equal(f.memory.readInt32LE(POOL + 0x34), 1000 * 65536); assert.equal(f.memory.readInt32LE(0x903514), 1);
});

test('active update edits three cursor-relative lifetimes even at minimum emission quality', () => {
  const f = fixture(); initializePeriodicBody(f.runtime); spawnPeriodicBody(PLAYER + 0x34, f.runtime);
  updatePeriodicBody(f.runtime); assert.equal(f.memory.readInt32LE(0x903514), 2);
  for (const index of [7, 6, 5]) assert.equal(f.memory.readUInt16LE(PARTICLES + index * 256 + 0x96), 16);
  assert.equal(f.memory.readUInt32LE(0x6e65c0), PARTICLES);
});

test('contact callback retires a young body without the older-body burst and returns zero', () => {
  const f = fixture(); initializePeriodicBody(f.runtime); spawnPeriodicBody(PLAYER + 0x34, f.runtime);
  assert.equal(handlePeriodicBodyContact(POOL, f.runtime), 0); assert.equal(f.memory.readInt32LE(0x903514), 0);
  assert.equal(f.memory.readUInt16LE(0x902bc4), 0); assert.equal(f.memory.readInt32LE(0x91e798), 0);
  assert.equal(f.memory.readUInt32LE(POOL) & 0x8000, 0x8000); assert.equal(f.memory.readUInt32LE(0x6e65c0), 0);
});

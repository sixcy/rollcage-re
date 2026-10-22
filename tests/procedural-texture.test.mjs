import test from 'node:test';
import assert from 'node:assert/strict';
import {renderProceduralTexture, updateProceduralTexture, lockProceduralTexture} from '../src/procedural-texture.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p);
  put(0x713884, 0x10000); put(0x713888, 0x30000); put(0x5ecefc, 0x50000); put(0x5ed02c, 2); put(0x6e1628, 77); put(0x714ae8, 0x51000);
  const runtime = {memory, scratchBase: 0x9000}; return {memory, put, runtime};
}

test('packed texture addition carries between bytes before the high-bit mask', () => {
  const f = fixture(); f.put(0x10000, 0xff); f.put(0x10004, 1);
  renderProceduralTexture(0x40000, 512, 8, 0, f.runtime);
  assert.equal(f.memory.readUInt32LE(0x40000 + 128 * 512), 0x80808180);
  assert.equal(f.memory.readUInt32LE(0x40000), 0);
});

test('phase wrap subtracts3600 once rather than taking a modulus for large intervals', () => {
  const f = fixture(); f.put(0x6e6d00, 3599); renderProceduralTexture(0x40000, 512, 24, 4000, f.runtime);
  assert.equal(f.memory.readInt32LE(0x6e6d00), 11999);
});

test('disabled update and missing resource avoid renderer access and timestamp writes', () => {
  const f = fixture(); f.put(0x5ed2c4, 123); assert.equal(updateProceduralTexture(f.runtime), 1); assert.equal(f.memory.readInt32LE(0x5ed2c4), 123);
  f.memory[0x50028] = 1; f.put(0x5ed02c, -1); updateProceduralTexture(f.runtime); assert.equal(f.memory.readInt32LE(0x5ed2c4), 123);
});

test('lock failure still publishes the live final timestamp without unlocking', () => {
  const f = fixture(), log = []; f.memory[0x50028] = 1; f.put(0x90a548, 10);
  f.runtime.handlers = {rendererCall: (object, method, args) => {log.push(method); if (method === 0x90) return 0x52000; f.put(0x90a548, 11); return 2;}};
  updateProceduralTexture(f.runtime); assert.deepEqual(log, [0x90, 8]); assert.equal(f.memory.readInt32LE(0x5ed2c4), 11); assert.equal(f.memory.readInt32LE(0x6e6d00), 0);
});

test('unsupported locked format is unlocked while phase remains unchanged', () => {
  const f = fixture(), log = []; f.memory[0x50028] = 1; f.put(0x5242c, 24);
  f.runtime.handlers = {rendererCall: (object, method, args) => {log.push(method); if (method === 0x90) return 0x52000; if (method === 8) {f.put(args[0], 0x40000); f.put(args[2], 512); return 1;} return 0;}};
  updateProceduralTexture(f.runtime); assert.deepEqual(log, [0x90, 8, 0x90, 12]); assert.equal(f.memory.readInt32LE(0x6e6d00), 0);
});

test('lock adapter reads format after renderer side effects and preserves output alias ordering', () => {
  const f = fixture(); f.runtime.handlers = {rendererCall: (object, method, args) => {
    if (method === 0x90) return 0x52000;
    f.put(args[0], 0x40000); f.put(args[2], 512); f.put(0x5242c, 32); return 1;
  }};
  assert.equal(lockProceduralTexture(2, 0x60000, 0x60000, 0x60000, f.runtime), 1); assert.equal(f.memory.readInt32LE(0x60000), 512);
});

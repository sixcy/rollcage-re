import test from 'node:test';
import assert from 'node:assert/strict';
import {destroyAudioDatabaseManager, destroyBaseSoundManager} from '../src/sound-manager-destruction.mjs';
function fixture() {
  const memory = Buffer.alloc(0xa00000), object = 0x100000, put = (p, v) => memory.writeInt32LE(v | 0, p), ptr = p => memory.readUInt32LE(p), calls = [];
  const runtime = {memory, scratchBase: 0x9000, services: {libraryCall(name, args) {calls.push([name, ...args]); return 0;}, platformCall(name, args) {calls.push([name, ...args]); return 1;}}};
  function vector(offset, header, storage) {put(object + offset, header); put(header, storage); put(header + 4, storage + 8); put(header + 8, storage + 16);}
  return {memory, object, put, ptr, calls, runtime, vector};
}

test('database destruction frees storage before its header, preserving captured ownership across callbacks', () => {
  const f = fixture(), header = 0x110000, replacement = 0x120000, storage = 0x130000;
  f.vector(0, header, storage); f.put(replacement, 0x140000);
  f.runtime.services.libraryCall = (name, args) => {
    f.calls.push([name, ...args]);
    if (args[0] === storage) {f.put(f.object, replacement); f.put(header + 4, 0x12345678);}
    if (args[0] === header) assert.deepEqual([0, 4, 8].map(o => f.ptr(header + o)), [0, 0, 0]);
  };
  destroyAudioDatabaseManager(f.object, f.runtime);
  assert.deepEqual(f.calls, [['operatorDelete', storage], ['operatorDelete', header]]);
  assert.equal(f.ptr(f.object), 0); assert.equal(f.ptr(replacement), 0x140000);
});

test('null vector storage leaves stale end and capacity words intact at header destruction', () => {
  const f = fixture(), header = 0x110000; f.vector(0, header, 0);
  f.runtime.services.libraryCall = (name, args) => {assert.equal(args[0], header); assert.equal(f.ptr(header + 4), 8); assert.equal(f.ptr(header + 8), 16);};
  destroyAudioDatabaseManager(f.object, f.runtime); assert.equal(f.ptr(f.object), 0);
});

test('PCBase cleanup follows native vector order, closes zero handles and preserves handle fields', () => {
  const f = fixture(), order = [0x82c, 0x830, 0x834, 0x840, 0x838, 0x83c, 0x848, 0x844, 0x84c];
  for (let i = 0; i < order.length; i++) f.vector(order[i], 0x110000 + i * 0x100, 0x120000 + i * 0x100);
  f.put(f.object + 0x8d0, 17);
  destroyBaseSoundManager(f.object, f.runtime);
  assert.deepEqual(f.calls.filter(([name]) => name === 'operatorDelete').map(([, p]) => p), order.flatMap((_, i) => [0x120000 + i * 0x100, 0x110000 + i * 0x100]));
  assert.deepEqual(f.calls.filter(([name]) => name === 'CloseHandle'), [['CloseHandle', 0], ['CloseHandle', 17], ['CloseHandle', 0], ['CloseHandle', 0]]);
  assert.deepEqual(f.calls.slice(-3), [0x894, 0x874, 0x854].map(o => ['DeleteCriticalSection', f.object + o]));
  assert.equal(f.ptr(f.object + 0x8d0), 17); assert.equal(f.ptr(f.object), 0x5d3c60);
});

test('PCBase cleanup reads later vector owners after earlier deletion side effects', () => {
  const f = fixture(), first = 0x110000, oldSecond = 0x111000, newSecond = 0x112000;
  f.vector(0x82c, first, 0); f.vector(0x830, oldSecond, 0); f.put(newSecond, 0x130000);
  f.runtime.services.libraryCall = (name, args) => {f.calls.push([name, ...args]); if (args[0] === first) f.put(f.object + 0x830, newSecond);};
  destroyBaseSoundManager(f.object, f.runtime);
  assert.deepEqual(f.calls.filter(([name]) => name === 'operatorDelete').map(([, p]) => p), [first, 0x130000, newSecond]);
  assert.equal(f.ptr(f.object + 0x830), 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceAudioSampleCallback, retireGameAudioSource, destroyQueuedAudioSource, releaseGameAudioListener} from '../src/audio-source-retirement.mjs';
function fixture() {
  const memory = Buffer.alloc(0xa00000), source = 0x100000, manager = 0x110000, vector = 0x120000, array = 0x130000, S = 0x9000, calls = [];
  const put = (p, v) => memory.writeInt32LE(v | 0, p), ptr = p => memory.readUInt32LE(p);
  put(source, 0x5d3f60); put(0x5d3fbc, 0x4ad420); put(manager, 0x5d4190); put(0x5d41b0, 0x4a7950); put(0x714b08, manager);
  put(manager + 0x840, vector); put(vector, array); put(vector + 4, array); put(vector + 8, array + 16);
  put(0x5d3d1c, 0x4ab790); put(0x5d3d2c, 0x40f2a0); put(0x5d3d30, 0x40ee80);
  put(0x5d0304, 0x40f2c0); put(0x5d0314, 0x40f2a0); put(0x5d0318, 0x40eea0);
  const runtime = {memory, scratchBase: S, services: {libraryCall(name, args) {
    calls.push([name, ...args]); if (name === '__RTDynamicCast') return args[0] ? source : 0;
    if (name === 'operatorDelete') return 0;
    throw Error(`Unexpected focused retirement CRT ${name}`);
  }, platformCall(name, args) {calls.push([name, ...args]); return name === 'GetCurrentThreadId' ? 99 : 0;}}};
  return {memory, source, manager, vector, array, S, calls, put, ptr, runtime};
}

test('retirement clears a queued callback and defers its source exactly once', () => {
  const f = fixture(), callback = f.source + 0x930;
  f.put(callback, 0x5d3d1c); f.put(callback + 4, 0x150000); f.put(callback + 16, callback);
  assert.equal(retireGameAudioSource(f.manager, f.source, f.runtime), 0);
  assert.equal(f.ptr(f.source + 0x940), 0); assert.equal(f.ptr(f.array), f.source); assert.equal(f.ptr(f.vector + 4), f.array + 4);
  retireGameAudioSource(f.manager, f.source, f.runtime);
  assert.equal(f.ptr(f.vector + 4), f.array + 4); assert(!f.calls.some(([name]) => name === 'operatorDelete'));
  assert.equal(f.ptr(f.manager + 0x88c), 0); assert.equal(f.ptr(f.manager + 0x890), 0);
});

test('failed RTTI conversion returns without locks, callback clearing or deferral', () => {
  const f = fixture(); f.put(f.source + 0x940, 0x150000);
  f.runtime.services.libraryCall = name => {assert.equal(name, '__RTDynamicCast'); return 0;};
  assert.equal(retireGameAudioSource(f.manager, f.source, f.runtime), 0);
  assert.equal(f.ptr(f.source + 0x940), 0x150000); assert.equal(f.ptr(f.vector + 4), f.array); assert.deepEqual(f.calls, []);
});

test('RTTI-adjusted pointer is deferred while callback replacement uses the original source', () => {
  const f = fixture(), original = f.runtime.services.libraryCall;
  f.runtime.services.libraryCall = (name, args, r) => name === '__RTDynamicCast' ? f.source + 16 : original(name, args, r);
  retireGameAudioSource(f.manager, f.source, f.runtime);
  assert.equal(f.ptr(f.array), f.source + 16); assert.equal(f.ptr(f.source + 0x940), 0);
});

test('empty incoming callable frees the old heap callback and preserves its retired base vtable', () => {
  const f = fixture(), old = 0x150000; f.put(old, 0x5d3d1c); f.put(f.source + 0x940, old); f.put(f.S + 20, 0);
  replaceAudioSampleCallback(f.source, f.runtime);
  assert.equal(f.ptr(f.source + 0x940), 0); assert.equal(f.ptr(old), 0x5d02b4);
  assert.deepEqual(f.calls, [['operatorDelete', old]]);
});

test('queued wrapper destruction clears sample and iterator ownership while retiring its vector storage', () => {
  const f = fixture(), object = 0x150000, header = 0x160000, storage = 0x170000;
  f.put(object + 44, f.source); f.put(object + 36, header); f.put(header, storage); f.put(header + 4, storage + 8); f.put(header + 8, storage + 16);
  destroyQueuedAudioSource(object, f.runtime);
  assert.equal(f.ptr(object + 44), 0); assert.equal(f.ptr(object + 52), 0xffffffff); assert.equal(f.ptr(object + 36), 0);
  assert.deepEqual([0, 4, 8].map(o => f.ptr(header + o)), [0, 0, 0]);
  assert.deepEqual(f.calls.filter(([name]) => name === 'operatorDelete'), [['operatorDelete', storage], ['operatorDelete', header]]);
  assert.deepEqual(f.calls.at(-1), ['DeleteCriticalSection', object + 4]);
});

test('listener release destroys its inline callback without separately freeing callable storage', () => {
  const f = fixture(), object = 0x150000, storage = object + 8;
  f.put(storage, 0x5d0304); f.put(object + 24, storage);
  assert.equal(releaseGameAudioListener(object, 1, f.runtime), object);
  assert.equal(f.ptr(object + 24), 0); assert.equal(f.ptr(storage), 0x5d02dc); assert.equal(f.ptr(object), 0x5d3cec);
  assert.deepEqual(f.calls, [['operatorDelete', object]]);
});

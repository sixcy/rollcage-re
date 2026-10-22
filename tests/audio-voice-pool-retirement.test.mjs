import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseAudioVoicePoolRecord, destroyAudioVoicePoolRecord} from '../src/audio-voice-pool-retirement.mjs';
import {eraseRendererPointers} from '../src/renderer-scene-nodes.mjs';
function fixture() {
  const memory = Buffer.alloc(0xa00000), object = 0x100000, manager = 0x110000, vector = manager + 0xd68, array = 0x120000, put = (p, v) => memory.writeInt32LE(v | 0, p), ptr = p => memory.readUInt32LE(p), calls = [];
  put(vector, array); put(vector + 4, array); put(vector + 8, array + 64); put(0x715b08, 3); put(0x714afc, 0x715b30);
  const runtime = {memory, scratchBase: 0x9000, services: {libraryCall(name, args) {calls.push([name, ...args]); if (name === 'memmove') {Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory, args[0]); return args[0];} return 0;}, xAudio2Call(owner, method, args) {calls.push(['COM', owner, method, ...args]); return 0;}}};
  return {memory, object, manager, vector, array, put, ptr, calls, runtime};
}

test('voice-pool release destroys only on exact zero after decrement', () => {
  for (const refs of [0, 2, 0xffffffff]) {
    const f = fixture(); f.put(f.object, refs); releaseAudioVoicePoolRecord(f.manager, f.object, f.runtime);
    assert.equal(f.ptr(f.object), refs - 1 >>> 0); assert.deepEqual(f.calls, []);
  }
});

test('final release deletes the record and removes every duplicate from the manager vector', () => {
  const f = fixture(), values = [f.object, 17, f.object, 29, f.object]; f.put(f.object, 1);
  values.forEach((v, i) => f.put(f.array + i * 4, v)); f.put(f.vector + 4, f.array + values.length * 4);
  releaseAudioVoicePoolRecord(f.manager, f.object, f.runtime);
  assert.equal(f.ptr(f.vector + 4), f.array + 8); assert.deepEqual([f.ptr(f.array), f.ptr(f.array + 4)], [17, 29]);
  assert.deepEqual(f.calls.map(([name]) => name), ['operatorDelete', 'memmove']);
});

test('manager removal captures its vector only after record deletion side effects', () => {
  const f = fixture(), alternate = 0x130000; f.put(f.object, 1); f.put(alternate, f.object); f.put(alternate + 4, 31);
  const original = f.runtime.services.libraryCall;
  f.runtime.services.libraryCall = (name, args, r) => {if (name === 'operatorDelete') {f.put(f.vector, alternate); f.put(f.vector + 4, alternate + 8);} return original(name, args, r);};
  releaseAudioVoicePoolRecord(f.manager, f.object, f.runtime);
  assert.equal(f.ptr(f.vector), alternate); assert.equal(f.ptr(f.vector + 4), alternate + 4); assert.equal(f.ptr(alternate), 31);
});

test('pool record destroys its voice before releasing the live engine and deleting itself', () => {
  const f = fixture(); f.put(f.object + 12, 1001); f.put(f.object + 8, 1002);
  assert.equal(destroyAudioVoicePoolRecord(f.object, 0, f.runtime), f.object);
  assert.deepEqual(f.calls, [['COM', 1001, 0x48, 1001], ['COM', 1002, 8, 1002], ['operatorDelete', f.object]]);
  assert.equal(f.ptr(f.object + 12), 0); assert.equal(f.ptr(f.object + 8), 0);
});

test('voice cleanup may retire the engine before its later ownership check', () => {
  const f = fixture(); f.put(f.object + 12, 1001); f.put(f.object + 8, 1002);
  f.runtime.services.xAudio2Call = (owner, method, args) => {f.calls.push(['COM', owner, method, ...args]); f.put(f.object + 8, 0);};
  destroyAudioVoicePoolRecord(f.object, 0, f.runtime);
  assert.deepEqual(f.calls, [['COM', 1001, 0x48, 1001], ['operatorDelete', f.object]]);
});

test('native pointer erase distinguishes captured destination from its live result word', () => {
  const f = fixture(), result = 0x130000; [1, 2, 3, 4].forEach((v, i) => f.put(f.array + i * 4, v)); f.put(f.vector + 4, f.array + 16);
  const original = f.runtime.services.libraryCall;
  f.runtime.services.libraryCall = (name, args, r) => {const value = original(name, args, r); f.put(f.runtime.scratchBase + 8, 0x140000); return value;};
  eraseRendererPointers(f.vector, result, f.array + 4, f.array + 8, {...f.runtime, nativePointerErase: true});
  assert.deepEqual([0, 4, 8].map(o => f.ptr(f.array + o)), [1, 3, 4]); assert.equal(f.ptr(f.vector + 4), f.array + 12);
  assert.equal(f.ptr(result), 0x140000);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {destroyBaseGameAudioSample, destroyXAudioSample, releaseXAudioSample} from '../src/audio-sample-destruction.mjs';
function fixture() {
  const memory = Buffer.alloc(0xa00000), object = 0x100000, manager = 0x110000, calls = [], put = (p, v) => memory.writeInt32LE(v | 0, p), ptr = p => memory.readUInt32LE(p);
  put(0x714b08, manager); put(manager + 0x830, 0x120000); put(0x120000, 0x121000); put(0x120004, 0x121000); put(0x5d407c, 0x4afc00); put(0x5d4080, 0x4afc80);
  const runtime = {memory, scratchBase: 0x9000, services: {libraryCall(name, args) {calls.push([name, ...args]); if (name === 'memmove') {Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory, args[0]); return args[0];} return 0;}, xAudio2Call(owner, method, args) {calls.push(['COM', owner, method, ...args]); return 0;}}};
  return {memory, object, manager, calls, put, ptr, runtime};
}
test('sample destruction removes only final waveform references, including signed wrap behavior', () => {
  for (const [before, after, remove] of [[2, 1, false], [1, 0, true], [0, -1, true], [-2147483648, 2147483647, false]]) {
    const f = fixture(), wave = 0x130000; f.put(f.object + 0x964, wave); f.put(wave, 0x5d407c); f.put(wave + 4, before); f.put(0x121000, wave); f.put(0x120004, 0x121004);
    destroyBaseGameAudioSample(f.object, f.runtime);
    assert.equal(f.memory.readInt32LE(wave + 4), after); assert.equal(f.ptr(f.object + 0x964), 0);
    assert.equal(f.ptr(0x120004), remove ? 0x121000 : 0x121004);
    assert.equal(f.calls.some(([name, p]) => name === 'operatorDelete' && p === wave), remove);
  }
});
test('sample voice shutdown reloads the live voice between stop, flush and destroy', () => {
  const f = fixture(); f.put(f.object + 0x97c, 11); f.put(f.object + 0x9a0, 0x130000); f.put(f.object + 0x948, 17);
  f.runtime.services.xAudio2Call = (owner, method, args) => {f.calls.push(['COM', owner, method, ...args]); if (method === 0x50) f.put(f.object + 0x97c, 22); if (method === 0x58) f.put(f.object + 0x97c, 33);};
  destroyXAudioSample(f.object, f.runtime);
  assert.deepEqual(f.calls.slice(0, 3), [['COM', 11, 0x50, 11, 32, 0], ['COM', 22, 0x58, 22], ['COM', 33, 0x48, 33]]);
  assert.equal(f.ptr(f.object + 0x97c), 0); assert.equal(f.ptr(f.object + 0x948), 0); assert.equal(f.memory[f.object + 0x99c], 1);
  assert.equal(f.ptr(f.object + 0x9a0), 0); assert.equal(f.ptr(f.object), 0x5d3ea0);
});
test('sample scratch allocation remains untouched when there was no voice', () => {
  const f = fixture(); f.put(f.object + 0x9a0, 0x130000); destroyXAudioSample(f.object, f.runtime);
  assert.equal(f.ptr(f.object + 0x9a0), 0x130000); assert.deepEqual(f.calls, []);
});
test('sample deleting flag is read after cache and waveform destruction', () => {
  const f = fixture(), wave = 0x130000; f.put(f.object + 0x964, wave); f.put(wave, 0x5d407c); f.put(wave + 4, 1); f.put(0x121000, wave); f.put(0x120004, 0x121004);
  const original = f.runtime.services.libraryCall;
  f.runtime.services.libraryCall = (name, args, r) => {if (name === 'operatorDelete' && args[0] === wave) f.put(f.runtime.scratchBase + 4, 1); return original(name, args, r);};
  assert.equal(releaseXAudioSample(f.object, 0, f.runtime), f.object); assert.deepEqual(f.calls.at(-1), ['operatorDelete', f.object]);
});

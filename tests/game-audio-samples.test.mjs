import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGameAudioSample, initializeRaceAudio} from '../src/game-audio-samples.mjs';
import {createSoundManagerServices} from '../tools/verify-sound-manager-construction-instructions.mjs';

//Synthetic world with original literal values; native comparisons separately
//check original retained bytes and the complete startup/sample parent frames.
function fixture() {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p), ptr = p => memory.readUInt32LE(p);
  const manager = 0x110000, session = 0x140000, name = 0x100000, descriptors = [], base = createSoundManagerServices(memory, 0);
  for (const [p, text, encoding] of [[0x5d0328, '..\\IDXData\\Redux\\Sound\\', 'utf16le'], [0x5d0358, '.wav', 'utf16le'], [0x5d0320, 'DEFAULT', 'latin1'], [0x5d0364, 'SFX_ENGINE', 'latin1'], [0x5d0370, 'SFX_LEADER_FLY', 'latin1'], [0x5d0380, 'EXPLO', 'latin1'], [0x5d3498, 'SFX_JETENGINE1', 'latin1']]) memory.write(text + '\0', p, encoding);
  put(manager, 0x5d4190); put(0x5d41a4, 0x4a7710); put(0x5d41dc, 0x4a9b00); put(0x714b08, manager);
  put(0x5d0304, 0x40f2c0); put(0x5d0314, 0x40f2a0); put(0x5d0318, 0x40eea0);
  put(manager + 0x82c, 0x111000); put(0x111000, 0x112000); put(0x111004, 0x112000); put(0x111008, 0x112020);
  put(0x5ecb1c, session); memory[session + 0x54d] = 5;
  put(0x909318, 0x120000); put(0x120000, 0x130000);
  const string = (m, p, w = 1) => {let e = p; while (w === 2 ? m.readUInt16LE(e) : m[e]) e += w; return m.toString(w === 2 ? 'utf16le' : 'latin1', p, e);};
  const services = {...base, libraryCall(kind, args, context) {
    if (kind === 'strstr') {const index = string(memory, args[0]).indexOf(string(memory, args[1])); return index < 0 ? 0 : args[0] + index;}
    return base.libraryCall(kind, args, context);
  }};
  const runtime = {memory, scratchBase: 0x9000, sehWord: 0x12345678, services, handlers: {soundManagerSample(request) {
    descriptors.push(Buffer.from(memory.subarray(request.descriptor, request.descriptor + 0x460)));
    return 0x180000 + descriptors.length * 4;
  }}};
  function load(text, flag = 1) {memory.write(text + '\0', name, 'latin1'); return loadGameAudioSample(name, flag, runtime);}
  return {memory, put, ptr, manager, session, descriptors, runtime, load, string};
}

test('sample range policy distinguishes engine prefix, leader prefix and contained explosion token', () => {
  const f = fixture();
  for (const [name, gain, range] of [['Plain', 1, 150], ['SFX_ENGINE_TURBO', 1, 200], ['SFX_LEADER_FLY_LONG', 3, 300], ['DEBRIS_EXPLO_1', 3, 300], ['sfx_engine', 1, 150]]) {
    f.load(name); const d = f.descriptors.at(-1);
    assert.equal(d.readFloatLE(0x440), gain, name); assert.equal(d.readFloatLE(0x444), range, name);
  }
});

test('sample policy inspects full name even when descriptor display name is truncated', () => {
  const f = fixture(), text = 'X'.repeat(30) + 'EXPLO'; f.load(text, 0x100);
  const d = f.descriptors[0];
  assert.equal(f.string(d, 0), 'X'.repeat(23));
  assert.equal(f.string(d, 48, 2), '..\\IDXData\\Redux\\Sound\\' + text + '.wav');
  assert.equal(d.readFloatLE(0x440), 3); assert.equal(d[0x458], 1);
});

test('loading the same sample twice creates separate owners and returns successive indices', () => {
  const f = fixture(); assert.equal(f.load('Plain'), 0); assert.equal(f.load('Plain'), 1);
  const array = f.ptr(0x6f2414); assert.notEqual(f.ptr(array), f.ptr(array + 4)); assert.equal(f.descriptors.length, 2);
});

test('sample index is captured before heap-name cleanup mutates vector length', () => {
  const f = fixture(), original = f.runtime.services.libraryCall;
  f.runtime.services.libraryCall = (name, args, context) => {
    if (name === 'operatorDelete' && f.ptr(context.scratchBase) === 0x40df53) f.put(0x6f2418, f.ptr(0x6f2418) + 4);
    return original(name, args, context);
  };
  assert.equal(f.load('A long sample name requiring heap storage'), 0);
  assert.equal(f.ptr(0x6f2418) - f.ptr(0x6f2414), 8);
});

test('race audio captures the session after sample creation and reads count before horn writes', () => {
  const f = fixture(), original = f.runtime.handlers.soundManagerSample;
  f.runtime.handlers.soundManagerSample = request => {
    f.put(0x5ecb1c, 0x713284 - 0x54d); f.memory[0x713284] = 2;
    return original(request);
  };
  initializeRaceAudio(f.runtime);
  assert.equal(f.ptr(0x6e6bdc), 0);
  assert.equal(f.ptr(0x713190 + 40 + 4), 127, 'second audio record exists despite count being cleared by first horn');
  assert.equal(f.ptr(0x713190 + 80 + 4), 0, 'count was re-read before a third audio record');
  assert.equal(f.ptr(0x713280 + 16), 255); assert.equal(f.ptr(0x713284), 0);
});

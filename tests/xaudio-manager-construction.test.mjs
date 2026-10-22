import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSoundManagerServices} from '../tools/verify-sound-manager-construction-instructions.mjs';
import {initializeXAudioManagerConstants, constructXAudioManager, constructAudioDeviceName, cacheAudioDeviceName} from '../src/xaudio-manager-construction.mjs';

const program = await loadRetainedNativeProgram();
function fixture(mode = 'success') {
  const memory = initializeXAudioManagerConstants(program.initializeMemory(Buffer.alloc(0xa00000))), put = (p, v) => memory.writeInt32LE(v | 0, p), object = 0x100000, engine = 0x600000, voice = 0x602000;
  const base = createSoundManagerServices(memory, 0), events = []; let attempts = 0;
  put(0x5ed314, 0x4a0780); put(0x714afc, 0x715b30); put(0x714b18, 1); put(0x714b1c, 17);
  const services = {...base, platformCall(name, args, runtime) {
    if (name === 'IsProcessorFeaturePresent') return 1;
    if (name === 'CoCreateInstance') {events.push([name]); if (mode === 'cocreate') return -1; put(args[4], engine); return 0;}
    if (name === 'WideCharToMultiByte') {events.push([name, ...args]); for (let i = 0; i < args[3]; i++) memory[args[4] + i] = memory.readUInt16LE(args[2] + i * 2) & 255; return args[3];}
    if (name === 'X3DAudioInitialize') {events.push([name, ...args]); return 0;}
    return base.platformCall(name, args, runtime);
  }, xAudio2Call(owner, method, args) {
    events.push([owner, method, ...args]);
    if (owner === engine && method === 0x28) {put(args[1], voice); attempts++; return mode === 'voices' || (mode === 'fallback' && attempts === 1) ? -1 : 0;}
    if (owner === engine && method === 0x10) {if (mode === 'details') return -1; memory.write('Adapter\0', args[2] + 0x200, 'utf16le'); memory.writeUInt16LE(6, args[2] + 0x406); put(args[2] + 0x418, 0x3f);}
    return 0;
  }};
  const runtime = {memory, scratchBase: 0x9000, sehWord: 0, services};
  return {memory, put, object, engine, voice, events, runtime};
}

test('mastering-voice frequency falls back from48000 to the device default before publishing channel count', () => {
  const f = fixture('fallback'); constructXAudioManager(f.object, f.runtime);
  assert.deepEqual(f.events.filter(event => event[0] === f.engine && event[1] === 0x28).map(event => event[5]), [48000, 0]);
  assert.equal(f.memory.readUInt32LE(f.object + 0x918), 6); assert.equal(f.memory.readUInt32LE(f.object + 0x850), 32);
  assert.equal(f.events.filter(([name]) => name === 'X3DAudioInitialize').length, 1);
});

test('failed mastering voice and failed device details release partial device ownership in native order', () => {
  for (const mode of ['voices', 'details']) {
    const f = fixture(mode); constructXAudioManager(f.object, f.runtime);
    const tail = f.events.filter(event => [8, 0x30, 0x48].includes(event[1])).map(([owner, method]) => [owner, method]);
    assert.deepEqual(tail, [[f.voice, 0x48], [f.engine, 0x30], [f.engine, 8]]);
    assert.deepEqual([0x910, 0x914, 0x918].map(offset => f.memory.readUInt32LE(f.object + offset)), [0, 0, 0]);
  }
});

test('COM creation failure preserves completed base construction without invoking a device method', () => {
  const f = fixture('cocreate'); constructXAudioManager(f.object, f.runtime);
  assert.equal(f.memory.readUInt32LE(f.object + 0x918), 0); assert.equal(f.events.filter(event => typeof event[0] === 'number').length, 0);
  assert.notEqual(f.memory.readUInt32LE(f.object + 0x82c), 0);
});

test('device-name construction copies UTF16 directly and caches ANSI through the opposite conversion interface', () => {
  const f = fixture(), input = 0x110000, output = 0x120000; f.memory.write('Device\0', input, 'utf16le');
  constructAudioDeviceName(output, input, f.runtime);
  assert.equal(f.memory.toString('utf16le', output, output + 12), 'Device');
  const cached = cacheAudioDeviceName(output, f.runtime);
  assert.equal(f.memory.toString('latin1', cached, cached + 7), 'Device\0');
  const request = f.events.find(([name]) => name === 'WideCharToMultiByte'); assert.equal(request[4], 7); assert.equal(request[6], 7);
});

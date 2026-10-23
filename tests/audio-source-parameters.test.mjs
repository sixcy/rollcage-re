import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {updateAudioSourceFrequency, updateAudioSourceParameters, hasAudioSourceEffect} from '../src/audio-source-parameters.mjs';
import {verifyAudioSourceParameters} from '../tools/verify-audio-source-parameters-instructions.mjs';

test('actual frequency game children match retained instructions, all memory and external ABI', async () => {
  const result = await verifyAudioSourceParameters({fixtures: 240, output: null});
  assert.ok(result.voiceCalls > 0); assert.ok(result.skippedVoice > 0);
  assert.ok(result.visits['4a79f0'] > 0); assert.ok(result.visits['4a9370'] > 0);
});

test('actual nonspatial gain/frequency parent matches full mapped state and genuine children', async () => {
  const result = await verifyAudioSourceParameters({fixtures: 160, withParameters: true, output: null});
  assert.ok(result.visits['4b12d0'] > 0); assert.ok(result.visits['4ae4a0'] > 0);
  assert.ok(result.visits['4a9340'] > 0); assert.ok(result.visits['4a7c10'] > 0);
});

test('relocated original PE instructions match strict sparse frequency/parameter source inputs', {
  skip: !existsSync('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe'),
}, async () => {
  for (const withParameters of [false, true]) await verifyAudioSourceParameters({fixtures: 36, moduleBaseAddress: 0x6e0000, sparse: true, withParameters, output: null});
});

function minimal() {
  const memory = Buffer.alloc(0xa00000), source = 0x100000, manager = 0x102000, S = 0x9000;
  const put = (p, v) => memory.writeUInt32LE(v >>> 0, p);
  put(source, 0x110000); put(0x110050, 0x4ae4a0); put(manager, 0x111000); put(0x111048, 0x4a79f0);
  put(manager + 0x84c, 0x112000); put(0x112000, 0x112100); put(0x112004, 0x112100);
  put(0x714b08, manager); put(source + 0x964, 0x113000); put(0x11300c, 44100);
  memory.writeFloatLE(1, source + 0x440); memory.writeFloatLE(1, 0x5dc774);
  memory.writeFloatLE(44100, source + 0x988);
  const calls = [], runtime = {memory, scratchBase: S, xmm2: 1, services: {
    platformCall(name) {calls.push(name); return name === 'GetCurrentThreadId' ? 77 : 0;},
  }};
  return {memory, source, manager, runtime, calls, put};
}

test('cache equality checks exactly low force byte1 and preserves LAHF-derived EAX', () => {
  const f = minimal();
  assert.equal(updateAudioSourceFrequency(f.manager, f.source, 2, f.runtime), 0x4201);
  assert.equal(updateAudioSourceFrequency(f.manager, f.source, 0x100, f.runtime), 0x4201);
  assert.throws(() => updateAudioSourceFrequency(f.manager, f.source, 0x101, f.runtime), /XAudio2 interface service/);
});

test('incoming XMM2 and unsupported actual dependencies remain explicit', () => {
  const f = minimal();
  assert.throws(() => updateAudioSourceFrequency(f.manager, f.source, 0, {...f.runtime, xmm2: undefined}), /incoming XMM2/);
  f.put(f.source + 0x968, 0x114000);
  assert.throws(() => updateAudioSourceFrequency(f.manager, f.source, 0, f.runtime), /decoder-rate child/);
});

test('actual effect and spatial state selects genuine unsupported parent branches', () => {
  const f = minimal();
  assert.equal(hasAudioSourceEffect(f.source, f.runtime), 0);
  f.put(f.source + 0x9a0, 0x115000); assert.equal(hasAudioSourceEffect(f.source, f.runtime), 1);
  assert.throws(() => updateAudioSourceParameters(f.manager, f.source, 0, f.runtime), /reverb\/effect branch/);
  f.put(f.source + 0x9a0, 0); f.memory[f.source + 0x45e] = 1;
  assert.throws(() => updateAudioSourceParameters(f.manager, f.source, 0, f.runtime), /spatial branch/);
});

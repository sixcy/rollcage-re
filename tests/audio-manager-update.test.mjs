import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {verifyAudioManagerUpdate} from '../tools/verify-audio-manager-update-instructions.mjs';
import {updateAudioManagerSources} from '../src/audio-manager-update.mjs';

test('real manager locks/events/time and mixer hierarchy match original full-memory/private instructions', async () => {
  const r = await verifyAudioManagerUpdate({fixtures: 36, output: null});
  assert.ok(r.visits['4a6600'] > 0); assert.ok(r.visits['4a6a6d'] > 0); assert.ok(r.visits['4a90f0'] > 0);
});

test('populated steady nonspatial manager sources execute real arbitration/sort/parameter descendants', async () => {
  const r = await verifyAudioManagerUpdate({fixtures: 24, populated: true, output: null});
  for (const entry of ['4a6b60', '4adc40', '4b12d0', '4a7c10', '4a79f0']) assert.ok(r.visits[entry] > 0, entry);
});

test('duplicate retired pointers are erased in original order through real source destruction', async () => {
  const r = await verifyAudioManagerUpdate({fixtures: 12, retired: true, output: null});
  assert.equal(r.visits['4ad8f0'], 12);
});

test('relocated original instructions match actual sparse manager/mixer and empty-consumer memory', {
  skip: !existsSync('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe'),
}, async () => {
  for (const consumerOnly of [false, true]) await verifyAudioManagerUpdate({fixtures: 12, consumerOnly, moduleBaseAddress: 0x6e0000, sparse: true, output: null});
});

test('actual spatial source state reaches its dependency error without being cleared or bypassed', () => {
  const memory = Buffer.alloc(0xa00000), manager = 0x100000, source = 0x110000, watch = 0x120000, S = 0x9000;
  const put = (p, v) => memory.writeUInt32LE(v >>> 0, p);
  put(0x716d98, 3); put(0x714b04, watch); memory.writeBigUInt64LE(1n, watch + 40); put(0x716e08, 1);
  put(manager + 0x838, 0x130000); put(0x130000, 0x131000); put(0x130004, 0x131004); put(0x131000, source);
  put(manager + 0x844, 0x132000); put(source, 0x140000); put(0x140048, 0x4ad500); put(0x14003c, 0x4ad570);
  put(source + 0x948, 3); put(source + 0x94c, 4); memory[source + 0x45c] = 1; memory[source + 0x45e] = 1;
  const calls = [];
  assert.throws(() => updateAudioManagerSources(manager, {memory, scratchBase: S, sehWord: 0x12345678,
    services: {platformCall(name, args) {assert.equal(name, 'QueryPerformanceCounter'); memory.writeBigUInt64LE(0n, args[0]); return 1;},
      xAudio2Call(_voice, slot) {calls.push(slot); return 0;}}}), /spatial listener\/attenuation branch4a6ceb/);
  assert.equal(memory[source + 0x45e], 1); assert.equal(memory.readUInt32LE(source + 0x948), 3);
  assert.deepEqual(calls, [0x64]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {setGameAudioSampleFrameOffset} from '../src/audio-sample-controls.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';

function fixture(moduleBaseAddress = 0x700000) {
  const object = 0x12000000, waveform = 0x13000000, stack = 0x14000000;
  const table = moduleBaseAddress + 0x1d3f60;
  const captured = createCapturedMemory([
    {address: object, bytes: Buffer.alloc(0x9a8)}, {address: waveform, bytes: Buffer.alloc(0x440)},
    {address: table, bytes: Buffer.alloc(0x88)}, {address: stack, bytes: Buffer.alloc(256)},
  ]);
  const {memory: m} = captured;
  m.writeUInt32LE(table, object); m.writeUInt32LE(waveform, object + 0x964);
  m.writeUInt32LE(48000, waveform + 12); m.writeUInt32LE(moduleBaseAddress + 0xad650, table + 0x1c);
  return {object, waveform, table, runtime: {memory: m, moduleBaseAddress, scratchBase: stack + 128, entryRegisters: {ESI: 0x12345678}}};
}

test('sample frame offset translates only code target and return under strict captured ASLR storage', () => {
  for (const base of [0x400000, 0x700000]) {
    const {object, waveform, runtime} = fixture(base), m = runtime.memory, S = runtime.scratchBase;
    setGameAudioSampleFrameOffset(object, 96000, runtime);
    assert.equal(m.readFloatLE(object + 0x8d4), 2);
    assert.equal(m.readUInt32LE(S - 12), base + 0xad641);
    assert.equal(m.readUInt32LE(S - 4), 0x12345678);
    assert.equal(m.readUInt32LE(object + 0x964), waveform);
    assert.equal(m.readUInt32LE(S + 4), 96000);
  }
});

test('sample frame offset rejects an unrelocated virtual target instead of admitting a heap or image guess', () => {
  const {object, table, runtime} = fixture();
  runtime.memory.writeUInt32LE(0x4ad650, table + 0x1c);
  assert.throws(() => setGameAudioSampleFrameOffset(object, 96000, runtime), /Unported sample offset target/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {updateVehicleAudio, initializeVehicleAudioTables} from '../src/vehicle-audio.mjs';

const BODY = 0x10000, SESSION = 0x20000, AUDIO = 0x713190, HORN = 0x713280;
function fixture() {
  const memory = Buffer.alloc(0xa00000); initializeVehicleAudioTables(memory);
  const put = (address, value) => memory.writeInt32LE(value | 0, address), word = (address, value) => memory.writeUInt16LE(value & 65535, address);
  put(0x5ecb1c, SESSION); put(0x909300, BODY); put(BODY + 0x11c, -1); put(SESSION + 0x57c, 4);
  for (const offset of [4, 8, 12, 16, 20]) put(AUDIO + offset, 127); put(HORN, 255); put(HORN + 8, 127);
  return {memory, put, word, run: () => updateVehicleAudio(BODY, 0, {memory, scratchBase: 0x9000})};
}

test('table initialization preserves adjacent runtime ownership fields', () => {
  const f = fixture(); f.put(0x5eced0, 0x12345678); f.put(0x5eced4, -1); initializeVehicleAudioTables(f.memory);
  assert.equal(f.memory.readUInt32LE(0x5eced0), 0x12345678); assert.equal(f.memory.readInt32LE(0x5eced4), -1); assert.equal(f.memory.readInt32LE(0x5750b8), 142000);
});

test('actual missing-bank sound defaults still produce engine and wheel smoothing state', () => {
  const f = fixture(); f.memory[BODY + 0x4b4] = 1; f.put(BODY + 0x5d4, 1000 << 8); f.put(BODY + 0x50c, 1000 << 8); f.run();
  assert.equal(f.memory.readInt32LE(AUDIO), 142000000); assert.equal(f.memory.readInt16LE(AUDIO + 24), 1000); assert.equal(f.memory.readInt16LE(AUDIO + 26), 500);
  assert.equal(f.memory.readInt32LE(AUDIO + 12), 127); assert.equal(f.memory.readInt32LE(AUDIO + 8), 127);
});

test('gear increase schedules control feedback and a retained pitch cooldown', () => {
  const f = fixture(); f.memory[BODY + 0x4b4] = 1; f.word(AUDIO + 30, 2); f.put(AUDIO, 14000 << 16); f.put(BODY + 0x5d4, 12000 << 8); f.put(BODY + 0x50c, 12000 << 8); f.run();
  assert.equal(f.memory[AUDIO + 32], 1); assert.equal(f.memory[AUDIO + 33], 3); assert.equal(f.memory.readInt32LE(AUDIO), (14000 - 256) << 16);
  assert.equal(f.memory.readUInt16LE(BODY + 0x71e), 0x10a); assert.equal(f.memory.readUInt16LE(BODY + 0x71a), 200); assert.equal(f.memory[BODY + 0x71d], 70);
  f.run(); assert.equal(f.memory[AUDIO + 32], 1); assert.equal(f.memory[AUDIO + 33], 2);
});

test('horn sequence follows authored duration rows and its FF terminator', () => {
  const f = fixture(); f.word(SESSION + 0x61c, 1); f.memory[SESSION + 0x585] = 1; f.memory[SESSION + 0x1c] = 5; f.memory[BODY + 0x714] = 0x20; f.run();
  assert.equal(f.memory.readInt32LE(HORN), 1); assert.equal(f.memory.readInt32LE(HORN + 4), 12);
  f.memory[BODY + 0x714] = 0; f.put(HORN, 8); f.put(HORN + 4, 0); f.run(); assert.equal(f.memory.readInt32LE(HORN), 255); assert.equal(f.memory.readInt32LE(HORN + 4), 255);
});

test('collision sound uses unsigned ten-tick cooldown and clears both bytes at66f', () => {
  for (const [elapsed, expected] of [[9, 100], [10, 110], [11, 111]]) {
    const f = fixture(); f.memory[BODY + 0x66f] = 0xe0; f.memory[BODY + 0x670] = 0x69; f.put(BODY + 0x3e74, 100); f.put(0x90a548, 100 + elapsed); f.run();
    assert.equal(f.memory.readInt32LE(BODY + 0x3e74), expected); assert.equal(f.memory.readUInt16LE(BODY + 0x66f), 0);
  }
});

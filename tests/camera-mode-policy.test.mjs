import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseCameraMode, findNearestCameraParticipant, initializeCameraPolicyConstants} from '../src/camera-mode-policy.mjs';

function fixture(index = 0) {
  const memory = Buffer.alloc(0xa00000), camera = 0x91ff80 + index * 0x184, scratchBase = 0x9000;
  const put = (address, value) => memory.writeInt32LE(value | 0, address);
  initializeCameraPolicyConstants(memory); put(0x5ecb1c, 0x50000); memory[0x5054d] = 3;
  put(0x5ec958, 1); put(camera + 0x178, -1);
  for (let participant = 0; participant < 3; participant++) {const body = 0x60000 + participant * 0x1000; put(0x909300 + participant * 0x30c, body); put(body + 0x68, 0x40000); memory[body + 0x718] = 10;}
  return {memory, camera, put, runtime: {memory, scratchBase}, run: () => chooseCameraMode(index, {memory, scratchBase})};
}

test('positive cooldown retains mapped participant and mode2 chooses default4 without consuming RNG', () => {
  const f = fixture(1); f.memory[0x5058c] = 2; f.memory.writeInt16LE(1, f.camera + 0x3a); f.put(0x5ec124, 2); f.run();
  assert.equal(f.memory.readInt32LE(f.camera), 4); assert.equal(f.memory.readUInt16LE(f.camera + 0x36), 2); assert.equal(f.memory.readInt32LE(0x5ec958), 1);
  assert.equal(f.memory.readUInt16LE(f.camera + 0x32), 0); assert.equal(f.memory.readUInt16LE(f.camera + 0x34), 90);
});

test('mode2 finish selection takes the last equal best rank and uses original weighted mode table', () => {
  const f = fixture(); f.memory[0x5058c] = 2;
  [4, 2, 2].forEach((rank, index) => {f.memory[0x90931d + index * 0x30c] = rank;}); f.run();
  assert.equal(f.memory.readUInt16LE(f.camera + 0x36), 2); assert.equal(f.memory.readInt32LE(f.camera), 9);
  assert.equal(f.memory.readUInt16LE(f.camera + 0x34), 180); assert.equal(f.memory.readInt32LE(0x5ec958), 16807);
});

test('leaving mode14 clears four words and flag2 while preserving adjacent high words', () => {
  const f = fixture(); f.put(f.camera, 14); f.memory.writeInt16LE(1, f.camera + 0x3a); f.put(0x91ce90, 0x1234567f);
  for (const address of [0x849482, 0x8494d6, 0x84952a, 0x84957e]) f.put(address, 0x1234abcd);
  f.run(); assert.equal(f.memory.readInt32LE(f.camera), 0); assert.equal(f.memory.readInt32LE(0x91ce90), 0x1234567d);
  for (const address of [0x849482, 0x8494d6, 0x84952a, 0x84957e]) assert.equal(f.memory.readUInt32LE(address), 0x12340000);
});

test('nearest camera participant keeps first ties and writes -1 with no participants', () => {
  const f = fixture(); findNearestCameraParticipant(0x58000, 0x59000, f.runtime); assert.equal(f.memory.readInt32LE(0x59000), 0);
  f.memory[0x5054d] = 0; findNearestCameraParticipant(0x58000, 0x59000, f.runtime); assert.equal(f.memory.readInt32LE(0x59000), -1);
});

test('nearest camera distance wraps signed coordinates and captures input before writing aliased output', () => {
  const f = fixture(); f.put(0x58000, 0x7fffffff); f.put(0x61034, -2147483648); f.put(0x62034, 0);
  findNearestCameraParticipant(0x58000, 0x58000, f.runtime); assert.equal(f.memory.readInt32LE(0x58000), 1);
});

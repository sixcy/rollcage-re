import test from 'node:test';
import assert from 'node:assert/strict';
import {constructCameraController, initializeCameraConstructionConstants} from '../src/camera-construction.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), control = 0x909060;
  const put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p);
  initializeCameraConstructionConstants(memory); put(0x5ecb1c, 0x50000); put(0x5ecefc, 0x52000); put(0x909288, 0x30000); put(0x902eec, 0x100000); put(0x70dcf4, 0x60003);
  word(0x30000, 12); word(0x30002, 70); word(0x30004, -150);
  put(0x909254, 0x40000); put(0x909278, 0x45000);
  for (let row = 0; row < 256; row++) {word(0x40000 + row * 16, 0xff00); word(0x40002 + row * 16, 255); put(0x4000c + row * 16, 0x43000);}
  put(0x91e79c, 0x180000); put(0x91e780, 0x190000); put(0x91e78c, 0x190100); put(0x91e790, 0x190200); put(0x91e794, 255); put(0x91e784, -1); put(0x902bc0, 0x1a0000);
  for (let id = 0; id < 256; id++) memory[0x190000 + id] = id;
  return {memory, control, put, word, run: (index = 0, output = control) => constructCameraController(index, 0x210000, output, {memory, scratchBase: 0x9000})};
}

test('camera construction creates aligned physical type4 body with two actual shape registrations', () => {
  const f = fixture(); f.run(); const body = f.memory.readUInt32LE(f.control);
  assert.equal(body, 0x160000); assert.equal(f.memory.readUInt32LE(0x70dcf4), 0x60183); assert.equal(f.memory.readUInt32LE(body), 0x804);
  assert.equal(f.memory.readInt32LE(body + 0x34), 12 << 16); assert.equal(f.memory.readInt32LE(body + 0x38), 7 << 16); assert.equal(f.memory.readInt32LE(body + 0x3c), 10 << 16);
  assert.equal(f.memory.readUInt32LE(body + 0x164), f.control); assert.equal(f.memory.readUInt32LE(f.control + 4), 0x210000);
  assert.equal(f.memory.readUInt16LE(0x902bc4), 1); assert.equal(f.memory.readInt32LE(0x91e798), 2); assert.equal(f.memory.readUInt32LE(body + 0x108), 1);
});

test('each camera constructor resets all four rows and takes the first replay preset only for modes5..8', () => {
  const f = fixture(); f.memory[0x50551] = 5; f.memory[0x52084] = 3; f.run();
  for (let view = 0; view < 4; view++) {const row = 0x91ff80 + view * 0x184; assert.equal(f.memory.readInt32LE(row), 14); assert.equal(f.memory.readInt16LE(row + 0x3a), -1); assert.equal(f.memory.readUInt16LE(row + 0x34), 150); assert.equal(f.memory.readInt32LE(row + 0x178), view === 0 ? 3 : -1);}
  f.put(0x91ff80, 4); f.memory[0x50551] = 4; f.run(1, f.control + 76);
  assert.equal(f.memory.readInt32LE(0x91ff80), 14); assert.equal(f.memory.readInt32LE(0x9200f8), -1);
});

test('camera controller preferences retain signed bytes and halve signed table offsets toward zero', () => {
  const f = fixture(); f.memory[0x50a90] = 2; f.memory[0x50a92] = 255; f.word(0x5704d0, -3); f.word(0x570468, -5); f.run();
  assert.equal(f.memory[f.control + 0x39] & 3, 2); assert.equal(f.memory.readInt16LE(f.control + 0x4a), -1);
  assert.equal(f.memory.readInt16LE(f.control + 0x40), -1); assert.equal(f.memory.readInt16LE(f.control + 0x42), -2); assert.equal(f.memory[f.control + 0x3b], 63);
});

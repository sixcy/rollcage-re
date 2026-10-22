import test from 'node:test';
import assert from 'node:assert/strict';
import {updateVehicleWheelHistories} from '../src/vehicle-wheel-histories.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), body = 0x10000, session = 0x50000;
  memory.writeUInt32LE(session, 0x5ecb1c); memory[session + 0x54d] = 1; memory.writeUInt32LE(body, 0x909300); memory.writeFloatLE(1 / 4096, 0x5dc5f4);
  [4096, 0, 0, 0, 4096, 0, 0, 0, 4096].forEach((value, index) => memory.writeInt16LE(value, body + 0xc4 + index * 2));
  for (let side = 0; side < 2; side++) {memory.writeUInt32LE(0x60000 + side * 128, body + 0x520 + side * 200); memory.writeInt32LE(100 * 65536, 0x60034 + side * 128);}
  return {memory, body, session};
}
test('paired wheel histories retain twelve newest positions and saturate their counts', () => {
  const {memory, body} = fixture(); for (let frame = 0; frame < 13; frame++) updateVehicleWheelHistories({memory});
  for (let side = 0; side < 2; side++) {const h = body + 0x2f4c + side * 0x6d4; assert.equal(memory.readInt32LE(h), 1); assert.equal(memory.readInt32LE(h + 4), 12); assert.equal(memory.readInt32LE(h + 20), (side ? 109 : 92) * 65536);}
});
test('phase performs one signed comparison and one subtraction rather than modulo', () => {
  const {memory, body} = fixture(), h = body + 0x2f4c; memory.writeInt16LE(1000, h + 8);
  updateVehicleWheelHistories({memory}); assert.equal(memory.readInt16LE(h + 8), 759);
  memory.writeInt16LE(-100, h + 8); updateVehicleWheelHistories({memory}); assert.equal(memory.readInt16LE(h + 8), -85);
});
test('empty participant registry preserves RNG and matrix scratch', () => {
  const {memory, session} = fixture(); memory[session + 0x54d] = 0; memory.writeInt32LE(123, 0x5ec958); memory.writeInt32LE(456, 0x91d360);
  updateVehicleWheelHistories({memory}); assert.equal(memory.readInt32LE(0x5ec958), 123); assert.equal(memory.readInt32LE(0x91d360), 456);
});

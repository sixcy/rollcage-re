import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareVehicleWheelRender, buildRenderRotationMatrix, transformRenderShortVector, updateWheelRenderOffset} from '../src/wheel-render-state.mjs';
import {createWheelRenderFixture, wheelRenderAddresses as a, verifyWheelRenderState} from '../tools/verify-wheel-render-state-instructions.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address), word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const matrix = (memory, address) => Array.from({length: 9}, (_, index) => memory.readInt16LE(address + index * 2));

test('rotation uses original asymmetric phase pairs, masks negative angles and preserves the matrix gap', () => {
  const runtime = createWheelRenderFixture(3), {memory} = runtime;
  for (let lane = 0; lane < 3; lane++) word(memory, a.angles + lane * 2, lane === 1 ? 2048 : 0);
  buildRenderRotationMatrix(a.angles, a.matrix, runtime);
  assert.deepEqual(matrix(memory, a.matrix), [-4095, 0, 0, 0, 4096, 0, 0, 0, -4095]);
  assert.equal(memory.readUInt16LE(a.matrix + 18), 0x7777); assert.deepEqual(memory.subarray(a.matrix + 20, a.matrix + 32), Buffer.alloc(12));
  word(memory, a.angles + 2, -1); buildRenderRotationMatrix(a.angles, a.matrix, runtime);
  assert.deepEqual(matrix(memory, a.matrix), [4096, 0, -5, 0, 4096, 0, 5, 0, 4096]);
});

test('rotation captures all angles before writing an aliased output', () => {
  const runtime = createWheelRenderFixture(531), {memory} = runtime;
  buildRenderRotationMatrix(a.angles, a.matrix, runtime); const expected = Buffer.from(memory.subarray(a.matrix, a.matrix + 18));
  buildRenderRotationMatrix(a.angles, a.angles, runtime); assert.deepEqual(memory.subarray(a.angles, a.angles + 18), expected);
});

test('short transform retains low32 overflow and preserves scattered upper words', () => {
  const runtime = createWheelRenderFixture(3), {memory} = runtime;
  for (let lane = 0; lane < 9; lane++) word(memory, 0x91d360 + lane * 2, 32767);
  for (const offset of [0, 4, 8]) put(memory, 0x91d408 + offset, 0xabcd7fff);
  transformRenderShortVector(runtime);
  for (const offset of [0, 4, 8]) assert.equal(memory.readUInt32LE(0x91d408 + offset), 0xabcdffd0);
});

test('offset halves toward zero and clamps using the accumulator before short truncation', () => {
  const runtime = createWheelRenderFixture(3), {memory} = runtime, wheel = a.body + 0x324;
  memory[wheel] = 0; word(memory, wheel + 2, -1); updateWheelRenderOffset(wheel, a.body, runtime); assert.equal(memory.readInt16LE(wheel + 2), 0); assert.equal(memory.readInt16LE(wheel + 0x72), 0);
  memory[wheel] = 1; word(memory, wheel + 2, 32767); put(memory, wheel + 0x80, -2147483648); memory[a.body + 0x64f] = 0;
  updateWheelRenderOffset(wheel, a.body, runtime); assert.equal(memory.readInt16LE(wheel + 2), 16623); assert.equal(memory.readInt16LE(wheel + 0x72), 6);
  word(memory, wheel + 2, 32767); memory[a.body + 0x64f] = 2;
  updateWheelRenderOffset(wheel, a.body, runtime); assert.equal(memory.readInt16LE(wheel + 2), 16143); assert.equal(memory.readInt16LE(wheel + 0x72), -6);
  assert.equal(memory.readUInt32LE(0x91d3e4), memory.readUInt32LE(wheel + 0x70)); assert.equal(memory.readUInt32LE(0x91d3e8), memory.readUInt32LE(wheel + 0x74));
});

test('mode8 smoothing divides each input toward zero and other modes preserve the cached steering', () => {
  const runtime = createWheelRenderFixture(3), {memory} = runtime;
  put(memory, a.body + 0x644, -7); put(memory, a.body + 0x648, 7); memory[a.body + 0x718] = 8;
  prepareVehicleWheelRender(a.body, runtime); assert.equal(memory.readInt32LE(a.body + 0x648), 5);
  memory[a.body + 0x718] = 1; put(memory, a.body + 0x644, 65536); prepareVehicleWheelRender(a.body, runtime); assert.equal(memory.readInt32LE(a.body + 0x648), 5);
});

test('front steering and rear zero steering publish actual linked matrices and shifted world offsets', () => {
  const runtime = createWheelRenderFixture(3), {memory} = runtime;
  memory[a.body + 0x718] = 1; memory[a.body + 0x64f] = 0; put(memory, a.body + 0x644, 65536);
  [100, 200, -300].forEach((value, lane) => put(memory, a.body + 0x34 + lane * 4, value));
  for (let index = 0; index < 4; index++) {const wheel = a.body + 0x324 + index * 200; memory[wheel] = 0; word(memory, wheel + 2, 0); put(memory, wheel + 0x78, 0); word(memory, wheel + 0x70, -20); word(memory, wheel + 0x74, 30);}
  prepareVehicleWheelRender(a.body, runtime);
  for (let index = 0; index < 4; index++) {
    const output = a.outputs + index * 0x1000;
    assert.deepEqual(matrix(memory, output + 0xc4), index < 2 ? [-4095, 0, 0, 0, 4096, 0, 0, 0, -4095] : [0, 0, 4096, 0, 4096, 0, -4096, 0, 0]);
    assert.deepEqual([0, 4, 8].map(offset => memory.readInt32LE(output + 0x34 + offset)), [100 - (20 << 16), 200, -300 + (30 << 16)]);
    assert.equal(memory.readUInt32LE(output + 12), memory.readUInt32LE(a.body + 12)); assert.equal(memory.readUInt32LE(output + 0x11c), memory.readUInt32LE(a.body + 0x11c));
  }
  for (let row = 0; row < 3; row++) {assert.equal(memory.readFloatLE(0x91cdc0 + row * 16 + row * 4), 1); assert.equal(memory.readUInt32LE(0x91cdcc + row * 16), 0x53535353);}
});

test('wheel render parent and every numeric child match retained instructions without services', async () => {
  const report = await verifyWheelRenderState({fixtures: 120, output: null});
  assert.equal(report.matched, true); assert.equal(report.instructions, 399); assert.deepEqual(report.externalCalls, []);
  for (const entry of ['41d2b0', '41d460', '432680', '433400', '41d610', '4334b0']) assert.ok(report.actualGameCalls[entry] > 0, entry);
});

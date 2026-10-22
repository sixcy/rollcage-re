import test from 'node:test';
import assert from 'node:assert/strict';
import {createVehicleWheels} from '../src/vehicle-wheel-construction.mjs';
import {prepareVehicleWheelRender} from '../src/wheel-render-state.mjs';
import {createVehicleWheelConstructionFixture, wheelConstructionAddresses as a, verifyVehicleWheelConstruction} from '../tools/verify-vehicle-wheel-construction-instructions.mjs';

const put = (m, p, value) => m.writeInt32LE(value | 0, p), word = (m, p, value) => m.writeUInt16LE(value & 65535, p);
const vector = (m, p) => [0, 4, 8].map(offset => m.readInt32LE(p + offset));
const shorts = (m, p) => [0, 2, 4].map(offset => m.readInt16LE(p + offset));
const wheelAt = index => a.body + 0x324 + index * 200;

test('wheel construction allocates four linked render bodies and preserves byte-sized participant IDs', () => {
  const runtime = createVehicleWheelConstructionFixture(0), {memory: m} = runtime;
  put(m, 0x6e6b44, 510); put(m, a.body + 0x648, -1234567);
  createVehicleWheels(a.body, 0, -1, runtime);
  assert.equal(m.readInt32LE(0x70dcf4), 4 * 384); assert.equal(m.readInt32LE(0x6e6b44), 512);
  for (let index = 0; index < 4; index++) {
    const wheel = wheelAt(index), output = m.readUInt32LE(wheel + 0x6c);
    assert.equal(output, a.arena + index * 384); assert.equal(m.readUInt32LE(output), 0x8c0b);
    assert.equal(m.readUInt32LE(output + 0x164), wheel); assert.equal(m[wheel + 0x9c], 255); assert.equal(m[wheel + 0x9d], index);
    assert.equal(m.readUInt16LE(output + 0x10e), index < 2 ? 510 + index : 65535);
  }
  assert.equal(m.readInt32LE(a.body + 0x644), 0); assert.equal(m[a.body + 0x64f], 0); assert.equal(m.readInt32LE(a.body + 0x648), -1234567);
});

test('authored wheel offsets and parity-mirrored geometry retain native short layout and padding', () => {
  const runtime = createVehicleWheelConstructionFixture(0), {memory: m} = runtime;
  for (let index = 0; index < 4; index++) put(m, wheelAt(index) + 0xa8, -1);
  createVehicleWheels(a.body, 0, 256, runtime);
  for (let index = 0; index < 4; index++) {
    const wheel = wheelAt(index), odd = index & 1;
    assert.deepEqual(shorts(m, wheel + 0x70), [odd ? 33 : -33, 0, index < 2 ? 26 : -26]);
    assert.deepEqual(shorts(m, wheel + 0x84), odd ? [0, -14, -8] : [14, 14, 8]);
    assert.deepEqual(shorts(m, wheel + 0x8c), [-14, 14, odd ? -8 : 8]);
    assert.deepEqual(shorts(m, wheel + 0x94), odd ? [14, 14, -8] : [0, -14, 8]);
    assert.equal(m.readUInt16LE(wheel + 0x76), 0x7799); assert.equal(m.readUInt32LE(wheel + 0xa8), 0xffff7fff);
    assert.equal(m.readInt32LE(wheel + 0x80), 0x240000); assert.equal(m.readInt32LE(wheel + 0xb8), -1); assert.equal(m[wheel + 0x9c], 0);
  }
  for (const offset of [0x3e38, 0x3e00, 0x3e54, 0x3e1c]) assert.deepEqual(vector(m, a.body + offset), [1, 6000, 16]);
});

test('first render consumes incoming offsets and accumulator before authored wheel values replace them', () => {
  const runtime = createVehicleWheelConstructionFixture(0), {memory: m} = runtime;
  put(m, a.body + 0x644, 0); m[a.body + 0x64f] = 0;
  for (let index = 0; index < 4; index++) {const wheel = wheelAt(index); word(m, wheel + 0x70, 10 + index); word(m, wheel + 0x74, 20 + index); word(m, wheel + 2, 128);}
  createVehicleWheels(a.body, 0, 0, runtime);
  for (let index = 0; index < 4; index++) {
    const wheel = wheelAt(index), output = m.readUInt32LE(wheel + 0x6c);
    assert.deepEqual(vector(m, output + 0x34), [(10 + index) << 16, -6 << 16, (20 + index) << 16]);
    assert.equal(m.readInt16LE(wheel + 2), 0); assert.equal(m.readInt16LE(wheel + 0x72), 0);
  }
  prepareVehicleWheelRender(a.body, runtime);
  for (let index = 0; index < 4; index++) assert.deepEqual(vector(m, m.readUInt32LE(wheelAt(index) + 0x6c) + 0x34), [(index & 1 ? 33 : -33) << 16, 0, (index < 2 ? 26 : -26) << 16]);
});

test('coefficients use each signed descriptor and body mass with native root scratch side effects', () => {
  const runtime = createVehicleWheelConstructionFixture(0), {memory: m} = runtime;
  put(m, a.body + 0xa8, 131072);
  for (let index = 0; index < 4; index++) for (let lane = 0; lane < 3; lane++) word(m, a.body + 0x180 + index * 28 + lane * 2, lane ? 0 : -256 * (index + 1));
  createVehicleWheels(a.body, 0, 0, runtime);
  for (let index = 0; index < 4; index++) {
    assert.equal(m.readInt32LE(wheelAt(index) + 0xbc), 131072 * (index + 1) ** 2);
    assert.equal(m.readInt32LE(wheelAt(index) + 0xc0), Math.trunc(65536 / (index + 1)));
  }
  assert.equal(m.readInt32LE(0x91d45c), 1048576); assert.equal(m.readInt32LE(0x91d460), 11);
});

test('model storage publication wraps reference counts and keeps auxiliary model choices live', () => {
  const runtime = createVehicleWheelConstructionFixture(1), {memory: m} = runtime;
  for (const offset of [0, 0x100, 0x200]) word(m, a.model + offset + 10, 65534);
  createVehicleWheels(a.body, runtime.model, 0, runtime);
  for (const offset of [0, 0x100, 0x200]) assert.equal(m.readUInt16LE(a.model + offset + 10), 2);
  for (let index = 0; index < 4; index++) {
    const output = m.readUInt32LE(wheelAt(index) + 0x6c);
    assert.equal(m.readUInt32LE(output + 0x10), a.model); assert.equal(m.readUInt32LE(output + 0x2c), 0x310100); assert.equal(m.readUInt32LE(output + 0x30), 0x310200);
    assert.ok(m.readUInt32LE(output + 0x14) >= output + 384);
  }
});

test('zero descriptor retains allocation and first-wheel mutations before the native division fault', () => {
  const runtime = createVehicleWheelConstructionFixture(0), {memory: m} = runtime;
  m.fill(0, a.body + 0x180, a.body + 0x186); put(m, a.body + 0x644, 1234); m[a.body + 0x64f] = 1;
  assert.throws(() => createVehicleWheels(a.body, 0, 0, runtime), /division by zero/);
  assert.equal(m.readUInt32LE(wheelAt(0) + 0x6c), a.arena); assert.equal(m.readInt32LE(0x70dcf4), 384);
  assert.equal(m.readInt32LE(wheelAt(0) + 0xbc), 0); assert.equal(m.readInt32LE(wheelAt(0) + 0xc0), 0x69696969);
  assert.equal(m.readInt32LE(a.body + 0x644), 1234); assert.equal(m[a.body + 0x64f], 1);
});

test('constructor, model allocation, coefficient boundaries and connected consumers match retained x86', async () => {
  const report = await verifyVehicleWheelConstruction({fixtures: 96, coefficientFixtures: 32, consumerScenarios: 8, output: null});
  assert.equal(report.matched, true); assert.equal(report.ownInstructions, 247); assert.equal(report.cookieChecks, 0);
  assert.ok(report.coefficientStates.completed > 0); assert.ok(report.coefficientStates.divideByZero > 0);
  for (const address of ['41caf0', '4741c0', '474510', '474490', '41ca60', '41c990', '41d2b0', '416400']) assert.ok(report.actualGameCalls[address] > 0, address);
});

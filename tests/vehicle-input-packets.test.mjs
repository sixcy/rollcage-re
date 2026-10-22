import test from 'node:test';
import assert from 'node:assert/strict';
import {pollInputPacket, decodeAnalogVehicleInput, convertInputPacket, transformInputAxis, initializeVehicleInputConstants} from '../src/vehicle-input-packets.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), pointerAddress = 0x10000, statusAddress = 0x11000, config = 0x20000;
  memory.writeUInt32LE(config, 0x5ecefc); memory.writeUInt32LE(2, 0x6e675c); memory.fill(0xa5, statusAddress, statusAddress + 8);
  const calls = [], transformPacket = (packet, status) => {calls.push([packet, Buffer.from(memory.subarray(status, status + 8))]);};
  return {memory, pointerAddress, statusAddress, config, calls, transformPacket};
}
const poll = (f, index = 0) => pollInputPacket(index, f.pointerAddress, f.statusAddress, f);

test('insufficient sample count still clears all eight status bytes, transforms and publishes packet pointer', () => {
  const f = fixture(); f.memory.writeUInt32LE(1, 0x6eafe0); f.memory.writeUInt32LE(1, 0x6e675c); poll(f);
  assert.deepEqual(f.calls, [[0x6e7edc, Buffer.alloc(8)]]); assert.equal(f.memory.readUInt32LE(f.pointerAddress), 0x6e7edc);
});

test('configuration byte37 lowers the network minimum and fallback accepts indices below4', () => {
  const f = fixture(); f.memory.writeUInt32LE(1, 0x6eafe0); f.memory.writeUInt32LE(1, 0x6e675c); f.memory[f.config + 0x37] = 1;
  f.memory.writeBigUInt64LE(0x8877665544332211n, 0x6e7ac4 + 3 * 0x67c); poll(f, 3);
  assert.equal(f.calls[0][1].readBigUInt64LE(), 0x8877665544332211n);
  poll(f, 4); assert.deepEqual(f.calls[1][1], Buffer.alloc(8));
});

test('network current sample requires its availability dword and special override selects fallback', () => {
  const f = fixture(); f.memory.writeUInt32LE(3, 0x6eafe0); f.memory.writeUInt32LE(1, 0x6e7880);
  f.memory.writeBigUInt64LE(0x0123456789abcdefn, 0x6e78b0); f.memory.writeBigUInt64LE(0x1020304050607080n, 0x6e7ac4);
  poll(f); assert.equal(f.calls[0][1].readBigUInt64LE(), 0x0123456789abcdefn);
  f.memory.writeUInt32LE(0, 0x6e7880); poll(f); assert.deepEqual(f.calls[1][1], Buffer.alloc(8));
  f.memory.writeUInt32LE(1, 0x5eb518); poll(f); assert.equal(f.calls[2][1].readBigUInt64LE(), 0x1020304050607080n);
});

test('history selects the closest nonfuture sample within64 ticks and the later equal-distance row wins', () => {
  const f = fixture(); f.memory.writeUInt32LE(0x83, 0x6eafe0); f.memory.writeUInt32LE(1, 0x6e7880); f.memory.writeUInt32LE(1000, 0x6ea69c);
  for (let index = 0; index < 64; index++) {const row = 0x6e7bd8 + index * 12; f.memory.writeUInt32LE(1001, row); f.memory.writeUInt32LE(index, row + 4);}
  f.memory.writeUInt32LE(936, 0x6e7bd8); poll(f); assert.equal(f.calls[0][1].readUInt32LE(), 0);
  for (const index of [5, 20]) f.memory.writeUInt32LE(999, 0x6e7bd8 + index * 12);
  poll(f); assert.equal(f.calls[1][1].readUInt32LE(), 20);
  for (const index of [0, 5, 20]) f.memory.writeUInt32LE(935, 0x6e7bd8 + index * 12);
  poll(f); assert.deepEqual(f.calls[2][1], Buffer.alloc(8));
});

test('post-transform flags and selected index are live and pointer publication follows packet masking', () => {
  const f = fixture(); f.transformPacket = packet => {f.memory.writeUInt32LE(0x81, 0x6eafe0); f.memory.writeInt32LE(-1, 0x6e9f70); f.memory[packet + 3] = 0xa0;};
  poll(f, 1); assert.equal(f.memory[0x6e7edc + 0x67c + 3], 0xaf);
  poll(f, 0); assert.equal(f.memory[0x6e7edc + 3], 0xa0);
  f.pointerAddress = 0x6e7edc + 3; poll(f, 0); assert.equal(f.memory.readUInt32LE(f.pointerAddress), 0x6e7edc);
});

test('status/source overlap retains native forward dword copy order', () => {
  const f = fixture(); f.statusAddress = 0x6e7ac4 + 2; f.memory.writeBigUInt64LE(0x8877665544332211n, 0x6e7ac4); poll(f);
  // Clearing status destroys bytes2..7 first. First copied dword propagates its
  // retained bytes0/1 into bytes2/3; the second read then sees propagated bytes.
  assert.equal(f.calls[0][1].toString('hex'), '1122000000000000');
});

test('analog masks and packet pointers reload between steering, brake and throttle while body stays captured', () => {
  const f = fixture(), body = 0x30000, other = 0x34000, first = 0x40000, second = 0x41000, record = 0x909300;
  f.memory.writeUInt32LE(body, record); f.memory.writeUInt32LE(first, body + 0x724); f.memory[record + 0x25e] = 4;
  f.memory[first + 8] = 10; f.memory[second + 9] = 20; f.memory[second + 10] = 30; const calls = [];
  f.transformAxis = (value, brake) => {calls.push([value, brake]); f.memory.writeUInt32LE(other, record); f.memory.writeUInt32LE(second, body + 0x724); f.memory[record + 0x25e] |= 3; return value + 1;};
  decodeAnalogVehicleInput(0, f);
  assert.deepEqual(calls, [[10, 0], [30, 1], [20, 0]]); assert.deepEqual([...f.memory.subarray(body + 0x708, body + 0x70b)], [11, 21, 31]);
  assert.deepEqual([...f.memory.subarray(other + 0x708, other + 0x70b)], [0, 0, 0]);
});

test('packet conversion preserves individual digital bit permutations and high control word', () => {
  const f = fixture(), packet = 0x40000;
  for (const [input, byte, bit] of [[0x800, 2, 8], [0x100, 2, 1], [0x10, 3, 0x10], [0x40, 3, 0x40], [0x80, 3, 0x80], [0x20, 3, 0x20], [4, 3, 8], [8, 3, 4], [1, 3, 2], [2, 3, 1], [0x1000, 2, 0x10], [0x2000, 2, 0x20], [0x4000, 2, 0x40], [0x8000, 2, 0x80]]) {
    f.memory.writeUInt32LE((0xa55a0000 | input) >>> 0, f.statusAddress); convertInputPacket(0, packet, f.statusAddress, f);
    assert.equal(f.memory[packet + byte], 255 ^ bit); assert.equal(f.memory.readUInt16LE(packet + 4), 0xa55a); assert.equal(f.memory[packet + 1], 0x41);
  }
});

test('analog packet clamps signed samples and keeps opposite longitudinal channels separate', () => {
  const f = fixture(), packet = 0x40000; f.memory.writeUInt16LE(0x87, 0x90955e); f.memory.writeInt32LE(0, f.statusAddress);
  f.memory.writeInt8(-128, f.statusAddress + 5); f.memory.writeInt8(-128, f.statusAddress + 6); convertInputPacket(0, packet, f.statusAddress, f);
  assert.deepEqual([...f.memory.subarray(packet + 8, packet + 11)], [1, 254, 0]);
  f.memory.writeInt8(127, f.statusAddress + 5); f.memory.writeInt8(127, f.statusAddress + 6); convertInputPacket(0, packet, f.statusAddress, f);
  assert.deepEqual([...f.memory.subarray(packet + 8, packet + 11)], [255, 0, 254]);
});

test('rejected conversion initializes exactly12 packet bytes and preserves the remaining storage', () => {
  const f = fixture(), packet = 0x40000; f.memory.fill(0xa5, packet, packet + 32);
  convertInputPacket(4, packet, f.statusAddress, f);
  assert.equal(f.memory.subarray(packet, packet + 12).toString('hex'), '0041ffff0000000000000000');
  assert.deepEqual(f.memory.subarray(packet + 12, packet + 32), Buffer.alloc(20, 0xa5));
});

test('axis response lazily writes129 dwords once and retains center asymmetry', () => {
  const f = fixture(); initializeVehicleInputConstants(f.memory); let calls = 0;
  const pow = (base, exponent) => {calls++; assert.equal(exponent, 2); return Math.pow(base, exponent);};
  assert.equal(transformInputAxis(127, 0, {...f, pow}), 123); assert.equal(calls, 129);
  assert.equal(f.memory.readInt32LE(0x6fb740), 0); assert.equal(f.memory.readInt32LE(0x6fb744), 5); assert.equal(f.memory.readInt32LE(0x6fb940), 129);
  assert.equal(transformInputAxis(128, 0, {...f, pow}), 128); assert.equal(transformInputAxis(129, 0, {...f, pow}), 133); assert.equal(calls, 129);
  assert.equal(f.memory.readUInt32LE(0x6e65b0), 1);
});

test('brake transform uses a signed16 deadzone and returns the original low word outside24', () => {
  const f = fixture(); initializeVehicleInputConstants(f.memory);
  assert.deepEqual([-25, -24, 0, 24, 25, -32768, 32767].map(value => transformInputAxis(value, 1, f)), [65511, 0, 0, 0, 25, 32768, 32767]);
});

test('initialized response tables remain caller-owned and arithmetic wraps before clipping', () => {
  const f = fixture(); f.memory.writeUInt32LE(1, 0x6e65b0); f.memory.writeInt32LE(-2147483648, 0x6fb740); f.memory.writeInt32LE(-2147483648, 0x6fb744);
  assert.equal(transformInputAxis(128, 0, f), 128); assert.equal(transformInputAxis(127, 0, f), 0);
  assert.equal(f.memory.readInt32LE(0x6fb740), -2147483648);
});

test('actual stored sample flows through packet conversion and registered-body analog decoding', () => {
  const f = fixture(), body = 0x30000; initializeVehicleInputConstants(f.memory); delete f.transformPacket;
  f.memory.writeUInt32LE(3, 0x6eafe0); f.memory.writeUInt32LE(1, 0x6e7880); f.memory.writeUInt32LE(body, 0x909300); f.memory.writeUInt16LE(0x87, 0x90955e);
  f.memory.writeInt8(-127, 0x6e78b0 + 5); f.memory.writeInt8(100, 0x6e78b0 + 6);
  pollInputPacket(0, body + 0x724, f.statusAddress, f); decodeAnalogVehicleInput(0, f);
  assert.equal(f.memory.readUInt32LE(body + 0x724), 0x6e7edc);
  assert.deepEqual([...f.memory.subarray(body + 0x708, body + 0x70b)], [0, 0, 200]);
});

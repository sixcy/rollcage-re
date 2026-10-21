import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';

function fixture() {
  const data = Buffer.alloc(0x220);
  data.write('GFXM'); data[0x79] = 3;
  data.writeUInt32LE(0x120, 0x8c); data.writeUInt32LE(0x180, 0x98);
  // The runtime offsets have unrelated authored values in the file.
  data[0x46] = 0xfe; data.writeUInt32LE(0xfffffff0, 0x60);
  const group = (index, count, relative) => {
    const p = 0x120 + index * 12;
    data.writeUInt16LE(count, p); data[p + 2] = index; data[p + 3] = 0xab;
    data[p + 4] = 0x56; data[p + 5] = 0x40 + index;
    data.writeUInt16LE(0x789a, p + 6); data.writeUInt32LE(relative, p + 8);
  };
  group(0, 0, 0); group(1, 3, 0x10); group(2, 2, 0x20);
  for (let i = 0; i < 5; i++) {
    const p = 0x180 + i * 16;
    data.fill(0xa0 + i, p, p + 16);
    data.writeInt16LE(i === 1 ? -32768 : i * 10, p);
    data.writeInt16LE(i === 1 ? 32767 : -i * 10, p + 2);
    data.writeInt16LE(-123 + i, p + 4);
  }
  return data;
}

test('authored route fields map to runtime names without following runtime offsets in the file', () => {
  const data = fixture(), routes = parseRespawnRoutes(data);
  assert.equal(routes.countByte79, 3); assert.equal(routes.countByte46, 3);
  assert.equal(routes.tableOffset, 0x120); assert.equal(routes.pointBaseOffset, 0x180);
  assert.deepEqual(routes.groups.map(group => [group.count, group.reverseByte2, group.byte05, group.pointsOffset]), [[0, 0, 0x40, 0x180], [3, 1, 0x41, 0x190], [2, 2, 0x42, 0x1a0]]);
  assert.deepEqual(routes.groups[1].points[0].position, [-32768, 32767, -122]);
});

test('overlapping point ranges preserve identity and aliases across groups and adjacent reads', () => {
  const routes = parseRespawnRoutes(fixture()), first = routes.groups[1], second = routes.groups[2];
  assert.equal(first.points[1], second.points[0]);
  assert.equal(first.pointAt(1), first.points[1]);
  assert.equal(first.pointAt(-1), routes.pointAtOffset(0x180));
  assert.equal(first.pointAt(3), routes.pointAtOffset(0x1c0));
  second.points[0].position[1] = 77;
  assert.equal(first.points[1].position[1], 77);
});

test('complete serialized group and point bytes survive opaque-field decoding', () => {
  const data = fixture(), before = Buffer.from(data), routes = parseRespawnRoutes(data);
  assert.deepEqual(data, before);
  assert.deepEqual(routes.groups[1].bytes, data.subarray(0x12c, 0x138));
  assert.deepEqual(routes.groups[1].points[0].bytes, data.subarray(0x190, 0x1a0));
  assert.deepEqual([...routes.groups[1].points[0].bytes.subarray(6)], Array(10).fill(0xa1));
  assert.equal(routes.groups[1].bytes[5], routes.groups[1].byte05);
  assert.equal(routes.groups[1].pointRelativeOffset, 0x10);
});

test('empty routes preserve the leading header and zero-count opaque point offset without dereference', () => {
  const data = fixture(); data[0x79] = 1; data.writeUInt32LE(0xffffffff, 0x128);
  const routes = parseRespawnRoutes(data);
  assert.equal(routes.groups.length, 1); assert.equal(routes.groups[0].count, 0);
  assert.deepEqual(routes.groups[0].points, []);
  assert.equal(routes.groups[0].pointRelativeOffset, 0xffffffff);
  assert.throws(() => routes.groups[0].pointAt(0), /resource bounds/);
  data[0x79] = 0;
  assert.deepEqual(parseRespawnRoutes(data).groups, []);
});

test('truncated headers, group tables and point spans fail before reading outside the resource', () => {
  assert.throws(() => parseRespawnRoutes(new Uint8Array(0x220)), /Invalid GFXM/);
  assert.throws(() => parseRespawnRoutes(Buffer.alloc(0x9b)), /Invalid GFXM/);
  const data = fixture(); data.write('NOPE');
  assert.throws(() => parseRespawnRoutes(data), /Invalid GFXM/);
  data.write('GFXM'); data.writeUInt32LE(data.length - 1, 0x8c);
  assert.throws(() => parseRespawnRoutes(data), /group table.*bounds/);
  data.writeUInt32LE(0x120, 0x8c); data.writeUInt32LE(data.length - 16, 0x98);
  assert.throws(() => parseRespawnRoutes(data), /group 1 points.*bounds/);
  data.writeUInt32LE(0x180, 0x98); data.writeUInt16LE(65535, 0x12c);
  assert.throws(() => parseRespawnRoutes(data), /group 1 points.*bounds/);
});

test('adjacent native-readable points retain resource boundaries and reject fractional indices', () => {
  const routes = parseRespawnRoutes(fixture()), group = routes.groups[1];
  assert.throws(() => group.pointAt(-100), /bounds/);
  assert.throws(() => group.pointAt(100), /bounds/);
  assert.throws(() => group.pointAt(0.5), /integer/);
  assert.throws(() => routes.pointAtOffset(0x218), /bounds/);
});

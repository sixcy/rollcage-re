import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { decodeTrackPaths } from '../src/track-paths.mjs';
import { buildViewerBundle } from '../tools/lib/track-viewer-bundle.mjs';
import { pathColor } from '../tools/track-viewer/path-color.mjs';

function fixture() {
  const data = Buffer.alloc(0x250);
  data.write('GFXM'); data[0x79] = 4;
  data.writeUInt32LE(0x100, 0x8c); data.writeUInt32LE(0x180, 0x98);
  // Group zero is meaningful data; group one is empty; group three is a marker.
  for (const [index, count, relative] of [[0, 2, 0], [1, 0, 0xffffffff], [2, 3, 0x20], [3, 1, 0x50]]) {
    data.writeUInt16LE(count, 0x100 + index * 12);
    data.writeUInt32LE(relative, 0x108 + index * 12);
  }
  const positions = [[-32768, 32767, -5], [2, 0, 0], [1, 2, 3], [1, 2, 3], [4, 5, 6], [7, 8, 9]];
  positions.forEach((position, index) => position.forEach((value, axis) => data.writeInt16LE(value, 0x180 + index * 16 + axis * 2)));
  return data;
}

test('stored paths retain group zero, original indices, repeats and isolated markers in terrain coordinates', () => {
  const paths = decodeTrackPaths(fixture());
  assert.equal(paths.status, 'available'); assert.equal(paths.experimental, false);
  assert.deepEqual(paths.groups, [
    { index: 0, offset: 0x100, positions: [[-32768, -32767, 5], [2, 0, 0]] },
    { index: 2, offset: 0x118, positions: [[1, -2, -3], [1, -2, -3], [4, -5, -6]] },
    { index: 3, offset: 0x124, positions: [[7, -8, -9]] }
  ]);
  assert.match(paths.message, /stored point order/);
  assert.equal(pathColor(2), pathColor(paths.groups[1].index));
});

test('empty tables and malformed pointers are nonfatal and keep distinct availability states', () => {
  const data = fixture(); data[0x79] = 0;
  assert.equal(decodeTrackPaths(data).status, 'empty');
  assert.match(decodeTrackPaths(data).message, /No stored path points/);
  for (const [field, value] of [[0x8c, data.length - 1], [0x98, data.length - 1], [0x8c, 0xffffffff]]) {
    const damaged = fixture(); damaged.writeUInt32LE(value, field);
    const paths = decodeTrackPaths(damaged);
    assert.equal(paths.status, 'unavailable'); assert.deepEqual(paths.groups, []);
    assert.match(paths.message, /Path data unavailable:.*bounds/);
  }
  assert.equal(decodeTrackPaths(Buffer.alloc(10)).status, 'unavailable');
});

test('Firebugs caveat accompanies available, empty and malformed paths', () => {
  const empty = fixture(); empty[0x79] = 0;
  for (const data of [fixture(), empty, Buffer.alloc(1)]) {
    const paths = decodeTrackPaths(data, true);
    assert.equal(paths.experimental, true);
    assert.match(paths.message, /Experimental: point interpretation is provisional/);
  }
});

test('packed browser reader matches Node for path positions, bounds failures and metadata', async () => {
  const bundle = await buildViewerBundle(['src/track-paths.mjs', 'tools/track-viewer/byte-buffer.mjs']);
  const damaged = fixture(); damaged.writeUInt32LE(0xffffffff, 0x98);
  for (const data of [fixture(), damaged, Buffer.alloc(1)]) {
    // The bundle's ByteBuffer is a separate class; convert inside its realm.
    const context = { btoa, atob, values: [...data] };
    const result = runInNewContext(`const m = ${bundle};
      m['src/track-paths.mjs'].decodeTrackPaths(m['tools/track-viewer/byte-buffer.mjs'].ByteBuffer.from(values), true)`, context);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), decodeTrackPaths(data, true));
  }
});

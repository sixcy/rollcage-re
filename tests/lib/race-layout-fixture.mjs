import {terrainFixture} from './terrain-fixture.mjs';

// Synthetic authored tables over two synthetic terrain sectors. This fixture
// does not represent an original-process recording.
export function raceLayoutFixture() {
  const data = terrainFixture();
  for (const [offset, value] of [[0x74, 0x1a00], [0x8c, 0x1800], [0x98, 0x1900], [0xa0, 0x1b00], [0xbc, 0x1b40], [0xac, 0x1c00]]) data.writeUInt32LE(value, offset);
  data.writeUInt16LE(1, 0x96); data.writeUInt32LE(1 << 16, 0x1c00);
  data[0x78] = 2; data[0x79] = 2; data[0x95] = 2;
  data.writeUInt16LE(3, 0x180c); data[0x1810] = 1; data[0x1811] = 1;
  for (let i = 0; i < 3; i++) {
    const p = 0x1900 + i * 16;
    [64 + i * 32, -20, -32 - i * 32].forEach((n, axis) => data.writeInt16LE(n, p + axis * 2));
    data[p + 6] = 8; data[p + 7] = 180; data.writeUInt32LE(0x12345678, p + 8); data.writeUInt32LE(0x0c0a0201, p + 12);
  }
  for (let i = 0; i < 2; i++) {
    const p = 0x1b00 + i * 20;
    data[p] = i; data[p + 1] = i; data.writeUInt16LE(i * 32768, p + 2);
    [64 + i * 128, -20, -64].forEach((n, axis) => data.writeInt16LE(n, p + 4 + axis * 2));
    data.writeUInt16LE(0xdead, p + 10); data.writeInt16LE(-16384, p + 16); data.writeUInt16LE(0xab01, p + 18);
    [48 + i * 32, -20, -80].forEach((n, axis) => data.writeInt16LE(n, 0x1a00 + i * 8 + axis * 2)); data.writeUInt16LE(0xbeef, 0x1a06 + i * 8);
    data.set([i, 255, 255, 255], 0x1b40 + i * 4);
  }
  return data;
}

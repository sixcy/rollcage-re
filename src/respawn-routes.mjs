// 44c472..44c4ac relocates GFXM +8c's 12-byte groups using the point base
// at +98. File byte79 becomes runtime-pack byte46; its table becomes +60.
// 47ccc0 skips group zero and reads signed-short XYZ from 16-byte points.
export function parseRespawnRoutes(data) {
  if (!Buffer.isBuffer(data) || data.length < 0x9c || data.toString('ascii', 0, 4) !== 'GFXM') {
    throw Error('Invalid GFXM respawn-route header.');
  }
  const range = (offset, bytes, label) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(bytes) || offset < 0 || bytes < 0 || offset + bytes > data.length) {
      throw Error(`Respawn route ${label} exceeds resource bounds.`);
    }
  };
  const countByte79 = data[0x79], tableOffset = data.readUInt32LE(0x8c), pointBaseOffset = data.readUInt32LE(0x98);
  range(tableOffset, countByte79 * 12, 'group table');
  const pointsByOffset = new Map();
  function pointAtOffset(offset) {
    range(offset, 16, 'point');
    let point = pointsByOffset.get(offset);
    if (!point) {
      point = {offset, bytes: data.subarray(offset, offset + 16),
        position: [0, 2, 4].map(delta => data.readInt16LE(offset + delta))};
      pointsByOffset.set(offset, point);
    }
    return point;
  }
  const groups = Array.from({length: countByte79}, (_, index) => {
    const offset = tableOffset + index * 12, count = data.readUInt16LE(offset);
    const pointRelativeOffset = data.readUInt32LE(offset + 8), pointsOffset = pointBaseOffset + pointRelativeOffset;
    if (count) range(pointsOffset, count * 16, `group ${index} points`);
    const pointAt = pointIndex => {
      if (!Number.isSafeInteger(pointIndex)) throw Error('Respawn route point index must be an integer.');
      // Native direction selection can read an adjacent record outside a
      // one-point group's declared span. Admit exactly resource-readable bytes.
      return pointAtOffset(pointsOffset + pointIndex * 16);
    };
    return {index, offset, count, reverseByte2: data[offset + 2], byte05: data[offset + 5],
      bytes: data.subarray(offset, offset + 12), pointRelativeOffset, pointsOffset,
      points: Array.from({length: count}, (_, pointIndex) => pointAt(pointIndex)), pointAt};
  });
  // countByte46 is the existing post-frame interface's runtime-pack name.
  // The authored producer and untouched resource-relative offsets stay explicit.
  return {countByte79, countByte46: countByte79, tableOffset, pointBaseOffset, groups, pointAtOffset};
}

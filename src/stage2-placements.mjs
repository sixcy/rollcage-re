import { placementMatrix } from './fixed-math.mjs';

// Stage II Extreme FUN_0042f250: cursor = serialized record + 0x26,
// incremented by 0x42. Color starts are byte offsets into GFXM +0x1c,
// whose runs select per-face lighting colors, not material UVs.
// See analysis/stage2-native-live/results/024-loadera-entry.json.
// The loader at 0x42fdcc..0x42fe0c and FUN_00444fd0 use the same
// angle conversion, lookup table and quaternion arithmetic as fixed-math.mjs.
export function parseStage2Placements(data, models) {
  if (!Buffer.isBuffer(data) || data.length < 0x40 || data.toString('ascii', 0, 4) !== 'BTP ') {
    throw new Error('Invalid Stage II BTP placement header.');
  }
  const count = data.readUInt32LE(0x14), offset = data.readUInt32LE(0x28), stride = 66;
  if (offset + count * stride > data.length) throw new Error('Stage II BTP placement records exceed resource bounds.');
  const records = Array.from({ length: count }, (_, index) => {
    const p = offset + index * stride, flags = data.readUInt16LE(p), type = flags & 0x3ff;
    const record = {
      index, offset: p, flags, type,
      position: [8, 10, 12].map(a => data.readInt16LE(p + a)),
      angles: [14, 16, 18].map(a => data.readInt16LE(p + a)),
      raw: Buffer.from(data.subarray(p, p + stride)),
    };
    if (type === 0) {
      record.modelIndex = data[p + 3];
      if (!models[record.modelIndex]) throw new Error(`Stage II placement ${index} references missing model ${record.modelIndex}.`);
      record.colorStarts = [32, 34, 36].map(a => data.readUInt16LE(p + a));
      record.matrix = placementMatrix(record.angles);
    }
    return record;
  });
  return { count, offset, stride, records };
}

// Stage II Extreme FUN_00429c00 selects the per-model material index stream
// from MODL +0x3c. Keys are byte offsets, unlike Rollcage's packed keys.
// Native evidence: stage2-native-live/results/034-modelrenderer.json.
// FUN_00433a10 supplies these eight UV permutations; the frame/state layouts
// are also consumed by FUN_00433b40 (retained results 035 and 066).
const permutations = [[0,1,2,3],[1,3,0,2],[3,2,1,0],[2,0,3,1],
  [2,3,0,1],[3,1,2,0],[1,0,3,2],[0,2,1,3]];

export function readStage2ModelMaterials(data, model) {
  const range = (p, n, label) => {
    if (!Number.isSafeInteger(p) || p < 0 || p + n > data.length) {
      throw new Error(`Stage II model ${label} exceeds resource bounds.`);
    }
  };
  range(0, 0x120, 'material header');
  range(model.offset, 0x50, 'header');
  const materialStart = data.readUInt16LE(model.offset + 0x3c);
  const inline = (materialStart & 0x8000) !== 0;
  const indexTable = inline ? model.offset + (materialStart & 0x7fff)
    : data.readUInt32LE(0xcc) + materialStart * 2;
  const materialTable = inline ? model.offset : data.readUInt32LE(0xd8);
  range(indexTable, model.faceCount * 2, 'UV indices');
  return model.faces.map((face, index) => {
    const key = data.readUInt16LE(indexTable + index * 2), descriptor = materialTable + key;
    range(descriptor, 12, 'UV descriptor');
    const animationWord = data.readUInt16LE(descriptor + 2);
    let uvOffset = descriptor, permutation = 0, animation = null;
    if (animationWord !== 0xffff) {
      const animationIndex = animationWord & 255;
      const animTable = data.readUInt32LE(0xb0), frameTable = data.readUInt32LE(0xb8);
      if (animationIndex >= data[0xb4]) throw new Error('Stage II model UV animation index is unavailable.');
      range(animTable + animationIndex * 24, 24, 'animation state');
      let frame = data.readUInt16LE(animTable + animationIndex * 24 + 6), p = frameTable + frame * 6;
      range(p, 6, 'animation frame');
      if (data.readInt16LE(p + 4) === 0) {
        frame = data.readInt16LE(p); p = frameTable + frame * 6;
        range(p, 6, 'animation redirect');
      }
      const uvIndex = data.readInt16LE(p);
      uvOffset = data.readUInt32LE(0x110) + uvIndex * 16;
      range(uvOffset, 12, 'animated UV record');
      permutation = animationWord >> 8;
      animation = { index: animationIndex, frame, uvIndex, permutation };
    }
    const corners = [[data[uvOffset], data[uvOffset + 1]], [data[uvOffset + 4], data[uvOffset + 5]],
      [data[uvOffset + 8], data[uvOffset + 9]], [data[uvOffset + 10], data[uvOffset + 11]]];
    const order = permutations[permutation] ?? permutations[0], pageWord = data.readUInt16LE(uvOffset + 6);
    return { index, key, descriptor, uvOffset, animationWord, animation, pageWord, page: pageWord & 63,
      uv: order.map(i => corners[i]),
      indices: [face.indices[0] - 1, face.indices[2] - 1, face.indices[1] - 1, ...(face.triangle ? [] : [face.indices[3] - 1])] };
  });
}

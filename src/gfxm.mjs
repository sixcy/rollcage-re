// GFXM model-table and primary MODL/MODC reconstruction.
// Native anchors: asset-formats results 003, 006, 019, 022 and 024.
export function parseGFXM(data) {
  if (!Buffer.isBuffer(data) || data.length < 0x120 || data.toString('ascii', 0, 4) !== 'GFXM') throw new Error('Invalid GFXM header.');
  function range(offset, bytes, label) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + bytes > data.length) throw new Error(`GFXM ${label} exceeds resource bounds.`);
  }
  const modelTable = data.readUInt32LE(0x18), modelSlots = data.readUInt16LE(0x2c);
  range(modelTable, modelSlots * 4, 'model table');
  const models = Array.from({ length: modelSlots }, (_, index) => {
    const offset = data.readUInt32LE(modelTable + index * 4);
    if (!offset) return null;
    range(offset, 0x50, `model ${index} header`);
    const type = data.toString('ascii', offset, offset + 4);
    if (type !== 'MODL' && type !== 'MODC') throw new Error(`Unsupported GFXM model type ${type}.`);
    const vertexCount = data.readUInt16LE(offset + 4), faceCount = data.readUInt16LE(offset + 6);
    const verticesOffset = offset + data.readUInt32LE(offset + 0x40);
    const facesOffset = offset + data.readUInt32LE(offset + 0xc);
    range(verticesOffset, vertexCount * 8, `model ${index} vertices`);
    range(facesOffset, faceCount * 8, `model ${index} faces`);
    const vertices = Array.from({ length: vertexCount }, (_, i) => {
      const p = verticesOffset + i * 8;
      return [data.readInt16LE(p), data.readInt16LE(p + 2), data.readInt16LE(p + 4), data.readInt16LE(p + 6)];
    });
    const faces = Array.from({ length: faceCount }, (_, i) => {
      const p = facesOffset + i * 8, indices = [...data.subarray(p, p + 4)];
      if (indices.some((v, corner) => v > vertexCount || (v === 0 && corner !== 3))) throw new Error(`Invalid vertex index in model ${index}, face ${i}.`);
      return { indices, packedWord: data.readUInt32LE(p + 4), triangle: indices[3] === 0 };
    });
    return { index, offset, type, vertexCount, faceCount, verticesOffset, facesOffset,
      lodOffsets: [data.readUInt16LE(offset + 0x1c), data.readUInt16LE(offset + 0x1e)], vertices, faces };
  });
  return { version: data.readUInt32LE(4), modelTable, modelSlots, models };
}

export function modelToOBJ(model) {
  if (!model) throw new Error('The selected model slot is empty.');
  const lines = ['# Rollcage primary model; original local coordinates.',
    '# Native draw corners: 1,3,2,4; materials, scene placement and LODs are not exported here.',
    `o model_${model.index}`];
  for (const [x,y,z] of model.vertices) lines.push(`v ${x} ${y} ${z}`);
  for (const { indices: [a,b,c,d] } of model.faces) lines.push(d ? `f ${a} ${c} ${d} ${b}` : `f ${a} ${c} ${b}`);
  return lines.join('\n') + '\n';
}

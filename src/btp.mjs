// Redux BTP texture upload reconstruction. Evidence: asset-formats results
// 003, 010, 012, 014, 015 and 016 (loader, upload loop and palette conversion).
export function parseBTP(data) {
  if (!Buffer.isBuffer(data) || data.length < 0x70 || data.toString('ascii', 0, 4) !== 'BTP ') throw new Error('Invalid BTP header.');
  const imageBase = data.readUInt32LE(0x24);
  const textureCount = data.readUInt16LE(0x34);
  const paletteCount = data.readUInt16LE(0x36);
  const textureTable = data.readUInt32LE(0x38);
  const paletteBase = data.readUInt32LE(0x3c);
  function range(offset, bytes, description) {
    if (offset < 0 || bytes < 0 || offset + bytes > data.length) throw new Error(`BTP ${description} exceeds resource bounds.`);
  }
  range(textureTable, textureCount * 12, 'texture table');
  range(paletteBase, paletteCount * 1024, 'palette table');
  const transparentStart = data[0x32], transparentCount = data[0x33];
  const textures = Array.from({ length: textureCount }, (_, index) => {
    const p = textureTable + index * 12;
    const width = data.readUInt16LE(p), height = data.readUInt16LE(p + 2);
    const paletteIndex = data.readUInt16LE(p + 4);
    const pixelOffset = imageBase + data.readUInt32LE(p + 8);
    const empty = width === 0 || height === 0;
    if (width * height > 128 * 1024 * 1024) throw new Error(`Invalid BTP texture dimensions at ${index}.`);
    if (!empty) {
      if (paletteIndex >= paletteCount) throw new Error(`Invalid BTP palette index at texture ${index}.`);
      range(pixelOffset, width * height, `texture ${index} pixels`);
    }
    return { index, width, height, empty, paletteIndex, unknown6: data.readUInt16LE(p + 6), pixelOffset,
      paletteOffset: paletteBase + paletteIndex * 1024,
      transparentBlack: index >= transparentStart && index < transparentStart + transparentCount };
  });
  return { version: data.readUInt32LE(4), imageBase, textureTable, paletteBase,
    textureCount, paletteCount, transparentStart, transparentCount, textures, data };
}

export function decodeBTPTexture(btp, index) {
  const texture = btp.textures[index];
  if (!texture || !Number.isInteger(index)) throw new RangeError('Invalid BTP texture index.');
  if (texture.empty) throw new Error('BTP texture slot is empty; the native uploader skips zero dimensions.');
  const { data } = btp;
  const rgba = Buffer.alloc(texture.width * texture.height * 4);
  for (let i = 0; i < texture.width * texture.height; i++) {
    const paletteIndex = data[texture.pixelOffset + i];
    const p = texture.paletteOffset + paletteIndex * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b;
    const black = r === 0 && g === 0 && b === 0;
    rgba[i * 4 + 3] = black && (texture.transparentBlack || paletteIndex === 0) ? 0 : 255;
  }
  return { width: texture.width, height: texture.height, rgba };
}

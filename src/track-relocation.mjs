//44c46a..44c71d, an owned section of44c2b0, not a separate native callee.
//Raw relocation preserves live table fields and ordered forward aliases.
//scratchBase is the original44c2b0 entry ESP, before its76-byte frame.
export function relocateRaceTrackPointers(header, base, {memory: m, scratchBase}) {
  const frame = scratchBase - 76;
  const get = p => m.readInt32LE(p >>> 0), ptr = p => m.readUInt32LE(p >>> 0);
  const put = (p, value) => m.writeInt32LE(value | 0, p >>> 0);
  const add = (p, value) => put(p, get(p) + value);
  const word = p => m.readUInt16LE(p >>> 0), byte = p => m.readUInt8(p >>> 0);
  const auxiliary = get(header + 0x88) + base | 0;
  const groups = get(header + 0x8c) + base | 0;
  const points = get(header + 0x98) + base | 0;
  put(frame + 0x48, auxiliary); put(frame + 0x3c, groups); put(frame + 0x28, points);
  if (byte(header + 0x79)) {
    for (let i = 0, p = groups + 8; i < byte(header + 0x79); i++, p += 12) add(p, points);
    base = ptr(0x90b970);
  }
  const geometry = get(header + 0x1c) + base | 0;
  for (const offset of [0x4c, 0x24, 0x14, 0x7c, 0x80, 0x18, 0x34, 0x40, 0x3c, 0x20]) add(header + offset, base);
  put(frame + 0x44, geometry);
  put(0x90b980, get(header + 0x4c));
  put(0x909254, get(header + 0x24)); put(frame + 0x30, get(header + 0x24));
  put(0x90b98c, 0x909240);
  if (word(header + 0x66)) {
    const scale = m.readFloatLE(0x5dc888), limit = m.readFloatLE(0x5dca40);
    for (let i = 0; i < word(header + 0x66); i++) for (let channel = 0; channel < 3; channel++) {
      const p = (ptr(header + 0x4c) + i * 4 + channel) >>> 0;
      let value = Math.fround(byte(p) * scale);
      if (!(limit > value)) value = limit;
      const truncated = Number.isFinite(value) && value >= -2147483648 && value < 2147483648 ? Math.trunc(value) : -2147483648;
      m[p] = truncated & 255;
    }
  }
  const normals = get(header + 0x68) + base | 0, modelAuxiliary = get(header + 0xc4) + base | 0;
  for (const offset of [0x6c, 0x70, 0xa8, 0xa4, 0x9c, 0x44, 0x74, 0xf0, 0xe4, 0xe8, 0xf8, 0x100, 0x118, 0xd4, 0x90, 0xc0, 0xec, 0x108, 0x10c, 0xd0]) add(header + offset, base);
  put(frame + 0x38, normals);
  for (let i = 0; i < word(header + 0x2c); i++) {
    const slot = (ptr(header + 0x18) + i * 4) >>> 0;
    if (!get(slot)) continue;
    add(slot, base);
    const model = ptr((ptr(header + 0x18) + i * 4) >>> 0);
    add(model + 0x18, model); add(model + 0xc, model); add(model + 0x40, model); m.writeUInt16LE(0, model + 0xa);
    if (get(model + 0x44)) add(model + 0x44, model);
    for (const offset of [0x1c, 0x1e]) {
      const relative = word(model + offset);
      if (!relative) continue;
      const child = model + relative | 0;
      add(child + 0x18, child); add(child + 0xc, child);
      if (get(child + 0x44)) add(child + 0x44, child);
    }
  }
  const sectors = ptr(header + 0x14); put(frame + 0x24, sectors);
  for (let i = 0; i < get(header + 0x10); i++) {
    const slot = sectors + i * 4;
    add(slot, base);
    for (const offset of [0x50, 0x54, 0x28, 0x3c, 0x58, 0x2c, 0x40, 0x5c, 0x30, 0x44, 0x20]) add(ptr(slot) + offset, base);
    add(ptr(slot) + 0x48, get(header + 0x3c));
    add(ptr(slot) + 0x38, get(header + 0x50) + base | 0);
    const sector = ptr(slot), index = get(sector + 0x4c);
    put(sector + 0x4c, Math.imul(index, 28) + modelAuxiliary);
  }
  return {base, auxiliary, groups, points, geometry, normals, modelAuxiliary, sectors};
}

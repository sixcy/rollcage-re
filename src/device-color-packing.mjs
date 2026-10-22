const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const channel = (m, descriptor, offset, value) => (value >>> (m[descriptor + offset] & 31)) << (m[descriptor + offset + 1] & 31);

//40a1e0 converts exactly256 RGBA palette entries using the renderer's live
//device descriptor. Alpha is zero for black RGB and255 for any nonzero RGB.
export function packDevicePalette16(source, destination, {memory, scratchBase}) {
  const descriptor = ptr(memory, ptr(memory, 0x714ae8) + 0x444), alpha = memory.readInt32LE(descriptor + 0x18) !== 0;
  if (alpha && Number.isInteger(scratchBase)) put(memory, scratchBase - 4, 256);
  for (let index = 0; index < 256; index++) {
    const row = source + index * 4, red = memory[row], green = memory[row + 1], blue = memory[row + 2];
    let packed = alpha ? channel(memory, descriptor, 10, red | green | blue ? 255 : 0) : 0;
    packed |= channel(memory, descriptor, 4, red) | channel(memory, descriptor, 8, blue) | channel(memory, descriptor, 6, green);
    if (alpha && Number.isInteger(scratchBase)) put(memory, scratchBase - 4, 255 - index);
    memory.writeUInt16LE(packed & 65535, destination + index * 2);
  }
}

//40a2f0. The non-colorkey branch preserves the native special first entry:
//when its packed RGB is zero, alpha stays zero even if original RGB was not.
export function packDevicePalette32(source, count, destination, colorKey, {memory, scratchBase}) {
  count |= 0;
  const descriptor = ptr(memory, ptr(memory, 0x714ae8) + 0x444), alpha = memory.readInt32LE(descriptor + 0x18) !== 0;
  const local = Number.isInteger(scratchBase) ? scratchBase - 4 : null;
  if (local !== null) put(memory, local, alpha ? 1 : 0);
  const keyed = colorKey !== 0 && alpha;
  if (count <= 0) return;
  if (local !== null) {
    if (keyed) {put(memory, local, destination); put(memory, scratchBase + 8, source + 1);}
    else put(memory, scratchBase + 8, destination - source - 1);
  }
  for (let index = 0; index < count; index++) {
    const row = source + index * 4, red = memory[row], green = memory[row + 1], blue = memory[row + 2];
    let packed = channel(memory, descriptor, 4, red) | channel(memory, descriptor, 8, blue) | channel(memory, descriptor, 6, green);
    if (alpha) {
      const opacity = keyed ? (red | green | blue ? 255 : 0) : index === 0 && packed === 0 ? 0 : 255;
      packed |= channel(memory, descriptor, 10, opacity);
    }
    put(memory, destination + index * 4, packed);
    if (keyed && local !== null) {put(memory, scratchBase + 8, source + index * 4 + 5); put(memory, local, destination + index * 4 + 4);}
  }
}

import {constructGameTexture} from './game-texture-construction.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, value) => m.writeInt32LE(value | 0, p);

//433550. Count and first mipmapped index arrive in ECX/EDX; the four original
//stack arguments are specialCount, descriptorTable, paletteBase and pixelBase.
//Descriptor width/height/palette are WORDs at0/2/4; pixels are relative DWORD+8.
export function constructTrackTextures(count, firstSpecial, specialCount, descriptors, paletteBase, pixelBase, runtime) {
  const {memory: m, scratchBase: S, entryRegisters = {}} = runtime, frame = S - 24;
  for (const [name, offset] of [['EBX', -12], ['EBP', -16], ['ESI', -20], ['EDI', -24]]) if (Number.isInteger(entryRegisters[name])) put(m, S + offset, entryRegisters[name]);
  put(m, S - 8, firstSpecial); put(m, S + 4, specialCount - 1 + firstSpecial);
  put(m, S + 8, descriptors); put(m, S + 12, paletteBase); put(m, S + 16, pixelBase);
  for (let index = 0, descriptor = descriptors + 8 >>> 0; index < (count | 0); index++, descriptor = descriptor + 12 >>> 0) {
    const palette = (m.readUInt16LE(descriptor - 4) * 1024 + ptr(m, frame + 0x24)) >>> 0;
    const pixels = ptr(m, descriptor) + ptr(m, frame + 0x28) >>> 0;
    const width = m.readUInt16LE(descriptor - 8), height = m.readUInt16LE(descriptor - 6);
    put(m, frame + 0x14, pixels);
    const flags = index < get(m, frame + 0x10) || index > get(m, frame + 0x1c) ? 0 : 1;
    put(m, frame - 4, flags); put(m, frame - 8, palette); put(m, frame - 12, ptr(m, frame + 0x14));
    put(m, frame - 16, 8); put(m, frame - 20, height); put(m, frame - 24, 0x4335b7);
    const context = {...runtime, scratchBase: frame - 24, entryRegisters: {...entryRegisters, EBX: count, EBP: height, ESI: index, EDI: descriptor}};
    if (!constructGameTexture(index, width, height, 8, ptr(m, frame - 12), ptr(m, frame - 8), flags, context)) {
      put(m, ptr(m, 0x5ecefc) + 0x48, 4); return 0;
    }
  }
  return 1;
}

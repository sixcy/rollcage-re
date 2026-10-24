import {nativeGlobalAddress} from './native-global-address.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);

//494140: two12-position histories per participant. History blocks are6d4
//bytes apart; their anchor objects come from body520 and5e8. The renderer's
//interpretation of every header byte remains a separate consumer question.
export function updateVehicleWheelHistories({memory}) {
  if (!Buffer.isBuffer(memory)) throw Error('Vehicle wheel histories require native memory.');
  if (!memory[ptr(memory, 0x5ecb1c) + 0x54d]) return;
  const scale = memory.readFloatLE(0x5dc5f4);
  for (let participant = 0, record = 0x909300; participant < memory[ptr(memory, 0x5ecb1c) + 0x54d]; participant++, record += 0x30c) {
    const body = ptr(memory, record);
    for (let offset = 0; offset <= 16; offset += 4) put(memory, 0x91d360 + offset, get(memory, body + 0xc4 + offset));
    for (let index = 0; index < 9; index++) memory.writeFloatLE(Math.fround(memory.readInt16LE(0x91d360 + index * 2) * scale), nativeGlobalAddress(memory, 0x91cdc0) + Math.floor(index / 3) * 16 + index % 3 * 4);
    const seed = Math.imul(get(memory, 0x5ec958), 0x41a7) & 0x7fffffff;
    put(memory, 0x5ec958, seed); const increment = (seed >>> 16 & 31) + 15;
    for (let side = 0; side < 2; side++) {
      const history = body + 0x2f4c + side * 0x6d4, x = side ? 9 : -8, y = memory.readInt16LE(body + 0xcc) < 0 ? 6 : -6;
      put(memory, 0x91d3e4, x & 65535 | (y & 65535) << 16); put(memory, 0x91d3e8, 0);
      const transformed = [0, 6, 12].map(offset => (Math.imul(memory.readInt16LE(0x91d360 + offset), x) + Math.imul(memory.readInt16LE(0x91d362 + offset), y) | 0) >> 12);
      transformed.forEach((value, axis) => put(memory, 0x91d448 + axis * 4, value));
      const anchor = ptr(memory, body + 0x520 + side * 200), position = transformed.map((value, axis) => (get(memory, anchor + 0x34 + axis * 4) + (value << 16)) | 0);
      const target = history + Math.imul(get(memory, history), 12) + 20;
      //MOVQ captures X/Y together before either byte is written; Z is later.
      put(memory, target, position[0]); put(memory, target + 4, position[1]); put(memory, target + 8, position[2]);
      put(memory, history, get(memory, history) + 1); if (get(memory, history) >= 12) put(memory, history, 0);
      const count = get(memory, history + 4); if (count < 12) put(memory, history + 4, count + 1);
      memory.writeUInt16LE(memory.readUInt16LE(history + 8) + increment & 65535, history + 8);
      if (memory.readInt16LE(history + 8) >= 256) memory.writeUInt16LE(memory.readUInt16LE(history + 8) - 256 & 65535, history + 8);
      memory[history + 10] = memory[history + 10] + 20 & 255;
    }
  }
}

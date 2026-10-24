import {nativeGlobalAddress} from './native-global-address.mjs';
const get = (memory, address) => memory.readInt32LE(address);
const ptr = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);

//417930. Camera rows are184h bytes. Event classes1/3 use the24-entry
//9034a0 table, class2 the six-entry903480 table, class4 one80b5e0 entry.
//These are live world-object pointers, not supplied camera decisions.
export function selectCameraEvent(index, {memory}) {
  const camera = (0x91ff80 + Math.imul(index, 0x184)) >>> 0;
  let kind = get(memory, camera + 0x3c);
  if ((kind === 1 || kind === 3) && get(memory, ptr(memory, 0x9034a0 + memory.readInt16LE(camera + 0x38) * 4) + 0x188) === 0) put(memory, camera + 0x3c, 0);
  if (get(memory, camera + 0x3c) === 2 && get(memory, ptr(memory, 0x903480 + memory.readInt16LE(camera + 0x38) * 4) + 0x194) === 0) put(memory, camera + 0x3c, 0);
  if (get(memory, camera + 0x3c) === 4 && get(memory, ptr(memory, nativeGlobalAddress(memory, 0x80b5e0) + memory.readInt16LE(camera + 0x38) * 4) + 0x188) === 0) put(memory, camera + 0x3c, 0);

  const session = ptr(memory, 0x5ecb1c), mode = memory[session + 0x552];
  let timestamp;
  if (mode) {
    const count = mode === 1 || mode === 2 ? 2 : mode === 3 ? 3 : mode === 4 ? 4 : 1;
    timestamp = 3000;
    for (let other = 0; other < count; other++) {
      const row = 0x920098 + other * 0x184, candidate = ptr(memory, row);
      if (timestamp >= candidate) timestamp = candidate;
      if (get(memory, row - 0xdc) !== 0) return;
    }
  } else {
    if (get(memory, camera + 0x3c) !== 0) return;
    timestamp = ptr(memory, camera + 0x118);
  }
  if (memory[session + 0x58c] === 2 || memory.readInt16LE(camera + 0x32) < 60 || ptr(memory, 0x90a548) < ((timestamp + 600) >>> 0) || memory.readInt16LE(camera + 0x3a) > 0) return;
  const view = get(memory, camera);
  if (view === 16 || view === 15) return;
  for (let event = 0; event < 24; event++) {
    const object = ptr(memory, 0x9034a0 + event * 4);
    if (!(memory[object + 0x188] & 1)) continue;
    kind = get(memory, object + 0x184);
    if (kind !== 0 && kind !== 1) continue;
    put(memory, camera + 0x3c, kind === 1 ? 1 : 3);
    memory.writeUInt16LE(event, camera + 0x38); put(memory, camera, 11); put(memory, camera + 0x20, 0);
    break;
  }
  if (get(memory, camera + 0x3c) !== 0) return;
  for (let event = 0; event < 6; event++) {
    if (!(memory[ptr(memory, 0x903480 + event * 4) + 0x194] & 1)) continue;
    put(memory, camera + 0x3c, 2); memory.writeUInt16LE(event, camera + 0x38); put(memory, camera, 12);
    break;
  }
  if (get(memory, camera + 0x3c) !== 0) return;
  if (memory[ptr(memory, nativeGlobalAddress(memory, 0x80b5e0)) + 0x188] & 1) {
    put(memory, camera + 0x3c, 4); memory.writeUInt16LE(0, camera + 0x38); put(memory, camera, 13);
  }
}

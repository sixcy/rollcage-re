import {removeDynamicLightRanges} from './dynamic-light-state.mjs';
import {removeRawParticleSpatial} from './body-retirement-effects.mjs';

//44ef90: release at most five live WORD handles, stopping at type0. This
//removes type2 spatial membership; it does not free the particle pool record.
export function releaseBodyAttachments(body, runtime) {
  const {memory} = runtime;
  let count = memory.readInt32LE(0x80f20c), handleAddress = body + 0x16a;
  for (let index = 0; index < 5; index++, handleAddress += 2) {
    const handle = memory.readUInt16LE(handleAddress), type = handle >>> 12, id = handle & 4095;
    if (!type) break;
    if (type === 1) {
      const light = id + 1;
      removeDynamicLightRanges(light, runtime);
      memory.writeUInt16LE(0, 0x80f544 + light * 64);
      if (count === id + 2) count = (count - 1) | 0;
    } else if (type === 2) {
      removeRawParticleSpatial(memory.readUInt32LE(0x80e660 + id * 4), runtime);
    } else if (type === 5) {
      const address = memory.readUInt32LE(0x9092b4) + id * 2;
      memory.writeUInt16LE((memory.readUInt16LE(address) & 0xfff2) | 2, address);
    }
    memory.writeUInt16LE(0, handleAddress);
  }
  memory.writeInt32LE(count, 0x80f20c);
}

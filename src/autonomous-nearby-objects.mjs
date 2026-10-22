import {dotQ16, signedShort} from './fixed-integer.mjs';
import {writeAutonomousProgressDirection} from './autonomous-route-geometry.mjs';

//411e70/4125a0 capture the body's high position words before walking its route.
//Tables retain old distances for skipped entries. scratchBase is native entry ESP.
function populate(body, objects, {memory, scratchBase}) {
  const origin = [0x36, 0x3a, 0x3e].map(offset => memory.readInt16LE(body + offset));
  const direction = scratchBase - 12;
  writeAutonomousProgressDirection(direction, 0x909300 + memory.readUInt16LE(body + 0x65e) * 0x30c,
    {memory, scratchBase: scratchBase - (objects ? 60 : 64)});
  if (objects) memory.writeUInt32LE(0, 0x6e651c); else memory[0x6e650e] = 0;
  let index = 0;
  while (objects ? index < memory.readUInt32LE(0x6e6514) : index < 36) {
    const registry = objects ? 0x920b40 + index * 12 : memory.readUInt32LE(0x849a5c) + index * 8;
    const object = memory.readUInt32LE(registry);
    if (objects ? memory[object + 0x19a] !== 5 : memory[registry + 4] !== 0) {
      const delta = [0x36, 0x3a, 0x3e].map((offset, axis) => signedShort(memory.readInt16LE(object + offset) - origin[axis]));
      const distance = delta.reduce((sum, value) => (sum + Math.imul(value, value)) | 0, 0);
      if (!objects) memory.writeInt32LE(distance, 0x920ec0 + index * 4);
      if (distance <= (objects ? 1000000 : 6250000) && dotQ16([0, 4, 8].map(offset => memory.readInt32LE(direction + offset)), delta.map(value => value << 16)) >= 0) {
        const count = objects ? memory.readUInt32LE(0x6e651c) : memory[0x6e650e];
        if (objects) {memory.writeInt32LE(distance, 0x920da0 + index * 4); memory.writeUInt32LE((count + 1) >>> 0, 0x6e651c);}
        else memory[0x6e650e] = (count + 1) & 255;
        memory[(objects ? 0x920e80 : 0x920f60) + count] = index & 255;
      }
    }
    index = (index + 1) & 65535;
  }
}

export function populateAutonomousNearbyBodies(body, context) {populate(body, false, context);}
export function populateAutonomousNearbyObstacles(body, context) {populate(body, true, context);}

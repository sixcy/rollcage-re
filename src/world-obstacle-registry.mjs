const get32 = (memory, address) => memory.readUInt32LE(address);
const put32 = (memory, address, value) => memory.writeInt32LE(value | 0, address);

//44cf99..44cfb7, the append segment of44c2b0 after48ab50 returns.
//This is not a reconstruction of the surrounding resource loader.
export function appendLoadedWorldObstacle(object, {memory}) {
  if (memory[object + 0x19a]) return;
  const count = get32(memory, 0x6e6514);
  put32(memory, (0x920b40 + Math.imul(count, 12)) >>> 0, object);
  put32(memory, 0x6e6514, count + 1);
}

//4123a0 constructs the shared60-entry polygon subset consumed by412870.
//The input obstacle count is captured. Empty/rejected entries still publish
//the retained current pool pointer and zero local polygon count.
export function buildAutonomousObstaclePolygons({memory, maxIterations = 65536}) {
  const count = get32(memory, 0x6e6514); put32(memory, 0x6e6520, 0);
  let poolCursor = 0, budget = maxIterations;
  const step = () => {if (--budget < 0) throw Error('Obstacle polygon producer iteration budget exceeded.');};
  for (let index = 0; index < count; index++) {
    step(); const registry = 0x920b40 + index * 12, object = get32(memory, registry), model = get32(memory, object + 0x10);
    let vertices = get32(memory, object + 0x24); const faces = get32(memory, object + 0x28), descriptors = model + memory.readUInt16LE(model + 0x34);
    let selected = 0, highest = -0xffffff;
    put32(memory, registry + 8, 0x6f95a0 + poolCursor * 4);
    const vertexCount = memory[object + 0x10d];
    if (vertexCount) {
      for (let vertex = 0; vertex < vertexCount; vertex++) {step(); highest = Math.max(highest, memory.readInt16LE(vertices + vertex * 8 + 2));}
      if (highest >= 0) {
        highest -= 24; vertices = get32(memory, object + 0x24);
        let descriptor = descriptors;
        for (let polygon = 0; polygon < memory[model + 0x27]; polygon++, descriptor += 20) {
          step(); const currentObject = get32(memory, registry), metadata = get32(memory, currentObject + 0x194);
          if ((memory[metadata + polygon * 4 + 3] & 15) === 4) continue;
          const start = memory[descriptor + 8], end = memory[descriptor + 9]; let hit = false;
          for (let face = start; face < end && !hit; face++) {
            step(); let packed = memory.readInt32LE(faces + face * 8);
            for (let corner = 0; corner < 4; corner++, packed >>= 8) {
              const vertex = packed & 255;
              if (vertex !== 0 && memory.readInt16LE(vertices - 6 + vertex * 8) > highest) {hit = true; break;}
            }
          }
          poolCursor = get32(memory, 0x6e6520);
          if (hit && poolCursor < 60) {
            selected = (selected + 1) | 0; put32(memory, 0x6f95a0 + poolCursor * 4, descriptor);
            poolCursor++; put32(memory, 0x6e6520, poolCursor);
          }
        }
      }
    }
    put32(memory, registry + 4, selected);
  }
}

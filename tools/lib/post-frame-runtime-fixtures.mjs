import {createRespawnRuntime} from '../../src/respawn-runtime.mjs';

//Declared scene/session/route inputs for connected callers. This deliberately
//does not claim that47ea40 loaded the installed authored scene into these roots.
export function configurePostFrameFixture(f, fixture, scratchBase, {ordinary = false, forcePrepass = false} = {}) {
  const {memory, views} = f, put = (p, v) => memory.writeInt32LE(v | 0, p);
  const pack = memory.readUInt32LE(0x90b98c), session = memory.readUInt32LE(0x5ecb1c), groups = 0x9c000, points = 0x9d000, controllers = 0x9e000, checkpoints = 0x9f000, ids = 0x9f100;
  memory[session + 0x54d] = ordinary ? 0 : f.bodies.length; memory[session + 0x551] = fixture % 7 === 0 ? 0 : fixture % 3 ? 3 : 8;
  memory[session + 0x586] = 3; put(session + 0x57c, 4); memory[session + 0x579] = 0;
  memory[pack + 0x46] = 3; put(pack + 0x60, groups); put(pack + 0x80, f.addresses.regions);
  memory[pack + 0x44] = 2; put(pack + 0x70, checkpoints); put(0x9092b0, checkpoints); put(pack + 0x90, ids); put(pack + 0x1c, f.addresses.normals);
  for (let cp = 0; cp < 2; cp++) {
    const p = checkpoints + cp * 20; memory[p + 1] = cp; memory.writeUInt16LE(cp ? 32768 : 0, p + 2);
    memory.writeInt16LE(cp ? -200 : -100, p + 4); memory.writeInt16LE(64, p + 12); memory[p + 18] = cp ? 0 : 1;
    memory.fill(255, ids + cp * 4, ids + cp * 4 + 4); memory[ids + cp * 4] = cp;
  }
  for (let group = 1; group <= 2; group++) {
    memory.writeUInt16LE(4, groups + group * 12); memory[groups + group * 12 + 2] = fixture % 3 === 1 ? 1 : 0;
    memory[groups + group * 12 + 5] = group; put(groups + group * 12 + 8, points + group * 128);
    for (let point = 0; point < 4; point++) {
      const position = [2 + point * 14, [-30, -6, 0, 6][fixture % 4], 2 + (group - 1) * 16];
      position.forEach((value, axis) => memory.writeInt16LE(value, points + group * 128 + point * 16 + axis * 2));
    }
  }
  for (const [index, body] of f.bodies.entries()) {
    put(body.address, memory.readInt32LE(body.address) & ~511 | (ordinary ? 11 : 3));
    put(body.address + 0x164, controllers + index * 64); put(controllers + index * 64, body.address);
    put(0x909318 + index * 0x30c, controllers + index * 64);
    memory[body.address + 0x718] = fixture % 2 ? 8 : 0;
    memory[session + 8 + index] = 5; memory[0x909300 + index * 0x30c + 0x248] = fixture % 5 ? 0 : 90;
    memory[0x909300 + index * 0x30c + 0x1c] = 1; memory[0x909300 + index * 0x30c + 0x1e] = 1; put(body.address + 0x660, 0);
  }
  if (forcePrepass) memory.writeInt16LE(-1024, f.addresses.header + 0x14);
  const progression = createRespawnRuntime({memory, recordCount: f.bodies.length, bodyStorage: f.bodies.map(body => ({address: body.address, length: 0x4000})), scratchBase});
  return {memory, views, grid: f.context.nativeTerrain.grid, models: f.models, modelPointersFor: f.candidateMapping.modelPointersFor, progression, scratchBase, roundingMode: 'nearest-even'};
}

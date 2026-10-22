import {autonomousRouteGroup} from './autonomous-route-geometry.mjs';
export const autonomousCandidateAddress = index => 0x91f1e0 + Math.imul(index, 52);

//4209d0 deliberately clears only these18 bytes of each52-byte row.
export function resetAutonomousCandidates({memory}) {
  for (let index = 0; index < 20; index++) {
    const row = autonomousCandidateAddress(index);
    for (const offset of [0, 36, 44, 48]) memory.writeInt32LE(0, row + offset);
    memory.writeUInt16LE(0, row + 42);
  }
}

//420f90 applies authored point bit20 only near the direction's starting end.
export function applyAutonomousCandidateEntryBias(body, lowestFree, {memory}) {
  const flags = memory.readUInt32LE(body + 0x6ec);
  const tier = Math.floor(((memory.readUInt32LE(body + 0x6f8) >>> 18) & 7) / 2);
  const pack = memory.readUInt32LE(0x90b98c), groups = memory.readUInt32LE(pack + 0x60);
  for (let index = 19; index > lowestFree; index--) {
    const row = autonomousCandidateAddress(index), groupIndex = memory.readUInt16LE(row);
    if (!groupIndex) continue;
    const pointIndex = memory[row + 2], group = groups + groupIndex * 12;
    const pointFlags = memory.readUInt32LE(memory.readUInt32LE(group + 8) + pointIndex * 16 + 8);
    if (!(pointFlags & 0x20)) continue;
    const currentGroup = autonomousRouteGroup(groupIndex, {memory}), count = memory.readUInt16LE(currentGroup);
    if (count >= 5 && (memory[currentGroup + 2] ? count - pointIndex - 1 >= 5 : pointIndex >= 5)) continue;
    const change = (flags & 0x400) && tier >= ((pointFlags >>> 28) & 3) ? 20 : -10;
    memory.writeInt32LE((memory.readInt32LE(row + 44) + change) | 0, row + 44);
  }
}

//420a90 reuses linked candidates' EXTRA score (+30), scanning all20 rows. Its
//found flags persist even when a later link improves the other branch's value.
export function linkedAutonomousCandidateScore(groupIndex, pointIndex, {memory}) {
  const group = autonomousRouteGroup(groupIndex, {memory});
  const links = memory.readUInt32LE(memory.readUInt32LE(group + 8) + (pointIndex & 65535) * 16 + 12);
  const first = links & 31, firstPoint = (links >>> 5) & 511;
  const second = (links >>> 14) & 31, secondPoint = (links >>> 19) & 511;
  let foundFirst = first === 0, foundSecond = second === 0, best = -50000;
  if (foundFirst && foundSecond) return 0;
  for (let index = 0; index < 20; index++) {
    const row = autonomousCandidateAddress(index), group = memory.readUInt16LE(row);
    if (group) {
      if (memory[row + 2] === firstPoint && group === first && best < memory.readInt32LE(row + 48)) {best = memory.readInt32LE(row + 48); foundFirst = true;}
      else if (memory[row + 2] === secondPoint && group === second && best < memory.readInt32LE(row + 48)) {best = memory.readInt32LE(row + 48); foundSecond = true;}
      if (foundFirst && foundSecond) return best;
    }
  }
  return best === -50000 ? 0 : best;
}

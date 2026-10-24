import {nativeGlobalAddress} from './native-global-address.mjs';
//491330 appends to the original20-slot ring, reserving one empty slot. The
//caller may mark a group visited even when the full ring drops that enqueue.
export function enqueueAutonomousRoute(group, pointIndex, {memory}) {
  const tail = memory.readUInt16LE(0x6e6cc0), head = memory.readUInt16LE(0x6e6cc4);
  if (tail === head - 1 || (tail === 19 && head === 0)) return;
  memory.writeUInt16LE(group & 65535, nativeGlobalAddress(memory, 0x80df60) + tail * 2);
  memory.writeUInt16LE(pointIndex & 65535, nativeGlobalAddress(memory, 0x80df20) + tail * 2);
  memory.writeUInt16LE(tail + 1 === 20 ? 0 : tail + 1, 0x6e6cc0);
}

//47fc90 follows both packed point links. This is reachability, not shortest
//path or best-branch selection. scratchBase denotes native entry ESP.
export function canReachAutonomousRoute(targetGroup, sourceGroup, pointIndex, {memory, scratchBase}) {
  targetGroup &= 65535; sourceGroup &= 65535; pointIndex &= 65535;
  const groups = memory.readUInt32LE(memory.readUInt32LE(0x90b98c) + 0x60);
  const linksAt = (group, index) => memory.readUInt32LE(memory.readUInt32LE(groups + group * 12 + 8) + index * 16 + 12);
  const initial = linksAt(sourceGroup, pointIndex), first = initial & 31, second = (initial >>> 14) & 31;
  if (sourceGroup === targetGroup || first === targetGroup || second === targetGroup) return 1;
  const visited = scratchBase - 132;
  for (let index = 1; index < 64; index++) memory.writeUInt16LE(0, visited + index * 2);
  memory.writeUInt16LE(sourceGroup, visited);
  memory.writeUInt16LE(0, 0x6e6cc4); memory.writeUInt16LE(0, 0x6e6cc0);
  let visitedCount = 1;
  if (first) {memory.writeUInt16LE(first, visited + visitedCount++ * 2); enqueueAutonomousRoute(first, (initial >>> 5) & 511, {memory});}
  if (second) {memory.writeUInt16LE(second, visited + visitedCount++ * 2); enqueueAutonomousRoute(second, (initial >>> 19) & 511, {memory});}
  let tail = memory.readUInt16LE(0x6e6cc0), head = 0;
  if (!tail) return 0;
  while (true) {
    const slot = head;
    head = head + 1 === 20 ? 0 : head + 1;
    memory.writeUInt16LE(head, 0x6e6cc4);
    const links = linksAt(memory.readUInt16LE(nativeGlobalAddress(memory, 0x80df60) + slot * 2), memory.readUInt16LE(nativeGlobalAddress(memory, 0x80df20) + slot * 2));
    const candidates = [[links & 31, (links >>> 5) & 511], [(links >>> 14) & 31, (links >>> 19) & 511]];
    if (candidates[0][0] === targetGroup || candidates[1][0] === targetGroup) return 1;
    for (const [group, index] of candidates) {
      if (!group) continue;
      let seen = false;
      for (let entry = 0; entry < 64; entry++) if (memory.readUInt16LE(visited + entry * 2) === group) {seen = true; break;}
      if (seen) continue;
      memory.writeUInt16LE(group, visited + visitedCount++ * 2);
      if (tail !== head - 1 && (tail !== 19 || head !== 0)) {
        memory.writeUInt16LE(index, nativeGlobalAddress(memory, 0x80df20) + tail * 2); memory.writeUInt16LE(group, nativeGlobalAddress(memory, 0x80df60) + tail * 2);
        tail = tail + 1 === 20 ? 0 : tail + 1; memory.writeUInt16LE(tail, 0x6e6cc0);
      }
    }
    if (tail === head) return 0;
  }
}

//47fc20 resets the failure byte when connected. After60 failures it copies
//the progression route/index into the body reloaded from the racer record.
export function updateAutonomousRouteConsistency(body, {memory, scratchBase}) {
  const record = 0x909300 + memory.readUInt16LE(body + 0x65e) * 0x30c;
  const target = memory.readUInt16LE(body + 0x6c0), source = memory[memory.readUInt32LE(record + 0x54) + 5], index = memory.readUInt16LE(record + 0x58);
  if (canReachAutonomousRoute(target, source, index, {memory, scratchBase: scratchBase - 16})) {memory[body + 0x6d8] = 0; return;}
  memory[body + 0x6d8] = (memory[body + 0x6d8] + 1) & 255;
  if (memory[body + 0x6d8] > 60) {
    const progression = memory.readUInt32LE(record + 0x54), registered = memory.readUInt32LE(record);
    memory.writeUInt16LE(memory[progression + 5], registered + 0x6c0);
    memory.writeUInt16LE(memory.readUInt16LE(record + 0x58), registered + 0x6c2);
  }
}

import {autonomousRouteGroup, stepRoutePoint} from './autonomous-route-geometry.mjs';

const ROWS = 0x91f1e0;
const dword = (memory,address,value) => memory.writeInt32LE(value | 0,address);
const word = (memory,address,value) => memory.writeUInt16LE(value & 65535,address);
const point = (memory,group,index) => memory.readUInt32LE(group + 8) + (index & 65535) * 16;
const budgetAt = (memory,address,tier) => {
  const value = memory[address + 10] & 15;
  return tier < 2 && value > 1 ? value - 1 : value;
};

// 421260. Append to descending52-byte rows; freeIndexAddress is live, not a
// copied count. Route references remain16bit for walking but row point IDs are8bit.
export function appendAutonomousRouteCandidates(groupIndex, pointIndex, freeIndexAddress, budget, tier, {memory,scratchBase}) {
  groupIndex &= 65535; pointIndex >>>= 0; budget &= 255; tier &= 255;
  const group = autonomousRouteGroup(groupIndex,{memory});
  let free = memory.readInt32LE(freeIndexAddress);
  if (free < 0) return;
  const disabled = memory[group + 3] !== 0 ? 1 : 0;
  let current = pointIndex, address = point(memory,group,current);
  budget = Math.min(budget,budgetAt(memory,address,tier));
  const output = scratchBase - 12, currentAddress = scratchBase - 8, budgetAddress = scratchBase - 4;
  dword(memory,currentAddress,current); dword(memory,budgetAddress,budget);
  let row = ROWS + free * 52;
  memory[row + 2] = current;
  word(memory,row,groupIndex);
  memory[row + 38] = disabled;
  memory[row + 36] = budget;
  memory[row + 39] = 0;
  let tag = memory[address + 8] & 3;
  if (tag) word(memory,row + 42,tag); // Zero deliberately retains the old tag.
  if (!stepRoutePoint(group,memory.readUInt32LE(currentAddress),output,{memory},true)) memory[row + 38] = 1;
  free = memory.readInt32LE(freeIndexAddress) - 1; dword(memory,freeIndexAddress,free);
  if (free < 0) return;
  for (;;) {
    if (budget === 0) break;
    // This is the inlined491390 walk. It reads group bytes and point pointer anew.
    const last = (memory.readUInt16LE(group) - 1) & 65535, cyclic = memory[group + 4] !== 0;
    current = memory.readUInt32LE(currentAddress);
    if (memory[group + 2] === 0) {
      if ((current & 65535) === last) {if (!cyclic) break; current = 0;}
      else current = (current + 1) & 65535;
    } else if ((current & 65535) === 0) {if (!cyclic) break; current = last;}
    else current = (current - 1) & 65535;
    address = point(memory,group,current); dword(memory,currentAddress,current);
    const pointBudget = budgetAt(memory,address,tier), previous = memory[budgetAddress];
    budget = previous - 1 < pointBudget ? (previous - 1) & 255 : pointBudget;
    dword(memory,budgetAddress,budget);
    row = ROWS + free * 52;
    word(memory,row,groupIndex);
    memory[row + 38] = disabled;
    memory[row + 2] = current;
    memory[row + 36] = budget;
    memory[row + 39] = 0;
    tag = memory[address + 8] & 3;
    if (tag) word(memory,row + 42,tag);
    free--; dword(memory,freeIndexAddress,free);
    if (free < 0) return;
  }
  if (!stepRoutePoint(group,memory.readUInt32LE(currentAddress),output,{memory})) {
    const lastAllocated = memory.readInt32LE(freeIndexAddress) + 1;
    word(memory,ROWS + lastAllocated * 52 + 38,0x101);
  }
}

// 4210b0. Walk allocated rows backwards, discovering both packed route links.
// scratchBase is native ENTRY ESP. The live64-word visited list avoids rescans;
// row group0 suppresses link expansion, including when it is the initial group.
export function buildAutonomousRouteCandidates(body, groupIndex, pointIndex, {memory,scratchBase}) {
  if (!Number.isInteger(scratchBase)) throw Error('Route candidate building requires native entry scratchBase.');
  groupIndex &= 65535; pointIndex &= 65535;
  const freeAddress = scratchBase - 0x90, budgetAddress = scratchBase - 0x8c, tierAddress = scratchBase - 0x88, visited = scratchBase - 0x84;
  dword(memory,freeAddress,19);
  const initialPoint = point(memory,autonomousRouteGroup(groupIndex,{memory}),pointIndex);
  const tier = memory[body + 0x6f1]; memory[tierAddress] = tier;
  for (let index=1;index<64;index++) word(memory,visited + index*2,0);
  word(memory,visited,groupIndex);
  memory[budgetAddress] = budgetAt(memory,initialPoint,tier);
  const append = (group,index) => appendAutonomousRouteCandidates(group,index,freeAddress,memory[budgetAddress],memory[tierAddress],{memory,scratchBase:scratchBase-0xb0});
  append(groupIndex,pointIndex);
  let visitedWrite = visited + 2;
  const unseen = group => {
    for(let index=0;index<64;index++) if(memory.readUInt16LE(visited+index*2)===group) return false;
    word(memory,visitedWrite,group); visitedWrite += 2; return true;
  };
  for (let index=19;index>memory.readInt32LE(freeAddress);index--) {
    const row = ROWS + index*52, currentGroup = memory.readUInt16LE(row);
    if (currentGroup === 0) continue;
    const address = point(memory,autonomousRouteGroup(currentGroup,{memory}),memory[row+2]);
    memory[budgetAddress] = memory[row+36];
    let links = memory.readUInt32LE(address+12), linkedGroup = links & 31;
    if (linkedGroup !== 0 && unseen(linkedGroup)) append(linkedGroup,(links>>>5)&511);
    links = memory.readUInt32LE(address+12); linkedGroup = (links>>>14)&31;
    if (linkedGroup !== 0 && unseen(linkedGroup)) append(linkedGroup,(links>>>19)&511);
  }
  return memory.readInt32LE(freeAddress);
}

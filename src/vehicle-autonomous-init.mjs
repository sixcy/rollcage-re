import {buildAutonomousObstaclePolygons} from './world-obstacle-registry.mjs';
import {initializeVehicleContactProfile} from './vehicle-contact-profile.mjs';
import {updateAutonomousProfilePlan} from './autonomous-profile-plan.mjs';

const pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const next = seed => Math.imul(seed, 0x41a7) & 0x7fffffff;

//420270. scratchBase is native ENTRY ESP. Keep the two byte lists in their
//actual local storage: they can alias session/global/body bytes supplied by a
//caller, and removing the first candidate is a forward overlapping byte move.
export function initializeAutonomousCompetitorOwners({memory, scratchBase}) {
  if (!Number.isInteger(scratchBase)) throw Error('Competitor initialization requires native entry ESP.');
  const session = pointer(memory, 0x5ecb1c), first = scratchBase - 20, second = scratchBase - 12;
  put(memory, 0x91f6a8, -1); memory.writeUInt16LE(65535, 0x91f6ac);
  const count = memory[session + 0x54d];
  let firstCount = 0, secondCount = 0;
  for (let index = 0; index < count; index++) {
    if (memory[session + index] === 8) {
      if (memory[session + index + 0x1c] !== 6) memory[second + secondCount++] = index;
    } else memory[first + firstCount++] = index;
  }
  if (!firstCount || firstCount > 2 || !secondCount) return;
  const initial = memory[first]; put(memory, scratchBase - 24, initial);
  const alternate = firstCount === 1 ? initial : memory[first + 1];
  //These original local DWORD writes overlap the first list after it is read.
  const owner = memory.readInt32LE(scratchBase - 24);
  const seed = next(memory.readInt32LE(0x5ea4d4)); put(memory, first, alternate);
  put(memory, 0x5ea4d4, seed);
  const selected = Math.imul(seed >>> 15, secondCount) >>> 16;
  memory[0x91f6a8 + memory[second + selected]] = owner & 255;
  if (secondCount <= 1) return;
  secondCount--;
  for (let index = selected; index < secondCount; index++) memory[second + index] = memory[second + index + 1];
  const remainingOwner = memory.readInt32LE(first), secondSeed = next(seed);
  put(memory, 0x5ea4d4, secondSeed);
  const selectedAgain = Math.imul(secondSeed >>> 15, secondCount) >>> 16;
  memory[0x91f6a8 + memory[second + selectedAgain]] = remainingOwner & 255;
}

//491ee0. Re-read the live route table and group count at each native iteration.
export function initializeAutonomousRouteFlags({memory}) {
  const mode = memory[pointer(memory, 0x5ecb1c) + 0x551];
  if (mode === 3 || mode === 8) return;
  const routes = pointer(memory, 0x90b98c);
  if (memory[routes + 0x46] <= 1) return;
  for (let index = 1; ; index++) {
    const group = pointer(memory, routes + 0x60) + index * 12;
    if (memory.readUInt16LE(group) <= 20 && memory[group + 4] === 1) memory[group + 4] = 0;
    if (index + 1 >= memory[routes + 0x46]) break;
  }
}

//410060. ECX is a participant record, whose first DWORD is the body pointer.
//The captured body remains the reset/profile target even if a descendant
//changes *record. The small route assignment deliberately reloads *record.
export function initializeVehicleAutonomousState(record, {memory, scratchBase}) {
  if (!Number.isInteger(scratchBase)) throw Error('Vehicle autonomous initialization requires native entry ESP.');
  const firstInitialization = memory[0x6e650d] === 0, body = pointer(memory, record);
  for (let offset = 0x6c0; offset < 0x700; offset += 16) memory.fill(0, body + offset, body + offset + 16);
  memory.fill(0, body + 0x700, body + 0x708);
  if (firstInitialization) {
    const session = pointer(memory, 0x5ecb1c), forced = memory[session + 0x58c] === 1;
    put(memory, 0x5ea4d4, memory.readInt32LE(session + 0x618));
    const kind = forced ? 0 : memory[session + 0x551];
    put(memory, 0x5ea4d8, forced || kind === 2 || kind === 4 || kind === 6 || kind === 7 ? 2 : memory[session + 0x585]);
    buildAutonomousObstaclePolygons({memory});
    const mode = memory[session + 0x579]; put(memory, 0x920f84, mode < 3 ? 0 : mode < 6 ? 1 : mode > 9 ? 3 : 2);
    initializeAutonomousCompetitorOwners({memory, scratchBase: scratchBase - 12});
    initializeAutonomousRouteFlags({memory}); memory[0x6e650d] = 1;
  }
  if (memory[pointer(memory, 0x90b98c) + 0x46] > 1) {
    const route = pointer(memory, record + 0x54), current = pointer(memory, record);
    memory.writeUInt16LE(memory[route + 5], current + 0x6c0);
    memory.writeUInt16LE(memory.readUInt16LE(record + 0x58), current + 0x6c2);
  }
  put(memory, body + 0x6c4, 0x40);
  for (const offset of [0x6c8, 0x6cc, 0x6d0, 0x6d4]) put(memory, body + offset, 0);
  memory[body + 0x6d8] = 0; memory[body + 0x6d9] = memory[body + 0x65e];
  for (const offset of [0x6fc, 0x700, 0x704]) put(memory, body + offset, 0);
  const identifier = memory.readUInt16LE(body + 0x65e);
  memory[body + 0x6db] = 0; put(memory, body + 0x6dc, 0); put(memory, body + 0x6e0, 0);
  memory[body + 0x6f3] = memory[0x91f6a8 + identifier]; put(memory, body + 0x6e4, 0); memory.writeUInt16LE(0, body + 0x6e8);
  initializeVehicleContactProfile(body, {memory});
  updateAutonomousProfilePlan(body, 1, {memory, scratchBase});
}

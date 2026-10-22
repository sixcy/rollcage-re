// Scheduled AI policy generation, Redux 41f900 and its complete numeric callees.
// Addresses are native virtual addresses in the caller-supplied byte memory.
const RECORDS = 0x909300;
const next = seed => Math.imul(seed, 0x41a7) & 0x7fffffff;
const roll7 = seed => (Math.imul(seed >>> 15, 7) >>> 16) & 255;
const dword = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const session = memory => memory.readUInt32LE(0x5ecb1c);
const record = (memory, body) => RECORDS + memory.readUInt16LE(body + 0x65e) * 0x30c;
const step = memory => {
  const seed = next(memory.readInt32LE(0x5ea4d4));
  dword(memory, 0x5ea4d4, seed);
  return seed;
};
const flag = (memory, address, bit, enabled) => dword(memory, address, (memory.readInt32LE(address) & ~bit) | (enabled ? bit : 0));

// Original unsigned16 probabilities at5705f0 (407-profile-thresholds evidence).
export function initializeAutonomousProfileTables(memory) {
  Buffer.from('00000080999933b3cccc66e633f3ffff', 'hex').copy(memory, 0x5705f0);
  return memory;
}

// 434960. Prefer the closest car ahead (negative own-minus-other distance),
// falling back to the smallest positive distance. Own progression/count are captured.
export function updateNearestAutonomousCompetitor(body, {memory}) {
  const ownIndex = memory.readUInt16LE(body + 0x65e), own = RECORDS + ownIndex * 0x30c;
  const ownProgress = ((memory[own + 0x1c] << 16) + memory.readInt32LE(own + 0x24)) | 0;
  const count = memory[session(memory) + 0x54d];
  let selected = 255, distance = 0x70000000;
  for (let index = 0; index < count; index++) {
    if (index === ownIndex) continue;
    const candidate = RECORDS + index * 0x30c;
    if (memory[memory.readUInt32LE(candidate) + 0x718] !== 10) continue;
    const delta = (ownProgress - (memory[candidate + 0x1c] << 16) - memory.readInt32LE(candidate + 0x24)) | 0;
    if (distance > 0 ? delta < distance : delta <= 0 && delta > distance) {selected = index; distance = delta;}
  }
  dword(memory, body + 0x6dc, distance);
  memory[body + 0x6da] = selected;
  return {index: selected, distance};
}

// 420090. Tier changes wrap as bytes before the final unsigned clamp.
export function updateAutonomousProfileTier(body, {memory}) {
  const mode = memory.readInt32LE(0x5ea4d8);
  if (mode === 2) {memory[body + 0x6f1] = 4; return;}
  if (mode === 1) {
    let tier = 3;
    if (memory[body + 0x6da] !== 255) {
      const special = memory[session(memory) + memory.readUInt16LE(body + 0x65e) + 0x1c] === 6;
      tier += memory.readInt32LE(body + 0x6dc) < (special ? -8000 : -16000) ? 1 : 0;
    }
    memory[body + 0x6f1] = tier;
  } else if (mode === 0) {
    const difficulty = memory.readUInt32LE(0x920f84);
    memory[body + 0x6f1] = difficulty === 0 ? 0 : difficulty === 1 ? 1 : 2;
  }
  const own = record(memory, body), leader = memory.readInt8(body + 0x6f3);
  if (leader === -1) return;
  const other = RECORDS + leader * 0x30c;
  const gap = (((memory[other + 0x1c] - memory[own + 0x1c]) << 16) - memory.readInt32LE(own + 0x24) + memory.readInt32LE(other + 0x24)) | 0;
  if (gap > 32000) memory[body + 0x6f1] += 2;
  else if (gap > 16000) memory[body + 0x6f1]++;
  if (memory[body + 0x6f1] > 4) memory[body + 0x6f1] = 4;
}

// 41fd20. Last-lap progress adds one or two to the bit2 probability.
export function updateAutonomousLapPolicy(body, {memory}) {
  const lapLimit = memory[session(memory) + 0x586], own = record(memory, body);
  let probability = (memory.readUInt32LE(body + 0x6f4) >>> 9) & 7;
  if (memory.readUInt32LE(0x90a548) < 350) {flag(memory, body + 0x6ec, 2, false); return;}
  if (probability !== 0) {
    const bonus = memory[own + 0x1c] === lapLimit ? 1 + (memory.readInt32LE(own + 0x24) >= 32768 ? 1 : 0) : 0;
    probability = Math.min(7, probability + bonus);
  }
  flag(memory, body + 0x6ec, 2, roll7(step(memory)) < probability);
}

const gapPolicy = (state, shift, bit, memory) => {
  let probability = (memory.readUInt32LE(state + 0x34) >>> shift) & 7;
  const gap = memory.readInt32LE(state + 0x1c);
  if (memory[state + 0x1a] !== 255 && probability !== 0) probability += gap < -32768 ? 2 : gap < -16384 ? 1 : gap > 32768 ? -2 : gap > 16384 ? -1 : 0;
  probability = Math.max(0, Math.min(7, (probability << 24) >> 24));
  flag(memory, state + 0x2c, bit, roll7(step(memory)) < probability);
};
export function updateAutonomousGapPolicy4(state, {memory}) {gapPolicy(state, 15, 4, memory);} // 41fde0
export function updateAutonomousGapPolicy8(state, {memory}) {gapPolicy(state, 18, 8, memory);} // 41fe80

// 41ff20. The threshold is captured before either output flag is written.
export function updateAutonomousPairedPolicy(state, {memory}) {
  const first = next(memory.readInt32LE(0x5ea4d4));
  const threshold = memory.readUInt16LE(0x5705f0 + (memory[state + 0x38] & 7) * 2);
  const second = next(first);
  dword(memory, 0x5ea4d4, second);
  flag(memory, state + 0x2c, 0x80, ((first >>> 15) & 65535) < threshold);
  flag(memory, state + 0x2c, 0x100, ((second >>> 15) & 65535) < threshold);
}

// 41ff90. Native tests only the low byte of the shifted random value.
export function updateAutonomousTierPolicy(body, {memory}) {
  const tier = memory[body + 0x6f1];
  if (tier === 4) {flag(memory, body + 0x6ec, 0x200, false); return;}
  let shift = tier <= 2 ? 2 : tier === 3 ? 3 : 15;
  if (memory[session(memory) + memory.readUInt16LE(body + 0x65e) + 0x1c] === 6) shift++;
  const value = ((step(memory) >>> 15) << (shift & 31)) >>> 16;
  flag(memory, body + 0x6ec, 0x200, (value & 255) === 0);
}

// 41fb30. Competitor gaps fold into [-32768,32768], retaining the native
// signed32 arithmetic at both overflow boundaries rather than JS remainder.
export function updateAutonomousTrafficPolicy(body, modeFlag, {memory}) {
  let probability = (memory.readUInt32LE(body + 0x6f8) >>> 18) & 7;
  const ownIndex = memory.readUInt16LE(body + 0x65e), own = RECORDS + ownIndex * 0x30c, currentSession = session(memory);
  if (memory[currentSession + 0x585] === 2 && memory[currentSession + 0x58c] !== 1 && !(memory[own + 0x249] & 1)) {flag(memory, body + 0x6ec, 0x400, false); return;}
  if ((modeFlag | 0) === 0) {
    const count = memory[currentSession + 0x54d], ownProgress = ((memory[own + 0x1c] << 16) + memory.readInt32LE(own + 0x24)) | 0;
    let category = 0;
    for (let index = 0; index < count; index++) {
      if (index === ownIndex) continue;
      const candidate = RECORDS + index * 0x30c;
      if (memory[memory.readUInt32LE(candidate) + 0x718] === 8) continue;
      let gap = ((memory[candidate + 0x1c] << 16) - ownProgress + memory.readInt32LE(candidate + 0x24)) | 0;
      if (gap > 32768) gap = (gap - 65536 - ((gap - 32769) & 0xffff0000)) | 0;
      if (gap < -32768) gap = (gap + 65536 + ((-32769 - gap) & 0xffff0000)) | 0;
      category = Math.max(category, gap > 1000 ? 1 : gap > 200 ? 2 : gap > -3000 ? 3 : 1);
    }
    probability = Math.max(0, probability - [0, 5, 3, 0][category]);
  }
  flag(memory, body + 0x6ec, 0x400, roll7(step(memory)) < probability);
}

// 41fa90. Gated paths consume no random transition.
export function updateAutonomousGapGatePolicy(state, {memory}) {
  const probability = (memory.readUInt32LE(state + 0x38) >>> 21) & 7, tier = memory[state + 0x31];
  const selected = memory[state + 0x1a] !== 255, gap = memory.readInt32LE(state + 0x1c);
  const blocked = tier === 4 ? !selected || gap < 16384 : tier === 3 ? !selected || gap < 2048 : selected && gap < -4096;
  flag(memory, state + 0x2c, 0x800, blocked ? false : roll7(step(memory)) < probability);
}

// 41f7b0. Eight profile distributions consume zero to three RNG transitions.
export function updateAutonomousProfileCountdown(state, {memory}) {
  const selector = memory[state + 0x37] & 7;
  if (selector === 0) {memory[state + 0x30] = 255; return;}
  const first = next(memory.readInt32LE(0x5ea4d4));
  let seed = first, value;
  if (selector === 7) value = 128 - (first >>> 24);
  else {
    const second = next(first); seed = second;
    if (selector === 1) value = 255 - (second >>> 26) - (first >>> 26);
    else if (selector === 2) value = 255 - (second >>> 26) - (first >>> 25);
    else if (selector === 3) value = 255 - (second >>> 25) - (first >>> 25);
    else if (selector === 4) {seed = next(second); value = 255 - (seed >>> 26) - (first >>> 25) - 31 - (second >>> 25);}
    else if (selector === 5) value = 255 - (second >>> 25) - (first >>> 24) - 63;
    else value = 255 - (second >>> 26) - (first >>> 24) - 94;
  }
  dword(memory, 0x5ea4d4, seed);
  memory[state + 0x30] = value;
}

// 4201b0. The early clock gate deliberately leaves the previous byte intact.
export function updateAutonomousProfileRate(body, modeFlag, {memory}) {
  const gap = memory.readInt32LE(body + 0x6dc), tier = memory[body + 0x6f1];
  if ((modeFlag | 0) !== 0 || tier === 4) {memory[body + 0x6f2] = 15; return;}
  if (memory.readUInt32LE(0x90a548) < 378) return;
  if (memory[body + 0x6da] === 255) {memory[body + 0x6f2] = 7; return;}
  memory[body + 0x6f2] = gap > 16384 ? 5 : gap > 8192 ? 6 : gap > -32768 ? 7 : 8;
  if (tier === 2 || tier === 3) memory[body + 0x6f2]++;
  if (memory[session(memory) + memory.readUInt16LE(body + 0x65e) + 0x1c] === 6) memory[body + 0x6f2]++;
}

// 41f900. scratchBase is optional native ENTRY ESP; its saved mode dword is
// reread for both late callees. Memory owns session/registry/profile/RNG aliases.
export function updateAutonomousProfilePlan(body, modeFlag, {memory, scratchBase}) {
  const state = body + 0x6c0, options = {memory};
  if (scratchBase !== undefined) dword(memory, scratchBase - 4, modeFlag);
  const savedMode = () => scratchBase === undefined ? modeFlag | 0 : memory.readInt32LE(scratchBase - 4);
  if ((modeFlag | 0) === 0) updateNearestAutonomousCompetitor(body, options);
  else memory[body + 0x6da] = 255;
  updateAutonomousProfileTier(body, options);
  const clock = memory.readUInt32LE(0x90a548);
  if (clock < 350) flag(memory, state + 0x2c, 1, false);
  else {
    const seed = step(memory), probability = (memory.readUInt32LE(state + 0x34) >>> 6) & 7;
    flag(memory, state + 0x2c, 1, roll7(seed) < probability);
  }
  updateAutonomousLapPolicy(body, options);
  updateAutonomousGapPolicy4(state, options);
  updateAutonomousGapPolicy8(state, options);
  let seed = next(memory.readInt32LE(0x5ea4d4));
  flag(memory, state + 0x2c, 0x10, roll7(seed) < ((memory.readUInt32LE(state + 0x34) >>> 12) & 7));
  if (clock < 350) flag(memory, state + 0x2c, 0x20, true);
  else {
    seed = next(seed);
    flag(memory, state + 0x2c, 0x20, roll7(seed) < ((memory.readUInt32LE(state + 0x34) >>> 21) & 7));
  }
  seed = next(seed); dword(memory, 0x5ea4d4, seed);
  flag(memory, state + 0x2c, 0x40, roll7(seed) < ((memory.readUInt32LE(state + 0x34) >>> 27) & 7));
  updateAutonomousPairedPolicy(state, options);
  updateAutonomousTierPolicy(body, options);
  updateAutonomousTrafficPolicy(body, savedMode(), options);
  updateAutonomousGapGatePolicy(state, options);
  updateAutonomousProfileCountdown(state, options);
  updateAutonomousProfileRate(body, savedMode(), options);
}

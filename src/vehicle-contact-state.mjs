const get = (memory, address) => memory.readInt32LE(address);
const pointer = (memory, address) => memory.readUInt32LE(address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);

//41f490: per-opponent accumulation and exclusive owner transfer. The session
//count and the initiating body's threshold are captured before the scan.
export function addVehicleContactScore(body, other, amount, {memory}) {
  const id = memory.readUInt16LE(other + 0x65e), address = body + 0x6fc + id * 2;
  const previous = memory.readUInt16LE(address), limit = (65535 - amount) | 0;
  word(memory, address, previous < limit ? previous + amount : 65535);
  const bit = (1 << (id & 31)) & 255;
  if (memory[body + 0x6db] & bit) return;
  const threshold = memory.readUInt16LE(0x570580 + ((pointer(memory, body + 0x6f8) >>> 12) & 7) * 2);
  if (memory.readUInt16LE(address) < threshold) return;
  memory[body + 0x6db] |= bit;
  if (memory[body + 0x6f3] !== 255) return;
  const ownId = memory.readUInt16LE(body + 0x65e), count = memory[pointer(memory, 0x5ecb1c) + 0x54d];
  let best = 0, bestScore = 0;
  for (let index = 0; index < count; index++) {
    if (index === ownId || index === id) continue;
    const candidate = pointer(memory, 0x909300 + index * 0x30c);
    if (memory.readInt8(candidate + 0x6f3) !== id) continue;
    const candidateThreshold = memory.readUInt16LE(0x570580 + ((pointer(memory, candidate + 0x6f8) >>> 12) & 7) * 2);
    const score = memory.readUInt16LE(candidate + 0x6fc + id * 2) - candidateThreshold;
    if (!best || score < bestScore) {best = candidate; bestScore = score;}
  }
  if (best && memory.readUInt16LE(address) - threshold > bestScore) {
    memory[best + 0x6f3] = 255; memory[body + 0x6f3] = id & 255;
  }
}

//41f410: unsigned-short decrement, profile-dependent half amount and bit clear.
export function subtractVehicleContactScore(body, other, amount, {memory, scratchBase}) {
  const id = memory.readUInt16LE(other + 0x65e), profile = (pointer(memory, body + 0x6f8) >>> 12) & 7;
  amount = (amount & 65535) >>> (profile > 5 ? 1 : 0);
  if (Number.isInteger(scratchBase)) word(memory, scratchBase + 4, amount);
  const address = body + 0x6fc + id * 2, previous = memory.readUInt16LE(address);
  word(memory, address, previous > amount ? previous - amount : 0);
  const bit = (1 << (id & 31)) & 255;
  if ((memory[body + 0x6db] & bit) && memory.readUInt16LE(address) < memory.readUInt16LE(0x570580 + profile * 2)) memory[body + 0x6db] &= ~bit;
}

//41f5f0 /41f630 tail-call adapters. They replace the live stack argument.
export function updateVehicleContactForObject(body, target, kind, adding, runtime) {
  const {memory, scratchBase} = runtime;
  if (!target || (memory[target + 0x718] === 8) === adding || (kind !== 12 && kind !== 17)) return;
  const amount = kind === 12 ? 150 : 25;
  if (Number.isInteger(scratchBase)) memory.writeInt32LE(amount, scratchBase + 4);
  if (adding) addVehicleContactScore(body, target, amount, runtime);
  else subtractVehicleContactScore(target, body, amount, runtime);
}

//41f380: collision-triggered autonomous recovery timer. This uses the distinct
//5ea4d4 random stream and byte profile table published at91f6a0.
export function triggerVehicleContactRecovery(body, intensity, {memory}) {
  const profile = (pointer(memory, body + 0x6f8) >>> 9) & 7;
  if (intensity < 20 || (memory.readUInt16LE(body + 0x6c4) & 0x3ff)) return;
  const difficulty = get(memory, 0x5ea4d8), offset = difficulty === 0 ? 10 : difficulty === 1 ? 8 : 4;
  const seed = Math.imul(get(memory, 0x5ea4d4), 0x41a7) & 0x7fffffff;
  const duration = ((memory[pointer(memory, 0x91f6a0) + profile] + 1) * (seed >>> 15)) >>> 16;
  memory.writeInt32LE(seed, 0x5ea4d4); word(memory, body + 0x6c6, duration + 30 + offset); word(memory, body + 0x6c4, 0x100);
}

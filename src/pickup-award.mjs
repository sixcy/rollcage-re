import probabilityBytes from './pickup-probabilities.json' with {type: 'json'};

export function initializePickupProbabilityTables(memory) {
  const bytes = Buffer.from(probabilityBytes.bytes_hex, 'hex'), start = Number(probabilityBytes.address);
  if (!Buffer.isBuffer(memory) || memory.length < start + bytes.length) throw Error('Pickup probability tables exceed supplied runtime memory.');
  bytes.copy(memory, start);
  return memory;
}
const address = value => value >>> 0;
const bodyFor = (memory, record) => memory.readUInt32LE(address(record));
const sessionFor = memory => memory.readUInt32LE(0x5ecb1c);
const vehicles = memory => memory.readUInt8(sessionFor(memory) + 0x54d);
const byte = (memory, pointer) => memory.readUInt8(address(pointer));

// 47b920 performs weighted pickup selection, availability restrictions, slot
// assignment and optional packet construction. The native return is void;
// the returned selection summary is JavaScript diagnostic information only.
export function awardWeightedPickup(record, {memory, packetAddress, handlers = {}, maxIterations = 100000} = {}) {
  const rank = byte(memory, record + 0x1d) - 1, body = bodyFor(memory, record);
  const seed = Math.imul(memory.readInt32LE(0x5ec954), 0x41a7) & 0x7fffffff;
  memory.writeInt32LE(seed, 0x5ec954);
  const random = (Math.imul(seed >>> 15, 0x7fff) >>> 16) % 100;
  const mode = byte(memory, sessionFor(memory) + 0x551);
  let candidate = 0, remainder = random, rejectedChoices = 0, iterations = 0;
  const probability = () => {
    let pointer;
    switch (mode) {
      case 1: case 7: candidate = 4; return 100;
      case 2: {
        const index = memory.readUInt16LE(body + 0x65e), reference = address(0x90960c - Math.imul(index, 0x30c));
        const delta = (((byte(memory, record + 0x1c) << 16) - (byte(memory, reference + 0x1c) << 16)
          - memory.readInt32LE(reference + 0x24)) + memory.readInt32LE(record + 0x24)) | 0;
        const row = delta > 0x7fff ? 0 : delta > 0 ? 1 : delta <= -0x7fff ? 3 : 2;
        pointer = 0x574ec0 + row * 8; break;
      }
      case 3: case 8: pointer = 0x574eb4; break;
      case 5: case 6:
        pointer = byte(memory, body + 0x718) === 8 ? 0x575030 + Math.imul(rank, 8)
          : 0x574f10 + Math.imul((rank + Math.imul(memory.readInt32LE(0x6e9f68), 6)) | 0, 8);
        break;
      default:
        pointer = (byte(memory, body + 0x718) === 8 ? 0x575030 : 0x574ee0) + Math.imul(rank, 8);
        break;
    }
    return byte(memory, pointer + candidate);
  };
  const available = () => {
    let count;
    switch (candidate) {
      case 0:
        count = byte(memory, 0x903502);
        for (let index = 0, length = vehicles(memory); index < length; index++) {
          const other = bodyFor(memory, 0x909300 + index * 0x30c);
          if (byte(memory, other + 0x68c) === 0) count++;
          if (byte(memory, other + 0x68d) === 0) count++;
        }
        return count < 2;
      case 1: case 4: case 5: return true;
      case 2:
        count = byte(memory, 0x903501);
        for (let index = 0, length = vehicles(memory); index < length; index++) {
          const otherRecord = 0x909300 + index * 0x30c, other = bodyFor(memory, otherRecord);
          if (byte(memory, other + 0x68c) === 2 || byte(memory, other + 0x68d) === 2) {
            count++;
            if ((mode === 3 || mode === 8) && record === otherRecord) return false;
          }
        }
        return count < 6;
      case 3:
        if (memory.readInt32LE(0x90cb80) !== 0) return false;
        for (let index = 0, length = vehicles(memory); index < length; index++) {
          const other = bodyFor(memory, 0x909300 + index * 0x30c);
          if (byte(memory, other + 0x68c) === 3 || byte(memory, other + 0x68d) === 3) return false;
        }
        return true;
      case 6: {
        count = 0; let own = false;
        for (let index = 0, length = vehicles(memory); index < length; index++) {
          const otherRecord = 0x909300 + index * 0x30c, other = bodyFor(memory, otherRecord);
          if (byte(memory, other + 0x68c) === 6 || byte(memory, other + 0x68d) === 6
            || (memory.readUInt32LE(other + 0x6bc) !== 0xffffffff && byte(memory, memory.readUInt32LE(other + 0x6bc)) === 1)) {
            count++; if (record === otherRecord) own = true;
          }
        }
        return count < 2 && !own;
      }
      case 7:
        count = byte(memory, 0x903503);
        for (let index = 0, length = vehicles(memory); index < length; index++) {
          const other = bodyFor(memory, 0x909300 + index * 0x30c);
          if (byte(memory, other + 0x68c) === 7) count++;
          if (byte(memory, other + 0x68d) === 7) count++;
        }
        return count < 1;
      default: return false;
    }
  };
  for (;;) {
    if (++iterations > maxIterations) throw Error('Weighted pickup selection exceeded the explicit iteration bound.');
    const weight = probability();
    if (remainder < weight) {
      if (available()) break;
      if (++rejectedChoices > 8) {candidate = 4; break;}
    }
    remainder = Math.max(0, (remainder - weight) | 0);
    candidate = ((candidate + 1) % 8) | 0;
  }
  const result = {item: candidate & 255, random, rejectedChoices, iterations, slot: null, networkSent: false};
  let flags = memory.readUInt32LE(0x6eafe0);
  const index = memory.readUInt16LE(body + 0x65e);
  if ((flags & 1) && (flags & 128)) {
    const selected = memory.readInt32LE(0x6e9f70);
    if (index !== (selected === -1 ? 0 : selected)) return result;
  }
  let slot;
  if (byte(memory, body + 0x68d) === 255) slot = 0x68d;
  else if (byte(memory, body + 0x68c) === 255) slot = 0x68c;
  else return result;
  memory[body + slot] = candidate & 255; result.slot = slot;
  flags = memory.readUInt32LE(0x6eafe0);
  const liveIndex = memory.readUInt16LE(body + 0x65e);
  if (!(flags & 1) || !(flags & 6) || !(flags & 128) || liveIndex > 5) return result;
  if (!Number.isInteger(packetAddress)) throw Error('Pickup notification requires retained12-byte packet storage.');
  if (typeof handlers.call4a0420 !== 'function') throw Error('Pickup notification requires call4a0420.');
  let packed = memory.readUInt32LE(packetAddress + 8) & (slot === 0x68c ? 0xffff8020 : 0xffff8000);
  packed |= ((candidate & 31) << 10) | (liveIndex & 31) | (slot === 0x68c ? 32 : 0);
  memory[packetAddress] = 0x90; memory.writeInt32LE(packed, packetAddress + 8);
  handlers.call4a0420({memory, ecx: 1, edx: packetAddress, args: [12, 18]});
  result.networkSent = true;
  return result;
}

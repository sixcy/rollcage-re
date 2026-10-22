import {divideQ16, multiplyQ16} from './fixed-integer.mjs';

// 420500: rank-gap handling producer, called after race progress/ranking.
// scratchBase is native entry ESP. The rank table is deliberately not cleared:
// missing/duplicate ranks retain caller storage, including live pointer aliases.
export function updateRaceHandlingScale({memory, scratchBase, maxIterations = 65536}) {
  const local = scratchBase - 0x38, ranks = local + 0x18;
  const read = address => memory.readUInt32LE(address);
  const write = (address, value) => memory.writeInt32LE(value | 0, address);
  let budget = maxIterations;
  const step = () => {if (--budget < 0) throw Error('Race handling scale iteration budget exceeded.');};
  let session = read(0x5ecb1c);
  write(local + 0x14, 0);
  if (memory[session + 0x551] === 4 || memory[session + 0xa87] === 0) {
    let index = 0, record = 0x909300;
    if (memory[session + 0x54d] === 0) return;
    do {
      step(); const body = read(record); record += 0x30c; index++;
      write(body + 0x2f38, 0x10000040);
    } while (index < memory[session + 0x54d]);
    return;
  }
  const count = memory[session + 0x54d];
  for (let index = 0, record = 0x909300; index < count; index++, record += 0x30c) {
    step(); write(ranks + memory[record + 0x1d] * 4, record);
  }
  let removed = 0;
  if (count !== 0) {
    for (let index = 0; index < count; index++) {
      step(); write(local + 0x10, ranks + (index + 1) * 4);
      const record = read(ranks + (index + 1) * 4);
      if (!record) break;
      if (memory[record + 0x249] & 1) {
        if (index + 1 < count) {
          for (let next = index + 1; next < count; next++) write(ranks + next * 4, read(ranks + (next + 1) * 4));
          removed = read(local + 0x14);
        }
        removed = (removed + 1) >>> 0;
        write(ranks + count * 4, 0); write(local + 0x14, removed); index--;
      }
      write(local + 0x10, ranks + (index + 2) * 4);
    }
    session = read(0x5ecb1c);
  }
  if (removed === count) return;
  const leader = read(ranks + 4);
  let leaderProgress = ((memory[leader + 0x1c] << 16) + memory.readInt32LE(leader + 0x24)) | 0;
  write(local + 0x10, leaderProgress);
  if (count - removed === 0) return;
  let index = 0;
  do {
    step(); const record = read(ranks + (index + 1) * 4), body = read(record);
    const gap = (leaderProgress - (memory[record + 0x1c] << 16) - memory.readInt32LE(record + 0x24)) | 0;
    write(body + 0x6e0, gap);
    let scale = 0x4000;
    if (gap <= 0x2000) {
      const quotient = divideQ16(gap << 16, 0x20000000);
      write(ranks, quotient); scale = multiplyQ16(quotient, 0x4000);
      session = read(0x5ecb1c); leaderProgress = memory.readInt32LE(local + 0x10);
    }
    scale = ((scale + 0x10000) | 0) >> 4;
    index++; memory.writeUInt16LE(scale & 65535, body + 0x2f3a); memory.writeUInt16LE(0x40, body + 0x2f38);
  } while (index < ((memory[session + 0x54d] - read(local + 0x14)) >>> 0));
}

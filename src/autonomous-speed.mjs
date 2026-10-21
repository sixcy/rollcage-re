import {abs32, dotQ16} from './fixed-integer.mjs';
import {writeAutonomousProgressDirection} from './autonomous-route-geometry.mjs';

const vector = (memory, address) => [0, 4, 8].map(offset => memory.readInt32LE(address + offset));
const setBits = (memory, body, bits) => memory.writeInt32LE(memory.readInt32LE(body + 0x710) | bits, body + 0x710);

//430e90 takes metadata from the first flagged wheel, including a null-record
//early return. It does not continue searching for another non-null contact.
export function readAutonomousSurfaceIndex(body, {memory}) {
  for (let wheel = 0; wheel < 4; wheel++) if (memory[body + 0x324 + wheel * 200] & 1) {
    const record = memory.readUInt32LE(body + 0x198 + wheel * 28);
    return record ? (memory.readUInt32LE(record + 12) >>> 8) & 31 : 0;
  }
  return 0;
}

//430fc0 chooses the longitudinal input bits using route alignment, surface
//metadata, signed speed and the authored point's unsigned target-speed word.
export function updateAutonomousSpeed(body, targetSpeed, {memory, scratchBase, handlers = {}}) {
  targetSpeed &= 65535;
  const record = 0x909300 + memory.readUInt16LE(body + 0x65e) * 0x30c;
  const speed = memory.readInt16LE(body + 0x668);
  const surface = readAutonomousSurfaceIndex(body, {memory}), skill = memory[body + 0x6f1];
  let limit, secondary;
  if (surface <= 10) {limit = 200; secondary = 100;}
  else if (memory.readInt32LE(body + 0x3cf8) < -5000 || (memory.readInt32LE(body + 0x3cf8) < 1000 && memory[memory.readUInt32LE(0x5ecb1c) + 0x553])) {
    limit = 40; secondary = skill > 1 ? 40 : 100;
  } else {limit = 100; secondary = 100;}
  const forward = [0xc8, 0xce, 0xd4].map(offset => memory.readInt16LE(body + offset) << 4);
  forward.forEach((value, axis) => memory.writeInt32LE(value, scratchBase - 24 + axis * 4));
  (handlers.progressDirection ?? writeAutonomousProgressDirection)(scratchBase - 12, record, {memory, scratchBase: scratchBase - 56});
  const alignment = dotQ16(vector(memory, scratchBase - 24), vector(memory, scratchBase - 12));
  let opposed = false;
  if (alignment < 45000) {
    if (dotQ16(vector(memory, scratchBase - 24), vector(memory, body + 0x68)) < 0) {
      if (skill > 1) setBits(memory, body, 0x80);
      setBits(memory, body, 0x40); opposed = true;
    } else if (alignment < 32768) {
      if (skill < 2) {if (speed < secondary) setBits(memory, body, 0x40);}
      else {setBits(memory, body, 0x80); setBits(memory, body, speed < secondary ? 0x40 : 0x10);}
    } else if (speed < limit) setBits(memory, body, 0x40);
  } else if (targetSpeed === 510 || (memory.readUInt32LE(body + 0x6ec) & 0x200)) setBits(memory, body, 0x40);
  else if (speed < targetSpeed) setBits(memory, body, 0x40);
  else if (speed > targetSpeed + 100 && abs32(memory.readInt32LE(body + 0x644)) < 32000) setBits(memory, body, 0x80);
  const angularLimit = surface >= 20 ? 2000000 : surface >= 10 ? 3000000 : 4000000;
  if (!opposed && speed > limit && abs32(memory.readInt32LE(body + 0x50)) > angularLimit) {
    memory.writeInt32LE(memory.readInt32LE(body + 0x710) & ~0x40, body + 0x710);
  }
}

//420390 applies opponent-relative pacing after steering. The opponent byte is
//signed. A -1 value may select the first bit in6db under session conditions.
export function limitAutonomousPacing(body, {memory}) {
  const own = 0x909300 + memory.readUInt16LE(body + 0x65e) * 0x30c;
  let opponent = memory.readInt8(body + 0x6f3), selectedFromMask = false;
  if (memory[body + 0x6f1] === 4) return;
  if (opponent === -1) {
    const session = memory.readUInt32LE(0x5ecb1c), mask = memory[body + 0x6db];
    if (memory[own + 0x1c] === memory[session + 0x586] || !mask) return;
    const count = memory[session + 0x54d];
    opponent = 0;
    while (opponent < count && !((mask >>> (opponent & 31)) & 1)) opponent++;
    if (opponent >= count) return;
    selectedFromMask = true;
  }
  const other = (0x909300 + Math.imul(opponent, 0x30c)) >>> 0;
  const otherSpeed = memory.readInt16LE(memory.readUInt32LE(other) + 0x668);
  const gap = (((memory[other + 0x1c] - memory[own + 0x1c]) << 16) - memory.readInt32LE(own + 0x24) + memory.readInt32LE(other + 0x24)) | 0;
  if (gap > -800) return;
  let shift, minimum, subtraction;
  if (gap > -1500) {shift = 0; minimum = 350; subtraction = 10;}
  else if (gap > -3000) {shift = 0; minimum = 330; subtraction = 20;}
  else if (gap > -8000) {shift = 1; minimum = 300; subtraction = 50;}
  else if (gap > -16000) {shift = 1; minimum = 250; subtraction = 100;}
  else {shift = 2; minimum = 250; subtraction = 150;}
  if (selectedFromMask) {
    subtraction <<= 2;
    if (subtraction > 100) return;
    minimum -= 100;
  }
  const adjustment = Math.max(0, ((memory.readInt32LE(body + 0x6a8) - 0x60000) | 0) >> (shift + 9));
  const ceiling = Math.max(minimum, (otherSpeed - subtraction + adjustment) | 0);
  if (memory.readInt16LE(body + 0x668) > ceiling) memory.writeInt32LE(memory.readInt32LE(body + 0x710) & ~0x40, body + 0x710);
}

import {abs32, dotQ16, multiplyQ16} from './fixed-integer.mjs';
import {scaleContactVector} from './body-contact-friction.mjs';
import {autonomousRouteGroup, stepRoutePoint} from './autonomous-route-geometry.mjs';
import {measureAutonomousRouteCurvature} from './autonomous-opponent-candidates.mjs';
import {autonomousCandidateAddress} from './autonomous-candidate-scores.mjs';

const vector = (memory, address) => [0, 4, 8].map(offset => memory.readInt32LE(address + offset));
const store = (memory, address, values) => values.forEach((value, axis) => memory.writeInt32LE(value | 0, address + axis * 4));
const coordinates = (memory, address) => [0, 2, 4].map(offset => memory.readInt16LE(address + offset) << 16);
const addScore = (memory, row, amount) => memory.writeInt32LE((memory.readInt32LE(row + 44) + amount) | 0, row + 44);
const routePoint = (memory, group, index) => memory.readUInt32LE(autonomousRouteGroup(group, {memory}) + 8) + index * 16;

// Original5705d0 Q16 tier coefficients, retained in539.
export function initializeAutonomousCandidateModifierTables(memory) {
  Buffer.from('000001006ddb0000dbb6000049920000b66d0000244900009224000000000000', 'hex').copy(memory, 0x5705d0);
  return memory;
}

//420ba0. Store point and tangent alignment; the score's shift wraps before SAR.
export function evaluateAutonomousCandidateAlignment(index, positionAddress, velocityAddress, speed, {memory, scratchBase}) {
  const row = autonomousCandidateAddress(index), group = autonomousRouteGroup(memory.readUInt16LE(row), {memory});
  const pointIndex = memory[row + 2], points = memory.readUInt32LE(group + 8);
  const current = coordinates(memory, points + pointIndex * 16);
  const displacement = current.map((value, axis) => (value - memory.readInt32LE(positionAddress + axis * 4)) | 0);
  memory.writeInt32LE(displacement[2], scratchBase - 40);
  const toward = scaleContactVector(displacement, 65536);
  store(memory, scratchBase - 12, toward); store(memory, row + 4, toward);
  const previous = stepRoutePoint(group, pointIndex, scratchBase - 40, {memory}, true);
  if (!previous) stepRoutePoint(group, pointIndex, scratchBase - 40, {memory});
  // If both walks fail, native code consumes the retained low word of deltaZ.
  const neighbor = coordinates(memory, points + memory.readUInt16LE(scratchBase - 40) * 16);
  const tangent = scaleContactVector(current.map((value, axis) => previous ? (value - neighbor[axis]) | 0 : (neighbor[axis] - value) | 0), 65536);
  store(memory, scratchBase - 24, tangent); store(memory, row + 16, tangent);
  memory.writeInt32LE(speed < 10000 ? 65536 : dotQ16(vector(memory, velocityAddress), vector(memory, scratchBase - 12)), row + 28);
  const alignment = dotQ16(vector(memory, scratchBase - 24), vector(memory, scratchBase - 12));
  memory.writeInt32LE(alignment, row + 32);
  addScore(memory, row, ((alignment << 6) - 0x3fffc1) >> 16);
}

//420ed0 tests strict signs on both sides of the route bend; zero fails.
export function isAutonomousCandidateInsideTurn(position, origin, incoming, outgoing, turn, {memory}) {
  const delta = vector(memory, position).map((value, axis) => (value - memory.readInt32LE(origin + axis * 4)) | 0);
  const side = address => (multiplyQ16(memory.readInt32LE(address + 8), delta[0]) - multiplyQ16(memory.readInt32LE(address), delta[2])) | 0;
  const first = side(incoming), second = side(outgoing);
  return turn < 0 ? Number(first < 0 && second < 0) : Number(first > 0 && second > 0);
}

//420de0 reuses the first classification for consecutive rows of the same group.
export function applyAutonomousCandidateTurnBias(group, point, {memory, scratchBase}) {
  const origin = scratchBase - 12, incoming = scratchBase - 24, outgoing = scratchBase - 36;
  const turn = measureAutonomousRouteCurvature(group, point, origin, incoming, outgoing, {memory, scratchBase: scratchBase - 80});
  if (abs32(turn) < 0x17d7) return;
  let previousGroup = 0, inside = false;
  for (let index = 0; index < 20; index++) {
    const row = autonomousCandidateAddress(index), candidateGroup = memory.readUInt16LE(row);
    if (!candidateGroup || candidateGroup === (group & 65535)) continue;
    if (candidateGroup !== previousGroup) {
      store(memory, scratchBase - 48, coordinates(memory, routePoint(memory, candidateGroup, memory[row + 2])));
      inside = Boolean(isAutonomousCandidateInsideTurn(scratchBase - 48, origin, incoming, outgoing, turn, {memory}));
      previousGroup = candidateGroup;
    }
    if (inside) addScore(memory, row, 3);
  }
}

//434910's asymmetric signed progress-gap thresholds.
export function autonomousCandidateModeGain(body, {memory}) {
  if (memory.readInt8(body + 0x6da) !== -1) {
    const gap = memory.readInt32LE(body + 0x6dc);
    if (gap < -8192) return 65536;
    if (gap >= 8192) return gap < 16384 ? 16384 : gap < 32768 ? -16384 : -65536;
  }
  return 32768;
}

//434c00: ECX is a registered competitor index, not a body pointer.
export function isAutonomousCompetitorRouteConnected(index, candidateGroup, {memory}) {
  const record = 0x909300 + Math.imul(index, 0x30c);
  const group = memory[memory.readUInt32LE(record + 0x54) + 5];
  if (group === (candidateGroup & 65535)) return 1;
  const links = memory.readUInt32LE(routePoint(memory, group, memory.readUInt16LE(record + 0x58)) + 12);
  return Number((links & 31) === (candidateGroup & 65535) || ((links >>> 14) & 31) === (candidateGroup & 65535));
}

//434a20 combines authored flag tiers, native skill coefficients and lap/gap bias.
export function evaluateAutonomousCandidateModeCost(body, gain, index, {memory}) {
  const record = 0x909300 + memory.readUInt16LE(body + 0x65e) * 0x30c;
  const gap = memory.readInt32LE(body + 0x6dc), competitor = memory.readInt8(body + 0x6da);
  const lap = memory[memory.readUInt32LE(0x5ecb1c) + 0x586], row = autonomousCandidateAddress(index);
  const group = memory.readUInt16LE(row), flags = memory.readUInt32LE(routePoint(memory, group, memory[row + 2]) + 8);
  let base = multiplyQ16([-30, 10, 30, 60][flags >>> 30] << 16, gain);
  let penalty = multiplyQ16([0, 15, 30, 60][(flags >>> 28) & 3] << 16, memory.readInt32LE(0x5705d0 + ((memory.readUInt32LE(body + 0x6f8) >>> 15) & 7) * 4));
  if (competitor !== -1 && abs32(gap) < 8192) {
    if (isAutonomousCompetitorRouteConnected(competitor, group, {memory})) base = (base + 0x100000) | 0;
    else if (((gap + 4095) >>> 0) <= 4094) base = (base - 0x40000) | 0;
  }
  const lastLap = memory[record + 0x1c] === lap;
  if (lastLap) penalty = gap < 0 ? penalty >> 1 : penalty << 1;
  base = (base - penalty) | 0;
  return (lastLap ? base << 1 : base) >> 16;
}

//434800 applies one mode cost to the whole consecutive same-group run.
export function applyAutonomousCandidateModeBias(body, lowestFree, {memory}) {
  const penaltyOnly = !(memory[body + 0x6ec] & 0x40);
  if (penaltyOnly && memory[body + 0x6f1] > 2) return;
  let gain;
  for (let index = 19; index > lowestFree; index--) {
    const row = autonomousCandidateAddress(index), group = memory.readUInt16LE(row);
    if (!group || !(memory[routePoint(memory, group, memory[row + 2]) + 8] & 4)) continue;
    if (penaltyOnly) {addScore(memory, row, -20); continue;}
    gain ??= autonomousCandidateModeGain(body, {memory});
    const cost = evaluateAutonomousCandidateModeCost(body, gain, index, {memory});
    addScore(memory, row, cost);
    while (index - 1 > lowestFree && memory.readUInt16LE(autonomousCandidateAddress(index - 1)) === group) {
      index--; addScore(memory, autonomousCandidateAddress(index), cost);
    }
  }
}

//491ec0 checks the raw inventory IDs, with no low-five-bit mask.
export function hasAutonomousItemFour(body, {memory}) {return Number(memory[body + 0x68c] === 4 || memory[body + 0x68d] === 4);}

//4352f0: authored event availability and score/disable/mode writes.
export function applyAutonomousCandidateEventBias(body, lowestFree, {memory}) {
  const scene = memory.readUInt32LE(0x90b990), count = memory[scene + 0xf6], events = memory.readUInt32LE(scene + 0xf8);
  const record = 0x909300 + memory.readUInt16LE(body + 0x65e) * 0x30c, session = memory.readUInt32LE(0x5ecb1c);
  const difficulty = memory.readUInt32LE(0x5ea4d8);
  let permissive = true;
  if (memory[session + 0x58c] !== 1 && !(memory[record + 0x249] & 1) && difficulty) {
    if (difficulty === 1) permissive = memory[record + 0x1c] !== memory[session + 0x586];
    else if (difficulty === 2 && (memory[record + 0x1c] > 2 || memory[session + 0x586] < 4)) permissive = false;
  }
  for (let index = 19; index > lowestFree; index--) {
    const row = autonomousCandidateAddress(index), type = memory[row + 37];
    if (type !== 0 && type !== 4) continue;
    for (let eventIndex = count - 1; eventIndex >= 0; eventIndex--) {
      const event = events + eventIndex * 8, eventType = memory[event + 4], threshold = memory[event + 6];
      if (type === 4) {
        if (eventType !== 1 || memory.readUInt32LE(event) !== memory[row + 3]) continue;
        if ((memory[event + 5] === 1 && permissive) || threshold <= memory[body + 0x6f0]) memory[row + 38] = 1;
        else addScore(memory, row, 35);
      } else {
        if (eventType === 1 || memory.readUInt16LE(event) !== memory.readUInt16LE(row) || abs32(memory.readUInt16LE(event + 2) - memory[row + 2]) >= 4) continue;
        if (memory[event + 5] === 1 && permissive) memory[row + 38] = 1;
        else if (memory.readUInt16LE(body + 0x6c0) === memory.readUInt16LE(event)) addScore(memory, row, 35);
        else if (eventType === 4 && !hasAutonomousItemFour(body, {memory})) memory[row + 38] = 1;
        else {
          if (memory[body + 0x6f0] < threshold) {if (threshold !== 255) addScore(memory, row, 35);}
          else memory[row + 38] = 1;
          if (eventType === 4) memory.writeUInt16LE(0x20, row + 42);
        }
      }
    }
  }
}

import {dotQ16, abs32} from './fixed-integer.mjs';
import {scaleContactVector} from './body-contact-friction.mjs';
import {writeRouteDirection, autonomousRouteGroup, stepRoutePoint, stepRoutePoints} from './autonomous-route-geometry.mjs';
import tables from './autonomous-weapon-tables.json' with {type: 'json'};
import yaw from './yaw-table.json' with {type: 'json'};

const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const rng = seed => Math.imul(seed, 0x41a7) & 0x7fffffff;
const recordAt = (memory, body) => 0x909300 + memory.readUInt16LE(body + 0x65e) * 0x30c;
const vector = (memory, address) => [0, 4, 8].map(offset => memory.readInt32LE(address + offset));
const store = (memory, address, values) => values.forEach((value, index) => memory.writeInt32LE(value | 0, address + index * 4));
const position = (memory, body) => vector(memory, body + 0x34);
const subtract = (first, second) => first.map((value, axis) => (value - second[axis]) | 0);
const facing = (memory, body) => [0xc8, 0xce, 0xd4].map(offset => memory.readInt16LE(body + offset) << 4);
const score = (memory, record) => ((memory[record + 0x1c] << 16) + memory.readInt32LE(record + 0x24)) | 0;
const squared = values => values.reduce((sum, value) => (sum + Math.imul(value, value)) | 0, 0);
const distance = (first, second) => squared(subtract(first, second).map(value => value >> 16));
const difference = (first, second) => {
  let value = (first - second) | 0;
  if (value > 32768) value = (value - 65536 - ((value - 32769) & 0xffff0000)) | 0;
  if (value < -32768) value = (value + 65536 + ((-value - 32769) & 0xffff0000)) | 0;
  return value;
};
const reverseUse = (memory, body) => {memory.writeInt32LE(memory.readInt32LE(body + 0x710) | 0x4000, body + 0x710); word(memory, body + 0x6c4, memory.readUInt16LE(body + 0x6c4) | 0x8000);};
const normalize = values => scaleContactVector(values, 65536);

export function initializeAutonomousWeaponTables(memory) {
  Buffer.from(tables.bytes_hex, 'hex').copy(memory, Number(tables.address));
  yaw.values.forEach((value, index) => memory.writeInt16LE(value, 0x5ed030 + index * 2));
  return memory;
}

//410780. The search may retain signed index -1 when no record has flag1;
//difficulty0 then dereferences the caller-owned record preceding909300.
export function decideAutonomousItem00(body, flag, {memory}) {
  const own = recordAt(memory, body), session = memory.readUInt32LE(0x5ecb1c), lap = memory[own + 0x1c];
  if (memory[own + 0x1d] === 1) return 0;
  if (memory.readInt32LE(session + 0x57c) >= 6) return 1;
  let selected = -1, otherScore = 0, otherSpeed = 0;
  for (let index = 0; index < memory[session + 0x54d]; index++) {
    const record = 0x909300 + index * 0x30c;
    if (memory[record + 0x1d] === 1) {selected = index; otherScore = score(memory, record); otherSpeed = memory.readInt16LE(memory.readUInt32LE(record) + 0x668); break;}
  }
  const mask = memory[body + 0x6db], selectedBit = mask & (1 << (selected & 31));
  if (mask) {if (!selectedBit) return 0;}
  else if (!selectedBit) {
    if ((flag & 255) === 1 && memory.readInt32LE(body + 0x6e0) < 10000 && (lap === memory[session + 0x586] - 2 || lap === memory[session + 0x586] - 1)) return 0;
    if (memory[0x903502]) return 0;
  }
  if (((otherScore - score(memory, own)) | 0) <= 100 && memory.readInt16LE(body + 0x668) >= otherSpeed) return 0;
  if (memory.readInt32LE(0x5ea4d8) === 0 && memory[memory.readUInt32LE(0x909300 + selected * 0x30c) + 0x718] !== 8) {
    const stage = memory.readUInt32LE(0x920f84), shift = stage === 0 ? 10 : stage === 1 ? 9 : stage <= 3 ? 8 : 0;
    const seed = rng(memory.readInt32LE(0x5ea4d4)); memory.writeInt32LE(seed, 0x5ea4d4);
    return (((seed >>> 15) << shift) >>> 16) === 0 ? 1 : 0;
  }
  return 1;
}

const useEventGate = (memory, record, session) => {
  const difficulty = memory.readInt32LE(0x5ea4d8);
  if (memory[session + 0x58c] !== 1 && !(memory[record + 0x249] & 1) && difficulty !== 0) {
    if (difficulty === 1) return memory[record + 0x1c] !== memory[session + 0x586];
    if (difficulty === 2 && (memory[record + 0x1c] > 2 || memory[session + 0x586] < 4)) return false;
  }
  return true;
};

//410f80. Event rows and the24 registered active-object pointers are supplied
//by the caller; all matching/range/opponent decisions are native game logic.
export function decideAutonomousItem01(body, timer, {memory}) {
  timer = (timer << 16) >> 16;
  const own = recordAt(memory, body), ownIndex = memory.readUInt16LE(body + 0x65e), session = memory.readUInt32LE(0x5ecb1c), type = memory.readUInt16LE(own + 0x6a);
  if (!(memory[body + 0x6ec] & 16)) return 0;
  if (memory.readInt32LE(session + 0x57c) >= 6 && timer > 50) return 1;
  if (memory.readInt32LE(own + 0x7c) !== 4) return 0;
  for (let index = 0; index < 24; index++) {
    const object = memory.readUInt32LE(0x9034a0 + index * 4);
    if (memory.readInt32LE(object + 0x184) === 1 && memory.readInt32LE(object + 0x188) !== 0) {
      if (type === 1 && [0, 4, 8].every(offset => memory.readInt32LE(object + 0x19c + offset) === memory.readInt32LE(own + 0x5c + offset))) return 0;
      if (type === 2 && memory.readInt32LE(own + 0x70) === memory.readInt32LE(object + 0x198)) return 0;
    }
  }
  const eventGate = useEventGate(memory, own, session);
  if (type === 1) {
    const resource = memory.readUInt32LE(0x90b990), rows = memory.readUInt32LE(resource + 0xf8), selected = memory.readUInt32LE(own + 0x74);
    for (let index = memory[resource + 0xf6] - 1; index >= 0; index--) {
      const row = rows + index * 8;
      if (memory[row + 4] === 1 && memory.readUInt32LE(row) === memory.readUInt16LE(selected + 0x192)) {
        if ((memory[row + 5] === 1 && eventGate) || memory[row + 6] <= memory[body + 0x6f0]) return 0;
      }
    }
  }
  const targetDistance = distance(vector(memory, own + 0x5c), position(memory, body));
  if (targetDistance > 16000000) return 0;
  const ownScore = score(memory, own);
  for (let index = 0; index < memory[session + 0x54d]; index++) if (index !== ownIndex) {
    const record = 0x909300 + index * 0x30c, gap = difference(score(memory, record), ownScore);
    if (abs32(gap) <= 5000) {
      if (gap <= 0) {if (targetDistance < 6250000) return 1;}
      else if (distance(position(memory, memory.readUInt32LE(record)), position(memory, body)) < targetDistance) return 1;
    }
  }
  return 0;
}

//410930. Preserve the separate qualified/seen flags for opponents ahead and
//behind. A qualified rear decision sets both the fire-direction and mode bits.
export function decideAutonomousItem03(body, flag, timer, {memory, scratchBase}) {
  timer = (timer << 16) >> 16;
  const own = recordAt(memory, body), ownIndex = memory.readUInt16LE(body + 0x65e), session = memory.readUInt32LE(0x5ecb1c);
  const lap = memory[own + 0x1c], laps = memory[session + 0x586], skill = memory[body + 0x6f1], threshold = memory.readUInt16LE(0x570580 + ((memory.readUInt32LE(body + 0x6f8) >>> 12) & 7) * 2);
  store(memory, scratchBase - 24, facing(memory, body));
  writeRouteDirection(scratchBase - 12, memory[memory.readUInt32LE(own + 0x54) + 5], memory.readUInt16LE(own + 0x58), {memory, scratchBase: scratchBase - 96});
  if (dotQ16(vector(memory, scratchBase - 12), vector(memory, scratchBase - 24)) < 0xd1b4) return 0;
  if (memory.readInt32LE(session + 0x57c) >= 6 && timer > 100) return 1;
  let aheadQualified = false, behindQualified = false, aheadSeen = false, behindSeen = false;
  const ownScore = score(memory, own), region = memory[body + 0x11c];
  for (let index = 0; index < memory[session + 0x54d]; index++) if (index !== ownIndex) {
    const record = 0x909300 + index * 0x30c, gap = difference(score(memory, record), ownScore);
    const ahead = ((gap - 301) >>> 0) <= 2698, behind = ((gap + 2999) >>> 0) <= 2698;
    if (ahead || (behind && skill > 2)) {
      const other = memory.readUInt32LE(record);
      if (region !== memory[other + 0x11c] || Math.abs(memory.readInt16LE(body + 0x11e) - memory.readInt16LE(other + 0x11e)) >= 14 || memory.readInt16LE(other + 0x668) <= 100) continue;
      if (ahead) {
        aheadSeen = true;
        if (memory[other + 0x718] !== 8) {if (skill === 0) return 0; if (memory.readUInt16LE(body + 0x6fc + index * 2) > threshold) aheadQualified = true;}
      } else {
        behindSeen = true;
        if (memory[other + 0x718] !== 8 && memory.readUInt16LE(body + 0x6fc + index * 2) > threshold) behindQualified = true;
      }
    }
  }
  if (aheadQualified) return 1;
  if (behindQualified) {reverseUse(memory, body); return 1;}
  if (memory[body + 0x6db] || ((flag & 255) === 1 && memory.readInt32LE(body + 0x6e0) < 10000 && lap === laps - 1)) return 0;
  if (aheadSeen) return 1;
  if (behindSeen) {reverseUse(memory, body); return 1;}
  return 0;
}

//411b00: current point plus at most nine successors, stopping at an open end.
export function hasAutonomousSpeedMarker(body, {memory}) {
  const group = autonomousRouteGroup(memory.readUInt16LE(body + 0x6c0), {memory}), points = memory.readUInt32LE(group + 8);
  let index = memory.readUInt16LE(body + 0x6c2);
  if (memory[points + index * 16 + 7] !== 255) return 1;
  for (let step = 0; step < 9; step++) {
    const last = (memory.readUInt16LE(group) - 1) & 65535;
    if (memory[group + 2]) {if (index) index = (index - 1) & 65535; else {if (!memory[group + 4]) return 0; index = last;}}
    else if (index === last) {if (!memory[group + 4]) return 0; index = 0;} else index = (index + 1) & 65535;
    if (memory[points + index * 16 + 7] !== 255) return 1;
  }
  return 0;
}

export function decideAutonomousItem04(body, flag, {memory, scratchBase}) {
  const own = recordAt(memory, body), session = memory.readUInt32LE(0x5ecb1c), lap = memory[own + 0x1c], laps = memory[session + 0x586], skill = memory[body + 0x6f1];
  let index = memory.readUInt16LE(own + 0x58);
  const groupIndex = memory[memory.readUInt32LE(own + 0x54) + 5], group = autonomousRouteGroup(groupIndex, {memory});
  if ((flag & 255) === 1 && memory.readInt32LE(body + 0x6e0) < 10000 && (lap === laps - 1 || lap === laps - 2 || (lap === laps && memory.readInt32LE(own + 0x24) < 32768))) return 0;
  if ((memory[body + 0x6c4] & 32) || hasAutonomousSpeedMarker(body, {memory})) return 0;
  store(memory, scratchBase - 24, facing(memory, body));
  writeRouteDirection(scratchBase - 12, groupIndex, index, {memory, scratchBase: scratchBase - 64});
  const direction = vector(memory, scratchBase - 12), forward = vector(memory, scratchBase - 24);
  if (dotQ16(forward, direction) < 0xddb3 + (skill > 2 ? 0x12dc : 0)) return 0;
  if (stepRoutePoint(group, index, scratchBase - 36, {memory})) index = memory.readUInt16LE(scratchBase - 36);
  const coordinates = pointIndex => [0, 2, 4].map(offset => memory.readInt16LE(memory.readUInt32LE(group + 8) + pointIndex * 16 + offset) << 16);
  const initial = coordinates(index), delta = subtract(initial, position(memory, body));
  store(memory, scratchBase - 24, delta.some(Boolean) ? normalize(delta) : delta);
  if (dotQ16(vector(memory, scratchBase - 24), direction) < 0xf08f + (skill > 2 ? 0xb8d : 0)) return 0;
  const threshold = 0xe803 + (skill > 2 ? 0xf43 : 0);
  for (const count of [3, 10]) {
    if (!stepRoutePoints(group, index, count, scratchBase - 36, {memory})) return 0;
    const delta = subtract(coordinates(memory.readUInt16LE(scratchBase - 36)), initial);
    store(memory, scratchBase - 24, delta.some(Boolean) ? normalize(delta) : delta);
    if (dotQ16(vector(memory, scratchBase - 24), direction) < threshold) return 0;
  }
  return 1;
}

export function decideAutonomousItem07(body, flag, timer, {memory, scratchBase}) {
  timer = (timer << 16) >> 16;
  const own = recordAt(memory, body), ownIndex = memory.readUInt16LE(body + 0x65e), session = memory.readUInt32LE(0x5ecb1c), mask = memory[body + 0x6db], skill = memory[body + 0x6f1];
  let restricted = false;
  if ((flag & 255) === 1 && memory.readInt32LE(body + 0x6e0) < 10000 && memory[own + 0x1c] === memory[session + 0x586] - 1) {if (!mask) return 0; restricted = true;}
  store(memory, scratchBase - 24, facing(memory, body));
  writeRouteDirection(scratchBase - 12, memory[memory.readUInt32LE(own + 0x54) + 5], memory.readUInt16LE(own + 0x58), {memory, scratchBase: scratchBase - 72});
  if (dotQ16(vector(memory, scratchBase - 12), vector(memory, scratchBase - 24)) < 0xd1b4) return 0;
  if (memory.readInt32LE(session + 0x57c) >= 6 && timer > 100) return 1;
  const ownScore = score(memory, own), region = memory[body + 0x11c];
  for (let index = 0; index < memory[session + 0x54d]; index++) if (index !== ownIndex) {
    const record = 0x909300 + index * 0x30c;
    let gap = (score(memory, record) - ownScore) | 0;
    if (gap > 65536) gap = (gap - 65536 - ((gap - 65537) & 0xffff0000)) | 0;
    if (((gap - 101) >>> 0) >= 5900) continue;
    const other = memory.readUInt32LE(record);
    if (memory.readInt16LE(other + 0x668) < 50) continue;
    if (skill < 3 && memory[other + 0x718] !== 8) {
      const stage = memory.readUInt32LE(0x920f84), shift = stage === 0 ? 9 : stage === 1 ? 8 : stage <= 3 ? 7 : 0;
      const seed = rng(memory.readInt32LE(0x5ea4d4)); memory.writeInt32LE(seed, 0x5ea4d4);
      if ((((seed >>> 15) << shift) >>> 16) !== 0) continue;
    }
    if (Math.abs(region - memory[other + 0x11c]) >= 7) continue;
    if (gap >= 4000) {
      const delta = subtract(position(memory, other), position(memory, body));
      store(memory, scratchBase - 24, normalize(delta));
      if (dotQ16(vector(memory, scratchBase - 24), vector(memory, scratchBase - 12)) <= 0xf03c) continue;
    }
    if ((mask & (1 << (index & 31))) || (!restricted && !mask)) return 1;
  }
  return 0;
}

//411260. Position words wrap independently after the shipped yaw lookup.
export function writeAutonomousObjectPosition(row, output, {memory}) {
  const local = memory.readUInt32LE(row), object = memory.readUInt32LE(row + 4), angle = memory[object + 0x199];
  const x = memory.readInt16LE(local), y = memory.readInt16LE(local + 2), z = memory.readInt16LE(local + 4);
  word(memory, output + 2, y);
  const cosine = memory.readInt16LE(0x5ed0b0 + angle * 2) >> 6, sine = memory.readInt16LE(0x5ed030 + angle * 2) >> 6;
  word(memory, output, memory.readUInt16LE(object + 0x36) + (Math.imul(x, cosine) >> 8) + (Math.imul(z, sine) >> 8));
  word(memory, output + 2, memory.readUInt16LE(output + 2) + memory.readUInt16LE(object + 0x3a));
  word(memory, output + 4, memory.readUInt16LE(object + 0x3e) + (Math.imul(z, cosine) >> 8) + (Math.imul(-x, sine) >> 8));
}

//411340. Three actual target classes: predicted registered vehicles,
//transformed authored object rows, and the precomputed nearby-object list.
//Those producer-owned lists remain explicit memory inputs, with no fabricated
//selection or visibility pass substituted here.
export function decideAutonomousItem02(body, timer, {memory, scratchBase}) {
  timer = (timer << 16) >> 16;
  const ownIndex = memory.readUInt16LE(body + 0x65e), own = recordAt(memory, body), session = memory.readUInt32LE(0x5ecb1c), profile = (memory.readUInt32LE(body + 0x6f8) >>> 3) & 7, mask = memory[body + 0x6db];
  if (memory.readInt32LE(session + 0x57c) >= 6 && timer > 100) return 1;
  const ownScore = score(memory, own), direction = facing(memory, body);
  store(memory, scratchBase - 28, direction);
  const candidate = scratchBase - 40, next = scratchBase - 124;
  let difficulty = memory.readInt32LE(0x5ea4d8);
  for (let index = 0; index < memory[memory.readUInt32LE(0x5ecb1c) + 0x54d]; index++) {
    const record = 0x909300 + index * 0x30c, group = memory.readUInt32LE(record + 0x54), other = memory.readUInt32LE(record), threshold = memory.readInt32LE(0x570540 + profile * 4);
    if (index === ownIndex) continue;
    if (memory[other + 0x718] !== 8) {
      if (difficulty === 0) continue;
      if (difficulty === 1) {const seed = rng(memory.readInt32LE(0x5ea4d4)); memory.writeInt32LE(seed, 0x5ea4d4); if (seed & 0xe0000000) continue;}
    }
    if (mask && !(mask & (1 << (index & 31)))) continue;
    if ((difference(score(memory, record), ownScore) >>> 0) > 6000) continue;
    const otherPosition = position(memory, other), range = distance(otherPosition, position(memory, body));
    if (range > 9000000) continue;
    const shift = range < 1000000 ? 3 : range < 4000000 ? 4 : 5, count = range < 1000000 ? 4 : range < 4000000 ? 6 : 8;
    if (!stepRoutePoints(group, memory.readUInt16LE(record + 0x58), count, next, {memory})) continue;
    const point = memory.readUInt32LE(group + 8) + memory.readUInt16LE(next) * 16;
    const pointPosition = [0, 2, 4].map(offset => memory.readInt16LE(point + offset) << 16);
    const toward = scaleContactVector(subtract(pointPosition, otherPosition), memory.readInt32LE(other + 0x664)), velocity = vector(memory, other + 0x68);
    store(memory, scratchBase - 16, toward);
    const predicted = otherPosition.map((value, axis) => (value + (velocity[axis] << shift) + (toward[axis] << shift) - memory.readInt32LE(body + 0x34 + axis * 4)) | 0);
    store(memory, candidate, normalize(predicted));
    if (dotQ16(vector(memory, candidate), vector(memory, scratchBase - 28)) > threshold) return 1;
    difficulty = memory.readInt32LE(0x5ea4d8);
  }
  if (mask || !(memory[body + 0x6ec] & 16)) return 0;
  const eventGate = useEventGate(memory, own, memory.readUInt32LE(0x5ecb1c));
  direction[1] = 0; store(memory, scratchBase - 28, normalize(direction));
  const objectCount = memory.readInt32LE(0x82e904);
  let row = memory.readUInt32LE(memory.readUInt32LE(0x90b990) + 0xec);
  for (let index = 0; index < objectCount; index++, row += 20) {
    const resource = memory.readUInt32LE(0x90b990), eventCount = memory[resource + 0xf6], events = memory.readUInt32LE(resource + 0xf8), local = memory.readUInt32LE(row), object = memory.readUInt32LE(row + 4), threshold = memory.readInt32LE(0x570560 + profile * 4);
    const material = memory.readUInt32LE(object + 0x194), selector = memory.readUInt32LE(local + 12) & 15;
    if ((memory[material + selector * 4 + 3] & 15) === 5) continue;
    writeAutonomousObjectPosition(row, scratchBase - 64, {memory});
    const delta = [0, 2, 4].map((offset, axis) => ((memory.readUInt16LE(scratchBase - 64 + offset) - memory.readUInt16LE(body + 0x36 + axis * 4)) << 16) >> 16);
    if (squared(delta) > 4000000) continue;
    let suppressed = false;
    for (let eventIndex = eventCount - 1; eventIndex >= 0; eventIndex--) {
      const event = events + eventIndex * 8;
      if (memory[event + 4] === 1 && memory.readUInt32LE(event) === memory.readUInt16LE(object + 0x192) && ((memory[event + 5] === 1 && eventGate) || memory[event + 6] <= memory[body + 0x6f0])) suppressed = true;
    }
    if (suppressed) continue;
    store(memory, candidate, normalize([delta[0] << 16, 0, delta[2] << 16]));
    if (dotQ16(vector(memory, candidate), vector(memory, scratchBase - 28)) > threshold) return 1;
  }
  for (let index = 0; index < memory[0x6e650e]; index++) {
    const object = memory.readUInt32LE(memory.readUInt32LE(0x849a5c) + memory[0x920f60 + index] * 8), threshold = memory.readInt32LE(0x570590 + profile * 4);
    if (memory.readInt32LE(0x920ec0 + index * 4) > 9000000) continue;
    store(memory, candidate, normalize(subtract(position(memory, object), position(memory, body))));
    if (dotQ16(vector(memory, candidate), vector(memory, scratchBase - 28)) > threshold) return 1;
  }
  return 0;
}

//4103f0: weapon IDs are signed bytes; timers are signed wrapping words.
//Slots are captured before decisions, while the second timer is read again
//after the first decision. scratchBase denotes the native entry ESP.
export function updateAutonomousWeaponPolicy(body, {memory, scratchBase, handlers = {}}) {
  const first = memory.readInt8(body + 0x68c), second = memory.readInt8(body + 0x68d);
  const flags = memory.readUInt32LE(body + 0x6ec), firstFlag = (flags >>> 7) & 1, secondFlag = (flags >>> 8) & 1;
  const record = 0x909300 + memory.readUInt16LE(body + 0x65e) * 0x30c;
  const session = memory.readUInt32LE(0x5ecb1c), phase = memory.readInt32LE(session + 0x57c);
  if ((memory[record + 0x249] & 1) && phase !== 6) return;
  let allowSecond = true;
  if (phase >= 6) {
    const timer = memory.readInt32LE(session + 0x580);
    if (timer < 150) return;
    if (timer < 300) allowSecond = false;
  }
  const difficulty = memory.readInt32LE(0x5ea4d8);
  for (const [id, offset] of [[first, 0x6e4], [second, 0x6e6]]) {
    if (id !== -1) word(memory, body + offset, memory.readUInt16LE(body + offset) + 1);
    else if (memory.readInt16LE(body + offset) >= 0) {
      const seed = rng(memory.readInt32LE(0x5ea4d4));
      memory.writeInt32LE(seed, 0x5ea4d4);
      word(memory, body + offset, -((seed >>> (difficulty === 0 ? 26 : difficulty === 1 ? 27 : 28)) + (difficulty === 0 ? 8 : difficulty === 1 ? 4 : 2)));
    }
  }
  if (memory.readUInt32LE(0x90a548) < 350) return;
  const firstTimer = memory.readInt16LE(body + 0x6e4), secondTimer = memory.readInt16LE(body + 0x6e6);
  let allowFirst = firstTimer >= 0 && (first & ~31) === 0;
  allowSecond &&= secondTimer >= 0 && (second & ~31) === 0;
  if (((first ^ second) & 31) === 0) {
    if (firstTimer < secondTimer) allowFirst = false;
    else allowSecond = false;
  }
  const decide = (id, timer, flag, slot) => {
    if (id === 5) return memory.readInt32LE(0x811180) === 0;
    if (id === 6) return memory.readInt32LE(body + 0x6bc) === -1 || timer >= 50;
    const entry = [0x410780, 0x410f80, 0x411340, 0x410930, 0x411ba0, 0, 0, 0x410c90][id];
    if (!entry) return false;
    const name = `call${entry.toString(16)}`, handler = handlers[name];
    const options = {memory, scratchBase: scratchBase - (id === 3 || id === 7 ? 36 : 32)};
    const defaults = {0: () => decideAutonomousItem00(body, flag, options), 1: () => decideAutonomousItem01(body, timer, options), 2: () => decideAutonomousItem02(body, timer, options), 3: () => decideAutonomousItem03(body, flag, timer, options), 4: () => decideAutonomousItem04(body, flag, options), 7: () => decideAutonomousItem07(body, flag, timer, options)};
    if (handler === undefined && !defaults[id]) throw Error(`Autonomous weapon policy requires reached handler ${name}.`);
    const value = handler === undefined ? defaults[id]() : handler({memory, ecx: body, edx: id === 1 || id === 2 ? timer & 65535 : flag, args: id === 3 || id === 7 ? [timer & 65535] : [], scratchBase: options.scratchBase, slot});
    const eax = typeof value === 'number' ? value : value?.eax;
    if (!Number.isInteger(eax)) throw Error(`Autonomous weapon decision ${name} requires explicit EAX.`);
    return eax !== 0;
  };
  if (allowFirst && decide(first, firstTimer, firstFlag, 0) && !(memory[body + 0x70c] & 4)) memory.writeInt32LE(memory.readInt32LE(body + 0x710) | 4, body + 0x710);
  if (allowSecond && decide(second, memory.readInt16LE(body + 0x6e6), secondFlag, 1) && !(memory[body + 0x70c] & 8)) memory.writeInt32LE(memory.readInt32LE(body + 0x710) | 8, body + 0x710);
}

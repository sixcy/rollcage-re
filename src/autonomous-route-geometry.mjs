import {abs32, dotQ16} from './fixed-integer.mjs';
import {scaleContactVector} from './body-contact-friction.mjs';

const vector = (memory, address) => [0, 4, 8].map(offset => memory.readInt32LE(address + offset));
const store = (memory, address, values) => values.forEach((value, axis) => memory.writeInt32LE(value | 0, address + axis * 4));
const point = (memory, group, index) => memory.readUInt32LE(group + 8) + (index & 65535) * 16;
const coordinates = (memory, address) => [0, 2, 4].map(offset => memory.readInt16LE(address + offset) << 16);
const delta = (a, b) => a.map((value, axis) => (value - b[axis]) | 0);
export const autonomousRouteGroup = (index, {memory}) => memory.readUInt32LE(memory.readUInt32LE(0x90b98c) + 0x60) + (index & 65535) * 12;

//491390 advances in authored direction;491400 reverses it. Failure leaves the
//output untouched. Neither routine validates the supplied index against count.
export function stepRoutePoint(group, index, output, {memory}, reverse = false) {
  index &= 65535;
  const last = (memory.readUInt16LE(group) - 1) & 65535;
  const backwards = (memory[group + 2] !== 0) !== reverse;
  if (backwards ? index === 0 : index === last) {
    if (!memory[group + 4]) return 0;
    memory.writeUInt16LE(backwards ? last : 0, output);
  } else memory.writeUInt16LE((index + (backwards ? -1 : 1)) & 65535, output);
  return 1;
}

//491470 advances an unsigned-byte number of points, committing only when the
//whole walk succeeds. Despite the historical request name this is not a search
//for a typed point. Zero steps succeeds and copies the supplied low word.
export function stepRoutePoints(group, index, count, output, {memory}) {
  count &= 255; index &= 65535;
  if (count) {
    const last = (memory.readUInt16LE(group) - 1) & 65535;
    const backwards = memory[group + 2] !== 0, cyclic = memory[group + 4] !== 0;
    for (let step = 0; step < count; step++) {
      if (backwards ? index === 0 : index === last) {
        if (!cyclic) return 0;
        index = backwards ? last : 0;
      } else index = (index + (backwards ? -1 : 1)) & 65535;
    }
  }
  memory.writeUInt16LE(index, output); return 1;
}

//491d80: use the next point, or the previous one at an open endpoint. A group
//with no neighbor produces the literal +X vector, irrespective of orientation.
export function writeRouteDirection(output, groupIndex, index, {memory, scratchBase}) {
  const group = autonomousRouteGroup(groupIndex, {memory});
  const current = coordinates(memory, point(memory, group, index));
  const next = scratchBase - 8;
  let direction;
  if (stepRoutePoint(group, index, next, {memory})) direction = delta(coordinates(memory, point(memory, group, memory.readUInt16LE(next))), current);
  else if (stepRoutePoint(group, index, next, {memory}, true)) direction = delta(current, coordinates(memory, point(memory, group, memory.readUInt16LE(next))));
  else {store(memory, output, [65536, 0, 0]); return;}
  store(memory, output, scaleContactVector(direction, 65536));
}

//4915e0's plane test. scratchBase is the native entry ESP. Its single-point
//case consumes retained direction locals at ESP-24 instead of initializing one.
export function isRoutePointPassed(group, index, position, {memory, scratchBase}) {
  const current = coordinates(memory, point(memory, group, index));
  const displacement = delta(current, vector(memory, position));
  store(memory, scratchBase - 12, displacement);
  let direction;
  if (stepRoutePoint(group, index, scratchBase + 4, {memory}, true)) direction = delta(current, coordinates(memory, point(memory, group, memory.readUInt16LE(scratchBase + 4))));
  else if (stepRoutePoint(group, index, scratchBase + 4, {memory})) direction = delta(coordinates(memory, point(memory, group, memory.readUInt16LE(scratchBase + 4))), current);
  else direction = vector(memory, scratchBase - 24);
  store(memory, scratchBase - 24, direction);
  store(memory, scratchBase - 24, scaleContactVector(direction, 65536));
  return dotQ16(vector(memory, scratchBase - 12), vector(memory, scratchBase - 24)) < 5000 ? 1 : 0;
}

//491740 walks at most49 candidates. Forward traversal commits before testing;
//backward traversal tests before committing. Exhaustion restores the original.
export function findAutonomousRoutePoint(group, indexAddress, output, position, {memory, scratchBase}) {
  const initial = memory.readUInt16LE(indexAddress);
  const close = index => delta(coordinates(memory, point(memory, group, index)), vector(memory, position)).every(value => abs32(value) <= 0x140000);
  const passed = index => isRoutePointPassed(group, index, position, {memory, scratchBase: scratchBase - 48});
  const forward = close(initial) || passed(initial);
  const temporary = scratchBase - 28;
  for (let iteration = 1; iteration < 50; iteration++) {
    const current = memory.readUInt16LE(indexAddress);
    if (!stepRoutePoint(group, current, temporary, {memory}, !forward)) return;
    const selected = memory.readUInt16LE(temporary), selectedPoint = point(memory, group, selected);
    if (forward) {
      memory.writeUInt16LE(selected, indexAddress);
      memory.writeUInt32LE(selectedPoint >>> 0, output);
      if (!close(selected) && !passed(selected)) return;
    } else {
      if (close(selected) || passed(selected)) return;
      memory.writeUInt16LE(selected, indexAddress);
      memory.writeUInt32LE(point(memory, group, selected) >>> 0, output);
    }
  }
  memory.writeUInt32LE(point(memory, group, initial) >>> 0, output);
  memory.writeUInt16LE(initial, indexAddress);
}

//491ce0 selects the progression route, except when its direction differs from
//the autonomous route. That case first walks the autonomous route locally.
export function writeAutonomousProgressDirection(output, record, {memory, scratchBase}) {
  const body = memory.readUInt32LE(record), progression = memory.readUInt32LE(record + 0x54);
  const autonomousGroup = memory.readUInt16LE(body + 0x6c0), progressGroup = memory[progression + 5];
  if (autonomousGroup !== progressGroup && memory[autonomousRouteGroup(autonomousGroup, {memory}) + 2] !== memory[autonomousRouteGroup(progressGroup, {memory}) + 2]) {
    const index = scratchBase - 12;
    memory.writeUInt32LE(memory.readUInt16LE(body + 0x6c2), index);
    findAutonomousRoutePoint(autonomousRouteGroup(autonomousGroup, {memory}), index, scratchBase - 4, body + 0x34, {memory, scratchBase: scratchBase - 44});
    writeRouteDirection(output, autonomousGroup, memory.readUInt16LE(index), {memory, scratchBase: scratchBase - 48});
  } else writeRouteDirection(output, progressGroup, memory.readUInt16LE(record + 0x58), {memory, scratchBase: scratchBase - 40});
}

import {abs32, lookupSqrt, vectorLengthQ16, divideQ16, multiplyQ16} from './fixed-integer.mjs';
import {scaleContactVector} from './body-contact-friction.mjs';
import {autonomousRouteGroup, stepRoutePoint, isRoutePointPassed} from './autonomous-route-geometry.mjs';
import {updateAutonomousSpeed, limitAutonomousPacing} from './autonomous-speed.mjs';
import {updateAutonomousSteering} from './autonomous-steering.mjs';

const vector = (memory, address) => [0, 4, 8].map(offset => memory.readInt32LE(address + offset));
const store = (memory, address, values) => values.forEach((value, axis) => memory.writeInt32LE(value | 0, address + axis * 4));
const pointDelta = (memory, point, body) => [0, 1, 2].map(axis => ((memory.readInt16LE(point + axis * 2) << 16) - memory.readInt32LE(body + 0x34 + axis * 4)) | 0);

//431380 advances a reached/passed target and normalizes the target displacement.
//Its distance path switches at176 units, with signed high-word approximation.
export function prepareAutonomousTarget(body, target, groupIndex, index, {memory, scratchBase}) {
  const initial = vector(memory, target);
  const length = initial.every(value => abs32(value) <= 0xb00000)
    ? vectorLengthQ16(initial)
    : lookupSqrt(initial.reduce((sum, value) => (sum + Math.imul(value >> 16, value >> 16)) | 0, 0)) << 16;
  let group = autonomousRouteGroup(groupIndex, {memory});
  const divide = () => {
    const scale = divideQ16(65536, length);
    for (let axis = 0; axis < 3; axis++) memory.writeInt32LE(multiplyQ16(memory.readInt32LE(target + axis * 4), scale), target + axis * 4);
  };
  if (length > 0x140000 && !isRoutePointPassed(group, index, body + 0x34, {memory, scratchBase: scratchBase - 32})) {divide(); return;}
  group = autonomousRouteGroup(groupIndex, {memory});
  const next = scratchBase - 8;
  if (stepRoutePoint(group, index, next, {memory})) {
    const selected = memory.readUInt16LE(next);
    memory.writeUInt16LE(selected, body + 0x6c2);
    group = autonomousRouteGroup(groupIndex, {memory});
    const point = memory.readUInt32LE(group + 8) + selected * 16;
    store(memory, target, scaleContactVector(pointDelta(memory, point, body), 65536));
  } else if (length > 0) divide();
}

//431750 is the second autonomous pass in450e50.6c4 bit4000 gates route control;
//the authored point+7 supplies twice its byte value, overridden to250 in mode4.
//A special6c9 target is retained until code5 is within the signed squared test.
export function updateAutonomousRouteControl(body, {memory, scratchBase, handlers = {}}) {
  const groupIndex = memory.readUInt16LE(body + 0x6c0);
  let index = memory.readUInt16LE(body + 0x6c2);
  if (!(memory.readUInt16LE(body + 0x6c4) & 0x4000)) return;
  const target = scratchBase - 12;
  if (memory[body + 0x6c9]) {
    const difference = vector(memory, body + 0x6cc).map((value, axis) => (value - memory.readInt32LE(body + 0x34 + axis * 4)) | 0);
    store(memory, target, difference);
    if (memory[body + 0x6c9] === 5) {
      const integers = difference.map(value => value >> 16);
      memory.writeInt32LE(integers[2], scratchBase - 16);
      if (integers.reduce((sum, value) => (sum + Math.imul(value, value)) | 0, 0) < 40000) memory[body + 0x6c9] = 0;
    }
  }
  let speed;
  if (!memory[body + 0x6c9]) {
    const pack = memory.readUInt32LE(0x90b98c);
    if ((memory.readUInt32LE(body + 0x6ec) & 0x200) && memory.readInt16LE(body + 0x668) > 300 && stepRoutePoint(memory.readUInt32LE(pack + 0x60) + groupIndex * 12, index, scratchBase - 16, {memory})) index = memory.readUInt16LE(scratchBase - 16);
    memory.writeUInt16LE(groupIndex, body + 0x6c0);
    memory.writeUInt16LE(index, body + 0x6c2);
    const point = memory.readUInt32LE(memory.readUInt32LE(pack + 0x60) + groupIndex * 12 + 8) + index * 16;
    store(memory, target, pointDelta(memory, point, body));
    if (!memory[body + 0x6c9]) {
      (handlers.prepareTarget ?? prepareAutonomousTarget)(body, target, groupIndex, index, {memory, scratchBase: scratchBase - 48});
      speed = memory[memory.readUInt32LE(0x5ecb1c) + 0x551] === 4 ? 250 : memory[point + 7] * 2;
    }
  }
  if (speed === undefined) {
    const point = memory.readUInt32LE(autonomousRouteGroup(groupIndex, {memory}) + 8) + index * 16;
    speed = memory[memory.readUInt32LE(0x5ecb1c) + 0x551] === 4 ? 250 : memory[point + 7] * 2;
  }
  (handlers.speed ?? updateAutonomousSpeed)(body, speed, {memory, scratchBase: scratchBase - 40});
  (handlers.steering ?? updateAutonomousSteering)(body, target, 1, 0, {memory, scratchBase: scratchBase - 48});
  const flags = memory.readUInt16LE(body + 0x6c4);
  if (flags & 0x8000) {
    memory.writeInt32LE(memory.readInt32LE(body + 0x710) & ~0xa000, body + 0x710);
    memory.writeUInt16LE(flags & 0x7fff, body + 0x6c4);
  }
  (handlers.pacing ?? limitAutonomousPacing)(body, {memory, scratchBase});
}

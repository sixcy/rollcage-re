import {lookupSqrt, signedShort} from './fixed-integer.mjs';

const shorts = (memory, address) => [0, 2, 4].map(offset => memory.readInt16LE(address + offset));
const store = (memory, address, values) => values.forEach((value, axis) => memory.writeUInt16LE(value & 65535, address + axis * 2));
const square = values => values.reduce((sum, value) => (sum + Math.imul(value, value)) | 0, 0);
const difference = (first, second) => first.map((value, axis) => signedShort(value - second[axis]));
const divide = (numerator, denominator) => {
  if (!denominator) throw Error('Candidate cost signed division by zero.');
  const result = Math.trunc((numerator | 0) / (denominator | 0));
  if (result < -2147483648 || result > 2147483647) throw Error('Candidate cost signed division overflow.');
  return result | 0;
};
const productShift8 = (first, second) => Number(BigInt.asIntN(32, (BigInt(first | 0) * BigInt(second | 0)) >> 8n));
const root = (memory, value) => {
  const magnitude = value < 0 ? -value | 0 : value;
  memory.writeInt32LE(magnitude, 0x91d45c);
  memory.writeInt32LE(Math.clz32(magnitude), 0x91d460);
  return lookupSqrt(value);
};

//412070. Cached segment length and reciprocal are shared across the native
//411fa0 loop. All projections use wrapped low32 IMUL rather than Q16 products.
export function evaluateAutonomousBodyDistanceCost(from, delta, targetIndex, radius, speed, distanceSq, segmentSq, lengthAddress, inverseAddress, {memory}) {
  const table = memory.readUInt32LE(0x849a5c), metadata = table + (targetIndex | 0) * 8, body = memory.readUInt32LE(metadata), model = memory.readUInt32LE(body + 0x10);
  const displacement = difference([0x36, 0x3a, 0x3e].map(offset => memory.readInt16LE(body + offset)), shorts(memory, from));
  const bodyRadius = memory.readUInt16LE(model + 0x32), targetDistance = memory.readInt32LE(0x920ec0 + targetIndex * 4);
  if (targetDistance < distanceSq || targetDistance > ((distanceSq * 2 + segmentSq) | 0)) return 0;
  if (memory.readInt32LE(lengthAddress) === -1) {
    const length = root(memory, segmentSq);
    memory.writeInt32LE(length, lengthAddress); memory.writeInt32LE(divide(65536, length), inverseAddress);
  }
  const direction = shorts(memory, delta), inverse = memory.readInt32LE(inverseAddress);
  const dot = displacement.reduce((sum, value, axis) => (sum + Math.imul(value, direction[axis])) | 0, 0);
  const along = Math.imul(dot, inverse) >> 16;
  if (along < 0 || along > ((memory.readInt32LE(lengthAddress) + bodyRadius) | 0)) return 0;
  const projectedScale = Math.imul(inverse, along);
  const perpendicular = displacement.map((value, axis) => signedShort(value - (Math.imul(direction[axis], projectedScale) >> 16)));
  const crossDistance = root(memory, square(perpendicular)), classification = memory[metadata + 6];
  let cost = classification === 2 ? 55 : classification === 3 ? 60 : 50;
  if (crossDistance > ((bodyRadius + radius * 2) | 0)) return 0;
  const halfWidth = ((bodyRadius >> 1) + radius) | 0;
  cost = crossDistance < halfWidth ? -cost : divide(Math.imul((crossDistance - radius * 2 - bodyRadius) | 0, cost), halfWidth);
  const range = speed < 100 ? 900 : ((speed << 11) - 0x31c7c) | 0, far = range << 4, squaredAlong = (Math.imul(along, along) + distanceSq * 2) | 0;
  if (squaredAlong > far) return cost >> 5;
  if (squaredAlong > range) {const small = cost >> 5; cost = (small + divide(Math.imul((far - squaredAlong) | 0, cost - small), (far - range) | 0)) | 0;}
  return cost;
}

//411fa0: native entry ESP defines the shared cached root/reciprocal and short
//delta storage. The gate still initializes both cache dwords before returning.
export function evaluateAutonomousPositionCost(body, from, to, radius, speed, distanceSq, {memory, scratchBase}) {
  const length = scratchBase - 16, inverse = scratchBase - 20, deltaAddress = scratchBase - 12;
  memory.writeInt32LE(-1, length); memory.writeInt32LE(0, inverse);
  if (!memory[0x6e650e] || !(memory[body + 0x6ec] & 32)) return 0;
  const delta = difference(shorts(memory, to), shorts(memory, from)); store(memory, deltaAddress, delta);
  const segmentSq = square(delta);
  if (segmentSq < 4) return 0;
  let cost = 0;
  for (let index = 0; index < memory[0x6e650e]; index++) cost = (cost + evaluateAutonomousBodyDistanceCost(from, deltaAddress, memory[0x920f60 + index], radius, speed, distanceSq, segmentSq, length, inverse, {memory})) | 0;
  return cost;
}

//412870. Traverse each retained model polygon's packed planes in inverse yaw.
//A null polygon pointer terminates immediately; zero planes accepts immediately.
export function intersectsAutonomousObstacle(from, to, object, radius, index, {memory}) {
  const polygonCount = memory.readUInt32LE(0x920b44 + index * 12);
  if (!polygonCount) return 0;
  const model = memory.readUInt32LE(object + 0x10), angle = 256 - memory[object + 0x199], sine = memory.readInt16LE(0x5ed030 + angle * 2) >> 6, cosine = memory.readInt16LE(0x5ed0b0 + angle * 2) >> 6;
  const origin = shorts(memory, from), end = shorts(memory, to), objectX = memory.readInt32LE(object + 0x34) >> 8, objectZ = memory.readInt32LE(object + 0x3c) >> 8;
  const x = ((origin[0] << 8) - objectX) | 0, z = ((origin[2] << 8) - objectZ) | 0, dx = (end[0] - origin[0]) << 8, dz = (end[2] - origin[2]) << 8;
  const rotatedX = (productShift8(z, sine) + productShift8(x, cosine) + objectX) | 0, rotatedZ = (productShift8(-x | 0, sine) + productShift8(z, cosine) + objectZ) | 0;
  const rotatedDx = (productShift8(dz, sine) + productShift8(dx, cosine)) | 0, rotatedDz = (productShift8(-dx | 0, sine) + productShift8(dz, cosine)) | 0;
  const polygons = memory.readUInt32LE(0x920b48 + index * 12), vertexBase = memory.readUInt32LE(model + 0x40), packedPlanes = memory.readUInt32LE(object + 0x2c);
  for (let polygon = 0; polygon < polygonCount; polygon++) {
    const pointer = memory.readUInt32LE(polygons + polygon * 4);
    if (!pointer) return 0;
    const descriptor = memory.readUInt32LE(pointer + 0x10), planeCount = (descriptor >>> 16) & 31;
    if (!planeCount) return 1;
    let plane = model + memory.readUInt16LE(model + 0x38) + 8 + (descriptor & 255) * 9;
    let rejected = false;
    for (let remaining = 0; remaining < planeCount; remaining++, plane += 9) {
      const packed = packedPlanes + memory[plane] * 8, vertex = memory[packed], normal = memory.readInt32LE(packed + 4), nx = (normal << 2) >> 22, ny = (normal << 12) >> 22, nz = (normal << 22) >> 22;
      const vertexAddress = vertexBase - 8 + vertex * 8;
      const vx = signedShort(memory.readInt16LE(vertexAddress) + memory.readInt16LE(object + 0x36)), vy = signedShort(memory.readInt16LE(vertexAddress + 2) + memory.readInt16LE(object + 0x3a)), vz = signedShort(memory.readInt16LE(vertexAddress + 4) + memory.readInt16LE(object + 0x3e));
      const dot = (Math.imul((rotatedX >> 8) - vx, nx) + Math.imul(origin[1] - vy, ny) + Math.imul((rotatedZ >> 8) - vz, nz)) | 0;
      const side = ((dot >> 8) - radius) | 0;
      if (side >= 0) {
        const along = (Math.imul(nx, rotatedDx >> 8) + Math.imul(ny, end[1] - origin[1]) + Math.imul(nz, rotatedDz >> 8)) | 0;
        if (along >= 0 || (((along >> 8) + side) | 0) > 0) {rejected = true; break;}
      }
    }
    if (!rejected) return 1;
  }
  return 0;
}

//4126d0: precomputed obstacle indices/distances and object model references
//are explicit producer-owned inputs. Every filtering/penalty decision is here.
export function evaluateAutonomousObstacleCost(from, to, radius, speed, distanceSq, {memory}) {
  let cost = 0;
  for (let listIndex = 0; listIndex < memory.readUInt32LE(0x6e651c); listIndex++) {
    const index = memory[0x920e80 + listIndex], object = memory.readUInt32LE(0x920b40 + index * 12);
    if (memory[object + 0x19a] === 5) continue;
    const model = memory.readUInt32LE(object + 0x10), objectRadius = memory.readUInt16LE(model + 0x32), objectSq = Math.imul(objectRadius, objectRadius), range = memory.readInt32LE(0x920da0 + index * 4);
    if ((range <= objectSq ? (range + objectSq * 2) | 0 : (objectSq + range * 2) | 0) < distanceSq) continue;
    const segmentSq = square(difference(shorts(memory, to), shorts(memory, from)));
    let broad;
    if (segmentSq > objectSq) {
      if (segmentSq > distanceSq) broad = distanceSq === 0 ? (objectSq + segmentSq * 2) | 0 : (objectSq + segmentSq * 8 + distanceSq) | 0;
      else broad = (segmentSq + distanceSq * 8 + objectSq) | 0;
    } else if (objectSq <= distanceSq) broad = (segmentSq + distanceSq * 8 + objectSq) | 0;
    else broad = distanceSq === 0 ? (segmentSq + objectSq * 2) | 0 : (segmentSq + objectSq * 8 + distanceSq) | 0;
    if (range > broad || !intersectsAutonomousObstacle(from, to, object, radius, index, {memory})) continue;
    const scale = speed < 100 ? 900 : ((speed << 10) - 0x18c7c) | 0;
    let penalty = -1000;
    if (range > ((objectSq + scale * 18) | 0)) penalty = -16;
    else if (range > ((objectSq + scale * 2) | 0)) penalty = (divide(Math.imul((range - scale * 9 - objectSq) | 0, 984), Math.imul(scale, 8)) - 16) | 0;
    cost = (cost + penalty) | 0;
  }
  return cost;
}

//412270 reads the progression group table9092a0, independent of pack+60,
//then sums at most three successful authored-direction segments via411fa0.
export function evaluateAutonomousRouteCost(body, groupIndex, pointIndex, origin, radius, speed, {memory, scratchBase}) {
  const group = memory.readUInt32LE(0x9092a0) + (groupIndex & 65535) * 12;
  const points = memory.readUInt32LE(group + 8), last = (memory.readUInt16LE(group) - 1) & 65535;
  let index = pointIndex & 65535, current = points + index * 16, total = 0;
  for (let segment = 0; segment < 3; segment++) {
    let next;
    if (memory[group + 2]) {if (index === 0) {if (!memory[group + 4]) return total; next = last;} else next = (index - 1) & 65535;}
    else if (index === last) {if (!memory[group + 4]) return total; next = 0;} else next = (index + 1) & 65535;
    const selected = points + next * 16, from = scratchBase - 8, to = scratchBase - 16;
    store(memory, from, shorts(memory, current)); store(memory, to, shorts(memory, selected));
    const distanceSq = square(difference(shorts(memory, from), shorts(memory, origin)));
    total = (total + evaluateAutonomousPositionCost(body, from, to, radius, speed, distanceSq, {memory, scratchBase: scratchBase - 68})) | 0;
    current = selected; index = next;
  }
  return total;
}

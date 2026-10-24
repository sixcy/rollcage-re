import {nativeGlobalAddress} from './native-global-address.mjs';
import {abs32, lookupSqrt, dotQ16, multiplyQ16, signedShort} from './fixed-integer.mjs';
import {evaluateAutonomousPositionCost, evaluateAutonomousObstacleCost} from './autonomous-candidate-costs.mjs';

const read32 = (memory, address) => memory.readUInt32LE(address);
const put32 = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const put16 = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const rowAddress = index => (0x91f1e0 + Math.imul(index, 52)) >>> 0;
const addScore = (memory, address, value) => put32(memory, address, memory.readInt32LE(address) + value);
const registerEax = value => {const result = typeof value === 'number' ? value : value?.eax; if (!Number.isInteger(result)) throw Error('Special candidate handler requires explicit EAX.'); return result | 0;};

//420a10: first stack argument (row byte offset) is unused by the native body.
export function scoreAutonomousSpecialCandidate(body, index, includeObstacle, {memory, scratchBase, handlers = {}}) {
  put32(memory, scratchBase + 8, includeObstacle);
  const from = scratchBase - 12, speed = memory.readInt16LE(body + 0x668);
  const to = 0x91f600 + memory[rowAddress(index) + 2] * 8;
  const radius = memory.readUInt16LE(read32(memory, body + 0x10) + 0x32);
  for (let axis = 0; axis < 3; axis++) put16(memory, from + axis * 2, memory.readUInt16LE(body + 0x36 + axis * 4));
  const first = handlers.call411fa0
    ? registerEax(handlers.call411fa0({memory, ecx: body, edx: from, args: [to, radius, speed, 0]}))
    : evaluateAutonomousPositionCost(body, from, to, radius, speed, 0, {memory, scratchBase: scratchBase - 0x30});
  if (!memory.readInt32LE(scratchBase + 8)) return first;
  const second = handlers.call4126d0
    ? registerEax(handlers.call4126d0({memory, ecx: from, edx: to, args: [radius, speed, 0]}))
    : evaluateAutonomousObstacleCost(from, to, radius, speed, 0, {memory, scratchBase: scratchBase - 0x2c});
  return (first + second) | 0;
}

//435240: the original caller's body argument is overwritten with its radius.
export function specialCandidateRouteCost(target, distanceSquared, index, body, {memory, scratchBase, handlers = {}}) {
  const radius = memory.readUInt16LE(read32(memory, body + 0x10) + 0x32); put32(memory, scratchBase + 8, radius);
  const row = rowAddress(index), previous = rowAddress(index - 1), groupIndex = memory.readUInt16LE(row);
  if (index - 1 < 0 || memory.readUInt16LE(previous) !== groupIndex) return memory.readInt32LE(row + 48);
  const pack = read32(memory, 0x90b98c), groups = read32(memory, pack + 0x60);
  const point = read32(memory, groups + groupIndex * 12 + 8) + memory[row + 2] * 16, from = scratchBase - 12;
  for (let axis = 0; axis < 3; axis++) put16(memory, from + axis * 2, memory.readUInt16LE(point + axis * 2));
  const speed = memory.readInt16LE(body + 0x668);
  const cost = handlers.call411fa0
    ? registerEax(handlers.call411fa0({memory, ecx: body, edx: target, args: [from, radius, speed, distanceSquared]}))
    : evaluateAutonomousPositionCost(body, target, from, radius, speed, distanceSquared, {memory, scratchBase: scratchBase - 0x30});
  return (cost + memory.readInt32LE(previous + 48)) | 0;
}

const configurations = {
  pickup: {flag: 4, pointFlag: 0x100, code: 3, weight: 31, threshold: 0xf03c, localSize: 0x4c},
  object: {flag: 0x800, pointFlag: 0x200, code: 4, weight: 25, threshold: 0xf03c, localSize: 0x5c},
  marker: {flag: 8, pointFlag: 0x400, code: 5, weight: 30, threshold: 0xdcb4, localSize: 0x54},
};

function appendSpecialCandidates(kind, body, lowestFreeAddress, {memory, scratchBase, handlers = {}, maxIterations = 65536}) {
  const config = configurations[kind], local = scratchBase - config.localSize;
  if (!(memory.readUInt32LE(body + 0x6ec) & config.flag)) return;
  if (kind === 'pickup' && memory[body + 0x68c] !== 255 && memory[body + 0x68d] !== 255) return;
  const first = (memory.readInt32LE(lowestFreeAddress) + 1) | 0;
  if (first >= 20) return;
  const capturedPosition = kind === 'object' ? [0x36, 0x3a, 0x3e].map(offset => memory.readInt16LE(body + offset)) : null;
  let retainedIndex = memory[0x6e650f], budget = maxIterations;
  const step = () => {if (--budget < 0) throw Error('Special candidate iteration budget exceeded.');};
  for (let sourceIndex = first; sourceIndex < 20; sourceIndex++) {
    step(); if (memory.readInt32LE(lowestFreeAddress) < 0 || (kind === 'object' ? retainedIndex : memory[0x6e650f]) >= 20) return;
    const sourceRow = rowAddress(sourceIndex), groupIndex = memory.readUInt16LE(sourceRow);
    if (!groupIndex || memory[sourceRow + 38] !== 0) continue;
    const pointIndex = memory[sourceRow + 2], pack = read32(memory, 0x90b98c), groups = read32(memory, pack + 0x60);
    const point = read32(memory, groups + groupIndex * 12 + 8) + pointIndex * 16;
    if (!(memory.readUInt32LE(point + 8) & config.pointFlag)) continue;
    let count, source;
    if (kind === 'pickup') {count = memory.readInt32LE(nativeGlobalAddress(memory, 0x902024)); source = read32(memory, nativeGlobalAddress(memory, 0x902020));}
    else if (kind === 'object') {count = read32(memory, nativeGlobalAddress(memory,0x82e904)); source = read32(memory, read32(memory, 0x90b990) + 0xec);}
    else {const resource = read32(memory, pack + 8); count = memory[resource + 0xf5]; source = read32(memory, resource + 0xe4);}
    for (let sourceNumber = 0; sourceNumber < count; sourceNumber++, source += kind === 'pickup' ? 4 : 20) {
      step(); let position, delta, metadata, pickupObject;
      if (kind === 'pickup') {
        const object = read32(memory, source), flags = memory.readUInt16LE(object + 0x182); pickupObject = object;
        if (!(flags & 0x80) || !(flags & 3) || memory.readUInt16LE(object + 0x18c) !== groupIndex || memory.readUInt16LE(object + 0x18e) !== pointIndex) continue;
        delta = [0x34, 0x38, 0x3c].map(offset => (memory.readInt32LE(object + offset) - memory.readInt32LE(body + offset)) | 0);
      } else if (kind === 'object') {
        metadata = read32(memory, source + 4);
        const stateIndex = memory.readUInt32LE(read32(memory, source) + 12) & 15;
        if ((memory[read32(memory, metadata + 0x194) + stateIndex * 4 + 3] & 15) === 5 || memory[source + 18] !== groupIndex || memory.readUInt16LE(source + 16) !== pointIndex) continue;
        position = [8, 10, 12].map(offset => memory.readInt16LE(source + offset));
        delta = position.map((value, axis) => signedShort(value - capturedPosition[axis]) << 16);
      } else {
        if (memory[source + 18] !== groupIndex || memory.readUInt16LE(source + 16) !== pointIndex) continue;
        position = [0, 2, 4].map(offset => memory.readInt16LE(source + offset));
        delta = position.map((value, axis) => ((value << 16) - memory.readInt32LE(body + 0x34 + axis * 4)) | 0);
      }
      const integers = delta.map(value => signedShort(value >> 16));
      const squared = integers.reduce((sum, value) => (sum + Math.imul(value, value)) | 0, 0);
      if (kind === 'object' ? squared > 2250000 : ((squared - 90000) >>> 0) > 0x20f580) continue;
      const input = abs32(squared); put32(memory, 0x91d45c, input); put32(memory, 0x91d460, Math.clz32(input));
      const distance = lookupSqrt(input); if (!distance) throw Error('Special candidate native IDIV by zero.');
      const direction = [0, 4, 8].map(offset => memory.readInt32LE(sourceRow + 16 + offset));
      const ratio = Math.trunc(dotQ16(delta, direction) / distance);
      if (ratio < config.threshold) continue;
      let score = multiplyQ16(ratio, config.weight << 16) >> 16;
      if (distance > 1000) score -= score >> 2;
      if (score <= 0) continue;
      if (kind === 'pickup') position = [0x36, 0x3a, 0x3e].map(offset => memory.readInt16LE(pickupObject + offset));
      const targetIndex = memory[0x6e650f], target = 0x91f600 + targetIndex * 8;
      for (let axis = 0; axis < 3; axis++) put16(memory, target + axis * 2, position[axis]);
      let free = memory.readInt32LE(lowestFreeAddress), destination = rowAddress(free);
      memory[destination + 2] = targetIndex;
      if (kind === 'object') memory[destination + 3] = memory[metadata + 0x192];
      memory[destination + 37] = config.code; addScore(memory, destination + 44, score);
      const scoreDestination = kind === 'pickup' ? destination : rowAddress(memory.readInt32LE(lowestFreeAddress));
      const scoreEntry = local - 12, rowOffset = Math.imul(free, 52), includeObstacle = kind === 'object' ? 0 : 1;
      put32(memory, scoreEntry + 4, rowOffset); put32(memory, scoreEntry + 8, includeObstacle);
      const extra = handlers.call420a10
        ? registerEax(handlers.call420a10({memory, ecx: body, edx: free, args: [rowOffset, includeObstacle]}))
        : scoreAutonomousSpecialCandidate(body, free, includeObstacle, {memory, scratchBase: scoreEntry, handlers});
      addScore(memory, scoreDestination + 44, extra);
      free = memory.readInt32LE(lowestFreeAddress); destination = rowAddress(free);
      const routeTarget = 0x91f600 + memory[0x6e650f] * 8, routeEntry = local - 20;
      put32(memory, routeEntry + 4, sourceIndex); put32(memory, routeEntry + 8, body);
      const cost = handlers.call435240
        ? registerEax(handlers.call435240({memory, ecx: routeTarget, edx: squared, args: [sourceIndex, body]}))
        : specialCandidateRouteCost(routeTarget, squared, sourceIndex, body, {memory, scratchBase: routeEntry, handlers});
      const completedIndex = memory[0x6e650f]; addScore(memory, destination + 48, cost);
      retainedIndex = (completedIndex + 1) & 255; memory[0x6e650f] = retainedIndex; memory[0x91f1c0 + completedIndex] = 31;
      free = (free - 1) | 0; put32(memory, lowestFreeAddress, free);
      if (free < 0 || retainedIndex >= 20) return;
    }
    if (kind === 'object' && count !== 0) retainedIndex = memory[0x6e650f];
  }
}

export const appendPickupSpecialCandidates = (body, lowestFreeAddress, context) => appendSpecialCandidates('pickup', body, lowestFreeAddress, context);
export const appendObjectSpecialCandidates = (body, lowestFreeAddress, context) => appendSpecialCandidates('object', body, lowestFreeAddress, context);
export const appendMarkerSpecialCandidates = (body, lowestFreeAddress, context) => appendSpecialCandidates('marker', body, lowestFreeAddress, context);

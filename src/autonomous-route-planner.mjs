import {scaleContactVector} from './body-contact-friction.mjs';
import {signedShort} from './fixed-integer.mjs';
import {findAutonomousRoutePoint} from './autonomous-route-geometry.mjs';
import {updateNearestAutonomousCompetitor} from './autonomous-profile-plan.mjs';
import {buildAutonomousRouteCandidates} from './autonomous-candidate-builder.mjs';
import {autonomousCandidateAddress, resetAutonomousCandidates, applyAutonomousCandidateEntryBias, linkedAutonomousCandidateScore} from './autonomous-candidate-scores.mjs';
import {evaluateAutonomousCandidateAlignment, applyAutonomousCandidateTurnBias, applyAutonomousCandidateModeBias, applyAutonomousCandidateEventBias} from './autonomous-candidate-modifiers.mjs';
import {populateAutonomousNearbyBodies, populateAutonomousNearbyObstacles} from './autonomous-nearby-objects.mjs';
import {updateAutonomousOpponentCandidates} from './autonomous-opponent-candidates.mjs';
import {evaluateAutonomousPositionCost, evaluateAutonomousObstacleCost, evaluateAutonomousRouteCost} from './autonomous-candidate-costs.mjs';
import {appendPickupSpecialCandidates, appendObjectSpecialCandidates, appendMarkerSpecialCandidates} from './autonomous-special-candidates.mjs';

//421430's scoring/selection pass with actual game-owned callees. Optional
//handlers support boundary probes. scratchBase is native entry ESP.
export function planAutonomousRoute(initialBody, {memory, scratchBase, handlers = {}}) {
  const local = scratchBase - 140;
  const s32 = address => memory.readInt32LE(address), u32 = address => memory.readUInt32LE(address);
  const put = (address, value) => memory.writeInt32LE(value | 0, address);
  const word = (address, value) => memory.writeUInt16LE(value & 65535, address);
  const vector = address => [0, 4, 8].map(offset => s32(address + offset));
  const store = (address, values) => values.forEach((value, axis) => put(address + axis * 4, value));
  const copyPoint = (destination, source) => {for (let axis = 0; axis < 3; axis++) word(destination + axis * 2, memory.readUInt16LE(source + axis * 2));};
  const pointAt = (group, index) => u32(u32(u32(0x90b98c) + 0x60) + (group & 65535) * 12 + 8) + (index & 65535) * 16;
  const score = (row, amount) => put(row + 44, (s32(row + 44) + amount) | 0);
  const call = (name, ecx, edx, args, entry) => {
    const request = {memory, ecx, edx, args, scratchBase: entry};
    if (handlers[name]) return handlers[name](request);
    if (name === 'call4209d0') return resetAutonomousCandidates({memory});
    if (name === 'call434960') return updateNearestAutonomousCompetitor(ecx, {memory});
    if (name === 'call4210b0') return buildAutonomousRouteCandidates(ecx, edx, args[0], {memory, scratchBase: entry});
    if (name === 'call491740') return findAutonomousRoutePoint(ecx, edx, args[0], args[1], {memory, scratchBase: entry});
    if (name === 'call420a90') return linkedAutonomousCandidateScore(ecx, edx, {memory});
    if (name === 'call420f90') return applyAutonomousCandidateEntryBias(ecx, edx, {memory});
    const context = {memory, scratchBase: entry};
    if (name === 'call420ba0') return evaluateAutonomousCandidateAlignment(ecx, edx, args[0], args[1], context);
    if (name === 'call420de0') return applyAutonomousCandidateTurnBias(ecx, edx, context);
    if (name === 'call411e70') return populateAutonomousNearbyBodies(ecx, context);
    if (name === 'call4125a0') return populateAutonomousNearbyObstacles(ecx, context);
    if (name === 'call492d80') return updateAutonomousOpponentCandidates(ecx, edx, context);
    if (name === 'call412270') return evaluateAutonomousRouteCost(ecx, edx, args[0], args[1], args[2], args[3], context);
    if (name === 'call411fa0') return evaluateAutonomousPositionCost(ecx, edx, args[0], args[1], args[2], args[3], context);
    if (name === 'call4126d0') return evaluateAutonomousObstacleCost(ecx, edx, args[0], args[1], args[2], context);
    if (name === 'call434f80') return appendPickupSpecialCandidates(ecx, edx, context);
    if (name === 'call434c60') return appendObjectSpecialCandidates(ecx, edx, context);
    if (name === 'call434800') return applyAutonomousCandidateModeBias(ecx, edx, context);
    if (name === 'call434550') return appendMarkerSpecialCandidates(ecx, edx, context);
    if (name === 'call4352f0') return applyAutonomousCandidateEventBias(ecx, edx, context);
    throw Error(`Autonomous route planning requires reached handler ${name}.`);
  };
  const number = (name, ecx, edx, args, entry) => {
    const result = call(name, ecx, edx, args, entry), value = typeof result === 'number' ? result : result?.eax;
    if (!Number.isInteger(value)) throw Error(`Autonomous route planning requires explicit EAX from ${name}.`);
    return value | 0;
  };
  let body = initialBody;
  const pack = u32(0x90b98c), group = memory.readUInt16LE(body + 0x6c0), initialIndex = memory.readUInt16LE(body + 0x6c2);
  const speed = memory.readInt16LE(body + 0x668);
  put(local + 0x48, 11000); put(local + 0x58, body); put(local + 0x20, group); put(local + 0x24, initialIndex);
  put(local + 0x40, speed & 65535); put(local + 0x44, 0);
  put(local + 0x4c, u32(u32(pack + 0x60) + group * 12 + 8) + initialIndex * 16);
  put(local + 0x28, Math.imul(s32(body + 0x664), s32(body + 0x664)));
  call('call4209d0', undefined, undefined, [], local - 4);
  call('call434960', body, undefined, [], local - 4);
  call('call491740', u32(pack + 0x60) + group * 12, local + 0x24, [local + 0x4c, body + 0x34], local - 12);
  const lowest = number('call4210b0', body, group, [u32(local + 0x24)], local - 16);
  put(local + 0x18, lowest);
  for (let axis = 0; axis < 3; axis++) word(local + 0x5c + axis * 2, memory.readUInt16LE(body + 0x36 + axis * 4));
  store(local + 0x7c, vector(body + 0x68));
  if (speed > 1) store(local + 0x7c, scaleContactVector(vector(local + 0x7c), 65536));
  let radius = memory.readUInt16LE(u32(body + 0x10) + 0x32);
  put(local + 0x1c, radius);
  for (let index = lowest + 1; index < 20; index++) {
    const row = autonomousCandidateAddress(index);
    if (memory.readUInt16LE(row) && !memory[row + 38]) call('call420ba0', index, body + 0x34, [local + 0x7c, s32(body + 0x664)], local - 12);
  }
  if (lowest + 1 < 20) radius = u32(local + 0x1c);
  if (memory[body + 0x6f1] > 1) call('call420de0', u32(local + 0x20), u32(local + 0x24), [], local - 4);
  call('call411e70', body, undefined, [], local - 4);
  call('call4125a0', body, undefined, [], local - 4);
  call('call492d80', body, local + 0x18, [], local - 4);
  const start = (s32(local + 0x18) + 1) | 0;
  put(local + 0x4c, start);

  if (start < 20) {
    const session = u32(0x5ecb1c);
    for (let index = start; index < 20; index++) {
      const row = autonomousCandidateAddress(index), candidateGroup = memory.readUInt16LE(row);
      if (!candidateGroup) continue;
      const point = pointAt(candidateGroup, memory[row + 2]), minimumSpeed = memory[point + 6] * 2;
      if (minimumSpeed && speed < minimumSpeed) {memory[row + 38] = 1; continue;}
      const ownGroup = u32(local + 0x20);
      if (memory[point + 8] & 0x40) {
        if (memory[session + 0x586] !== memory[0x90931c + memory.readUInt16LE(body + 0x65e) * 0x30c]) {memory[row + 38] = 1; continue;}
      }
      if (memory[point + 8] & 8) {if (candidateGroup !== ownGroup) {memory[row + 38] = 1; continue;} score(row, -110);}
      if ((memory[point + 8] & 0x10) && memory[session + 0x553]) score(row, 20);
      if (candidateGroup === ownGroup) score(row, memory[point + 8] & 4 ? 12 : 2);
    }
  }
  put(local + 0x38, 0);
  put(local + 0x20, 0x6fb3a0 + Math.imul(start, 8));
  for (let index = start; index < 20; index++) {
    const row = autonomousCandidateAddress(index), candidateGroup = memory.readUInt16LE(row);
    if (candidateGroup) {
      const pointIndex = memory[row + 2], point = pointAt(candidateGroup, pointIndex);
      put(local + 0x24, pointIndex); put(local + 0x54, point - pointIndex * 16); put(local + 0x50, point);
      copyPoint(local + 0x64, point);
      const difference = [0, 2, 4].map(offset => signedShort(memory.readUInt16LE(local + 0x64 + offset) - memory.readUInt16LE(local + 0x5c + offset)));
      store(local + 0x2c, difference);
      const squared = difference.reduce((sum, value) => (sum + Math.imul(value, value)) | 0, 0); put(local + 0x3c, squared);
      let extra;
      if (candidateGroup === memory.readUInt16LE(local + 0x38)) {
        //The prior row's point byte is row-52+2, independent of current group.
        const previousPoint = u32(local + 0x54) + memory[row - 50] * 16;
        copyPoint(local + 0x74, previousPoint);
        extra = (number('call411fa0', body, local + 0x64, [local + 0x74, radius, speed, squared], local - 20) + s32(row - 4)) | 0;
      } else {
        put(local + 0x38, candidateGroup);
        if (memory[row + 39] && !(memory[point + 8] & 8)) extra = number('call420a90', candidateGroup, pointIndex, [], local - 4);
        else extra = number('call412270', body, candidateGroup, [u32(local + 0x24), local + 0x5c, radius, speed, candidateGroup], local - 24);
      }
      put(row + 48, extra);
      if (!memory[row + 38]) {
        if (memory[body + 0x6f1] < 3) score(row, squared > 640000 ? -10 : squared > 250000 ? -5 : squared > 40000 ? -2 : 0);
        else if (squared < 409600 && memory[row + 36]) score(row, -150);
        if (s32(row + 28) < 60000 && speed > 100) {
          const velocity = vector(body + 0x68), length = s32(body + 0x664) << 3;
          const target = scaleContactVector(difference.map(value => value << 16), length); store(local + 0x7c, target);
          const ahead = vector(body + 0x34).map((value, axis) => (value + (velocity[axis] << 2)) | 0);
          const forecast = velocity.map((value, axis) => (((value << 3) + ahead[axis]) + target[axis]) | 0);
          put(local + 0x54, forecast[0]); put(local + 0x34, forecast[1]); put(local + 0x50, forecast[2]);
          if (!s32(local + 0x44)) {ahead.forEach((value, axis) => word(local + 0x6c + axis * 2, value >> 16)); put(local + 0x44, 1);}
          forecast.forEach((value, axis) => word(u32(local + 0x20) + axis * 2, value >> 16));
          if (s32(local + 0x48) === 11000) put(local + 0x48, number('call411fa0', body, local + 0x5c, [local + 0x6c, radius, speed, 0], local - 20));
          score(row, s32(local + 0x48));
          score(row, number('call411fa0', body, local + 0x6c, [u32(local + 0x20), radius, speed, s32(local + 0x28) >> 10], local - 20));
          score(row, number('call411fa0', body, u32(local + 0x20), [local + 0x64, radius, speed, s32(local + 0x28) >> 8], local - 36));
        } else score(row, number('call411fa0', body, local + 0x5c, [local + 0x64, radius, speed, 0], local - 20));
      }
    } else if (memory[row + 37]) score(row, number('call411fa0', body, local + 0x5c, [0x91f600 + memory[row + 2] * 8, radius, speed, 0], local - 20));
    put(local + 0x20, u32(local + 0x20) + 8);
  }

  let baseObstacle = 11000;
  put(local + 0x1c, 0x6fb3a0 + Math.imul(start, 8));
  for (let index = start; index < 20; index++) {
    const row = autonomousCandidateAddress(index);
    if (!memory[row + 38]) {
      const candidateGroup = memory.readUInt16LE(row);
      let cost;
      if (candidateGroup) {
        copyPoint(local + 0x64, pointAt(candidateGroup, memory[row + 2]));
        if (s32(row + 28) < 60000 && speed > 100) {
          if (baseObstacle === 11000) baseObstacle = number('call4126d0', local + 0x5c, local + 0x6c, [radius, speed, 0], local - 16);
          cost = baseObstacle;
          if (!cost) {
            cost = number('call4126d0', local + 0x6c, u32(local + 0x1c), [radius, speed, s32(local + 0x28) >> 10], local - 16);
            if (!cost) cost = number('call4126d0', u32(local + 0x1c), local + 0x64, [radius, speed, s32(local + 0x28) >> 8], local - 16);
          }
        } else cost = number('call4126d0', local + 0x5c, local + 0x64, [radius, speed, 0], local - 16);
      } else if (memory[row + 37]) cost = number('call4126d0', local + 0x5c, 0x91f600 + memory[row + 2] * 8, [radius, speed, 0], local - 16);
      if (cost !== undefined) score(row, cost);
    }
    put(local + 0x1c, u32(local + 0x1c) + 8);
  }
  if (start < 20) body = u32(local + 0x58);
  for (const name of ['call434f80', 'call434c60', 'call434800', 'call434550', 'call4352f0']) call(name, body, name === 'call434800' || name === 'call4352f0' ? s32(local + 0x18) : local + 0x18, [], local - 4);
  const finalLowest = s32(local + 0x18), groups = u32(u32(0x90b98c) + 0x60), early = u32(0x90a548) < 350;
  if (memory[body + 0x6f1] >= 3) for (let index = 19; index > finalLowest; index--) {
    const row = autonomousCandidateAddress(index), group = memory.readUInt16LE(row);
    if (group) {const bias = memory.readInt8(groups + group * 12 + 6); if (!early || bias < 0) score(row, bias);}
  }
  call('call420f90', body, finalLowest, [], local - 4);
  let best = -50000, selected = -1;
  for (let index = 19; index > finalLowest; index--) {
    const row = autonomousCandidateAddress(index), total = (s32(row + 44) + s32(row + 48)) | 0;
    if ((memory.readUInt16LE(row) || memory[row + 37]) && total > best && !memory[row + 38]) {best = total; selected = index;}
  }
  if (selected === -1) selected = 19;
  const chosen = autonomousCandidateAddress(selected), type = memory[chosen + 37];
  if (type) {
    const point = memory[chosen + 2], oldTimer = memory[body + 0x6ca]; memory[body + 0x6c9] = type;
    for (let axis = 0; axis < 3; axis++) put(body + 0x6cc + axis * 4, memory.readInt16LE(0x91f600 + point * 8 + axis * 2) << 16);
    if (type === 1) {memory[body + 0x6cb] = 3; memory[body + 0x6ca] = Math.max(0, Math.min(oldTimer - 1, memory[0x91f1c0 + point]));}
    else if (memory[body + 0x6cb]) memory[body + 0x6cb]--;
  } else {
    word(body + 0x6c9, 0x1f00); if (memory[body + 0x6cb]) memory[body + 0x6cb]--;
    if (memory.readUInt16LE(chosen + 42)) word(body + 0x6c4, memory.readUInt16LE(chosen + 42));
    word(body + 0x6c0, memory.readUInt16LE(chosen)); word(body + 0x6c2, memory[chosen + 2]);
  }
}

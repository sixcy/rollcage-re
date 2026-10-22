import {quaternionFromReleaseDirection} from './scripted-release.mjs';
import {queryRawRespawnPlacement} from './raw-respawn-query.mjs';
import {unregisterPhysicalBody, removeBodySpatial, retireType33Body} from './body-retirement.mjs';
import {allocateRawEffectParticle, registerRawEffectSpatial, lookupRawSpatialBucket} from './body-retirement-effects.mjs';
import {updateRespawnProgress} from './respawn-progress.mjs';
import {updateLapAdvance} from './lap-timing.mjs';
import {finishRaceProgress} from './race-completion.mjs';
import {populateRawVehicleTrackBasis} from './raw-track-basis.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {resolveNativeMemoryAddress} from './native-memory-spans.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p);
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const vector = (m, p) => [0, 4, 8].map(o => get(m, p + o));
const nextSeed = value => Math.imul(value, 0x41a7) & 0x7fffffff;

//47e180. The participant count is captured once; the body pointer is reloaded
//for the rejection mask after the captured body's state has been written.
export function checkRawPostFrameVehicles({memory}) {
  const count = memory[ptr(memory, 0x5ecb1c) + 0x54d];
  for (let index = 0; index < count; index++) {
    const record = 0x909300 + index * 0x30c, body = ptr(memory, record);
    const sector = ptr(memory, ptr(memory, 0x909240) + memory[body + 0x11c] * 4);
    let reject = memory.readInt16LE(body + 0x3a) > memory.readInt16LE(sector + 0x14) + 512;
    if (!reject) {
      if (memory.readInt16LE(body + 0x668) < 2) {
        memory[record + 0x248] = memory[record + 0x248] + 1 & 255;
        let grounded = true;
        for (let wheel = 0; wheel < 4; wheel++) if (!(memory[body + 0x324 + wheel * 200] & 1)) {grounded = false; break;}
        if (grounded) memory[record + 0x248] = 0;
        reject = memory[record + 0x248] > 90;
      } else memory[record + 0x248] = 0;
    }
    if (reject) {
      put(memory, body + 0x128, 32); const live = ptr(memory, record);
      memory[record + 0x248] = 0; put(memory, live + 0x110, get(memory, live + 0x110) & 0x7fffffff);
    }
  }
}

//436920: allocation and spatial insertion are actual raw implementations.
//Positions/velocities remain pointers so allocation aliases are read live.
export function emitRawRespawnParticle(position, velocity, colorMode, typeMode, {memory, scratchBase}) {
  const particle = allocateRawEffectParticle({memory});
  word(memory, particle + 0x96, 100); memory[particle + 0x95] = 16; word(memory, particle + 0xa2, 0x8000);
  put(memory, particle, typeMode === 0 ? 23 : 30);
  const x = get(memory, velocity), y = get(memory, velocity + 4), z = get(memory, velocity + 8);
  for (let axis = 0; axis < 3; axis++) word(memory, particle + 0x9c + axis * 2, get(memory, velocity + axis * 4));
  const translated = [x, y, z].map((value, axis) => (get(memory, position + axis * 4) + (value << 8)) | 0);
  translated.forEach((value, axis) => put(memory, particle + 0x88 + axis * 4, value));
  put(memory, particle + 0x98, -7968);
  //436920→474670 enters at S−28;4286e0 then enters at S−56.
  //Its42870f PUSH EDI leaves the actual allocated particle at S−80.
  //Later non-host49b690 transport observes this word as address padding.
  if (Number.isInteger(scratchBase)) put(memory, scratchBase - 80, particle);
  registerRawEffectSpatial(particle, ...translated, {memory});
  const first = nextSeed(get(memory, 0x5ec958)); put(memory, particle + 0xa4, get(memory, 0x9153e8));
  memory[particle + 0x94] = 1; put(memory, 0x5ec958, first);
  const low = Math.imul(first >>> 15, 255) >>> 16;
  let color, registerEcx = first;
  if (colorMode === 0) {
    const second = nextSeed(first), third = nextSeed(second); registerEcx = second; put(memory, 0x5ec958, third);
    color = (Math.imul(second >>> 15, 255) >>> 8 & 0xffff00) | low | (Math.imul(third >>> 15, 255) & 0xffff0000) | 0xff000000;
  } else color = low << 16 | low << 8 | low | 0xff000000;
  put(memory, particle + 0x98, color); return {particle, registerEcx};
}

//47d900: native local vectors are retained for pointer aliasing in436920.
export function emitRawVehicleRespawnRing(body, code, {memory, scratchBase}) {
  let mode = code | 0; if (mode === 2) mode = 0; else memory[body + 0x699] = 31;
  const center = vector(memory, body + 0x34), frame = scratchBase - 44;
  let registers;
  for (let index = 0; index < 16; index++) {
    const angle = index << 4, phase = angle + 64 & 255;
    const sine = memory.readInt16LE(0x5ed030 + angle * 2) << 7, cosine = memory.readInt16LE(0x5ed0b0 + angle * 2) << 7;
    put(memory, frame + 0x20, sine + (sine >> 1) + center[0]); put(memory, frame + 0x24, center[1]); put(memory, frame + 0x28, cosine + (cosine >> 1) + center[2]);
    put(memory, frame + 0x14, memory.readInt16LE(0x5ed030 + phase * 2) >> 4); put(memory, frame + 0x18, 0); put(memory, frame + 0x1c, memory.readInt16LE(0x5ed0b0 + phase * 2) >> 4);
    registers = emitRawRespawnParticle(frame + 0x20, frame + 0x14, mode, 0, {memory, scratchBase: frame - 12});
  }
  return registers;
}

//47d440. Pointer copies follow the actual native read/store order. Progression
//uses coherent record views; basis outputs occupy449d40's actual local vectors.
export function applyRawRespawn(body, position, quaternion, rotation, route, index, terrain, runtime) {
  const {memory, scratchBase, progression, completionHandlers = {}} = runtime;
  if (runtime.onRecoveryApply !== undefined) {
    if (typeof runtime.onRecoveryApply !== 'function') throw Error('Recovery application observer must be a function.');
    const hex = (address, length) => memory.subarray(address, address + length).toString('hex');
    runtime.onRecoveryApply(Object.freeze({bodyAddress: body, bodyHeaderHex: hex(body, 0x180), entryEsp: scratchBase,
      positionAddress: position, positionHex: hex(position, 12), quaternionAddress: quaternion, quaternionHex: hex(quaternion, 16),
      rotationAddress: rotation, rotationHex: hex(rotation, 18), routeAddress: route, routeHex: hex(route, 12), index, terrain}));
  }
  removeBodySpatial(body, {memory});
  const pose = vector(memory, position); put(memory, body + 0x38, pose[1]); put(memory, body + 0x34, pose[0]); put(memory, body + 0x3c, pose[2]);
  const y = get(memory, quaternion + 8), x = get(memory, quaternion + 4), z = get(memory, quaternion + 12);
  put(memory, body + 0x60, y); put(memory, body + 0x5c, x); put(memory, body + 0x64, z); put(memory, body + 0x58, get(memory, quaternion));
  for (let axis = 0; axis < 9; axis++) word(memory, body + 0xc4 + axis * 2, memory.readUInt16LE(rotation + axis * 2));
  for (const base of [0x68, 0x40, 0xb8, 0x74, 0x80, 0x4c]) for (const offset of [0, 4, 8]) put(memory, body + base + offset, 0);
  put(memory, body + 0x11c, terrain);
  if ((get(memory, body) & 511) === 3) {
    const record = 0x909300 + memory.readUInt16LE(body + 0x65e) * 0x30c;
    for (let wheel = 0; wheel < 4; wheel++) put(memory, body + 0x37c + wheel * 200, 0);
    put(memory, body + 0x650, 0);
    const registered = ptr(memory, record); put(memory, record + 0x54, route); put(memory, record + 0x58, index);
    if (memory[registered + 0x718] === 8) {word(memory, registered + 0x6c0, memory[route + 5]); word(memory, registered + 0x6c2, memory.readUInt16LE(record + 0x58));}
    const session = ptr(memory, 0x5ecb1c), mode = memory[session + 0x551];
    if (mode === 3 || mode === 8) {
      const counter = session + memory.readUInt16LE(ptr(memory, record) + 0x65e) + 8;
      if (memory[counter]) memory[counter]--;
    } else {
      if (progression?.memory !== memory || typeof progression.recordAt !== 'function') throw Error('Raw respawn progression requires coherent native record views.');
      const recordView = progression.recordAt(record), before = get(memory, record + 0x24), transitionEntry = scratchBase - 20;
      const advanceLap = value => updateLapAdvance(value.bytes, {body: value.body00, clock90a548: get(memory, 0x90a548)});
      const finish = (value, entry) => finishRaceProgress(value.address, {memory, scratchBase: entry - 228, handlers: completionHandlers});
      const trackBasis = bodyView => {
        const tangent = transitionEntry - 24, normal = transitionEntry - 12;
        populateRawVehicleTrackBasis(bodyView.address, tangent, normal, {memory}); return vector(memory, tangent);
      };
      updateRespawnProgress(recordView, progression.runtime, {trackBasis, advanceLap, finishProgress: value => finish(value, transitionEntry - 112)});
      let delta = get(memory, record + 0x24) - before | 0;
      if (delta > 32767) delta = delta - 65536 | 0; else if (delta < -32768) delta = delta + 65536 | 0;
      const total = delta + before | 0;
      if (total < 0) {const lap = memory[record + 0x1c]; if (lap && lap <= memory[ptr(memory, 0x5ecb1c) + 0x586]) memory[record + 0x1c]--;}
      else if (total > 65536) {advanceLap(recordView); finish(recordView, scratchBase - 20);}
    }
    const controller = ptr(memory, 0x909318 + memory.readUInt16LE(body + 0x65e) * 0x30c);
    if (controller !== 0x12345678) memory[controller + 0x39] |= 4;
  }
  const selected = lookupRawSpatialBucket(...vector(memory, body + 0x34), {memory});
  //The inline lookup writes through47d440's original first argument slot.
  put(memory, scratchBase + 4, selected.outside);
  const tagged = selected.bucket + (selected.outside ? 1 : 0), bucket = tagged & 0xfffffffe, base = ptr(memory, 0x902eec);
  put(memory, body + 12, tagged);
  const head = memory.readUInt16LE(bucket + 8), id = ((body - base + 128 >>> 0) >>> 7) & 65535;
  put(memory, body + 4, head); if (head) word(memory, base - 122 + head * 128, id); word(memory, bucket + 8, id);
}

//47ccc0 with actual prepass, retirement, query, placement, ring and sound.
//No path/pose/obstruction answers are supplied by handlers. Scene/pool views
//remain caller-owned state until the whole scene constructor is reconstructed.
export function runRawPostFrameBodyStates(runtime) {
  const {memory, scratchBase} = runtime;
  if (!Buffer.isBuffer(memory) || !Number.isInteger(scratchBase) || runtime.views?.memory !== memory) throw Error('Raw post-frame states require coherent memory/views and native entry ESP.');
  checkRawPostFrameVehicles(runtime);
  let remaining = memory.readUInt16LE(0x902bc4), cursor = ptr(memory, 0x902bc0);
  let closestRoute = 0, closestPoint = 0, closestIndex = -1, closestDistance = 0x7fffffff;
  let secondRoute = 0, secondPoint = 0, secondIndex = -1, secondDistance = 0x7fffffff;
  let respawnedBodies = 0, retiredBodies = 0;
  while (remaining > 0) {
    const body = ptr(memory, cursor);
    if (get(memory, body + 0x128) === 32) {
      const type = get(memory, body) & 511;
      if (type === 4) {const controller = ptr(memory, body + 0x164); memory[controller + 0x3a] = 20; const registered = ptr(memory, controller); put(memory, registered, get(memory, registered) | 512); memory[controller + 0x39] |= 128; break;}
      if (type === 7 || type === 21) {
        const controller = ptr(memory, body + 0x164); unregisterPhysicalBody(ptr(memory, controller), {memory}); removeBodySpatial(ptr(memory, controller), {memory});
        const slot = memory[controller + 5]; if (slot >= 36) throw RangeError('Post-frame controller slot exceeds native36-entry table.');
        memory[0x849940 + slot] = 0; memory[controller + 4] = 0; word(memory, ptr(memory, controller) + 0x160, 0); cursor -= 4; remaining--; retiredBodies++;
      } else if (type === 33) {
        retireType33Body(body, {...runtime, scratchBase: scratchBase - 104}); cursor -= 4; remaining--; retiredBodies++;
      } else {
        const position = [0x36, 0x3a, 0x3e].map(offset => memory.readInt16LE(body + offset)), pack = ptr(memory, 0x90b98c), groups = memory[pack + 0x46];
        for (let groupIndex = 1, route = ptr(memory, pack + 0x60) + 12; groupIndex < groups; groupIndex++, route += 12) {
          for (let index = 0, point = ptr(memory, route + 8); index < memory.readUInt16LE(route); index++, point += 16) {
            if (point === ptr(memory, 0x70eb18)) continue;
            const delta = [0, 2, 4].map((offset, axis) => memory.readInt16LE(point + offset) - position[axis]);
            const distance = Math.imul(delta[2], delta[2]) + Math.imul(delta[1], delta[1]) + Math.imul(delta[0], delta[0]) | 0;
            if (distance < closestDistance) {secondRoute = closestRoute; secondPoint = closestPoint; secondIndex = closestIndex; secondDistance = closestDistance; closestRoute = route; closestPoint = point; closestIndex = index; closestDistance = distance;}
            else if (distance < secondDistance) {secondRoute = route; secondPoint = point; secondIndex = index; secondDistance = distance;}
          }
        }
        put(memory, 0x70eb18, closestPoint);
        for (const offset of [0, 2, 4]) put(memory, 0x70eb0c + offset * 2, memory.readInt16LE(closestPoint + offset) << 16);
        const forward = closestIndex < memory.readUInt16LE(closestRoute) - 1, neighbor = closestPoint + (forward ? 16 : -16);
        let sign = forward ? 1 : -1; if (memory[closestRoute + 2]) sign = -sign;
        const direction = [0, 2, 4].map(offset => Math.imul((memory.readInt16LE(neighbor + offset) - memory.readInt16LE(closestPoint + offset)) << 8, sign));
        direction.forEach((value, axis) => put(memory, 0x70eb1c + axis * 4, value));
        const math = {}, quaternion = quaternionFromReleaseDirection(direction, math), quaternionAddress = scratchBase - 24, output = scratchBase - 44;
        direction.forEach((value, axis) => put(memory, 0x70eb1c + axis * 4, value)); quaternion.forEach((value, axis) => put(memory, quaternionAddress + axis * 4, value));
        put(memory, 0x91d45c, math.sum91d45c); put(memory, 0x91d460, math.leadingZeros91d460);
        //47cf02/47cf19 publish a module-literal pointer in EDX. Resolve its
        //actual identity before crossing a child/observer boundary under ASLR.
        const respawnPosition = resolveNativeMemoryAddress(memory, 0x70eb0c, 12);
        const accepted = queryRawRespawnPlacement(body, respawnPosition, quaternionAddress, body + 0xc4, 1, output, {...runtime, scratchBase: scratchBase - 120});
        let route = closestRoute, index = closestIndex;
        if (!accepted) {put(memory, 0x70eb18, secondPoint); for (const offset of [0, 2, 4]) put(memory, 0x70eb0c + offset * 2, memory.readInt16LE(secondPoint + offset) << 16); route = secondRoute; index = secondIndex;}
        applyRawRespawn(body, respawnPosition, quaternionAddress, body + 0xc4, route, index, get(memory, output), {...runtime, scratchBase: scratchBase - 124});
        if ((get(memory, body) & 511) === 3) emitRawVehicleRespawnRing(body, 0, {...runtime, scratchBase: scratchBase - 104});
        emitNativeEffect(43, 0, [0, -1, 9000, 6, undefined, 0, 0], {dispatch40ea40: value => dispatchNativeSound(value, runtime.soundRuntime ?? {memory})}); respawnedBodies++;
      }
    }
    cursor += 4; remaining--;
  }
  return {respawnedBodies, retiredBodies};
}

//450e50 supplies the actual nested47ccc0 entry, rather than a fixture's ESP.
export function runRacePostFrameStage({memory, scratchBase, postFrame}) {
  if (postFrame?.memory !== memory) throw Error('call47ccc0 requires its coherent shared post-frame runtime.');
  return runRawPostFrameBodyStates({...postFrame, scratchBase});
}

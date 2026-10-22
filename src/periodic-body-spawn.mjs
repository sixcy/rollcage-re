import {createRawBody, initializeRawBody, registerRawBodyShapes, registerRawBodySpatial} from './raw-body-construction.mjs';
import {removeBodySpatial, retireType33Body} from './body-retirement.mjs';
import {emitRawEffectParticles, lookupRawSpatialBucket} from './body-retirement-effects.mjs';
import {updateRawLinearVelocity} from './raw-linear-velocity.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import constants from './periodic-body-constants.json' with {type: 'json'};

const get = (m, p) => m.readInt32LE(p), pointer = (m, p) => m.readUInt32LE(p);
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
const random = (memory) => {
  const seed = Math.imul(get(memory, 0x5ec954), 0x41a7) & 0x7fffffff;
  put(memory, 0x5ec954, seed); return Math.imul(seed >>> 15, 0x7fff) >>> 16;
};

export function initializePeriodicBodyConstants(memory) {
  for (const item of constants.constants) Buffer.from(item.bytesHex, 'hex').copy(memory, item.address);
}

//469ec0: the single type33 controller is allocated from the real body arena,
//initialized/spatially inserted, then immediately removed until first spawn.
export function initializePeriodicBody({memory, scratchBase}) {
  if (!memory[pointer(memory, 0x5ecb1c) + 0x554]) return;
  const body = createRawBody(0, 0x821, 0x180, 0, {memory, scratchBase: scratchBase - 16});
  put(memory, 0x903510, body); put(memory, body + 0x148, 0x46a2c0);
  initializeRawBody(pointer(memory, 0x903510), 0x5ec318, {memory, scratchBase: scratchBase - 16});
  removeBodySpatial(pointer(memory, 0x903510), {memory});
  const current = pointer(memory, 0x903510);
  put(memory, 0x90351c, 0); put(memory, 0x903520, 0); put(memory, current + 0x164, 0x903510);
  put(memory, 0x903514, 0); put(memory, 0x903518, 127);
}

//46a2c0 is a pointer-installed Listing callback rather than a Ghidra procedure.
//Its body is taken from the first native stack argument; the return is zero.
export function handlePeriodicBodyContact(body, runtime) {
  retireType33Body(body, {...runtime, scratchBase: runtime.scratchBase - 4});
  return 0;
}

export function createPeriodicBodyCollisionFilter(runtime) {
  return body => {
    if (!Number.isInteger(body?.address) || !Buffer.isBuffer(body.bytes) || body.bytes.buffer !== runtime.memory.buffer || body.bytes.byteOffset !== runtime.memory.byteOffset + body.address || body.bytes.length < 0x180) throw Error('Periodic body collision filter requires shared native body storage.');
    return handlePeriodicBodyContact(body.address, runtime);
  };
}

//46a140. Incoming pointer is player+34h; rejected attempts retain the native
//pose, RNG and slot-index writes. This is a tail entry from469fd0.
export function spawnPeriodicBody(position, runtime) {
  const {memory, scratchBase, handlers = {}, soundRuntime} = runtime;
  const index = get(memory, 0x90351c), record = (0x903510 + Math.imul(index, 12)) >>> 0;
  if (get(memory, record + 4)) return;
  const body = pointer(memory, record), next = (index + 1) | 0;
  put(memory, 0x90351c, (next >>> 0) < 1 ? next : 0);
  put(memory, body + 0x38, get(memory, position + 4));
  //The x basis is fetched before publishing the RNG seed (which can alias it).
  const seed = Math.imul(get(memory, 0x5ec954), 0x41a7) & 0x7fffffff;
  const axisX = memory.readInt16LE(position + 0x94) - 128;
  put(memory, 0x5ec954, seed);
  const value = Math.imul(seed >>> 15, 0x7fff) >>> 16;
  const axisZ = memory.readInt16LE(position + 0xa0) - 128;
  const x = (((axisX + (value & 255)) << 16) + get(memory, position)) | 0;
  const z = ((((axisZ << 8) + (value & 0xff00)) << 8) + get(memory, position + 8)) | 0;
  put(memory, body + 0x38, get(memory, body + 0x38) + 0xe3e00000);
  const y = get(memory, body + 0x38);
  put(memory, body + 0x40, 0); put(memory, body + 0x44, 0x960000); put(memory, body + 0x48, 0);
  put(memory, body + 0x34, x); put(memory, body + 0x3c, z);
  const found = lookupRawSpatialBucket(x, y, z, {memory}); put(memory, scratchBase - 4, found.outside);
  if (found.outside) return;
  const region = pointer(memory, 0x9092c0) + (memory.readUInt16LE(found.bucket + 6) & 0x3fff) * 6;
  const sector = pointer(memory, pointer(memory, 0x909240) + (memory.readUInt16LE(region + 2) & 127) * 4);
  if (memory[sector + 4] & 8) return;
  updateRawLinearVelocity(pointer(memory, record), {memory, scratchBase: scratchBase - 24});
  registerRawBodySpatial(pointer(memory, record), {memory});
  const current = pointer(memory, record); put(memory, record + 4, 1);
  registerRawBodyShapes(current, 1, 0x5ec920, {memory});
  if (get(memory, record + 8) !== 127) return;
  const active = pointer(memory, record);
  const args = [active + 0x68, 0x800, 16000, 9, active + 0x68, 0, 0];
  const result = emitNativeEffect(30, active + 0x34, args, {
    dispatch40ea40: request => dispatchNativeSound(request, soundRuntime ?? {memory, handlers})
  });
  put(memory, record + 8, result);
}

//469fd0. Timed/randomized spawn and active lifetime. Three cursor-relative
//particle lifetime edits are retained independently of the emitted count.
export function updatePeriodicBody(runtime) {
  const {memory, scratchBase} = runtime;
  if (!memory[pointer(memory, 0x5ecb1c) + 0x554]) return;
  if (get(memory, 0x903514)) {
    const body = pointer(memory, 0x903510), position = scratchBase - 12, velocity = scratchBase - 24;
    const color = get(memory, 0x9153e0);
    put(memory, velocity, 0);
    put(memory, position, get(memory, body + 0x34)); put(memory, position + 4, get(memory, body + 0x38));
    const z = get(memory, body + 0x3c); put(memory, position + 8, z);
    put(memory, velocity + 4, 0); put(memory, velocity + 8, 0);
    emitRawEffectParticles(position, velocity, 0, color, 8, {memory});
    let cursor = (pointer(memory, 0x9153d4) - 256) >>> 0;
    const base = pointer(memory, 0x9153c4), end = pointer(memory, 0x91900c);
    for (let index = 0; index < 3; index++) {
      if (cursor < base) cursor = (end - 256) >>> 0;
      memory.writeUInt16LE(16, cursor + 0x96); cursor = (cursor - 256) >>> 0;
    }
    const age = (get(memory, 0x903514) + 1) | 0; put(memory, 0x903514, age);
    if ((age >>> 0) > 200) retireType33Body(pointer(memory, 0x903510), {...runtime, scratchBase: scratchBase - 32});
    const current = pointer(memory, 0x903510);
    if (memory[current + 12] & 1) retireType33Body(current, {...runtime, scratchBase: scratchBase - 32});
  }
  if (((get(memory, 0x903520) + 600) >>> 0) >= pointer(memory, 0x90a548)) return;
  if (random(memory) >= 400) return;
  let selected = get(memory, 0x6e6af8);
  if (memory[pointer(memory, 0x5ecb1c) + 0x552]) {selected ^= 1; put(memory, 0x6e6af8, selected);}
  spawnPeriodicBody(pointer(memory, (0x909300 + Math.imul(selected, 0x30c)) >>> 0) + 0x34, runtime);
}

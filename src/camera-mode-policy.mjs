import constants from './camera-policy-constants.json' with {type: 'json'};
import {abs32} from './fixed-integer.mjs';
import {measureWormholeVector} from './wormhole-targeting.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const rng = seed => Math.imul(seed, 0x41a7) & 0x7fffffff;

export function initializeCameraPolicyConstants(memory) {
  Buffer.from(constants.bytes_hex, 'hex').copy(memory, Number(constants.address));
}

//417880: nearest participant under the wrapped, unsigned abs32 squared metric.
//Equal distances retain the earlier participant. The output is written last.
export function findNearestCameraParticipant(position, output, {memory, scratchBase}) {
  const session = ptr(memory, 0x5ecb1c); put(memory, scratchBase - 4, output);
  const count = memory[session + 0x54d];
  let best = 0xffffffff, selected = -1; put(memory, scratchBase - 24, best); put(memory, scratchBase - 12, count);
  if (!count) {put(memory, output, selected); return;}
  const initialY = get(memory, position + 4), initialX = get(memory, position); put(memory, scratchBase - 20, initialY);
  const initialZ = get(memory, position + 8); put(memory, scratchBase - 8, initialX); put(memory, scratchBase - 16, initialZ);
  for (let index = 0; index < count; index++) {
    const body = ptr(memory, 0x909300 + index * 0x30c);
    const z = (get(memory, scratchBase - 16) - get(memory, body + 0x3c)) >> 18;
    const y = (get(memory, scratchBase - 20) - get(memory, body + 0x38)) >> 18;
    const x = (get(memory, scratchBase - 8) - get(memory, body + 0x34)) >> 18;
    const distance = abs32((Math.imul(y, y) + Math.imul(z, z) + Math.imul(x, x)) | 0) >>> 0;
    if (distance < best) {best = distance; selected = index; put(memory, scratchBase - 24, best);}
  }
  put(memory, ptr(memory, scratchBase - 4), selected);
}

//41c9c0 uses the same actual length/root arithmetic as the wormhole graph.
//Publish the two numeric multiply locals as produced, including input aliases.
export function measureCameraVector(address, runtime) {
  const {memory, scratchBase} = runtime, values = [];
  for (let axis = 0; axis < 3; axis++) {
    const value = get(memory, address + axis * 4); values.push(value);
    if (axis === 0) {put(memory, scratchBase - 4, value); put(memory, scratchBase - 8, value);}
    else {put(memory, scratchBase - 8, value); put(memory, scratchBase - 4, value);}
  }
  return measureWormholeVector(values, runtime);
}

//41a170. Choose a replay/event-camera mode and participant. Retry state, the
//shared RNG and numeric locals are live storage, including the six-attempt
//fallback. This is policy; full camera positioning4180a0 remains separate.
export function chooseCameraMode(index, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 60;
  let camera = (0x91ff80 + Math.imul(index, 0x184)) >>> 0, seed = get(m, 0x5ec958), mode = 4, selected = 0, attempts = 5;
  put(m, frame + 0x24, index); put(m, frame + 0x14, mode); put(m, frame + 0x28, camera); put(m, frame + 0x38, get(m, camera));
  put(m, frame + 0x10, seed);
  for (;;) {
    const before = attempts; attempts--; put(m, frame + 0x34, attempts);
    if (before < 0) {mode = 4; break;}
    const session = ptr(m, 0x5ecb1c), raceMode = m[session + 0x58c]; put(m, frame + 0x30, 0);
    if (raceMode !== 2) {
      do {seed = rng(seed); mode = (seed >>> 16) & 15; put(m, 0x5ec958, seed); put(m, frame + 0x14, mode);} while (mode !== 10 && (mode === get(m, camera) || mode > 10));
      put(m, frame + 0x10, seed);
    }
    if (m.readInt16LE(camera + 0x3a) > 0) selected = ptr(m, 0x5ec120 + index * 4);
    else if (raceMode === 2) {
      seed = rng(seed); put(m, frame + 0x10, seed); put(m, 0x5ec958, seed);
      mode = get(m, 0x570500 + ((seed >>> 16) & 15) * 4); put(m, frame + 0x14, mode);
      if (m[session + 0x552]) selected = ptr(m, frame + 0x24);
      else if (get(m, camera + 0x178) !== -1) selected = ptr(m, camera + 0x178);
      else {
        const count = m[session + 0x54d]; let rank = 6;
        for (let participant = 0; participant < count; participant++) {
          const record = 0x909300 + participant * 0x30c, body = ptr(m, record);
          if (m[body + 0x718] === 10 && m[record + 0x1d] <= rank) {rank = m[record + 0x1d]; selected = participant;}
        }
        mode = get(m, frame + 0x14);
      }
    } else {
      const count = m[session + 0x54d];
      do {seed = rng(seed); selected = (seed >>> 16) & 7; put(m, 0x5ec958, seed);} while (selected >= count);
      put(m, frame + 0x10, seed);
    }
    const body = ptr(m, 0x909300 + Math.imul(selected, 0x30c)); put(m, frame + 0x2c, body);
    if (mode !== 4 && mode !== 5) {
      if (measureCameraVector(body + 0x68, {...runtime, scratchBase: frame - 4}) < 0x20000) {put(m, frame + 0x30, 1); seed = Math.imul(get(m, 0x5ec958), 7); put(m, 0x5ec958, seed);}
      else seed = get(m, 0x5ec958);
      put(m, frame + 0x10, seed);
    }
    let reject = false;
    if (mode === 2 || mode === 3) {
      let near = 0; put(m, frame + 0x18, 0);
      const count = m[ptr(m, 0x5ecb1c) + 0x54d]; put(m, frame + 0x1c, count); put(m, frame + 0x20, 0);
      for (let participant = 0; participant < count; participant++) {
        if (participant !== selected) {
          const other = ptr(m, 0x909300 + participant * 0x30c);
          const y = (get(m, body + 0x38) - get(m, other + 0x38)) >> 18, z = (get(m, body + 0x3c) - get(m, other + 0x3c)) >> 18, x = (get(m, body + 0x34) - get(m, other + 0x34)) >> 18;
          if ((abs32((Math.imul(y, y) + Math.imul(z, z) + Math.imul(x, x)) | 0) >>> 0) < 10000) {near++; put(m, frame + 0x18, near);}
        }
        put(m, frame + 0x20, participant + 1);
      }
      if (count > 0) {seed = get(m, frame + 0x10); mode = get(m, frame + 0x14);}
      reject = near === 0 || (m[body + 0x64f] === 0 && m.readInt16LE(body + 0xcc) < 0) || (m[body + 0x64f] === 1 && m.readInt16LE(body + 0xcc) > 0);
    }
    camera = ptr(m, frame + 0x28);
    if (!reject && get(m, frame + 0x30) !== 1) break;
    attempts = get(m, frame + 0x34); index = get(m, frame + 0x24);
    if (reject) {seed = Math.imul(seed, 7); put(m, 0x5ec958, seed); put(m, frame + 0x10, seed);}
  }
  put(m, camera, mode); put(m, camera + 0x32, 0x5a0000); word(m, camera + 0x36, selected); put(m, camera + 0x17c, 0); put(m, camera + 0x180, 0);
  const duration = mode === 1 || mode === 7 ? 210 : mode === 6 ? 150 : mode === 8 ? 60 : mode === 9 ? 180 : mode === 10 ? 300 : undefined;
  if (duration !== undefined) word(m, camera + 0x34, duration);
  if (get(m, frame + 0x38) === 14 && m[ptr(m, 0x5ecb1c) + 0x58c] === 0 && get(m, 0x91ff80) !== 14) {
    put(m, 0x91ce90, get(m, 0x91ce90) & 0xfffffffd);
    for (const address of [0x849482, 0x8494d6, 0x84952a, 0x84957e]) word(m, address, 0);
  }
}

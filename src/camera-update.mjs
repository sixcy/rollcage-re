import {nativeGlobalAddress} from './native-global-address.mjs';
import {selectCameraTrigger, measureCameraLineDistance} from './camera-route-triggers.mjs';
import {selectCameraEvent} from './camera-event-selection.mjs';
import {chooseCameraMode, measureCameraVector} from './camera-mode-policy.mjs';
import {queryCameraBodyPose, reduceRawCameraDirection, publishCachedCameraMatrix, buildCameraBodyPose} from './camera-pose-helpers.mjs';
import {publishCameraPose} from './camera-pose-publication.mjs';
import {selectModelDestructionObserver, computeModelCameraDuration} from './placed-object-damage.mjs';
import {getViewportApplication} from './weather-viewport.mjs';
import {updateCameraViewportScale} from './camera-viewport.mjs';
import {transformWheelEffectOffset} from './wheel-effects.mjs';
import {initializeCameraCurveFactorials, scaleCameraCurveTemplate, evaluateCameraCurve} from './camera-curve.mjs';
import {normalizeRawFixedVector, normalizeRawFixedVectorWithLength} from './raw-vector-normalization.mjs';
import {publishAnimationMatrix} from './vehicle-auxiliary-animation.mjs';
import {queryRawRespawnPlacement} from './raw-respawn-query.mjs';
import {abs32} from './fixed-integer.mjs';
import {computeWormholeFixedRoot} from './wormhole-targeting.mjs';
import {copyToNativeMemory,resolveNativeMemoryAddress} from './native-memory-spans.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const word = (m, p, v) => m.writeUInt16LE(v & 65535, p), short = v => (v << 16) >> 16;
const vector = (m, p) => [0, 4, 8].map(o => get(m, p + o)), store = (m, p, values) => values.forEach((v, i) => put(m, p + i * 4, v));
const copy = (m, from, to, words) => {for (let i = 0; i < words; i++) put(m, to + i * 4, get(m, from + i * 4));};
const copyPair = (m, from, to) => copyToNativeMemory(m,to,Buffer.from(m.subarray(from,from+8)));
const trunc32 = v => Number.isFinite(v) && v >= -2147483648 && v < 2147483648 ? Math.trunc(v) | 0 : -2147483648;
function divide(numerator, denominator) {if (!denominator) throw Error('Camera positioning division by zero.'); const n = Math.trunc(numerator / denominator); if (n < -2147483648 || n > 2147483647) throw Error('Camera positioning division overflow.'); return n | 0;}

//4180a0. Original17-way positioning dispatch. Raw live state and actual lower
//algorithms remain explicit; CRT formatting/math/allocation are library services.
//The race default uses this reference; its retained-instruction comparisons
//and remaining caller/producer limits are recorded in re-docs/camera-update.md.
export function updateCamera(index, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 204, row = Math.imul(index, 0x184), camera = 0x91ff80 + row, pose = camera + 0x40, direction = camera + 0x144, up = camera + 0x150;
  const child = depth => ({...runtime, scratchBase: frame - depth});
  put(m, frame + 0xc4, get(m, 0x5e8890) ^ (scratchBase - 188)); put(m, frame + 0x28, 0);
  put(m, frame + 0x5c, get(m, 0x5ec120 + index * 4)); put(m, frame + 0x14, index); put(m, frame + 0x24, row);
  put(m, frame + 0x1c, resolveNativeMemoryAddress(m,0x909300+Math.imul(get(m,frame+0x5c),0x30c),4)); put(m, frame + 0x6c, get(m, camera + 0x3c)); put(m, frame + 0x50, trunc32(m.readFloatLE(nativeGlobalAddress(m,0x91ceb0))));
  if (typeof runtime.handlers?.formatCameraName !== 'function') throw Error('Camera update requires CRT player-name formatting.');
  runtime.handlers.formatCameraName(frame + 0xa4, 0x5d043c, index, child(16));
  if (selectCameraTrigger(index, camera + 0x36, camera + 0x174, child(8))) {put(m, camera, 16); word(m, camera + 0x32, 0);}
  put(m, camera + 0x24, 104); put(m, camera + 0x1c, 0); word(m, camera + 0x30, 0); put(m, camera + 0x17c, 0);
  selectCameraEvent(index, child(4));
  const rng = () => {const result = Math.imul(get(m, 0x5ec958), 0x41a7) & 0x7fffffff; put(m, 0x5ec958, result); return result;};
  const inverted = body => (!m[body + 0x64f] && m.readInt16LE(body + 0xcc) < 0) || (m[body + 0x64f] === 1 && m.readInt16LE(body + 0xcc) > 0);
  const difference = body => {const x = get(m, body + 0x34), y = get(m, body + 0x38), z = get(m, body + 0x3c); put(m, direction + 8, z - get(m, pose + 8)); put(m, direction, x - get(m, pose)); put(m, direction + 4, y - get(m, pose + 4)); reduceRawCameraDirection(direction, child(4));};
  const matrix = (other = 0x5ea4f4) => publishCachedCameraMatrix(direction, other, pose + 0x90, get(m, frame + 0x14), child(12));
  const retry = () => {const previous = get(m, frame + 0x28); put(m, frame + 0x28, previous + 1); if ((previous >>> 0) <= 3) return true; put(m, camera, 9); put(m, camera + 0x32, 0x5a0000); word(m, camera + 0x36, index); return false;};
  const pick = () => chooseCameraMode(index, child(4));
  let suppressViewportReset = false;
  for (;;) {
    let participant = m.readUInt16LE(camera + 0x36), record = 0x909300 + Math.imul(participant, 0x30c), body = ptr(m, record), controller = ptr(m, record + 0x18);
    put(m, frame + 0x2c, 0); put(m, frame + 0x30, controller); put(m, frame + 0x20, body);
    let mode = get(m, camera);
    //Event-specific transitions precede the mode table on every retry.
    if (mode === 11 || mode === 12 || mode === 13) {
      let eventClass = get(m, camera + 0x3c), changed = false;
      if (mode === 11 && get(m, frame + 0x6c) === 3) {
        const event = ptr(m, 0x9034a0 + m.readInt16LE(camera + 0x38) * 4), target = ptr(m, event + 0x198);
        if (get(m, event + 0x188) === 16 && !get(m, camera + 0x20)) put(m, camera + 0x20, 30);
        if (get(m, camera + 0x20) === 1 || !get(m, camera + 0x3c)) {put(m, camera, 8); put(m, camera + 0x32, 0x5a0000); word(m, camera + 0x36, m.readUInt16LE(target + 0x65e)); changed = true;}
      }
      if (!changed) {
        if (eventClass === 4) {
          const event = ptr(m, nativeGlobalAddress(m, 0x80b5e0) + m.readInt16LE(camera + 0x38) * 4);
          if (m[event + 0x188] & 64) {put(m, camera, 9); put(m, camera + 0x32, 0xd20000); word(m, camera + 0x36, m.readUInt16LE(ptr(m, event + 0x198) + 0x65e));}
        } else if (!eventClass) pick();
        else put(m, camera + 0x118, get(m, 0x90a548));
      }
      body = ptr(m, 0x909300 + Math.imul(m.readUInt16LE(camera + 0x36), 0x30c)); put(m, frame + 0x20, body);
    }
    if (get(m, ptr(m, 0x5ecb1c) + 0x57c) === 6 && m.readInt16LE(camera + 0x3a) === -1) {
      word(m, camera + 0x3a, 300); put(m, camera, 4); put(m, camera + 0x32, 0x780000); word(m, camera + 0x36, get(m, frame + 0x5c)); body = ptr(m, 0x909300 + Math.imul(m.readUInt16LE(camera + 0x36), 0x30c)); put(m, frame + 0x20, body);
    }
    mode = get(m, camera);
    if (mode === 0 || mode === 9) {copy(m, ptr(m, ptr(m, frame + 0x30)) + 0x34, pose, 54); break;}
    if (mode === 1 || mode === 7) {
      publishCameraPose(0x909300 + Math.imul(m.readUInt16LE(camera + 0x36), 0x30c), pose, 1, frame + 0xa4, child(12));
      put(m, camera + 0x1c, 1); put(m, camera + 0x24, trunc32(m.readFloatLE(nativeGlobalAddress(m,0x91ceb0)))); word(m, camera + 0x30, m.readUInt16LE(camera + 0x36));
      copyPair(m, body + 0x68, pose + 0x34); put(m, pose + 0x3c, get(m, body + 0x70));
      for (let axis = 0; axis < 3; axis++) put(m, direction + axis * 4, (mode === 1 ? -1 : 1) * m.readInt16LE(body + 0xc8 + axis * 6));
      const selected = ptr(m, 0x909300 + Math.imul(m.readUInt16LE(camera + 0x36), 0x30c));
      buildCameraBodyPose(body, pose, direction, m[selected + 0x64f] === 1 ? 1 : 0, child(24)); suppressViewportReset = true; break;
    }
    if (mode === 2 || mode === 3) {
      if (!m.readInt16LE(camera + 0x32)) put(m, camera + 0x20, (rng() >>> 16) & 1 ? 0x780000 : 0);
      if (inverted(body)) {pick(); if (retry()) continue; break;}
      copy(m, body + 0x34, pose, 54);
      const offset = get(m, camera + 0x20); if (offset) {put(m, camera + 0x20, offset - 45000); put(m, pose + 4, get(m, pose + 4) - get(m, camera + 0x20));} else put(m, pose + 4, get(m, pose + 4) - 0x780000);
      store(m, direction, [0, 4096, 0]); store(m, up, [mode === 2 ? 4096 : m.readInt16LE(body + 0xc8), 0, mode === 2 ? 4096 : m.readInt16LE(body + 0xd4)]); matrix(up);
      if (!queryCameraBodyPose(ptr(m, ptr(m, 0x909318)), pose, child(4))) {pick(); if (retry()) continue;}
      break;
    }
    if (mode === 4 || mode === 5) {
      const angle = m.readInt16LE(camera + 0x2c), sine = m.readInt16LE(0x5ed030 + (angle & 255) * 2), cosine = m.readInt16LE(0x5ed030 + ((angle + 64) & 255) * 2); put(m, frame + 0x40, cosine);
      const first = !m.readInt16LE(camera + 0x32);
      if (first) word(m, camera + 0x2e, rng() & 0x10000 ? mode === 4 ? 1 : 2 : mode === 4 ? -1 : -2);
      if (mode === 5 && inverted(body)) {pick(); if (retry()) continue; break;}
      if (mode === 5 && first) put(m, camera + 0x20, -200);
      copy(m, body + 0x34, pose, 54); put(m, pose, get(m, pose) + Math.imul(sine, 480)); put(m, pose + 8, get(m, pose + 8) + Math.imul(get(m, frame + 0x40), 480));
      put(m, pose + 4, get(m, pose + 4) + (mode === 4 ? inverted(body) ? 0x260000 : -0x260000 : get(m, camera + 0x20) << 16));
      difference(body); matrix(); word(m, camera + 0x2c, m.readUInt16LE(camera + 0x2c) + m.readUInt16LE(camera + 0x2e)); if (mode === 5) put(m, camera + 0x20, get(m, camera + 0x20) + 2);
      let accepted;
      if (mode === 5) accepted = queryCameraBodyPose(ptr(m, ptr(m, 0x909318)), pose, child(4));
      else {copy(m, ptr(m, ptr(m, 0x909318)), 0x6f9a20, 96); copy(m, pose, 0x6f9a54, 54); accepted = queryRawRespawnPlacement(0x6f9a20, pose, 0, 0x6f9a00, 2, frame + 0x94, child(28));}
      if (!accepted) {pick(); if (retry()) continue;} break;
    }
    if (mode === 6) {
      put(m, camera + 0x24, 208); copy(m, body + 0x34, pose, 54); put(m, frame + 0x98, get(m, body + 0x34));
      store(m, up, [0, -4096, 0]); const targetY = (get(m, body + 0x38) + (inverted(body) ? 0x640000 : -0x640000)) | 0; put(m, frame + 0x9c, targetY);
      let targetZ = (get(m, body + 0x3c) - 0xa00000) | 0;
      if (!m.readInt16LE(camera + 0x32)) {copyPair(m, frame + 0x98, camera + 0x168);} else {
        for (const [offset, value] of [[0, get(m, frame + 0x98)], [4, targetY], [8, targetZ]]) {const old = get(m, camera + 0x168 + offset), next = (old + ((value - old) >> 3)) | 0; if (offset === 8) targetZ = next; else put(m, camera + 0x168 + offset, next);}
      }
      put(m, camera + 0x170, targetZ); copyPair(m, camera + 0x168, pose); put(m, pose + 8, get(m, camera + 0x170));
      copy(m, ptr(m, ptr(m, 0x909318)), 0x6f9a20, 96); copy(m, pose, 0x6f9a54, 54);
      const accepted = queryRawRespawnPlacement(0x6f9a20, pose, 0, 0x6f9a00, 2, frame + 0x84, child(20));
      let failed = false; if (!accepted) {pick(); body = ptr(m, 0x909300 + Math.imul(m.readUInt16LE(camera + 0x36), 0x30c)); failed = true;}
      difference(body); matrix(up); if (failed && retry()) continue; break;
    }
    if (mode === 8) {
      if (!m.readInt16LE(camera + 0x32)) {
        put(m, frame + 0x34, 0); word(m, frame + 0x38, -80); publishBodyMatrix(body, [0x7c, 0x60, 0x64, 0x80, 0x68, 0x70, 0x78, 0x4c, 0x18]);
        put(m, 0x91d3e4, get(m, frame + 0x34)); put(m, 0x91d3e8, get(m, frame + 0x38)); transformWheelEffectOffset(runtime);
        put(m, camera + 0x15c, get(m, body + 0x34) + (get(m, 0x91d448) << 16)); put(m, camera + 0x164, get(m, body + 0x3c) + (get(m, 0x91d450) << 16));
        put(m, camera + 0x160, get(m, body + 0x38) + ((get(m, 0x91d44c) + (inverted(body) ? 40 : -40)) << 16));
        copy(m, body + 0x34, pose, 54); copyPair(m, camera + 0x15c, pose); put(m, pose + 8, get(m, camera + 0x164));
        if (!queryCameraBodyPose(ptr(m, ptr(m, 0x909318)), pose, child(4))) {pick(); body = ptr(m, 0x909300 + Math.imul(m.readUInt16LE(camera + 0x36), 0x30c)); put(m, frame + 0x2c, 1); put(m, frame + 0x20, body);}
      }
      put(m, camera + 0x24, 208); copy(m, body + 0x34, pose, 54); copyPair(m, camera + 0x15c, pose); put(m, pose + 8, get(m, camera + 0x164)); store(m, pose + 0x34, [0, 0, 0]); difference(body); matrix();
      if (get(m, frame + 0x2c) === 1 && retry()) continue; break;
    }
    if (mode === 10 || mode === 11 || mode === 12 || mode === 13) {
      let observed = body;
      if (mode === 10) {
        put(m, frame + 0xa0, get(m, camera + 0x164)); copyPair(m, camera + 0x15c, frame + 0x98); put(m, frame + 0x28, 2);
        if (!m.readInt16LE(camera + 0x32)) put(m, camera + 0x20, (rng() >>> 15) & 65535);
        put(m, frame + 0x24, body + 0x34);
      } else {observed = ptr(m, (mode === 11 ? 0x9034a0 : mode === 12 ? 0x903480 : nativeGlobalAddress(m, 0x80b5e0)) + m.readInt16LE(camera + 0x38) * 4); put(m, frame + 0x24, observed);}
      selectModelDestructionObserver(observed + 0x34, frame + 0x18, 0, child(12));
      const observer = ptr(m, frame + 0x18); copyPair(m, observer + 4, camera + 0x15c); put(m, camera + 0x164, get(m, observer + 12));
      const large = m[ptr(m, 0x5ecefc) + 0x31] === 1;
      if (mode === 10) {
        if (get(m, 0x6e6550) > 0 && vector(m, camera + 0x15c).some((v, i) => v !== get(m, frame + 0x98 + i * 4)) && m.readInt16LE(camera + 0x32) > m.readInt16LE(camera + 0x34) - 30) word(m, camera + 0x32, m.readUInt16LE(camera + 0x34) - 30);
        let fov = large ? 312 : 208;
        if ((m[camera + 0x20] & 1) && large) {fov = computeModelCameraDuration(frame + 0x98, body + 0x34, 250, 3, child(12)); put(m, frame + 0x28, 1);} put(m, camera + 0x24, fov);
      } else {put(m, camera + 0x24, large ? 312 : 123); put(m, frame + 0x28, large ? 1 : 2);}
      copy(m, body + 0x34, pose, 54); copyPair(m, camera + 0x15c, pose); put(m, pose + 8, get(m, camera + 0x164)); store(m, pose + 0x34, [0, 0, 0]);
      const target = mode === 10 ? ptr(m, frame + 0x24) : observed + 0x34;
      if (!m.readInt16LE(camera + 0x32)) {copyPair(m, target, camera + 0x168); put(m, camera + 0x170, get(m, target + 8));}
      else for (const offset of [0, 4, 8]) {const old = get(m, camera + 0x168 + offset); put(m, camera + 0x168 + offset, old + ((get(m, target + offset) - old) >> (get(m, frame + 0x28) & 31)));}
      for (const offset of [0, 4, 8]) put(m, direction + offset, get(m, camera + 0x168 + offset) - get(m, pose + offset)); reduceRawCameraDirection(direction, child(4)); matrix();
      if (mode !== 10) word(m, camera + 0x32, 0); if (mode === 11 && get(m, camera + 0x20) > 0) put(m, camera + 0x20, get(m, camera + 0x20) - 1); break;
    }
    if (mode === 15) {
      let object = ptr(m, camera + 0x140), age = m.readInt16LE(camera + 0x32);
      if (!age) {
        while (ptr(m, object + 0x1b0)) object = ptr(m, object + 0x1b0); put(m, camera + 0x140, object);
        let height = 0, current = object; do {const model = ptr(m, current + 0x10); if (model) height = (height + m.readUInt16LE(model + 0x22)) | 0; current = ptr(m, current + 0x19c);} while (current);
        put(m, camera + 0x18, 0); put(m, camera + 0x10, 0); put(m, camera + 0x14, -(Math.min(height, 600) >> 1));
      }
      put(m, camera + 0x17c, 1); const duration = m.readInt16LE(camera + 0x34);
      put(m, camera + 0x180, age < 20 ? Math.imul(age, 500) : age < duration - 50 ? 10000 : age > duration - 20 ? 0 : Math.imul(duration - age - 20, 333));
      put(m, camera + 0x24, Math.imul(get(m, camera + 0x28), 104) >>> 8);
      for (const [i, offset] of [0x10, 0x14, 0x18].entries()) word(m, frame + 0x34 + i * 2, m.readUInt16LE(camera + offset));
      publishBodyMatrix(object, Array(9).fill(0x18)); put(m, 0x91d3e4, get(m, frame + 0x34)); put(m, 0x91d3e8, get(m, frame + 0x38)); transformWheelEffectOffset(runtime);
      const offset = vector(m, 0x91d448).map(v => v << 16); put(m, frame + 0x2c, offset[2]);
      if (age < 30) {copyPair(m, object + 0x34, camera + 0x168); put(m, camera + 0x170, get(m, object + 0x3c));}
      const target = offset.map((v, i) => (v + get(m, camera + 0x168 + i * 4)) | 0); put(m, frame + 0x18, target[0]);
      copy(m, body + 0x34, pose, 54); copyPair(m, camera + 4, pose); put(m, pose + 8, get(m, camera + 12)); put(m, frame + 0x2c, target[2]); put(m, frame + 0x4c, target[1]); store(m, pose + 0x34, [0, 0, 0]);
      for (const [i, value] of target.entries()) put(m, direction + i * 4, value - get(m, pose + i * 4)); reduceRawCameraDirection(direction, child(4)); matrix(); break;
    }
    if (mode === 14) {updateCurveMode(); suppressViewportReset = true; break;}
    if (mode === 16) {if (updateTriggerMode(body)) continue; break;}
    break; //Unsigned out-of-table modes follow the native common tail.
  }
  if (!suppressViewportReset && (m[nativeGlobalAddress(m,0x91ce90)] & 2)) {
    let name = frame + 0xa4; if (!m[name]) {const current = ptr(m, 0x6efb3c); name = current ? ptr(m, current + 0x28) >= 16 ? ptr(m, current + 0x14) : current + 0x14 : 0;}
    if (name) {put(m, frame - 4, 1); put(m, frame - 8, name); const application = getViewportApplication(child(12)); updateCameraViewportScale(application, name, 1, 0, child(12));}
  }
  if (m.readInt16LE(camera + 0x3a) > 0) word(m, camera + 0x3a, m.readUInt16LE(camera + 0x3a) - 1);
  const oldAge = m.readInt16LE(camera + 0x32); word(m, camera + 0x32, oldAge + 1); if (oldAge > m.readInt16LE(camera + 0x34)) pick();

  function publishBodyMatrix(body, locals) {
    for (const offset of [0, 4, 8, 12, 16]) put(m, 0x91d360 + offset, get(m, body + 0xc4 + offset));
    const scale = m.readFloatLE(0x5dc5f4);
    for (let i = 0; i < 9; i++) {const value = Math.fround(m.readInt16LE(0x91d360 + i * 2)); m.writeFloatLE(value, frame + locals[i]); m.writeFloatLE(Math.fround(value * scale), nativeGlobalAddress(m,0x91cdc0) + Math.floor(i / 3) * 16 + i % 3 * 4);}
  }
  function updateCurveMode() {
    const i = get(m, frame + 0x14), base = Math.imul(i, 12), points = 0x6f98f0 + Math.imul(i, 60);
    let body = ptr(m, frame + 0x20);
    if (!m.readInt16LE(camera + 0x32)) {
      const selected = ptr(m, frame + 0x1c); word(m, camera + 0x36, get(m, frame + 0x5c)); const controller = ptr(m, selected + 0x18); body = ptr(m, selected); put(m, frame + 0x30, controller); put(m, frame + 0x20, body);
      if (!i) {initializeCameraCurveFactorials(runtime); scaleCameraCurveTemplate(runtime);}
      for (const output of [0x6f9880 + base, 0x6f98b0 + base]) {copyPair(m, body + 0x34, output); put(m, output + 8, get(m, body + 0x3c));}
      store(m, 0x6f9850 + base, [0, -65536, 0]); publishBodyMatrix(body, Array(9).fill(0x1c));
      for (let point = 0; point < 5; point++) {put(m, 0x91d3e4, get(m, 0x5eabf0 + point * 8)); put(m, 0x91d3e8, get(m, 0x5eabf4 + point * 8)); transformWheelEffectOffset(runtime); copy(m, 0x91d448, points + point * 12, 3);}
      put(m, 0x6f9720 + i * 4, 0); put(m, 0x6f99e0 + i * 4, 0); put(m, 0x6f99f0 + i * 4, 436);
    }
    const controller = ptr(m, frame + 0x30); put(m, camera + 0x24, get(m, frame + 0x50)); copy(m, ptr(m, controller) + 0x34, pose, 54);
    if ((m[controller + 0x39] & 0x38) === 0x20) put(m, 0x6f9720 + i * 4, get(m, 0x6f9720 + i * 4) + 1);
    if (get(m, 0x6f9720 + i * 4) > 10) {
      const targetBody = ptr(m, frame + 0x20), target = [0, 4, 8].map((o, axis) => (get(m, targetBody + 0x34 + o) + get(m, controller + 0x2c + o)) | 0), delta = [];
      for (let axis = 0; axis < 3; axis++) {const p = 0x6f98b0 + base + axis * 4, old = get(m, p), next = (old + ((target[axis] - old) >> 4)) | 0; put(m, p, next); delta.push((next - get(m, 0x6f9880 + base + axis * 4)) >> 16);}
      for (const point of [3, 4]) store(m, points + point * 12, delta);
      for (const offset of [0, 4, 8]) {const p = 0x6f9850 + base + offset, old = get(m, p); put(m, p, (old << 4) - old + get(m, controller + 0x14 + offset));}
      normalizeRawFixedVector(0x6f9850 + base, child(4));
    }
    evaluateCameraCurve(points, frame + 0x98, get(m, 0x6f99e0 + i * 4), child(12)); put(m, frame + 0x50, base);
    const values = [0, 4, 8].map(o => (get(m, frame + 0x98 + o) + get(m, 0x6f9880 + base + o)) | 0); put(m, pose + 8, values[2]); put(m, pose, values[0]); put(m, pose + 4, values[1]);
    const tracked = ptr(m, frame + 0x20); difference(tracked); const length = measureCameraVector(direction, child(4)); if (length >= 256) normalizeRawFixedVectorWithLength(direction, length, child(4));
    const shift = m[ptr(m, 0x5ecb1c) + 0x552] ? 3 : 2; for (const o of [0, 4, 8]) put(m, direction + o, get(m, direction + o) + (get(m, 0x6f9850 + base + o) >> shift));
    const result = publishAnimationMatrix(direction, 0x6f9850 + base, pose + 0x90, child(8));
    const from = result ? pose + 0x90 : camera + 0x120, to = result ? camera + 0x120 : pose + 0x90; copyToNativeMemory(m,to,Buffer.from(m.subarray(from,from+16)));copyToNativeMemory(m,to+16,Buffer.from(m.subarray(from+16,from+32)));
    publishCameraPose(0x909300 + Math.imul(m.readUInt16LE(camera + 0x36), 0x30c), pose, 0, frame + 0xa4, child(12));
    const next = (get(m, 0x6f99e0 + i * 4) + get(m, 0x6f99f0 + i * 4)) | 0; put(m, 0x6f99e0 + i * 4, Math.min(next, 65536));
  }
  function updateTriggerMode(body) {
    //The complete authored trigger-camera block is translated separately below.
    return updateTriggerCameraMode({memory: m, frame, camera, pose, direction, up, body, index, runtime, child, pick, retry, publishBodyMatrix, matrix, difference});
  }
}

function updateTriggerCameraMode({memory: m, frame, camera, pose, direction, up, body, index, runtime, child, pick, retry, matrix, difference}) {
  if (!m.readInt16LE(camera + 0x32)) {
    const speed = Math.max(get(m, body + 0x664), 0x140000), alternate = speed & 0x10000, trigger = ptr(m, camera + 0x174);
    put(m, frame + 0x20, body); put(m, frame + 0x40, alternate);
    const start = trigger + (alternate ? 0x10 : 4), end = trigger + (alternate ? 4 : 0x10);
    copyPair(m, start, camera + 0x15c); put(m, camera + 0x164, get(m, start + 8));
    let duration = divide(get(m, trigger + 0x34), speed); if (!alternate) duration = Math.imul(duration, 220) >> 8;
    word(m, camera + 0x34, duration); put(m, frame + 0x30, get(m, end + 8) - get(m, camera + 0x164)); put(m, frame + 0x44, m.readInt16LE(camera + 0x34)); copyPair(m, end, frame + 0x88);
    const x = divide((get(m, frame + 0x88) - get(m, camera + 0x15c)) | 0, get(m, frame + 0x44)); put(m, frame + 0x2c, x);
    const base = Math.imul(index, 12), step = 0x6f9740 + base; put(m, frame + 0x48, base); put(m, step, x); put(m, frame + 0x54, step);
    const y = divide((get(m, frame + 0x8c) - get(m, camera + 0x160)) | 0, m.readInt16LE(camera + 0x34)); put(m, frame + 0x58, y); put(m, step + 4, y);
    const z = divide(get(m, frame + 0x30), get(m, frame + 0x44)); put(m, step + 8, z); put(m, frame + 0x44, z);
    const squared = abs32((Math.imul(x >> 18, x >> 18) + Math.imul(y >> 18, y >> 18) + Math.imul(z >> 18, z >> 18)) | 0);
    if (squared > 300) {
      const firstRoot = computeWormholeFixedRoot(squared, runtime), secondRoot = computeWormholeFixedRoot(300, runtime), ratio = divide(secondRoot << 8, firstRoot);
      for (const [offset, local] of [[0, 0x2c], [4, 0x58], [8, 0x44]]) put(m, step + offset, Math.imul(get(m, frame + local) >> 8, ratio));
    }
    if (get(m, frame + 0x40)) {
      const original = m.readInt16LE(camera + 0x34), advance = Math.imul(original, 70) >> 8; word(m, camera + 0x34, Math.imul(original, 140) >> 8);
      for (const offset of [0, 4, 8]) put(m, camera + 0x15c + offset, get(m, camera + 0x15c + offset) + Math.imul(get(m, step + offset), advance));
    }
    put(m, 0x6f9730 + index * 4, speed & 0x30000 ? 0 : 1);
  } else {
    for (const offset of [0, 4, 8]) put(m, camera + 0x15c + offset, get(m, camera + 0x15c + offset) + get(m, 0x6f9740 + Math.imul(index, 12) + offset));
  }
  put(m, camera + 0x24, m[ptr(m, 0x5ecefc) + 0x31] === 1 ? 312 : 208); copy(m, body + 0x34, pose, 54);
  copyPair(m, camera + 0x15c, pose); put(m, pose + 8, get(m, camera + 0x164));
  const step = 0x6f9740 + Math.imul(index, 12); copyPair(m, step, pose + 0x34); put(m, pose + 0x3c, get(m, step + 8));
  const trigger = ptr(m, camera + 0x174), distance = measureCameraLineDistance(body + 0x34, trigger + 4, trigger + 0x10, frame + 0x74, child(12)); put(m, frame + 0x74, distance);
  if (distance > 0x3e80000) {pick(); return retry();}
  put(m, frame + 0x18, direction); difference(body);
  if (get(m, 0x6f9730 + index * 4)) {
    const target = ptr(m, camera + 0x174), dx = (get(m, target + 0x10) - get(m, direction)) | 0, dy = (get(m, target + 0x14) - get(m, direction + 4)) | 0, dz = (get(m, target + 0x18) - get(m, direction + 8)) | 0;
    put(m, frame + 0x3c, get(m, direction + 8) - Math.max(-0x1000000, Math.min(0x1000000, dz))); put(m, frame + 0x34, get(m, direction) - Math.max(-0x1000000, Math.min(0x1000000, dx))); put(m, frame + 0x38, get(m, direction + 4) - dy);
    reduceRawCameraDirection(frame + 0x34, child(4)); normalizeRawFixedVector(frame + 0x34, child(4));
    const x = get(m, frame + 0x34) >> 2, z = get(m, frame + 0x3c) >> 2; put(m, frame + 0x38, -65536); put(m, frame + 0x34, x);
    if (!m.readInt16LE(camera + 0x32)) {copyPair(m, frame + 0x34, up); put(m, up + 8, z);}
    else {for (const [offset, value] of [[0, x], [4, -65536], [8, z]]) {const old = get(m, up + offset); put(m, up + offset, (old << 4) - old + value);} normalizeRawFixedVector(up, child(4));}
  } else {copyPair(m, 0x5ea4f4, up); put(m, up + 8, get(m, 0x5ea4fc));}
  matrix(up); put(m, camera + 0x11c, get(m, 0x90a548)); return false;
}

import {nativeGlobalAddress} from './native-global-address.mjs';
import {breakClassTwoModel} from './model-contact-effects.mjs';
import {emitRawEffectParticles, emitRawBodyDebris, alterRawTerrainBrightness, activateRawBodyPulse} from './body-retirement-effects.mjs';
import {appendBodyPositionEffect} from './body-retirement.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {updateWorldEffectRecords} from './world-effect-records.mjs';

const get = (m, p) => m.readInt32LE(p), put = (m, p, value) => m.writeInt32LE(value | 0, p);

//413fc0 raw bridge: the existing checked damage falloff acts on these same
//pending class-two model rows and can make later414060 calls ready.
export function applyPlacedModelEffectDamage({memory: m}) {
  const effectFlag = get(m, nativeGlobalAddress(m,0x91cd90)), count = m.readUInt32LE(0x9207e4);
  if (!effectFlag || !count) return;
  updateWorldEffectRecords(m.subarray(0x920800, 0x920800 + count * 16), {count, effectFlag, originS16: [0x91cd82, 0x91cd86, 0x91cd8a].map(address => m.readInt16LE(nativeGlobalAddress(m,address))), strength: get(m, nativeGlobalAddress(m,0x91cd8c))});
}

//414060. Age pending 16-byte rows, then activate at most one ready model
//effect per call. Row+8 is a signed byte; the scan count is captured unsigned.
export function updatePlacedModelContactEffects(runtime) {
  const {memory: m, scratchBase} = runtime, count = m.readUInt32LE(0x9207e4), frame = scratchBase - 44, position = frame + 0x14, velocity = frame + 0x20;
  for (let index = 0, row = 0x920800; index < count; index++, row += 16) {
    if (m[row + 6]) continue;
    if (m[row + 7]) {m[row + 7]--; continue;}
    const x = m.readInt16LE(row) << 16, y = m.readInt16LE(row + 2) << 16, z = m.readInt16LE(row + 4) << 16;
    put(m, position, x); put(m, position + 4, y); put(m, frame + 0x10, z); put(m, position + 8, z); put(m, velocity, 0); put(m, velocity + 8, 0);
    const scale = m.readInt8(row + 8), amount = scale > 0 ? scale - 1 : 3;
    put(m, velocity + 4, scale > 0 ? -0x400000 : -0x200000);
    if (scale <= 0 || amount) {
      const cursor = get(m, 0x9153dc), next = cursor + 1 | 0, target = 0x919020 + Math.imul(cursor, 12);
      put(m, target, x); put(m, target + 4, y); put(m, 0x9153dc, (next >>> 0) < 24 ? next : 0); put(m, target + 8, z);
      emitNativeEffect(scale > 0 ? 11 : 10, target, [0, 0x400, 12000, 6, next, 0, 0], {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? {memory: m, handlers: runtime.handlers})});
    }
    emitRawEffectParticles(position, velocity, amount, get(m, 0x9153d8), 4, runtime);
    if (scale > 0) {
      emitRawEffectParticles(position, velocity, amount, get(m, 0x9153e0), 8, runtime);
      appendBodyPositionEffect(position, amount, runtime);
      put(m, nativeGlobalAddress(m,0x91cd88), get(m, frame + 0x10)); put(m, nativeGlobalAddress(m,0x91cd90), 1); put(m, nativeGlobalAddress(m,0x91cd80), x); put(m, nativeGlobalAddress(m,0x91cd84), y); put(m, nativeGlobalAddress(m,0x91cd8c), amount * 4 + 4);
      emitRawBodyDebris(position, velocity, amount, runtime);
      if (get(m, nativeGlobalAddress(m, 0x811180)) === 0) {put(m, nativeGlobalAddress(m,0x91cd60), 1); put(m, nativeGlobalAddress(m,0x91cd64), 31); put(m, nativeGlobalAddress(m,0x91cd68), amount); put(m, nativeGlobalAddress(m,0x91cd6c), x); put(m, nativeGlobalAddress(m,0x91cd70), y); put(m, nativeGlobalAddress(m,0x91cd74), get(m, frame + 0x10));}
      alterRawTerrainBrightness(position, amount, {...runtime, scratchBase: frame - 4});
      activateRawBodyPulse(position, runtime);
    } else emitRawBodyDebris(position, velocity, amount, runtime);
    if (!m[row + 9]) breakClassTwoModel(m.readUInt32LE(row + 12), {...runtime, scratchBase: frame - 4});
    m[row + 6] = 255;
    return;
  }
}

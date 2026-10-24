import {nativeGlobalAddress} from './native-global-address.mjs';
import {swapWeatherBodyPose, restoreWeatherBodyPose, updateWeatherVolume, advanceWeatherRandom} from './weather-volumes.mjs';
import {updateWeatherScreenParticles} from './weather-screen.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {nativeCodeAddress} from './native-memory-spans.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const effect = (code, parameters, runtime) => emitNativeEffect(code, 0, parameters, {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)});

//498cc0. Publish old brightness even when the transition remains idle.
export function updateWeatherBrightness({memory: m}) {
  put(m, 0x6e6cd0, get(m, 0x5ed2b8));
  if (!get(m, nativeGlobalAddress(m,0x80dedc))) {
    if (get(m, 0x5ed2b8) > 128) {put(m, 0x6e6ce8, get(m, 0x6e6ce8) + 1); if (get(m, 0x6e6ce8) > 30) {put(m, 0x6e6ce8, 0); put(m, 0x5ed2b4, 1); put(m, 0x5ed2b8, get(m, 0x5ed2b8) - 1);}}
  } else if (get(m, nativeGlobalAddress(m,0x80dedc)) === 1 && get(m, 0x5ed2b8) < 256) {
    put(m, 0x6e6ce8, get(m, 0x6e6ce8) - 1); if (get(m, 0x6e6ce8) < 0) {put(m, 0x5ed2b8, get(m, 0x5ed2b8) + 1); put(m, 0x6e6ce8, 30); put(m, 0x5ed2b4, get(m, nativeGlobalAddress(m,0x80dedc)));}
  }
}

//4975b0. Thunder cooldown, separate weather RNG and actual sound policy.
export function updateWeatherThunder(runtime) {
  const {memory: m} = runtime, cooldown = get(m, 0x6e6cf0);
  if (cooldown) {put(m, 0x6e6cf0, cooldown - 1); return;}
  const random = advanceWeatherRandom(m); if (((random >>> 15) << 16 >>> 0) >= 0x4000000) return;
  const chosen = advanceWeatherRandom(m) >>> 15, pitch = (chosen >>> 8) << 4;
  effect(chosen < 512 ? 37 : 38, [0, (chosen & 255) + 1024, (pitch + 8192) << 16 >> 16, 7, pitch, 0, 0], runtime);
}

//497730. The fourth sound stack argument is7; leaked ECX is unused by484bb0.
export function triggerWeatherLightning(runtime) {
  const {memory: m} = runtime, random = advanceWeatherRandom(m), pitch = ((random >>> 23) + 750) << 4;
  effect(36, [0, -1, pitch << 16 >> 16, 7, 0, 0, 0], runtime); put(m, nativeGlobalAddress(m,0x91cd60), 0x10001); put(m, nativeGlobalAddress(m,0x91cd64), 12);
}

//497650. Native post-decrement duration controls its alternating bit2 flash.
export function updateWeatherLightning(enabled, runtime) {
  const {memory: m} = runtime, cooldown = get(m, 0x6e6ce4); let duration;
  if (cooldown) put(m, 0x6e6ce4, cooldown - 1);
  else if (enabled) {
    const random = advanceWeatherRandom(m) >>> 15;
    if (random < 128) {triggerWeatherLightning(runtime); const selector = random & 3; if (selector === 3) put(m, 0x6e6cec, 8); else duration = selector === 2 ? 16 : 20;}
  }
  if (duration === undefined) duration = get(m, 0x6e6cec);
  const previous = get(m, 0x6e6cc8); put(m, 0x6e6ccc, previous); if (!duration) return;
  const next = duration & 2; put(m, 0x6e6cec, duration - 1); let dirty = get(m, 0x5ed2b4); if (previous !== next) dirty = 1; put(m, 0x6e6cc8, next); put(m, 0x5ed2b4, dirty);
}

//496700. Six weather volumes share a pose backup; screen particles always run.
export function updateWeather(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20; let row = ptr(m, nativeGlobalAddress(m,0x80dde0)), enabled = 1;
  updateWeatherBrightness({...runtime, scratchBase: frame - 4}); let session = ptr(m, 0x5ecb1c);
  if (m[session + 0x553] && row) {
    for (let index = 0; index < 6; index++) {
      if (row === 0xffffffff) break;
      swapWeatherBodyPose(row, index, 0, {...runtime, scratchBase: frame - 8}); updateWeatherVolume(row, {...runtime, scratchBase: frame - 4});
      session = ptr(m, 0x5ecb1c); const body = ptr(m, row + 0x10);
      if (m[session + 0x553] && body && get(m, body + 0x11c) >= 0) {
        const sector = ptr(m, ptr(m, ptr(m, 0x90b98c)) + m[body + 0x11c] * 4); if (m[sector + 4] & 8) enabled = 0;
      }
      if (m[nativeGlobalAddress(m,0x91ce90)] & 2 || index >= (get(m, nativeGlobalAddress(m,0x80ddf8)) - 2 | 0)) restoreWeatherBodyPose(body, runtime);
      row = ptr(m, nativeGlobalAddress(m,0x80dde4 + index * 4));
    }
    if (m[session + 0x553] === 1) {updateWeatherThunder({...runtime, scratchBase: frame - 4}); updateWeatherLightning(enabled, {...runtime, scratchBase: frame - 4});}
  }
  //49681d CALL498030: retain the game-owned return word from source, rather
  //than inheriting a previous native invocation's private stack contents.
  put(m, frame - 4, nativeCodeAddress(0x496822, runtime));
  updateWeatherScreenParticles(enabled, {...runtime, scratchBase: frame - 4});
}

import {abs32} from './fixed-integer.mjs';
import {emitWheelSurfaceDebris} from './wheel-effects.mjs';
import {sharesNativeMemorySpan} from './native-memory-spans.mjs';
const get = (memory, address) => memory.readInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const nextSeed = seed => Math.imul(seed, 0x41a7) & 0x7fffffff;

//46e760. The contact argument starts12 bytes into the complete event; its
//+20/+24/+28 are event point lanes, promoted fromQ8 toQ16 before debris.
export function emitScriptedCollisionDebris(body, contact, kind, runtime) {
  const {memory, scratchBase} = runtime, point = scratchBase - 12, velocity = scratchBase - 24;
  put(memory, point, get(memory, contact + 0x20) << 8);
  put(memory, point + 4, get(memory, contact + 0x24) << 8);
  const z = get(memory, contact + 0x28) << 8, xVelocity = -get(memory, body + 0x68) | 0;
  put(memory, point + 8, z);
  const zVelocity = -get(memory, body + 0x70) | 0, first = nextSeed(get(memory, 0x5ec958)), second = nextSeed(first);
  put(memory, velocity, ((xVelocity >> 2) + ((((first >>> 16) & 63) - 32) << 13)) | 0);
  put(memory, velocity + 4, -((second >>> 16) & 63) << 12);
  const third = nextSeed(second); put(memory, 0x5ec958, third);
  put(memory, velocity + 8, ((zVelocity >> 2) + ((((third >>> 16) & 63) - 32) << 13)) | 0);
  return emitWheelSurfaceDebris(point, velocity, kind, {...runtime, scratchBase: scratchBase - 36});
}

//46e470, installed by46e4e0 after an unscripted release. This callback always
//accepts the collision. Only a static event with sufficiently large packed
//impulse magnitudes samples RNG and can produce type22 debris.
export function filterScriptedCollision(body, other, event, runtime) {
  const {memory, scratchBase} = runtime;
  put(memory, scratchBase + 4, body); put(memory, scratchBase + 8, other); put(memory, scratchBase + 12, event);
  if (other) return 1;
  const impulse = (abs32(get(memory, event + 0x64)) | abs32(get(memory, event + 0x60)) | abs32(get(memory, event + 0x5c))) >>> 0;
  if (impulse < 0x30000) return 1;
  const seed = nextSeed(get(memory, 0x5ec958)); put(memory, 0x5ec958, seed);
  if (!(seed & 0x30000)) emitScriptedCollisionDebris(memory.readUInt32LE(scratchBase + 4), event + 12, 22, {...runtime, scratchBase: scratchBase - 12});
  return 1;
}

//Register this actual callback at native address46e470 in the shared physics
//view's collisionFilters map. The caller supplies its real native entry stack.
export function createScriptedCollisionFilter(runtime) {
  return (body, other, event) => {
    const shared = (value, minimum) => Number.isInteger(value?.address) && sharesNativeMemorySpan(runtime.memory, value.bytes, value.address, minimum);
    if (!shared(body, 0x74) || !shared(event, 0x68)) throw Error('Scripted collision filter requires body/event views sharing its native memory.');
    if (other && !shared(other, 0x74)) throw Error('Scripted collision filter requires a shared second body.');
    return filterScriptedCollision(body.address, other?.address ?? 0, event.address, runtime);
  };
}

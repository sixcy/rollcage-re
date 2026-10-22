import {abs32, multiplyQ16, divideQ16, vectorLengthQ16} from './fixed-integer.mjs';
import {reduceBodyEffectDirection} from './body-effect-impulse.mjs';
import {multiplyQ8} from './sphere-collision.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {emitScriptedCollisionDebris} from './scripted-collision-filter.mjs';
import {addVehicleContactScore, subtractVehicleContactScore, updateVehicleContactForObject, triggerVehicleContactRecovery} from './vehicle-contact-state.mjs';
const get = (memory, address) => memory.readInt32LE(address);
const pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const vector = (memory, address) => [0, 4, 8].map(offset => get(memory, address + offset));

//432e70 uses signed shifts even for an overflowed negative sum. Such inputs
//index original bytes before the ordinary192-entry positive root table.
function rootFromNativeTable(value, memory) {
  const absolute = abs32(value), leading = Math.clz32(absolute); put(memory, 0x91d45c, absolute); put(memory, 0x91d460, leading);
  if (leading === 32) return 0;
  const even = leading & ~1, shift = even - 24, normalized = shift < 0 ? value >> -shift : value << shift;
  return (memory.readUInt16LE(0x5eb290 + (normalized - 64) * 2) << ((31 - even) >> 1)) >>> 12;
}

//482730 raw adapter. State identity is captured before sound emission, whereas
//the lookup pointer and body/vector values are consumed after that child.
export function applyRawActiveVehicleEffect(body, direction, code, runtime) {
  const {memory, handlers = {}, scratchBase} = runtime, state = pointer(memory, body + 0x6bc);
  put(memory, scratchBase + 4, code);
  if (!memory[state + 8]) {
    const status = Math.max(0, (memory.readInt8(state + 1) - (code >> 5)) | 0);
    const args = [0, 0x600, 0x3fff, 6, body, 0, memory[body + 0x6b4] === 1 ? 1 : 0];
    if (handlers.call484bb0) handlers.call484bb0({...runtime, code: 24, registerEdx: body + 0x34, args, scratchBase: scratchBase - 88});
    else emitNativeEffect(24, body + 0x34, args, {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)});
    memory[state + 1] = status & 255; memory[state + 8] = 10;
  }
  const x = get(memory, direction), y = get(memory, direction + 4), z = get(memory, direction + 8);
  const coordinates = [];
  for (let column = 0; column < 3; column++) {
    const values = [x, y, z].map((value, row) => multiplyQ8(-memory.readInt16LE(body + 0xc4 + row * 6 + column * 2), value));
    const sum = (0x1000 + values[0] + values[1] + values[2]) | 0;
    coordinates.push(Math.max(0, Math.min(0x1fff, sum)));
  }
  const index = ((coordinates[2] >> 7) & 0x30) | (((coordinates[1] >> 11) & 3) << 2) | ((coordinates[0] >> 11) & 3);
  memory[state + 9 + memory[pointer(memory, 0x713180) + index]] = get(memory, scratchBase + 4) & 255;
}

//41e080, installed by41dbb0. Its three arguments use the stack ABI. Scratch
//argument slots are overwritten and later children consume those live bytes.
export function filterVehicleCollision(body, other, event, runtime) {
  const {memory, scratchBase} = runtime, frame = scratchBase - 40;
  put(memory, scratchBase + 4, body); put(memory, scratchBase + 8, other); put(memory, scratchBase + 12, event);
  let intensity;
  if (!other) {
    const dot = [0, 4, 8].reduce((sum, offset) => (sum + multiplyQ16(get(memory, event + 0x38 + offset), get(memory, body + 0x40 + offset))) | 0, 0);
    intensity = Math.min(abs32(dot) >> 14, 127); put(memory, frame + 0x2c, intensity);
  } else {
    const kind = get(memory, other) & 511; put(memory, frame + 0x18, kind);
    if (kind === 12) {
      updateVehicleContactForObject(body, pointer(memory, other + 0x194), 12, memory[body + 0x718] === 8, {...runtime, scratchBase: frame - 8});
      return 1;
    }
    const velocity = vector(memory, event + 0x5c);
    put(memory, frame + 0x2c, velocity[0]); put(memory, frame + 0x30, velocity[1]); put(memory, frame + 0x14, velocity[2]);
    const squared = velocity.reduce((sum, value) => (sum + multiplyQ16(value, value)) | 0, 0);
    intensity = Math.min(rootFromNativeTable(squared, memory) >> 7, 127); put(memory, frame + 0x2c, intensity);
    if (kind === 17) updateVehicleContactForObject(body, pointer(memory, other + 0x180), kind, memory[body + 0x718] === 8, {...runtime, scratchBase: frame - 8});
    else if (kind === 3) {
      if (memory[body + 0x718] === 8) {
        if (intensity >= 20 && memory[other + 0x718] !== 8 && memory[body + 0x6c9] !== 1) addVehicleContactScore(body, other, intensity, runtime);
      } else if (memory[other + 0x718] === 8 && memory[other + 0x6c9] === 1) subtractVehicleContactScore(other, body, intensity, {...runtime, scratchBase: frame - 8});
      if (memory[body + 0x718] === 8 && memory[other + 0x718] !== 8) triggerVehicleContactRecovery(body, intensity, runtime);
    }
    event = pointer(memory, frame + 0x34);
  }
  const cooldown = Math.min(intensity << 3, 255);
  if (cooldown > memory[body + 0x66f]) {
    memory[body + 0x66f] = cooldown & 255;
    const point = vector(memory, event + 0x2c);
    for (let lane = 0; lane < 3; lane++) put(memory, body + 0x680 + lane * 4, get(memory, body + 0x34 + lane * 4) - (point[lane] << 8));
    const direction = vector(memory, body + 0x680), scratch = reduceBodyEffectDirection(direction);
    for (let lane = 0; lane < 3; lane++) put(memory, body + 0x680 + lane * 4, direction[lane]);
    put(memory, 0x91d45c, scratch.sum91d45c); put(memory, 0x91d460, scratch.leadingZeros91d460);
    const squares = direction.map(value => multiplyQ16(value, value)), scaled = squares.reduce((bits, value) => bits | value, 0) & 0xe0000000;
    const root = squares.reduce((sum, value) => (sum + (scaled ? value >>> 2 : value)) | 0, 0);
    put(memory, 0x91d45c, abs32(root)); put(memory, 0x91d460, Math.clz32(abs32(root)));
    const length = vectorLengthQ16(direction);
    if (length < 64) {
      const x = get(memory, body + 0x674), y = get(memory, body + 0x678), z = get(memory, body + 0x67c);
      put(memory, body + 0x680, x); put(memory, body + 0x684, y); put(memory, body + 0x688, z);
    } else {
      const scale = divideQ16(65536, length);
      for (let lane = 0; lane < 3; lane++) put(memory, body + 0x680 + lane * 4, multiplyQ16(get(memory, body + 0x680 + lane * 4), scale));
    }
  }
  const direction = vector(memory, event + 0x38).map(value => value >> 8);
  if (body !== pointer(memory, event + 4)) for (let lane = 0; lane < 3; lane++) direction[lane] = -direction[lane] | 0;
  direction.forEach((value, lane) => put(memory, frame + 0x1c + lane * 4, value));
  if (intensity > 31) {
    const sign = memory[body + 0x64f] ? 1 : -1;
    const axes = [0xc6, 0xcc, 0xd2].map(offset => memory.readInt16LE(body + offset) * sign);
    put(memory, frame + 0x14, axes[0]); put(memory, frame + 0x30, axes[1]);
    const dot = axes.reduce((sum, value, lane) => (sum + Math.imul(value, direction[lane])) | 0, 0) >> 4;
    put(memory, frame + 0x34, dot);
    intensity = (intensity - multiplyQ16(dot, get(memory, frame + 0x2c))) | 0;
    if (intensity > 31) memory[body + 0x671] = 1;
  }
  const state = pointer(memory, body + 0x6bc), active = state !== 0xffffffff && memory[state] !== 0;
  if (memory.readInt16LE(body + 0x668) > 3) emitScriptedCollisionDebris(body, event + 12, active ? 23 : 22, {...runtime, scratchBase: frame - 8});
  if (active && intensity >= 48) applyRawActiveVehicleEffect(body, frame + 0x1c, intensity, {...runtime, scratchBase: frame - 8});
  return 1;
}

export function createVehicleCollisionFilter(runtime) {
  return (body, other, event) => {
    const shared = (value, minimum) => Number.isInteger(value?.address) && Buffer.isBuffer(value.bytes) && value.bytes.buffer === runtime.memory.buffer && value.bytes.byteOffset === runtime.memory.byteOffset + value.address && value.bytes.length >= minimum;
    if (!shared(body, 0x720) || !shared(event, 0x68) || (other && !shared(other, 0x180))) throw Error('Vehicle collision filter requires shared native body/event storage.');
    return filterVehicleCollision(body.address, other?.address ?? 0, event.address, runtime);
  };
}

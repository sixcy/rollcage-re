import {abs32, multiplyQ16, divideQ16, dotQ16} from './fixed-integer.mjs';
import {mixAnimationDirections} from './vehicle-auxiliary-animation.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, value) => m.writeInt32LE(value | 0, p), word = (m, p, value) => m.writeUInt16LE(value & 65535, p);
const vector = (m, p) => [0, 4, 8].map(offset => get(m, p + offset)), store = (m, p, values) => values.forEach((value, index) => put(m, p + index * 4, value));
function root(value, m) {
  const absolute = abs32(value), leading = Math.clz32(absolute); put(m, 0x91d45c, absolute); put(m, 0x91d460, leading);
  const shift = Math.min(16, (leading - 2) & ~1), scaled = shift > 0 ? value << shift : value >> (-shift & 31); let result = 0, square = 0, bit = 0x8000;
  for (let step = 15; step >= 0; step--) {const candidate = square + ((bit + result * 2) << step) | 0; if (candidate <= scaled) {result += bit; square = candidate;} bit = bit >>> 1 | (bit & 1) << 31;}
  return result << ((16 - shift) / 2 & 31);
}
export function measureWormholeVector(values, {memory: m}) {
  let squares = values.map(value => multiplyQ16(value, value)), reduced = !!(squares.reduce((a, b) => a | b, 0) & 0xe0000000);
  if (reduced) squares = squares.map(value => value >>> 2);
  return root(squares.reduce((a, b) => a + b | 0, 0), m) << (reduced ? 1 : 0);
}
//Actual41ca60 direct entry, also used by the authored-trigger camera. Keep
//signed wrapped inputs and the same root diagnostic publication as its caller.
export function computeWormholeFixedRoot(value, {memory}) {return root(value | 0, memory);}
const sound = (code, position, velocity, volume, mode, reverb, runtime) => emitNativeEffect(code, position, [velocity, 0x400, volume, mode, 0, 0, reverb], {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)});
const column = (m, body, offset) => [0, 6, 12].map(lane => m.readInt16LE(body + offset + lane) << 4);

//49aaa0: choose the nearest forward progression delta below half a lap.
export function selectWormholeTarget(owner, body, {memory: m}) {
  const count = m[ptr(m, 0x5ecb1c) + 0x54d]; let selected = 1, best = 0x20000;
  for (let index = 0; index < count; index++) {
    const record = 0x909300 + index * 0x30c, candidate = ptr(m, record);
    if (candidate === owner) continue;
    let progress = get(m, record + 0x24); const own = get(m, 0x909324 + m.readUInt16LE(owner + 0x65e) * 0x30c);
    if (progress < own) progress = progress + 65536 | 0;
    const difference = progress - own | 0;
    if (difference < 32768 && difference < best) {selected = candidate; best = difference;}
  }
  put(m, body + 0x198, selected);
}

//49bdf0: predict a point ahead of and above the selected live target.
export function writeWormholeTargetPoint(body, output, {memory: m}) {
  const target = ptr(m, body + 0x198), side = column(m, target, 0xc6).map(value => m[target + 0x64f] ? value : -value | 0), forward = [0xc8, 0xce, 0xd4].map(offset => m.readInt16LE(target + offset));
  const y = get(m, target + 0x38), z = get(m, target + 0x3c);
  put(m, output, get(m, target + 0x68) + get(m, target + 0x34) + Math.imul(forward[0], 4096) + Math.imul(side[0], 64));
  put(m, output + 4, get(m, target + 0x6c) + y + Math.imul(forward[1], 4096) + Math.imul(side[1], 64));
  put(m, output + 8, get(m, target + 0x70) + z + Math.imul(forward[2], 4096) + Math.imul(side[2], 64));
}

//49beb0 /49bd50.
export function clampWormholeVelocity(address, {memory: m}) {for (const offset of [0, 4, 8]) put(m, address + offset, Math.max(-0xe0000, Math.min(0xe0000, get(m, address + offset))));}
export function captureWormholeBasis(body, {memory: m}) {for (const [source, output] of [[0xc4, 0x1b8], [0xc6, 0x1c4], [0xc8, 0x1d0]]) for (let lane = 0; lane < 3; lane++) put(m, body + output + lane * 4, m.readInt16LE(body + source + lane * 6) << 4);}

//49af70. The destination uses captured owner geometry and previous18c.
export function updateWormholeEmergence(body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 44, owner = ptr(m, body + 0x194), side = column(m, owner, 0xc6).map(value => m[owner + 0x64f] ? value : -value | 0), distance = get(m, body + 0x18c);
  const point = [0, 1, 2].map(lane => multiplyQ16(side[lane], distance) + get(m, owner + 0x34 + lane * 4) + (m.readInt16LE(owner + 0xc8 + lane * 6) << 11) | 0);
  const previous = get(m, body + 0x180), timer = previous + 1 | 0; put(m, body + 0x18c, get(m, body + 0x18c) + 0x20000 - Math.imul(previous, 0xccc)); put(m, body + 0x180, timer);
  if (timer > 40) {
    put(m, body + 0x188, 2); put(m, body + 0x180, 0); m[body + 0x2a3c] = 0; selectWormholeTarget(owner, body, runtime);
    store(m, body + 0x19c, column(m, owner, 0xc8)); put(m, body + 0x1a8, 0x4000000);
    let current = ptr(m, body + 0x194); sound(32, current + 0x34, 0, 15000, 6, m[current + 0x6b4] === 1 ? 1 : 0, runtime);
    current = ptr(m, body + 0x194);
    if (m[current + 0x70b] && m[current + 0x71e] <= 10) {word(m, current + 0x71e, 0x10a); word(m, current + 0x71a, 255); m[current + 0x71d] = 50;}
    put(m, body + 0x2a38, sound(33, body + 0x34, body + 0x68, 16000, 9, 0, runtime));
  } else {
    const current = ptr(m, body + 0x194), amount = timer + 64 & 255;
    if (m[current + 0x70b] && amount && m[current + 0x71e] <= 10) {word(m, current + 0x71e, 0x10a); word(m, current + 0x71a, amount); m[current + 0x71d] = amount;}
  }
  store(m, frame + 0x20, point.map((value, lane) => (value - get(m, body + 0x34 + lane * 4) | 0) >> 3)); clampWormholeVelocity(frame + 0x20, runtime); store(m, body + 0x40, vector(m, frame + 0x20)); store(m, body + 0x1ac, column(m, owner, 0xc8));
}

//49b220. EAX reports transition/expiry to the outer sound-stop gate.
export function updateWormholeChase(body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36;
  put(m, body + 0x180, get(m, body + 0x180) + 1);
  if (get(m, body + 0x180) >= 300) {put(m, body + 0x188, 4); put(m, body + 0x180, 0); return 1;}
  if (get(m, body + 0x198) !== 1) {
    writeWormholeTargetPoint(body, frame + 0x18, runtime);
    for (let lane = 0; lane < 3; lane++) put(m, frame + 0xc + lane * 4, (get(m, frame + 0x18 + lane * 4) >> 10) - (get(m, body + 0x34 + lane * 4) >> 10));
    const distance = measureWormholeVector(vector(m, frame + 0xc), runtime);
    if (distance < 0x2000) {
      put(m, body + 0x188, 0x40); put(m, body + 0x180, 0); const owner = ptr(m, body + 0x194); sound(34, body + 0x34, 0, 16000, 6, m[owner + 0x6b4] === 1 ? 1 : 0, runtime); return 1;
    }
    if (distance > 0x7f0000) {put(m, body + 0x198, 1); return 0;}
    put(m, body + 0x1a8, distance << 6); const inverse = divideQ16(65536, distance);
    for (const offset of [0, 4, 8]) put(m, frame + 0xc + offset, multiplyQ16(get(m, frame + 0xc + offset), inverse));
    store(m, body + 0x19c, vector(m, frame + 0xc));
  }
  mixAnimationDirections(body + 0x1ac, body + 0x1ac, body + 0x19c, Math.max(1, Math.min(8, get(m, body + 0x1a8) >> 20)), 1, 0, {...runtime, scratchBase: frame - 20});
  const doubled = vector(m, body + 0x1ac).map(value => value + value | 0), velocity = vector(m, body + 0x68);
  store(m, body + 0x74, doubled.map((value, lane) => value + (value >> 1) - (velocity[lane] >> 5) | 0)); return 0;
}

//49b3f0. Ramp momentum over60ticks, then capture the basis and sign plane.
export function updateWormholeCapture(body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 24;
  writeWormholeTargetPoint(body, frame + 0xc, runtime);
  for (let lane = 0; lane < 3; lane++) put(m, frame + 0xc + lane * 4, (get(m, frame + 0xc + lane * 4) - get(m, body + 0x34 + lane * 4) | 0) >> 3);
  clampWormholeVelocity(frame + 0xc, runtime); store(m, body + 0x40, vector(m, frame + 0xc));
  const scale = Math.min(65536, Math.trunc(((get(m, body + 0x180) - 59 | 0) << 16) / 59) + 0x18000 | 0);
  for (const offset of [0, 4, 8]) put(m, body + 0x40 + offset, multiplyQ16(get(m, body + 0x40 + offset), scale));
  put(m, body + 0x180, get(m, body + 0x180) + 1);
  if (get(m, body + 0x180) >= 60) {
    put(m, body + 0x188, 0x80); put(m, body + 0x180, 0); captureWormholeBasis(body, runtime);
    const target = ptr(m, body + 0x198); for (let lane = 0; lane < 3; lane++) put(m, frame + 0xc + lane * 4, get(m, target + 0x34 + lane * 4) - get(m, body + 0x34 + lane * 4));
    put(m, body + 0x1dc, dotQ16(vector(m, frame + 0xc), vector(m, body + 0x1d0))); return;
  }
  const target = ptr(m, body + 0x198); store(m, body + 0x1ac, vector(m, body + 0x34).map((value, lane) => value - get(m, target + 0x34 + lane * 4) | 0));
  const side = column(m, target, 0xc6).map(value => m[target + 0x64f] ? value : -value | 0);
  for (let lane = 0; lane < 3; lane++) put(m, body + 0x1ac + lane * 4, get(m, body + 0x1ac + lane * 4) - (side[lane] << 6));
}

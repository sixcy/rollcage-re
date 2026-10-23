import {readGameMicroseconds} from './game-network-protocol.mjs';
import {advanceWeatherRandom} from './weather-volumes.mjs';
import {queryWeatherViewport, readWeatherViewportExtent} from './weather-viewport.mjs';
import {nativeMemorySpan} from './native-memory-spans.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const f = (m, p) => m.readFloatLE(p), sf = (m, p, v) => m.writeFloatLE(v, p), mul = (a, b) => Math.fround(a * b), add = (a, b) => Math.fround(a + b), sub = (a, b) => Math.fround(a - b), div = (a, b) => Math.fround(a / b);
function playerName(memory, name) {memory.writeBigUInt64LE(memory.readBigUInt64LE(0x5d0254), name); memory[name + 8] = memory[0x5d025c]; nativeMemorySpan(memory,name+9,251).fill(0);}

//4979c0. Actual frame-rate gate, shared RNG and all three screen-particle types.
export function spawnWeatherScreenParticle(index, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 0x254;
  let stamp = ptr(m, 0x6e6cd4), now = ptr(m, 0x90a548), session = ptr(m, 0x5ecb1c);
  if (stamp > now) stamp = now; put(m, 0x6e6cd4, stamp);
  const kind = m[session + 0x553], interval = kind === 1 ? 66 : kind === 2 ? 200 : 3;
  if ((Math.imul(now - stamp | 0, 33) >>> 0) < interval) return;
  const offset = Math.imul(index, 160); put(m, 0x6e6cd4, now); put(m, frame + 0x18, offset); put(m, ptr(m, 0x7135b4) + offset + 0x98, 0);
  advanceWeatherRandom(m); const width = readWeatherViewportExtent(false, {...runtime, scratchBase: frame - 4});
  const x = Math.imul(width, ptr(m, 0x5ed2bc) >>> 15) >>> 16;
  advanceWeatherRandom(m); const height = readWeatherViewportExtent(true, {...runtime, scratchBase: frame - 4});
  const y = Math.imul(height, ptr(m, 0x5ed2bc) >>> 15) >>> 16;
  put(m, ptr(m, 0x7135b4) + offset, 1); sf(m, ptr(m, 0x7135b4) + offset + 0x7c, x); sf(m, frame + 0x10, y);
  let base = ptr(m, 0x7135b4); session = ptr(m, 0x5ecb1c); sf(m, base + offset + 0x80, y); put(m, base + offset + 0x88, 0);
  const actualKind = m[session + 0x553];
  if (actualKind === 2) {
    const first = advanceWeatherRandom(m), second = advanceWeatherRandom(m); put(m, base + offset + 0x98, (first >>> 26) + 128);
    base = ptr(m, 0x7135b4); sf(m, frame + 0x10, (Math.imul(second >>> 15, 10) >>> 16) + 10); sf(m, base + offset + 0x84, f(m, frame + 0x10));
    const third = advanceWeatherRandom(m); put(m, base + offset + 0x8c, 0); put(m, base + offset + 0x90, 0); put(m, base + offset + 0x9c, Math.imul(third >>> 15, 255) >>> 16);
    put(m, base + offset + 0x94, Math.imul(advanceWeatherRandom(m) >>> 15, 255) >>> 16); return;
  }
  if (actualKind === 1) {
    const first = advanceWeatherRandom(m), second = advanceWeatherRandom(m); put(m, base + offset + 0x98, (first >>> 26) + 100); base = ptr(m, 0x7135b4);
    put(m, base + offset + 0x9c, 0); sf(m, frame + 0x10, (second >>> 30) + 5); sf(m, base + offset + 0x84, f(m, frame + 0x10)); return;
  }
  if (actualKind !== 0) return;
  const initialHeight = m.readUInt16LE(session + 0xa80), bottom = initialHeight * 2 - (initialHeight >>> 1); put(m, frame + 0x10, 50);
  let offsetLive = offset, radius;
  do {
    const random = advanceWeatherRandom(m); session = ptr(m, 0x5ecb1c); const screenHeight = m.readUInt16LE(session + 0xa80);
    radius = Math.trunc(Math.imul((random >>> 22) + 128, screenHeight) / (screenHeight >>> 1));
    offsetLive = get(m, frame + 0x18); const chosen = (advanceWeatherRandom(m) >>> 15 & 63) - 32 & 255; put(m, base + offsetLive + 0x9c, chosen);
    playerName(m, frame + 0x38); queryWeatherViewport(frame + 0x38, frame + 0x34, frame + 0x20, frame + 0x1c, frame + 0x28, {...runtime, scratchBase: frame - 16}); base = ptr(m, 0x7135b4);
    const angle = get(m, base + offsetLive + 0x9c), center = get(m, frame + 0x1c) >> 1;
    sf(m, base + offsetLive + 0x7c, (Math.imul(m.readInt16LE(0x5ed030 + angle * 2), radius) >> 14) + center);
    sf(m, base + offsetLive + 0x80, add((-Math.imul(m.readInt16LE(0x5ed0b0 + angle * 2), radius) | 0) >> 14, Math.fround(bottom)));
    if (f(m, base + offsetLive + 0x7c) > f(m, 0x5dc598)) {
      playerName(m, frame + 0x140); queryWeatherViewport(frame + 0x140, frame + 0x2c, frame + 0x24, frame + 0x14, frame + 0x30, {...runtime, scratchBase: frame - 16}); base = ptr(m, 0x7135b4);
      if (Math.fround(get(m, frame + 0x14)) > f(m, base + offsetLive + 0x7c) && f(m, base + offsetLive + 0x80) > f(m, 0x5dc598)) {
        const availableHeight = readWeatherViewportExtent(true, {...runtime, scratchBase: frame - 4}); if (Math.fround(availableHeight) > f(m, base + offsetLive + 0x80)) break;
      }
    }
    put(m, frame + 0x10, get(m, frame + 0x10) - 1);
  } while (get(m, frame + 0x10) > 0);
  const first = advanceWeatherRandom(m), second = advanceWeatherRandom(m); put(m, base + offsetLive + 0x98, (first >>> 26) + 100); base = ptr(m, 0x7135b4);
  sf(m, frame + 0x14, (second >>> 28) + 24); put(m, base + offsetLive + 0x90, 0); sf(m, base + offsetLive + 0x84, f(m, frame + 0x14));
}

//498030. Every screen query and per-particle reload remains in native order.
export function updateWeatherScreenParticles(emitEnabled, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 0x13c;
  playerName(m, frame + 0x28); queryWeatherViewport(frame + 0x28, frame + 0x18, frame + 0x1c, frame + 0x14, frame + 0x20, {...runtime, scratchBase: frame - 16});
  const halfWidth = mul(Math.fround(get(m, frame + 0x14)), f(m, 0x5dc6ec)); playerName(m, frame + 0x28); sf(m, frame + 0x14, halfWidth);
  queryWeatherViewport(frame + 0x28, frame + 0x10, frame + 0x18, frame + 0x1c, frame + 0x20, {...runtime, scratchBase: frame - 16});
  let session = ptr(m, 0x5ecb1c); if (m[session + 0x552]) return;
  let speed = 0;
  if (!(m[0x91ce90] & 2)) {let index = get(m, 0x6e9f70); if (index === -1) index = 0; speed = m.readInt16LE(ptr(m, 0x909300 + Math.imul(index, 0x30c)) + 0x668); session = ptr(m, 0x5ecb1c);}
  sf(m, frame + 0x10, speed); sf(m, frame + 0x24, mul(speed, f(m, 0x5dc5d4))); const kind = m[session + 0x553];
  if (kind === 2) {
    for (let offset = 0, index = 0; offset < 0x500; offset += 160, index++) {
      let base = ptr(m, 0x7135b4), age = get(m, base + offset + 0x90); put(m, base + offset + 0x90, age + 1);
      if (age >= 10) {const random = advanceWeatherRandom(m); put(m, base + offset + 0x8c, Math.min((Math.imul(random >>> 15, 3) >>> 16) + 1, 3)); put(m, base + offset + 0x90, 0);}
      const target = get(m, base + offset + 0x8c), old = get(m, base + offset + 0x88); if (old !== target) put(m, base + offset + 0x88, old + (old < target ? 1 : -1));
      sf(m, frame + 0x14, get(m, base + offset + 0x88)); base = ptr(m, 0x7135b4); const drift = get(m, base + offset + 0x88);
      sf(m, base + offset + 0x80, add(f(m, base + offset + 0x80), f(m, frame + 0x14)));
      put(m, base + offset + 0x9c, get(m, base + offset + 0x9c) + (m[base + offset + 0x94] & 1 ? drift : -drift)); put(m, base + offset + 0x98, get(m, base + offset + 0x98) - 2);
      if (get(m, base + offset + 0x98) <= 0) {put(m, base + offset, 0); if (emitEnabled) spawnWeatherScreenParticle(index, {...runtime, scratchBase: frame - 4});}
    }
    return;
  }
  if (kind === 1) {
    const firstHeight = readWeatherViewportExtent(true, {...runtime, scratchBase: frame - 4});
    const targetY = Math.fround(readWeatherViewportExtent(true, {...runtime, scratchBase: frame - 4}) + (firstHeight >> 1)); sf(m, frame + 0x1c, targetY);
    speed = f(m, frame + 0x10); const step = mul(div(f(m, 0x5dc774), mul(speed > f(m, 0x5dca18) ? speed : f(m, 0x5dca18), f(m, 0x5dc620))), f(m, 0x5dc640));
    let spread = mul(f(m, frame + 0x24), f(m, 0x5dc6ec)), spreadY = mul(spread, f(m, 0x5dc6ec)), center = f(m, frame + 0x14), target = targetY, wave = f(m, 0x5dc5f0);
    sf(m, frame + 0x24, spread); sf(m, frame + 0x18, spreadY); sf(m, frame + 0x20, step);
    for (let offset = 0, index = 0; offset < 0x1400; offset += 160, index++) {
      let base = ptr(m, 0x7135b4), phase = Math.min(get(m, base + offset + 0x88) + 16 | 0, 1024);
      put(m, base + offset + 0x98, get(m, base + offset + 0x98) - 2); put(m, base + offset + 0x88, phase); sf(m, base + offset + 0x84, sub(f(m, base + offset + 0x84), step));
      sf(m, frame + 0x10, m.readInt16LE(0x570720 + (phase & 4095) * 4)); base = ptr(m, 0x7135b4);
      let y = add(mul(f(m, frame + 0x10), wave), f(m, base + offset + 0x80)), x = f(m, base + offset + 0x7c);
      sf(m, base + offset + 0x7c, add(mul(sub(x, center), spread), x)); sf(m, base + offset + 0x80, sub(y, mul(sub(target, y), spreadY)));
      if (get(m, base + offset + 0x98) <= 0) {
        put(m, base + offset, 0);
        if (emitEnabled) {spawnWeatherScreenParticle(index, {...runtime, scratchBase: frame - 4}); spread = f(m, frame + 0x24); spreadY = f(m, frame + 0x18); center = f(m, frame + 0x14); target = f(m, frame + 0x1c); wave = f(m, 0x5dc5f0);}
      }
    }
    return;
  }
  if (kind !== 0) return;
  const milliseconds = Number((BigInt.asUintN(64, readGameMicroseconds({...runtime, scratchBase: frame - 4})) / 1000n) & 0xffffffffn) >>> 0;
  let random = advanceWeatherRandom(m), active = get(m, 0x6e6cf4);
  if (!active) {if (!(random >>> 15 & 0x3fffc0)) {active = 1; put(m, 0x6e6ce0, milliseconds); put(m, 0x6e6cf4, active);}}
  else if (active === 1) {if (milliseconds > (ptr(m, 0x6e6ce0) + 30000 >>> 0)) active = 0; put(m, 0x6e6cf4, active);}
  let base = ptr(m, 0x7135b4);
  if (get(m, 0x6e6cdc) && active && f(m, frame + 0x10) > f(m, 0x5dca34)) {
    random = advanceWeatherRandom(m);
    if (!(random >>> 15 & 0x7fff800)) {base = ptr(m, 0x7135b4); let index = 0; while (index < 32 && get(m, base + index * 160)) index++; if (index < 32) {spawnWeatherScreenParticle(index, {...runtime, scratchBase: frame - 4}); base = ptr(m, 0x7135b4);}}
  }
  for (let offset = 0; offset < 0x500; offset += 160) {
    const age = get(m, base + offset + 0x90); put(m, base + offset + 0x90, age + 1); if (age >= 5) {put(m, base + offset + 0x98, get(m, base + offset + 0x98) - 1); put(m, base + offset + 0x90, 0);} if (get(m, base + offset + 0x98) <= 0) put(m, base + offset, 0);
  }
}

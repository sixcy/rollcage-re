import {packDevicePalette16, packDevicePalette32} from './device-color-packing.mjs';
import constants from './procedural-texture-constants.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export function initializeProceduralTextureConstants(memory) {
  for (const item of constants.constants) Buffer.from(item.bytesHex, 'hex').copy(memory, item.address);
}

//499760. CRT allocation and libm results are explicit library services. Single
//precision inputs/loop accumulators are rounded before each double libm call.
export function initializeProceduralTextureStorage(runtime) {
  const {memory, scratchBase, handlers = {}} = runtime;
  if (typeof handlers.allocate !== 'function') throw Error('Procedural texture storage requires allocate.');
  const math = runtime.math ?? Math, f = p => memory.readFloatLE(p), d = p => memory.readDoubleLE(p);
  const sf = (p, v) => memory.writeFloatLE(v, p), sd = (p, v) => memory.writeDoubleLE(v, p), bp = scratchBase - 4;
  const trunc = v => Number.isFinite(v) && Math.trunc(v) >= -2147483648 && Math.trunc(v) <= 2147483647 ? Math.trunc(v) : -2147483648;
  const mulf = (a, b) => Math.fround(a * b);
  put(memory, bp - 8, 0x75840);
  const allocation = handlers.allocate(0x75840, runtime) >>> 0;
  if (!allocation) {put(memory, 0x713994, 0); return;}
  memory.fill(0, allocation, allocation + 0x75840); put(memory, bp - 12, allocation);
  sd(bp - 56, d(0x5dc8f0)); sd(bp - 64, d(0x5dc948));
  put(memory, 0x713994, allocation); put(memory, 0x713884, allocation); put(memory, 0x713888, allocation + 0x1c800);
  sf(bp - 4, 0); sf(bp - 12, 0);
  let output = allocation, y = 0;
  do {
    sf(bp - 8, 0); sf(bp - 16, Math.fround(f(0x5dca24) - y));
    sd(bp - 32, math.cos(mulf(y, f(0x5dc638)))); sd(bp - 40, math.sin(mulf(f(bp - 12), f(0x5dc624))));
    let x = 0;
    do {
      const distance = math.hypot(Math.fround(f(0x5dca4c) - x), f(bp - 16));
      sd(bp - 24, distance * d(0x5dc798)); sd(bp - 48, math.cos(d(bp - 24)));
      let sum = math.sin(mulf(f(bp - 8), f(0x5dc650))) + d(bp - 32); sd(bp - 24, sum);
      sum = d(bp - 24) + math.cos(mulf(f(bp - 8), f(0x5dc644))) + d(bp - 40); sd(bp - 24, sum);
      sum = d(bp - 24) + math.sin(mulf(Math.fround(f(bp - 8) + f(bp - 12)), f(0x5dc63c)));
      const value = trunc((d(bp - 48) + sum) * d(bp - 56) + d(bp - 64));
      x = Math.fround(f(bp - 8) + f(0x5dc774)); memory[output++] = ((255 - (value & 255)) & 255) >>> 1; sf(bp - 8, x);
    } while (f(0x5dca64) > x);
    y = Math.fround(f(bp - 12) + f(0x5dc774)); sf(bp - 12, y);
  } while (f(0x5dca30) > y);
  output = ptr(memory, 0x713888);
  let phase = f(bp - 4);
  do {
    const first = trunc((trunc(math.sin(mulf(phase, f(0x5dc670))) * d(0x5dc930) + d(0x5dc938)) << 9) + math.cos(mulf(f(bp - 4), f(0x5dc648))) * d(0x5dc950) + d(0x5dc958));
    memory.writeUInt16LE(first & 65535, output);
    const second = (trunc(math.cos(mulf(f(bp - 4), f(0x5dc65c))) * d(0x5dc930) + d(0x5dc938)) << 9) + math.sin(mulf(f(bp - 4), f(0x5dc660))) * d(0x5dc950) + d(0x5dc958);
    memory.writeUInt16LE(trunc(second - first) & 65535, output + 2);
    phase = Math.fround(f(bp - 4) + f(0x5dc774)); sf(bp - 4, phase); output += 4;
  } while (f(0x5dca84) > phase);
}
function service(runtime, object, method, args) {
  if (typeof runtime.handlers?.rendererCall !== 'function') throw Error('Procedural texture requires rendererCall.');
  const result = runtime.handlers.rendererCall(object, method, args, runtime);
  return (typeof result === 'number' ? result : result?.eax) | 0;
}

//408310. The renderer lock produces a destination pointer and pitch; the
//game adapter separately reads the live format from renderer object+42ch.
export function lockProceduralTexture(id, destinationOut, formatOut, pitchOut, runtime) {
  const {memory, scratchBase} = runtime, mapped = get(memory, (0x6e1620 + Math.imul(id, 4)) >>> 0);
  if (mapped === -1) return 0;
  const object = service(runtime, ptr(memory, 0x714ae8), 0x90, [mapped]) >>> 0;
  if (!object) return 0;
  const destination = scratchBase - 8, pitch = scratchBase - 4;
  put(memory, destination, 0); put(memory, pitch, 0);
  if ((service(runtime, object, 8, [destination, 0, pitch]) & 255) !== 1) return 0;
  put(memory, destinationOut, get(memory, destination));
  put(memory, formatOut, get(memory, object + 0x42c)); put(memory, pitchOut, get(memory, pitch));
  return 1;
}

//433d50 re-resolves the live mapping/manager before unlocking the resource.
export function unlockProceduralTexture(id, argument, runtime) {
  const {memory} = runtime, mapped = get(memory, (0x6e1620 + Math.imul(id, 4)) >>> 0);
  if (mapped !== -1) {
    const object = service(runtime, ptr(memory, 0x714ae8), 0x90, [mapped]) >>> 0;
    if (object) service(runtime, object, 12, [argument]);
  }
  return 1;
}

//499a90 palette producer. Index128 and the unused alpha bytes are retained.
export function initializeProceduralTexturePalette(runtime) {
  const {memory, scratchBase} = runtime;
  if (!lockProceduralTexture(get(memory, 0x5ed02c), scratchBase - 4, scratchBase - 8, scratchBase - 12, {...runtime, scratchBase: scratchBase - 36})) return;
  let row = 0x7143ac, value = 0;
  for (let i = 0; i < 56; i++, row -= 4, value += 2) {
    memory[row] = memory[row + 1] = value >> 2; memory[row + 2] = Math.min(255, value * 2);
  }
  let intensity = value * 8 - 0x364;
  for (let i = 0; i < 71; i++, row -= 4, value++, intensity += 8) {
    memory[row] = memory[row + 1] = Math.min(255, intensity); memory[row + 2] = Math.min(255, value * 2);
  }
  packDevicePalette16(0x713fb0, 0x7139b0, {...runtime, scratchBase: scratchBase - 36});
  packDevicePalette32(0x713fb0, 256, 0x713bb0, 1, {...runtime, scratchBase: scratchBase - 44});
  unlockProceduralTexture(get(memory, 0x5ed02c), 0x713fb0, {...runtime, scratchBase: scratchBase - 20});
}

//499b90. Write128 rows of128 pixels starting128 pitches into the locked
//surface. Packed-byte addition retains carries before OR80808080h. Palette
//reads are interleaved with writes, including overlapping output/table inputs.
export function renderProceduralTexture(destination, pitch, format, delta, {memory, scratchBase}) {
  const frame = scratchBase - 4, local = frame - 20;
  put(memory, frame - 8, destination); put(memory, frame - 20, delta); memory[frame - 1] = 128;
  put(memory, frame - 16, 0); put(memory, frame - 12, 0);
  if ([8, 16, 32].includes(format | 0)) {
    const bytesPerRow = format * 16, remainder = (pitch - bytesPerRow) | 0;
    put(memory, scratchBase + 8, remainder); //the native format argument is reused
    let output = (destination + Math.imul(pitch, 128)) >>> 0;
    const phase = ptr(memory, 0x713888) + ((get(memory, 0x6e6d00) << 2) & 65535);
    const offset = memory.readUInt16LE(phase), second = (memory.readUInt16LE(phase + 2) + 4) & 65535;
    let input = ptr(memory, 0x713884);
    for (let row = 0; row < 128; row++) {
      let cursor = offset;
      for (let column = 0; column < 32; column++) {
        const first = get(memory, input + cursor); cursor = (cursor + second) & 65535;
        const packed = ((first + get(memory, input + cursor)) | 0x80808080) | 0;
        cursor = (((cursor - second) & 65535) + 4) & 65535;
        if (format === 8) {put(memory, output, packed); output += 4;}
        else if (format === 16) {
          //Both palette values are read before each complete dword store.
          const low = memory.readUInt16LE(0x7139b0 + (packed & 255) * 2), high = memory.readUInt16LE(0x7139b0 + ((packed >>> 8) & 255) * 2);
          put(memory, output, low | (high << 16));
          const upperHigh = memory.readUInt16LE(0x7139b0 + (packed >>> 24) * 2), upperLow = memory.readUInt16LE(0x7139b0 + ((packed >>> 16) & 255) * 2);
          put(memory, output + 4, upperLow | (upperHigh << 16)); output += 8;
        } else {
          for (let lane = 0; lane < 4; lane++) put(memory, output + lane * 4, get(memory, 0x713bb0 + ((packed >>> (lane * 8)) & 255) * 4));
          output += 16;
        }
      }
      input += 512; output = (output + remainder) >>> 0;
    }
  }
  let phase = (get(memory, 0x6e6d00) + Math.imul(get(memory, local), 3)) | 0;
  put(memory, 0x6e6d00, phase); if (phase >= 3600) {phase = (phase - 3600) | 0; put(memory, 0x6e6d00, phase);}
}

//499de0. Tick interval is captured before renderer calls; timestamp is live
//after them. Even unsupported locked formats are unlocked and timestamped.
export function updateProceduralTexture(runtime) {
  const {memory, scratchBase} = runtime;
  if (!memory[ptr(memory, 0x5ecefc) + 0x28] || get(memory, 0x5ed02c) === -1) return 1;
  const previous = get(memory, 0x5ed2c4), difference = (get(memory, 0x90a548) - previous) | 0;
  const delta = previous !== -1 && difference >= 1 && difference <= 3 ? difference : 1;
  const formatOut = scratchBase - 12, pitchOut = scratchBase - 8, destinationOut = scratchBase - 4;
  if (lockProceduralTexture(get(memory, 0x5ed02c), destinationOut, formatOut, pitchOut, {...runtime, scratchBase: scratchBase - 36})) {
    const format = get(memory, formatOut);
    if ([8, 16, 32].includes(format)) renderProceduralTexture(ptr(memory, destinationOut), get(memory, pitchOut), format, delta, {...runtime, scratchBase: scratchBase - 32});
    unlockProceduralTexture(get(memory, 0x5ed02c), 0x713fb0, {...runtime, scratchBase: scratchBase - 24});
  }
  put(memory, 0x5ed2c4, get(memory, 0x90a548)); return 1;
}

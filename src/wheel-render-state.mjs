import table from './render-angle-table.json' with {type: 'json'};
import {nativeGlobalAddress} from './native-global-address.mjs';
import {transformWheelEffectOffset} from './wheel-effects.mjs';

const get = (memory, address) => memory.readInt32LE(address);
const pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);

export function initializeWheelRenderTables(memory) {
  Buffer.from(table.bytesHex, 'hex').copy(memory, Number(table.address));
  Buffer.from('00008039', 'hex').copy(memory, 0x5dc5f4);
  return memory;
}

//432680. Original4096 masked phase pairs, low32 products and short outputs.
export function buildRenderRotationMatrix(angles, output, {memory}) {
  const phase = index => 0x570720 + (memory.readInt16LE(angles + index * 2) & 4095) * 4;
  const x = phase(0), sx = memory.readInt16LE(x), cx = memory.readInt16LE(x + 2);
  const y = phase(1), sy = memory.readInt16LE(y), cy = memory.readInt16LE(y + 2);
  const z = phase(2), sz = memory.readInt16LE(z), cz = memory.readInt16LE(z + 2);
  const sySx = Math.imul(sy, sx) >> 12, syCx = Math.imul(sy, cx) >> 12;
  word(memory, output + 4, sy);
  word(memory, output, Math.imul(cz, cy) >> 12); word(memory, output + 2, (-Math.imul(sz, cy) | 0) >> 12);
  word(memory, output + 6, (Math.imul(sySx, cz) + Math.imul(sz, cx) | 0) >> 12);
  word(memory, output + 8, (Math.imul(cz, cx) - Math.imul(sySx, sz) | 0) >> 12);
  word(memory, output + 10, (-Math.imul(cy, sx) | 0) >> 12);
  word(memory, output + 14, (Math.imul(syCx, sz) + Math.imul(cz, sx) | 0) >> 12);
  word(memory, output + 12, (Math.imul(sz, sx) - Math.imul(syCx, cz) | 0) >> 12);
  word(memory, output + 16, Math.imul(cy, cx) >> 12);
  put(memory, output + 20, 0); put(memory, output + 24, 0); put(memory, output + 28, 0);
}

//433400. Transform the three scattered shorts, preserving their upper words.
export function transformRenderShortVector({memory}) {
  const x = memory.readInt16LE(0x91d408), y = memory.readInt16LE(0x91d40c), z = memory.readInt16LE(0x91d410);
  const dot = row => (Math.imul(memory.readInt16LE(0x91d360 + row * 6), x) + Math.imul(memory.readInt16LE(0x91d362 + row * 6), y) + Math.imul(memory.readInt16LE(0x91d364 + row * 6), z) | 0) >> 12;
  const second = dot(1), third = dot(2), first = dot(0);
  word(memory, 0x91d40c, second); word(memory, 0x91d410, third); word(memory, 0x91d408, first);
}

//41d610. The full pre-truncation accumulator determines the clamped offset.
export function updateWheelRenderOffset(wheel, body, {memory}) {
  let value = Math.trunc(memory.readInt16LE(wheel + 2) / 2);
  if (memory[wheel] & 1) {
    const displacement = (get(memory, wheel + 0x80) - 0x1e0000 | 0) >> 13;
    value = memory[body + 0x64f] ? value + displacement | 0 : value - displacement | 0;
  }
  word(memory, wheel + 2, value); word(memory, wheel + 0x72, Math.max(-6, Math.min(6, -Math.trunc(value / 8))));
  put(memory, 0x91d3e4, get(memory, wheel + 0x70)); put(memory, 0x91d3e8, get(memory, wheel + 0x74));
}

//41d460. Build local spin/steering rotation, transform its columns, then
//publish linked render-body matrix, packed terrain and world position.
export function prepareWheelRender(wheel, body, steering, runtime) {
  const {memory, scratchBase} = runtime, frame = scratchBase - 64;
  let spin = get(memory, wheel + 0x78);
  put(memory, frame + 0x14, pointer(memory, wheel + 0x6c));
  if (memory[body + 0x64f] === 1) {steering = -steering | 0; spin = -spin | 0;}
  word(memory, frame + 0x1a, (steering >> 6) + 1024); word(memory, frame + 0x1c, -Math.imul(spin >> 12, 3)); word(memory, frame + 0x18, 0);
  buildRenderRotationMatrix(frame + 0x18, frame + 0x20, runtime);
  let output;
  for (let column = 0; column < 3; column++) {
    for (let row = 0; row < 3; row++) word(memory, 0x91d408 + row * 4, memory.readUInt16LE(frame + 0x20 + row * 6 + column * 2));
    transformRenderShortVector(runtime);
    if (!column) output = pointer(memory, frame + 0x14);
    for (let row = 0; row < 3; row++) word(memory, output + 0xc4 + row * 6 + column * 2, memory.readUInt16LE(0x91d408 + row * 4));
  }
  updateWheelRenderOffset(wheel, body, runtime); transformWheelEffectOffset(runtime);
  put(memory, output + 12, get(memory, body + 12)); put(memory, output + 0x11c, get(memory, body + 0x11c));
  const offset = [0, 4, 8].map(lane => get(memory, 0x91d448 + lane));
  for (let lane = 0; lane < 3; lane++) put(memory, output + 0x34 + lane * 4, (offset[lane] << 16) + get(memory, body + 0x34 + lane * 4));
}

//41d2b0. Float renderer scratch is separate from the short transform source.
export function prepareVehicleWheelRender(body, runtime) {
  const {memory, scratchBase} = runtime;
  let steering = get(memory, body + 0x644);
  if (memory[body + 0x718] === 8) {const previous = get(memory, body + 0x648); steering = (Math.trunc(steering / 4) - Math.trunc(previous / 4) + previous) | 0; put(memory, body + 0x648, steering);}
  for (let offset = 0; offset < 20; offset += 4) put(memory, 0x91d360 + offset, get(memory, body + 0xc4 + offset));
  let scale;
  for (let lane = 0; lane < 9; lane++) {
    const value = memory.readInt16LE(0x91d360 + lane * 2); memory.writeFloatLE(value, scratchBase - 4);
    if (!lane) scale = memory.readFloatLE(0x5dc5f4);
    memory.writeFloatLE(Math.fround(value * scale), nativeGlobalAddress(memory,0x91cdc0 + Math.floor(lane / 3) * 16 + lane % 3 * 4));
  }
  for (let index = 0; index < 4; index++) prepareWheelRender(body + 0x324 + index * 200, body, index < 2 ? steering : 0, {...runtime, scratchBase: scratchBase - 28});
}

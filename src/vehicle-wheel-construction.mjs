import {nativeGlobalAddress} from './native-global-address.mjs';
import tables from './vehicle-wheel-construction-tables.json' with {type: 'json'};
import {abs32, multiplyQ16, divideQ16} from './fixed-integer.mjs';
import {createRawBody} from './raw-body-construction.mjs';
import {prepareWheelRender, initializeWheelRenderTables} from './wheel-render-state.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
export function initializeVehicleWheelConstructionTables(memory) {
  initializeWheelRenderTables(memory);
  for (const table of tables) Buffer.from(table.bytesHex, 'hex').copy(memory, Number(table.address));
  return memory;
}

//41ca60's signed input walk, including root scratch and overflowing squared
//descriptors. A zero result still reaches the native coefficient division.
function radiusRoot(value, memory) {
  const absolute = abs32(value); put(memory, 0x91d45c, absolute); put(memory, 0x91d460, Math.clz32(absolute));
  let shift = (Math.clz32(absolute) - 2) & ~1, scaled;
  if (shift > 16) {shift = 16; scaled = value << 16;} else scaled = shift > 0 ? value << shift : value >> (-shift & 31);
  let root = 0, square = 0, bit = 0x8000;
  for (let step = 15; step >= 0; step--) {const candidate = square + ((bit + root * 2) << step) | 0; if (candidate <= scaled) {square = candidate; root = root + bit | 0;} bit = (bit >>> 1) | (bit & 1) << 31;}
  return root << ((16 - shift) / 2 & 31);
}

//41caf0. EDX is the wheel model; stack arg0 is the participant index. This
//constructor uses incoming wheel offsets during its FIRST render update,
//then installs the authored offsets and distance for subsequent updates.
export function createVehicleWheels(body, wheelModel, vehicleIndex, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 48;
  put(m, scratchBase + 4, vehicleIndex); put(m, frame + 0x1c, wheelModel);
  const steering = get(m, body + 0x644); put(m, frame + 0x28, body); put(m, frame + 0x2c, steering);
  for (let offset = 0; offset < 20; offset += 4) put(m, 0x91d360 + offset, get(m, body + 0xc4 + offset));
  let scale;
  for (let lane = 0; lane < 9; lane++) {const value = m.readInt16LE(0x91d360 + lane * 2); m.writeFloatLE(value, frame + 0x18); if (!lane) scale = m.readFloatLE(0x5dc5f4); m.writeFloatLE(Math.fround(value * scale), nativeGlobalAddress(m, 0x91cdc0) + Math.floor(lane / 3) * 16 + lane % 3 * 4);}
  m[frame + 0x13] = 0; put(m, frame + 0x18, 0x5eac42); put(m, frame + 0x14, body + 0x184);
  let wheel = body + 0x324;
  do {
    m[wheel] = 0;
    for (const offset of [0x28, 0x2c, 0x30, 0x1c, 0x20, 0x24, 4, 8, 12, 0x10, 0x14, 0x18, 0x40, 0x44, 0x48]) put(m, wheel + offset, 0);
    for (const [source, target] of [[0xc8, 0x34], [0xce, 0x38], [0xd4, 0x3c]]) put(m, wheel + target, m.readInt16LE(body + source) << 4);
    put(m, wheel + 0x5c, 1000); put(m, wheel + 0x58, 0); put(m, wheel + 0x78, 0);
    const object = createRawBody(ptr(m, frame + 0x1c), 0x8c0b, 384, 0, {...runtime, scratchBase: frame - 12}); put(m, wheel + 0x6c, object);
    prepareWheelRender(wheel, body, m[frame + 0x13] < 2 ? get(m, frame + 0x2c) : 0, {...runtime, scratchBase: frame - 8});
    const authored = ptr(m, frame + 0x18), height = m.readUInt16LE(0x5eac1a);
    word(m, wheel + 0x70, m.readUInt16LE(authored - 2)); word(m, wheel + 0x72, m.readUInt16LE(authored)); word(m, wheel + 0x74, m.readUInt16LE(authored + 2));
    word(m, wheel + 2, 0); put(m, wheel + 0x7c, 0); m[wheel + 1] = 0;
    const geometry = get(m, 0x5eac18); put(m, wheel + 0x80, 0x240000); word(m, wheel + 0x84, geometry); word(m, wheel + 0x8c, -geometry);
    word(m, wheel + 0x86, height); word(m, wheel + 0x8e, height); word(m, wheel + 0x94, 0); word(m, wheel + 0x96, -height);
    const index = m[frame + 0x13]; m[wheel + 0x9c] = m[scratchBase + 4]; let z = get(m, 0x5eac1c); m[wheel + 0x9d] = index;
    if (index & 1) {let saved = m.readUInt16LE(wheel + 0x84); z = -z | 0; word(m, wheel + 0x84, m.readUInt16LE(wheel + 0x94)); word(m, wheel + 0x94, saved); saved = m.readUInt16LE(wheel + 0x86); word(m, wheel + 0x86, m.readUInt16LE(wheel + 0x96)); word(m, wheel + 0x96, saved);}
    for (const offset of [0x88, 0x90, 0x98]) word(m, wheel + offset, z);
    const descriptor = ptr(m, frame + 0x14); put(m, ptr(m, wheel + 0x6c) + 0x164, wheel); put(m, wheel + 0xa8, get(m, wheel + 0xa8) & ~0x8000); put(m, wheel + 0xb8, -1);
    const squared = [-4, -2, 0].map(offset => {const value = m.readInt16LE(descriptor + offset) << 8; return multiplyQ16(value, value);}).reduce((sum, value) => sum + value | 0, 0);
    put(m, frame + 0x24, squared); const radius = radiusRoot(squared, m);
    put(m, wheel + 0xbc, multiplyQ16(get(m, frame + 0x24), get(m, body + 0xa8)));
    const inverse = divideQ16(65536, radius), nextAuthored = ptr(m, frame + 0x18) + 8;
    put(m, frame + 0x14, get(m, frame + 0x14) + 28); put(m, wheel + 0xc0, inverse); wheel += 200; put(m, frame + 0x18, nextAuthored); m[frame + 0x13] = m[frame + 0x13] + 1 & 255;
  } while (m[frame + 0x13] < 4);
  put(m, body + 0x644, 0); m[body + 0x64f] = 0;
  for (const base of [0x3e38, 0x3e00, 0x3e54, 0x3e1c]) {put(m, body + base + 8, 16); put(m, body + base + 4, 6000); put(m, body + base, 1);}
}

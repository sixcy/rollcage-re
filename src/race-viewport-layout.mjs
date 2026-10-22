import constants from './race-viewport-layout-constants.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
export function initializeRaceViewportLayoutConstants(memory) {for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}

//471770: local view selection, followed by ascending active peers in network
//mode. The original SIMD constants remain mutable native data inputs.
export function selectRaceViewportParticipants({memory: m, scratchBase, entryRegisters}) {
  if (Number.isInteger(scratchBase) && Number.isInteger(entryRegisters?.ECX)) put(m, scratchBase - 4, entryRegisters.ECX);
  if (!(m[0x6eafe0] & 16)) {
    const first = Array.from({length: 4}, (_, i) => get(m, 0x5dcc60 + i * 4)), second = Array.from({length: 4}, (_, i) => get(m, 0x5dcb80 + i * 4));
    first.forEach((value, i) => put(m, 0x5ec120 + i * 4, value + second[i])); return;
  }
  if (Number.isInteger(scratchBase) && Number.isInteger(entryRegisters?.ESI)) put(m, scratchBase - 8, entryRegisters.ESI);
  const local = get(m, 0x6e9f70); put(m, 0x5ec120, local); let output = 0x5ec124;
  for (let index = 0; index < 6; index++) if (index !== local && get(m, 0x6e7884 + index * 0x67c) === 1) {put(m, output, index); output += 4; if (output >= 0x5ec130) break;}
  const remaining = output > 0x5ec130 ? 0 : (0x5ec133 - output) >>> 2;
  for (let i = 0; i < remaining; i++, output += 4) put(m, output, 0);
}

//42ef80: ECX/EDX are the first two selected participant indices, followed by
//two caller stack indices. Both switches use the initially captured mode;
//border calculation rereads the live session after projection publication.
export function layoutRaceViewports(first, second, third, fourth, {memory: m, scratchBase}) {
  const frame = scratchBase - 36, mode = m[ptr(m, 0x5ecb1c) + 0x552];
  put(m, scratchBase + 4, third); put(m, scratchBase + 8, fourth);
  put(m, frame + 0x10, first); put(m, frame + 0x14, second); put(m, frame + 0x20, mode); word(m, 0x6f9bfc, 0);
  let width = 0, height = 0, config = ptr(m, 0x5ecefc);
  if (mode <= 4) {
    width = m.readUInt16LE(config + 0x42c); height = m.readUInt16LE(config + 0x42e);
    if (mode === 2 || mode === 3 || mode === 4) width >>>= 1;
    if (mode === 1 || mode === 3 || mode === 4) height >>>= 1;
  }
  const halfWidth = width >>> 1, halfHeight = height >>> 1;
  word(m, 0x91d508, halfHeight); word(m, 0x91d506, halfWidth); put(m, frame + 0x18, halfWidth);
  put(m, 0x91d3c0, halfWidth << 16); put(m, 0x91d3c4, halfHeight << 16); m.writeFloatLE(halfWidth, 0x91cdf8);
  put(m, frame + 0x18, halfHeight); put(m, 0x91d594, (height << 16) + width);
  config = ptr(m, 0x5ecefc); m.writeFloatLE(halfHeight, 0x91cdfc);
  const fullWidth = m.readUInt16LE(config + 0x42c), fullHeight = m.readUInt16LE(config + 0x42e);
  put(m, frame + 0x1c, fullWidth); put(m, frame + 0x18, fullWidth >>> 1);
  const border = m[ptr(m, 0x5ecb1c) + 0x552] ? Math.max(2, Math.trunc(fullWidth / 640)) : 0;
  const right = (fullWidth >>> 1) + border, bottom = (fullHeight >>> 1) + border; put(m, frame + 0x1c, right);
  width = width - border * 2 | 0; height = height - border * 2 | 0;
  const address = index => (0x909308 + Math.imul(index, 0x30c)) >>> 0;
  const write = (index, values, offsets = [0, 4, 8, 12]) => {const record = address(index); offsets.forEach((offset, i) => put(m, record + offset, values[i]));};
  const selected = offset => get(m, frame + offset);
  if (mode === 1) {
    write(selected(0x10), [border, border, width, height]); const target = address(selected(0x14)); put(m, target + 4, bottom); put(m, target + 12, height); put(m, target + 8, width); put(m, target, border);
  } else if (mode === 2) {
    write(selected(0x10), [border, border, width, height]); write(selected(0x14), [right, border, width, height]);
  } else if (mode === 3) {
    const target = address(selected(0x10)), centered = get(m, frame + 0x18) - (width >>> 1) | 0; put(m, frame + 0x18, centered);
    put(m, target, centered); const next = address(selected(0x14)); put(m, target + 4, border); put(m, target + 8, width); put(m, target + 12, height);
    const liveRight = get(m, frame + 0x1c); put(m, next, border); put(m, next + 4, bottom); put(m, next + 8, width); put(m, next + 12, height);
    write(selected(0x28), [liveRight, bottom, width, height]);
  } else if (mode === 4) {
    write(selected(0x10), [border, border, width, height]); write(selected(0x14), [right, border, width, height]);
    write(selected(0x28), [border, bottom, width, height]); write(selected(0x2c), [right, bottom, width, height]);
  } else write(selected(0x10), [border, height, width, border], [4, 12, 8, 0]);
  const value = m[0x91d50e], auxiliary = ptr(m, 0x90b990); m[0x91d5b8] = value; m[0x91de28] = value;
  m[0x91d5b6] = m[0x91d510]; m[0x91de26] = m[0x91d510];
  for (let i = 0; i < 3; i++) {const color = m[auxiliary + 0x30 + i] * 2 & 255; m[0x91d5b9 + i] = color; m[0x91de29 + i] = color;}
  const session = ptr(m, 0x5ecb1c); word(m, session + 0xa80, height); word(m, session + 0xa82, width);
}

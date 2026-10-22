import {selectTrackBasisAxis} from './track-basis.mjs';
const get = (memory, address) => memory.readInt32LE(address);
const pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);

//417210 with actual44a1c0 axis policy and449cd0 route sign. Inputs and both
//outputs share the native address space; a negative registration writes none.
export function populateRawVehicleTrackBasis(body, tangent, normal, {memory}) {
  const pack = pointer(memory, 0x90b98c), normals = pointer(memory, pack + 0x1c), cell = get(memory, body + 0x11c);
  if (cell < 0) return 0;
  const sector = pointer(memory, pointer(memory, pack) + (cell & 255) * 4), width = get(memory, sector + 8), row = cell >> 16, column = cell << 16 >> 24;
  let vertex = (Math.imul((width + 1) | 0, row) + column) | 0;
  let first = (pointer(memory, sector + 0x20) + (vertex << 3)) >>> 0, packet = (pointer(memory, sector + 0x50) + ((vertex - row) << 3)) >>> 0, second;
  const player = memory.readUInt16LE(body + 0x65e), record = 0x909300 + Math.imul(player, 0x30c);
  let axis = selectTrackBasisAxis(cell, {mode: memory[pointer(memory, 0x5ecb1c) + 0x579], progressStage: memory[record + 0x20]});
  if (axis > 1) {
    axis = axis === 2 ? -1 : 1;
    if (column === width) {second = first; first = (first - 8) >>> 0; packet = (packet - 8) >>> 0;} else second = (first + 8) >>> 0;
  } else if (row === get(memory, sector + 12)) {second = first; first = (first - (width + 1) * 8) >>> 0; packet = (packet - width * 8) >>> 0;}
  else second = (first + (width + 1) * 8) >>> 0;
  if (!axis) {
    const route = pointer(memory, 0x9092b0) + memory[record + 0x22] * 20;
    let dot = 0;
    for (let lane = 0; lane < 3; lane++) dot = (dot + Math.imul(memory.readInt16LE(route + 12 + lane * 2), memory.readInt16LE(second + lane * 2) - memory.readInt16LE(first + lane * 2))) | 0;
    axis = dot >= 0 ? 1 : -1;
  } else axis = axis === 1 ? 0 : -1;
  const values = [0, 2, 4].map(offset => (memory.readInt16LE(first + offset) - memory.readInt16LE(second + offset)) << 12);
  values.forEach((value, lane) => put(memory, tangent + lane * 4, value));
  if (axis < 0) values.forEach((value, lane) => put(memory, tangent + lane * 4, -value));
  const packed = get(memory, normals + memory.readUInt16LE(packet + 2) * 4);
  put(memory, normal, (packed & 0xfff00fff) << 2 >> 14); put(memory, normal + 4, (packed & 0xfffffc03) << 12 >> 14); put(memory, normal + 8, packed << 22 >> 14);
  return 1;
}

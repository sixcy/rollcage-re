import constants from './vehicle-input-constants.json' with {type: 'json'};

const put32 = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const short = value => (value << 16) >> 16;
const clampAxis = value => Math.max(-127, Math.min(127, value));

export function initializeVehicleInputConstants(memory) {
  for (const item of constants.constants) Buffer.from(item.bytes_hex, 'hex').copy(memory, Number(item.address));
  return memory;
}

// 433200. Capture raw controls/mask before zeroing the12-byte packet header.
export function convertInputPacket(vehicleIndex, packet, status, {memory}) {
  const controls = memory.readUInt32LE(status), mask = memory.readInt16LE((0x90955e + Math.imul(vehicleIndex, 0x30c)) >>> 0);
  memory.fill(0, packet, packet + 8); memory.fill(0, packet, packet + 8); put32(memory, packet + 8, 0); put32(memory, packet, 0xffff4100);
  if (!(memory[0x6eafe0] & 1)) {if ((vehicleIndex | 0) > 3) return;}
  else if ((vehicleIndex >>> 0) > 5 || memory.readInt32LE((0x6e7880 + Math.imul(vehicleIndex, 0x67c)) >>> 0) === 0) return;
  if (controls & 0x800) memory[packet + 2] = 0xf7;
  if (controls & 0x100) memory[packet + 2] ^= 1;
  if (controls & 0x10) memory[packet + 3] = 0xef;
  for (const [input, output] of [[0x40, 0x40], [0x80, 0x80], [0x20, 0x20], [4, 8], [8, 4], [1, 2], [2, 1]]) if (controls & input) memory[packet + 3] ^= output;
  if (mask & 0x80) {
    const steering = clampAxis(memory.readInt8(status + 5)), longitudinal = clampAxis(memory.readInt8(status + 6));
    if (mask & 4) memory[packet + 8] = (steering - 128) & 255;
    if ((mask & 2) && longitudinal < 0) memory[packet + 9] = (-longitudinal * 2) & 255;
    if ((mask & 1) && longitudinal >= 0) memory[packet + 10] = (longitudinal * 2) & 255;
  }
  for (const [input, output] of [[0x1000, 0x10], [0x4000, 0x40], [0x8000, 0x80], [0x2000, 0x20]]) if (controls & input) memory[packet + 2] ^= output;
  memory.writeUInt16LE(controls >>> 16, packet + 4);
}

// 434210. The native CRT power call is an explicit numeric service; float32
// multiply/add and the signed truncation into the generated table are retained.
export function transformInputAxis(value, brake, {memory, pow = Math.pow}) {
  if (memory.readInt32LE(0x6e65b0) === 0) {
    let current = memory.readFloatLE(0x5dc9d4);
    for (let address = 0x6fb740; address < 0x6fb944; address += 4) {
      const powered = pow(Math.fround(current * memory.readFloatLE(0x5dc684)), memory.readDoubleLE(0x5dc890));
      current = Math.fround(current + memory.readFloatLE(0x5dc730));
      const truncated = Math.trunc(powered);
      put32(memory, address, Number.isFinite(truncated) && truncated >= -2147483648 && truncated <= 2147483647 ? truncated : -2147483648);
    }
    put32(memory, 0x6fb740, 0); put32(memory, 0x6e65b0, 1);
  }
  const input = short(value);
  if (brake & 255) return Math.abs(input) < 25 ? 0 : input & 65535;
  if (input < 128) {
    const adjusted = Math.max(0, 128 - (Math.imul(128 - input, 300) >> 8));
    const address = (0x6fb940 - short(adjusted) * 4) >>> 0;
    if (((128 - memory.readInt32LE(address)) | 0) <= 0) return 0;
    return (128 - memory.readUInt16LE(address)) & 65535;
  }
  const adjusted = Math.min(255, (Math.imul(input - 128, 300) >> 8) + 128), address = (0x6fb540 + short(adjusted) * 4) >>> 0;
  if (((memory.readInt32LE(address) + 128) | 0) >= 255) return 255;
  return (128 + memory.readUInt16LE(address)) & 65535;
}

// 471250. This retrieves target-owned sampled/current/history records. Device
// sampling and configuration are upstream producers, not OS calls in this pass.
export function pollInputPacket(vehicleIndex, pointerAddress, statusAddress, {memory, transformPacket = (packet, status) => convertInputPacket(vehicleIndex, packet, status, {memory})}) {
  const flags = memory.readUInt32LE(0x6eafe0);
  const minimum = !(flags & 1) || memory[memory.readUInt32LE(0x5ecefc) + 0x37] !== 0 ? 1 : 2;
  put32(memory, statusAddress, 0); memory.writeUInt16LE(0, statusAddress + 5); memory[statusAddress + 7] = 0; memory[statusAddress + 4] = 0;
  const offset = Math.imul(vehicleIndex, 0x67c) | 0;
  const copy = address => {put32(memory, statusAddress, memory.readInt32LE(address)); put32(memory, statusAddress + 4, memory.readInt32LE(address + 4));};
  if (memory.readUInt32LE(0x6e675c) >= minimum) {
    if (!(flags & 1) || !(flags & 6) || memory.readInt32LE(0x5eb518) !== 0) {
      if ((vehicleIndex | 0) < 4) copy(0x6e7ac4 + offset);
    } else if (memory.readInt32LE(0x6e7880 + offset) !== 0) {
      if (!(flags & 0x80)) copy(0x6e78b0 + offset);
      else {
        let closest = -1, distance = 0x40;
        for (let index = 0; index < 0x40; index++) {
          const stamp = memory.readUInt32LE(0x6e7bd8 + offset + index * 12), clock = memory.readUInt32LE(0x6ea69c);
          if (stamp <= clock) {
            const gap = (clock - stamp) >>> 0;
            if (gap <= distance) {closest = index; distance = gap;}
          }
        }
        if (closest !== -1) copy(0x6e7bdc + offset + closest * 12);
      }
    }
  }
  const packet = (0x6e7edc + offset) >>> 0;
  if (typeof transformPacket !== 'function') throw Error('Input packet retrieval requires recovered433200 transform.');
  transformPacket(packet, statusAddress, {memory});
  const liveFlags = memory.readUInt32LE(0x6eafe0);
  if ((liveFlags & 0x81) === 0x81) {
    const selected = memory.readInt32LE(0x6e9f70);
    if ((vehicleIndex | 0) !== (selected === -1 ? 0 : selected)) memory[packet + 3] |= 15;
  }
  put32(memory, pointerAddress, packet);
}

// 434360. The registered body is captured once. Packet pointer and analog mask
// are loaded again for each selected axis; output can alias either structure.
export function decodeAnalogVehicleInput(vehicleIndex, {memory, pow = Math.pow, transformAxis = (value, brake) => transformInputAxis(value, brake, {memory, pow})}) {
  const record = (0x909300 + Math.imul(vehicleIndex, 0x30c)) >>> 0, input = memory.readUInt32LE(record) + 0x708;
  const axis = (mask, packetOffset, outputOffset, brake) => {
    if (!(memory[record + 0x25e] & mask)) return;
    const packet = memory.readUInt32LE(input + 0x1c), value = memory[packet + packetOffset];
    if (typeof transformAxis !== 'function') throw Error('Analog input requires recovered434210 transform.');
    memory[input + outputOffset] = transformAxis(value, brake, {memory}) & 255;
  };
  axis(4, 8, 0, 0); axis(2, 10, 2, 1); axis(1, 9, 1, 0);
}

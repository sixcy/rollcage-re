import {applyVehicleHapticEffect} from './vehicle-haptics.mjs';

//42b530 final-substep surface/speed feedback. All addresses belong to the
//caller's sampled/runtime memory; device/cache services are those of407380.
export function updateVehicleSurfaceFeedback(runtime) {
  const {memory, scratchBase, handlers = {}} = runtime;
  const pointer = address => memory.readUInt32LE(address), get = address => memory.readInt32LE(address);
  const scale = value => Math.fround(Math.fround(value) * memory.readFloatLE(0x5dc5e8));
  const clamp = value => value < memory.readFloatLE(0x5dcb10) ? memory.readFloatLE(0x5dcb10) : value > memory.readFloatLE(0x5dc774) ? memory.readFloatLE(0x5dc774) : value;
  let session = pointer(0x5ecb1c);
  for (let index = 0; index < memory[session + 0x54d]; index++) {
    const record = 0x909300 + index * 0x30c;
    if (memory.readInt8(record + 0x258) <= 1) continue;
    const body = pointer(record), query = pointer(body + 0x11c);
    let surface, materials = query === 0xffffffff;
    if (!materials) {
      const segment = pointer(pointer(0x909240) + (query & 255) * 4), row = query >> 16, column = (query << 16) >> 24;
      const cell = (pointer(segment + 0x20) + Math.imul((Math.imul(row, (get(segment + 8) + 1) | 0) + column) | 0, 8)) >>> 0;
      surface = pointer(cell + 4) >>> 22;
      materials = surface >= 1008 || surface < memory.readUInt16LE(0x90929c);
    }
    if (materials) surface = [0x198, 0x1b4, 0x1d0, 0x1ec].reduce((sum, offset) => {
      const material = pointer(body + offset);
      return (sum + (material ? (pointer(material + 12) >>> 8) & 31 : 26)) | 0;
    }, 0) >> 2;
    else surface = 26;
    const factor = (20 - (Math.trunc(Math.imul(Math.min(surface, 20), 20) / 23) + 2)) | 0;
    const first = clamp(scale(Math.trunc(Math.imul(factor, Math.min(Math.imul(memory.readInt16LE(body + 0x668), 50), 10000)) / 20)));
    const emit = (type, value) => {
      const descriptor = Buffer.alloc(20); descriptor.writeFloatLE(value, 12); descriptor.writeFloatLE(value, 16);
      const deviceId = memory.readInt16LE(record + 0x25c), context = {...runtime, scratchBase: scratchBase - 60};
      if (handlers.call407380) handlers.call407380({memory, ecx: deviceId, edx: type, args: [descriptor], scratchBase: context.scratchBase});
      else applyVehicleHapticEffect(deviceId, type, descriptor, context);
    };
    emit(3, first);
    const liveBody = pointer(record), second = Math.imul((1000 - memory.readInt16LE(liveBody + 0x668)) | 0, Math.trunc(Math.imul(factor, 10000) / 20)) >> 10;
    emit(4, clamp(scale(second)));
    session = pointer(0x5ecb1c);
  }
}

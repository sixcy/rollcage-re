import constants from './vehicle-haptics-constants.json' with {type: 'json'};

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const read = (memory, address) => memory.readUInt32LE(address);
const multiply = (first, second) => Math.fround(Math.fround(first) * Math.fround(second));
const service = (runtime, name) => {
  if (typeof runtime.handlers?.[name] !== 'function') throw Error(`Vehicle haptics requires library service ${name}.`);
  return runtime.handlers[name];
};
const container = (runtime, entry, ecx, args, scratchBase) => {
  const result = service(runtime, 'hapticContainerCall')(entry, {memory: runtime.memory, ecx, args, scratchBase}, runtime);
  if (result === undefined && [0x40b6b0, 0x40b9d0, 0x40b370].includes(entry)) return 0;
  const eax = typeof result === 'number' ? result : result?.eax;
  if (!Number.isInteger(eax)) throw Error(`Haptic container${entry.toString(16)} requires explicit EAX.`);
  return eax >>> 0;
};
const device = (runtime, pointer, method, args) => service(runtime, 'deviceCall')(pointer, method, args, runtime);

export function initializeVehicleHapticsConstants(memory) {
  for (const table of constants) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address));
  return memory;
}

//407380. Standard-container methods remain actual library interfaces; the
//game's cache creation/replacement, effect creation/update and live handle/
//descriptor reloads are reconstructed here using their native pointer cells.
//The result is the meaningful AL status; higher EAX bytes are volatile.
export function applyVehicleHapticEffect(deviceId, effectType, descriptor, runtime) {
  const {memory, scratchBase: stack} = runtime;
  if (!Buffer.isBuffer(descriptor) || descriptor.length < 20 || !Number.isInteger(stack)) throw Error('Haptic effect requires20 descriptor bytes and native entry ESP.');
  descriptor.copy(memory, stack + 4, 0, 20);
  put(memory, stack - 20, effectType); put(memory, stack - 8, deviceId);
  const pointer = device(runtime, read(memory, 0x714b54), 0x14, [deviceId | 0, 3]) >>> 0;
  if (!pointer) return 0;
  let returned = container(runtime, 0x40b2a0, undefined, [stack - 4, stack - 8], stack - 44);
  if (read(memory, returned) === read(memory, 0x6f2360)) {
    put(memory, stack - 16, 0); put(memory, stack - 12, 0);
    put(memory, stack - 16, container(runtime, 0x40c0a0, undefined, [], stack - 36));
    const map = container(runtime, 0x40b220, undefined, [stack - 8], stack - 40);
    if (map !== stack - 16) {
      container(runtime, 0x40b6b0, map, [read(memory, read(memory, map) + 4)], stack - 40);
      put(memory, read(memory, map) + 4, read(memory, map)); put(memory, read(memory, map), read(memory, map)); put(memory, read(memory, map) + 8, read(memory, map));
      const oldHeader = read(memory, map); put(memory, map + 4, 0);
      put(memory, map, read(memory, stack - 16)); const newSize = read(memory, stack - 12);
      put(memory, stack - 16, oldHeader); const oldSize = read(memory, map + 4);
      put(memory, map + 4, newSize); put(memory, stack - 12, oldSize);
    }
    const header = read(memory, stack - 16);
    container(runtime, 0x40b9d0, stack - 16, [stack - 4, read(memory, header), header], stack - 48);
    service(runtime, 'free')(read(memory, stack - 16), runtime);
  }
  const map = container(runtime, 0x40b220, undefined, [stack - 8], stack - 40);
  returned = container(runtime, 0x40b5b0, map, [stack - 4, stack - 20], stack - 44);
  if (read(memory, returned) === read(memory, map)) {
    const cell = container(runtime, 0x40b2f0, map, [stack - 20], stack - 40);
    put(memory, cell, device(runtime, pointer, 0x34, [memory.readInt32LE(stack - 20)]));
    const liveCell = container(runtime, 0x40b2f0, map, [stack - 20], stack - 40);
    device(runtime, pointer, 0x40, [read(memory, liveCell), stack + 4]);
  } else {
    const cell = container(runtime, 0x40b2f0, map, [stack - 20], stack - 40);
    device(runtime, pointer, 0x44, [read(memory, cell), stack + 4]);
  }
  return 1;
}

//4074e0 always stops/removes cached effect key1, independently of407570's
//type2 and407670's type0. The handle is read again after the stop virtual call.
export function stopVehicleHapticEffect(deviceId, runtime) {
  const {memory, scratchBase: stack} = runtime;
  put(memory, stack - 8, 1); put(memory, stack - 12, deviceId);
  const pointer = device(runtime, read(memory, 0x714b54), 0x14, [deviceId | 0, 3]) >>> 0;
  if (!pointer) return;
  const result = container(runtime, 0x40b2a0, undefined, [stack - 4, stack - 12], stack - 28);
  if (read(memory, result) === read(memory, 0x6f2360)) return;
  const map = container(runtime, 0x40b220, undefined, [stack - 12], stack - 32);
  container(runtime, 0x40b5b0, map, [stack - 4, stack - 8], stack - 36);
  const node = read(memory, stack - 4);
  if (node === read(memory, map)) return;
  device(runtime, pointer, 0x3c, [read(memory, node + 0x14)]);
  device(runtime, pointer, 0x38, [read(memory, node + 0x14)]);
  container(runtime, 0x40b370, map, [stack - 4, node], stack - 36);
}

const callEffect = (deviceId, type, descriptor, entry, runtime) => {
  if (runtime.handlers?.apply407380) return runtime.handlers.apply407380(deviceId, type, descriptor, {...runtime, scratchBase: entry});
  return applyVehicleHapticEffect(deviceId, type, descriptor, {...runtime, scratchBase: entry});
};
const clamp = (value, minimum, maximum) => value < minimum ? minimum : value > maximum ? maximum : value;

//407570 uses imported scalar cosf/sinf. Host defaults retain float32 arguments,
//results and each multiplication; vendor libm internals are a library boundary.
export function applyVehicleDirectionalHaptics(deviceId, angle, gain, runtime) {
  const {memory, scratchBase: stack} = runtime;
  angle = Math.max(0, Math.min(angle | 0, 36000));
  const scaled = multiply(gain | 0, memory.readFloatLE(0x5dc5e8));
  const radians = multiply(multiply(multiply(angle, memory.readFloatLE(0x5dc5cc)), memory.readFloatLE(0x5dc940)), memory.readFloatLE(0x5dc888));
  memory.writeFloatLE(scaled, stack + 4);
  const cosine = Math.fround((runtime.handlers?.cosf ?? Math.cos)(radians));
  const x = clamp(multiply(cosine, memory.readFloatLE(stack + 4)), memory.readFloatLE(0x5dcb10), memory.readFloatLE(0x5dc774));
  const sine = Math.fround((runtime.handlers?.sinf ?? Math.sin)(radians));
  const y = clamp(multiply(sine, memory.readFloatLE(stack + 4)), memory.readFloatLE(0x5dcb10), memory.readFloatLE(0x5dc774));
  const descriptor = Buffer.alloc(20); descriptor.writeFloatLE(y, 12); descriptor.writeFloatLE(x, 16);
  return callEffect(deviceId, 2, descriptor, stack - 56, runtime);
}

//407670: duration-1 is zero; otherwise signed integer microseconds become
//float seconds. Gain is clamped only after its float32 scaling.
export function applyVehicleConstantHaptics(deviceId, duration, gain, runtime) {
  const {memory, scratchBase: stack} = runtime, descriptor = Buffer.alloc(20);
  if ((duration | 0) !== -1) descriptor.writeFloatLE(multiply(duration | 0, memory.readFloatLE(0x5dc5bc)), 0);
  descriptor.writeFloatLE(clamp(multiply(gain | 0, memory.readFloatLE(0x5dc5e8)), memory.readFloatLE(0x5dcb10), memory.readFloatLE(0x5dc774)), 12);
  return callEffect(deviceId, 0, descriptor, stack - 48, runtime);
}

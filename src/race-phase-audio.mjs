import {copyToNativeMemory,nativeMemorySpan} from './native-memory-spans.mjs';
const get = (memory, address) => memory.readInt32LE(address);
const pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const fmul = (a, b) => Math.fround(Math.fround(a) * Math.fround(b));
const service = (runtime, name, ...args) => {
  if (typeof runtime.handlers?.[name] !== 'function') throw Error(`Race phase audio requires reached service ${name}.`);
  return runtime.handlers[name](...args, runtime);
};

//Original immutable scalar bytes retained in974/975/978. Listener ownership,
//master level5ecdb8 and live position/velocity polarity remain caller-owned.
export function initializeRacePhaseAudioConstants(memory) {
  for (const [address, hex] of [
    [0x5dc5b8, '00008035bd378635acc527373bb25f37000080375304e9370000f03782a8fb370000003800010038000280383ec3ae3817b7d1386f12033917b7513900008039'],
    [0x5dc628, 'fc037f3c'],
    [0x5dcf00, '0000000000000000000000000000f041'],
  ]) Buffer.from(hex, 'hex').copy(memory, address);
}

//484880: one zeroed descriptor is reused across four active listener records.
//A later null source retains the preceding listener's flag/vector/rotation.
export function updateRaceAudioListeners(runtime) {
  const {memory, scratchBase} = runtime;
  const local = ((scratchBase - 4) & ~15) - 0x70, descriptor = local + 0x10;
  nativeMemorySpan(memory,descriptor,76).fill(0);
  const positionScale = memory.readFloatLE(0x5dc5b8), velocityScale = memory.readFloatLE(0x5dc5d0), rotationScale = memory.readFloatLE(0x5dc5f4);
  for (let index = 0, record = 0x849490; record < 0x8495e0; record += 0x54, index++) {
    if (!memory[record - 16]) continue;
    const dynamic = memory.readUInt16LE(record - 14) !== 0;
    const position = pointer(memory, record + (dynamic ? 0 : -12)), velocity = pointer(memory, record + (dynamic ? 16 : -8)), rotation = pointer(memory, record + (dynamic ? 32 : -4));
    if (position) {
      put(memory, descriptor, 1);
      for (let axis = 0; axis < 3; axis++) memory.writeFloatLE(fmul(get(memory, position + axis * 4), axis ? positionScale : memory.readFloatLE(0x5ecdb4)), descriptor + 4 + axis * 4);
    }
    if (velocity) {
      put(memory, descriptor + 16, 1);
      for (let axis = 0; axis < 3; axis++) memory.writeFloatLE(fmul(get(memory, velocity + axis * 4), axis ? velocityScale : memory.readFloatLE(0x5ecdb0)), descriptor + 20 + axis * 4);
    }
    if (rotation) {
      put(memory, descriptor + 32, 1);
      for (let axis = 0; axis < 9; axis++) memory.writeFloatLE(fmul(memory.readInt16LE(rotation + axis * 2), rotationScale), descriptor + 36 + axis * 4);
    }
    put(memory, descriptor + 72, 0);
    const base = pointer(memory, 0x6f2408), count = ((pointer(memory, 0x6f240c) - base) | 0) >> 2;
    if (index >= count) continue;
    const destination = pointer(memory, base + index * 4);
    if (!destination) continue;
    for (const [offset, length] of [[0, 16], [16, 16], [32, 16], [48, 16], [64, 8]]) copyToNativeMemory(memory,destination+4+offset,Buffer.from(memory.subarray(descriptor+offset,descriptor+offset+length)));
    put(memory, destination + 76, get(memory, descriptor + 72));
  }
}

//484b20 refreshes position polarity, live reverb ownership and master level.
export function refreshRaceAudioState(runtime) {
  const {memory, scratchBase} = runtime, session = pointer(memory, 0x5ecb1c);
  const inverted = memory[session + 0x58b] !== 0;
  put(memory, 0x5ecdb4, inverted ? 0xb5800000 : 0x35800000);
  put(memory, 0x5ecdb0, inverted ? 0xb7f00000 : 0x37f00000);
  put(memory, 0x6e6bd4, get(memory, pointer(memory, 0x5ecefc) + 0x404));
  updateRaceAudioListeners({...runtime, scratchBase: scratchBase - 4});
  return service(runtime, 'audioDeviceCall', pointer(memory, 0x714b08), 0x5c, [get(memory, 0x5ecdb8)]);
}

//484dd0: signed CX -> integer scaled volume -> float32 -> two virtual calls.
export function setRaceAudioVolume(value, runtime) {
  const {memory, scratchBase} = runtime, selected = (value << 16) >> 16;
  memory.writeFloatLE(fmul(Math.trunc(Math.imul(selected, 32767) / 16383), memory.readFloatLE(0x5dc5d8)), 0x5ea3c4);
  const target = service(runtime, 'audioDeviceCall', pointer(memory, 0x714b08), 0x48, [1]);
  const result = typeof target === 'number' ? target : target?.eax;
  if (!Number.isInteger(result)) throw Error('Race audio device getter requires an explicit EAX pointer.');
  const address = result >>> 0;
  service(runtime, 'audioDeviceCall', address, 0xc, [memory.readFloatLE(0x5ea3c4)]);
  return refreshRaceAudioState({...runtime, scratchBase});
}

//484510 emits a one-byte command through the game's existing file/pipe handle.
export function sendRaceMusicCommand(command, runtime) {
  const code = command & 255, byte = code === 3 ? 0x55 : code === 8 ? 0x53 : code === 9 ? 0x41 : null;
  if (byte !== null) {
    const {memory, scratchBase} = runtime, buffer = scratchBase - 5, written = scratchBase - 4;
    memory[buffer] = byte;
    service(runtime, 'writeFile', {memory, handle: pointer(memory, 0x6e6b30), buffer, length: 1, written, overlapped: 0});
  }
  return 0;
}

//4843a0 selects the3/9 command only on a matching music-state transition.
export function updateRaceMusicState(mode, runtime) {
  const {memory, scratchBase} = runtime, selected = mode & 255, current = memory.readUInt16LE(0x6e6bd8);
  if ((selected === 0 && current === 2) || (selected === 1 && current === 1)) {
    if (!memory[pointer(memory, 0x5ecefc) + 0x410]) sendRaceMusicCommand(selected ? 9 : 3, {...runtime, scratchBase: scratchBase - 4});
    memory.writeUInt16LE(selected ? 2 : 1, 0x6e6bd8);
  }
}

//484440 retains the unsigned conversion adjustment before float32 scaling.
export function setRaceSerialVolume(value, runtime) {
  const {memory, scratchBase} = runtime, selected = (value << 16) >> 16;
  const adjusted = Math.fround(selected + memory.readDoubleLE(0x5dcf00 + (selected >>> 31) * 8));
  const scaled = Math.trunc(fmul(adjusted, memory.readFloatLE(0x5dc628)));
  const buffer = scratchBase - 8, written = scratchBase - 4;
  memory[buffer] = 0x56; memory[buffer + 1] = scaled & 255;
  return service(runtime, 'writeFile', {memory, handle: pointer(memory, 0x6e6b30), buffer, length: 2, written, overlapped: 0});
}

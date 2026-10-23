import {enqueueFinishNotification} from './finish-messages.mjs';
import {sendNotificationPacket} from './notification-transport.mjs';
import {resolveNativeMemoryAddress} from './native-memory-spans.mjs';

const get = (memory, address) => memory.readInt32LE(address);
const pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const lengthOf = (memory, address) => {let length = 0; while (memory[address + length]) length++; return length;};
const copyString = (memory, source, destination) => {
  let value;
  do {value = memory.readUInt8(source++); memory.writeUInt8(value, destination++);} while (value);
};

// Original 5d049c bytes, retained request851. Other address/peer globals are
// caller-owned runtime state and are deliberately not reset here.
export function initializeVehicleAuxiliaryInputTables(memory) {
  memory.writeUInt16LE(0x203a, 0x5d049c);
  memory[0x5d049e] = 0;
}

// 471820 preserves ECX/EDX; this matters to 4a0420's subsequent flag tests.
export function isNotificationTransportReady({memory}) {
  const flags = pointer(memory, 0x6eafe0);
  return (flags & 1) && (flags & 6) ? 1 : 0;
}

// 4a0180 clears the checksum field, then sums unsigned bytes in two lanes.
export function checksumNotificationPacket(packet, length, {memory}) {
  length |= 0;
  let even = 0, odd = 0, index = 0;
  put(memory, packet + 4, 0);
  if (length >= 2) {
    do {
      even = (even + memory.readUInt8(packet + index)) | 0;
      odd = (odd + memory.readUInt8(packet + index + 1)) | 0;
      index = (index + 2) | 0;
    } while (index < ((length - 1) | 0));
  }
  return (even + odd + (index < length ? memory.readUInt8(packet + index) : 0)) | 0;
}

// 49ea00 with actual 54d660/54d700/54d720: default address, socket-shaped
// storage initialization, live 10-byte address copy and 20-byte template copy.
export function constructNotificationAddress(address, values, {memory}) {
  memory.writeUInt16LE(65535, address + 8);
  put(memory, address, get(memory, 0x5e8280));
  put(memory, address + 4, get(memory, 0x5e8284));
  memory.writeUInt16LE(memory.readUInt16LE(0x5e8288), address + 8);
  memory.fill(0, address + 16, address + 32);
  memory.writeUInt16LE(2, address + 16);
  put(memory, address + 32, 0xffff0000);
  put(memory, address, get(memory, values));
  put(memory, address + 4, get(memory, values + 4));
  memory.writeUInt16LE(memory.readUInt16LE(values + 8), address + 8);
  Buffer.from(memory.subarray(0x6f2424, 0x6f2434)).copy(memory, address + 16);
  memory.writeUInt16LE(memory.readUInt16LE(0x6f2436), address + 34);
  memory.writeUInt16LE(memory.readUInt16LE(0x6f2434), address + 32);
  return address;
}

// Actual 4a0420 parent, specialized only by this caller's mode=2,flags=0.
// No peer/local game paths are reachable: actual 471820 preserves those zeros.
export function sendAuxiliaryNotificationPacket(packet, length, runtime) {
  const {memory, scratchBase, handlers = {}} = runtime;
  const frame = ((scratchBase - 4) & ~7), values = frame - 16, address = frame - 80;
  return sendNotificationPacket(2, packet, length, 0, {
    memory, scratchBase: values,
    handlers: {
      call471820: request => ({eax: isNotificationTransportReady(request), ecx: request.ecx, edx: request.edx}),
      call4a0180: request => checksumNotificationPacket(request.ecx, request.edx, request),
      constructAddress49ea00: request => constructNotificationAddress(address, request.args[0], request),
      sendInterface: request => {
        if (typeof handlers.sendInterface !== 'function') throw Error('Auxiliary input requires reached network sendInterface service.');
        return handlers.sendInterface({...request, address});
      },
    },
  });
}

// 42bdb0: preset message id in ECX, scratchBase is native entry ESP.
export function sendAuxiliaryPresetMessage(id, runtime) {
  const {memory, scratchBase} = runtime, settings = pointer(memory, 0x5ecefc);
  const preset = (settings + 0xdce + ((id | 0) << 6)) >>> 0;
  put(memory, scratchBase - 4, get(memory, 0x5e8890) ^ (scratchBase - 0x88));
  if (lengthOf(memory, preset) === 0) return;
  const message = scratchBase - 0x84;
  copyString(memory, settings + 0x120, message);
  let end = message + lengthOf(memory, message);
  memory.writeUInt16LE(memory.readUInt16LE(0x5d049c), end);
  memory[end + 2] = memory[0x5d049e];
  const bytes = lengthOf(memory, preset) + 1;
  end = message + lengthOf(memory, message);
  // Native REP MOVSD snapshots each four-byte read; remaining bytes copy forward.
  let offset = 0;
  for (; offset + 4 <= bytes; offset += 4) put(memory, end + offset, get(memory, preset + offset));
  for (; offset < bytes; offset++) memory[end + offset] = memory[preset + offset];
  const queueEntry = scratchBase - 0x94;
  const packet = ((queueEntry - 20) - (Math.min(64, lengthOf(memory, message)) + 9)) & ~15;
  enqueueFinishNotification(message, {
    memory, scratchBase: packet,
    handlers: {call4a0420: request => sendAuxiliaryNotificationPacket(request.edx, request.args[0], {...runtime, scratchBase: packet - 12})},
  });
}

// 42be80 captures body714 once and dispatches selected-player bits20..29 in
// ascending order before applying the two local display toggles at bits30/31.
export function updateVehicleAuxiliaryInput(record, runtime) {
  const {memory, scratchBase} = runtime;
  const flags = pointer(memory, pointer(memory, record) + 0x714);
  let selected = get(memory, 0x6e9f70);
  if (selected === -1) selected = 0;
  //42be9c/a1 compare actual module-relative participant addresses. Preserve
  //opaque heap pointers; only the source-known909300 literal is resolved.
  const selectedRecord = (resolveNativeMemoryAddress(memory, 0x909300, 4) + Math.imul(selected, 0x30c)) >>> 0;
  if (resolveNativeMemoryAddress(memory, record, 4) !== selectedRecord) return;
  if (memory[0x6eafe0] & 1) {
    for (let id = 0; id < 10; id++) {
      if (flags & (0x100000 << id)) sendAuxiliaryPresetMessage(id, {...runtime, scratchBase: scratchBase - 8});
    }
  }
  if (flags & 0x40000000) memory[pointer(memory, 0x5ecefc) + 0x25] ^= 1;
  if (flags & 0x80000000) put(memory, 0x91ce90, get(memory, 0x91ce90) ^ 4);
}

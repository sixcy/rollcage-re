// Bounded numerical replay memory. Only explicitly captured spans are readable;
// no huge zero-filled allocation or guessed pointer relocation is permitted.
import {registerNativeMemorySpans} from '../../src/native-memory-spans.mjs';
const addressSpace = 0x100000000;
const methods = {Int8: 1, UInt8: 1, Int16LE: 2, UInt16LE: 2, Int32LE: 4, UInt32LE: 4, FloatLE: 4, DoubleLE: 8, BigInt64LE: 8, BigUInt64LE: 8};
const numericKey = key => typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key) ? Number(key) : null;
const validSpan = (address, length) => Number.isSafeInteger(address) && address >= 0 && Number.isSafeInteger(length) && length >= 0 && address + length <= addressSpace;

export function createCapturedMemory(input, {aliases = [], maxMappedBytes = 128 * 1024 * 1024} = {}) {
  if (!Array.isArray(input) || !input.length || !Number.isSafeInteger(maxMappedBytes) || maxMappedBytes < 1) throw Error('Captured memory requires explicit bounded regions.');
  const emptyVectors = [];
  const sorted = input.filter(row => {
    if (Buffer.isBuffer(row.bytes) && row.bytes.length === 0) {
      const begin = Number(row.vectorBegin), header = Buffer.alloc(12);
      if (!validSpan(begin, 0) || begin >= addressSpace) throw Error('Invalid empty captured vector region.');
      for (const offset of [0, 4, 8]) header.writeUInt32LE(begin, offset);
      if (row.rangeMode !== 'vector-storage' || Number(row.address) !== begin || row.length !== 0 || !Number.isSafeInteger(Number(row.vectorHeaderAddress)) || Number(row.vectorHeaderAddress) <= 0 || Number(row.vectorHeaderAddress) + 12 > addressSpace || row.vectorHeaderHex !== header.toString('hex') || Number(row.vectorEnd) !== begin || Number(row.vectorCapacity) !== begin || !Number.isSafeInteger(row.maxVectorBytes) || row.maxVectorBytes < 1 || row.maxVectorBytes > 64 * 1024 * 1024) throw Error('Invalid empty captured vector region.');
      emptyVectors.push(row); return false;
    }
    return true;
  }).map(({address, bytes}) => {
    address = Number(address);
    if (!Buffer.isBuffer(bytes) || !bytes.length || !validSpan(address, bytes.length)) throw Error('Invalid captured region.');
    return {address, bytes};
  }).sort((a, b) => a.address - b.address || b.bytes.length - a.bytes.length);
  const regions = [];
  let mapped = 0;
  for (const row of sorted) {
    const last = regions.at(-1), end = row.address + row.bytes.length;
    if (!last || row.address > last.address + last.bytes.length) {
      mapped += row.bytes.length;
      if (mapped > maxMappedBytes) throw Error('Captured memory exceeds its byte bound.');
      regions.push({address: row.address, bytes: Buffer.from(row.bytes)}); continue;
    }
    const offset = row.address - last.address, overlap = Math.min(row.bytes.length, last.bytes.length - offset);
    if (!row.bytes.subarray(0, overlap).equals(last.bytes.subarray(offset, offset + overlap))) throw Error('Overlapping captured bytes disagree.');
    if (end > last.address + last.bytes.length) {
      const extra = end - last.address - last.bytes.length;
      if (mapped + extra > maxMappedBytes) throw Error('Captured memory exceeds its byte bound.');
      last.bytes = Buffer.concat([last.bytes, row.bytes.subarray(row.bytes.length - extra)]); mapped += extra;
    }
  }
  //An observed empty vector grants no readable bytes at NULL. Its real header
  //must also be captured; the descriptor is not replacement native storage.
  for (const row of emptyVectors) {
    const address = Number(row.vectorHeaderAddress);
    const header = regions.find(part => address >= part.address && address + 12 <= part.address + part.bytes.length);
    if (!header || header.bytes.subarray(address - header.address, address - header.address + 12).toString('hex') !== row.vectorHeaderHex) throw Error('Empty captured vector requires its actual matching header bytes.');
  }
  if (!regions.length) throw Error('Captured memory requires nonempty readable regions.');
  const declaredRoutes = aliases.map(({address, targetAddress, length}) => {
    address = Number(address); targetAddress = Number(targetAddress);
    if (!validSpan(address, length) || !validSpan(targetAddress, length) || !length) throw Error('Invalid captured-memory alias.');
    return {address, targetAddress, length};
  }).sort((a, b) => a.address - b.address);
  for (let i = 0; i < declaredRoutes.length; i++) {
    const route = declaredRoutes[i];
    if (i && declaredRoutes[i - 1].address + declaredRoutes[i - 1].length > route.address) throw Error('Captured-memory aliases overlap.');
    if (!regions.some(row => route.targetAddress >= row.address && route.targetAddress + route.length <= row.address + row.bytes.length)) throw Error('Alias target is not completely captured.');
    if (route.address !== route.targetAddress && regions.some(row => route.address < row.address + row.bytes.length && row.address < route.address + route.length)) throw Error('Alias shadows actual captured addresses.');
  }
  // Identity declarations still require captured targets, but need no routing
  // boundary inside an otherwise contiguous captured region.
  const routes = declaredRoutes.filter(row => row.address !== row.targetAddress);
  function span(address, length) {
    if (!validSpan(address, length)) throw Error('Captured-memory access exceeds x86 address bounds.');
    const route = routes.find(row => address >= row.address && address < row.address + row.length);
    if (route) {
      if (address + length > route.address + route.length) throw Error('Access crosses captured-memory alias boundary.');
      address = route.targetAddress + address - route.address;
    } else if (routes.some(row => address < row.address && address + length > row.address)) throw Error('Access crosses captured-memory alias boundary.');
    const row = regions.find(row => address >= row.address && address + length <= row.address + row.bytes.length);
    if (!row) throw Error(`Uncaptured native memory at 0x${address.toString(16)} (${length} bytes).`);
    return row.bytes.subarray(address - row.address, address - row.address + length);
  }
  const api = {subarray: (start, end = addressSpace) => span(start, end - start)};
  for (const [name, width] of Object.entries(methods)) {
    api[`read${name}`] = address => span(address, width)[`read${name}`](0);
    api[`write${name}`] = (value, address) => {span(address, width)[`write${name}`](value, 0); return address + width;};
  }
  api.readUIntLE = (address, width) => {
    if (!Number.isInteger(width) || width < 1 || width > 6) throw Error('Invalid variable integer width.');
    return span(address, width).readUIntLE(0, width);
  };
  // Buffer.isBuffer(proxy) permits existing source numerical adapters. Buffer
  // backing-store identity across disjoint regions is deliberately unsupported:
  // users of .buffer/.byteOffset or unmapped generic methods must fail explicitly.
  const memory = new Proxy(Buffer.alloc(0), {
    get(target, key) {
      const index = numericKey(key);
      if (index !== null) return span(index, 1)[0];
      if (key === 'length') return addressSpace;
      if (Object.hasOwn(api, key)) return api[key];
      if (key === Symbol.toStringTag) return 'CapturedMemory';
      throw Error(`Unsupported captured-memory property ${String(key)}.`);
    },
    set(target, key, value) {
      const index = numericKey(key);
      if (index === null) throw Error('Captured memory only admits numerical byte writes.');
      span(index, 1)[0] = value; return true;
    }
  });
  registerNativeMemorySpans(memory, regions);
  return {memory, span, mappedBytes: mapped};
}

// Explicit ownership for original-address replay spans. Ordinary Buffer users
// retain their backing-store identity checks; sparse memories register only
// actual captured spans, never a fictitious contiguous x86 backing store.
const sparseSpans = new WeakMap();
const sameStart = (a, b) => a.buffer === b.buffer && a.byteOffset === b.byteOffset;
const containsBytes = (owner, bytes) => owner.buffer === bytes.buffer && bytes.byteOffset >= owner.byteOffset && bytes.byteOffset + bytes.length <= owner.byteOffset + owner.length;
const validRange = (memory, address, length) => Number.isSafeInteger(address) && address >= 0 && Number.isSafeInteger(length) && length >= 0 && address + length <= memory.length;

// Only explicit source instruction/function identities use this relocation.
// Never apply it to arbitrary integers or captured heap/data pointer bytes.
export function nativeCodeAddress(preferredAddress, {moduleBaseAddress = 0x400000} = {}) {
  const actual = moduleBaseAddress + preferredAddress - 0x400000;
  if (!Number.isSafeInteger(moduleBaseAddress) || moduleBaseAddress <= 0 || !Number.isSafeInteger(preferredAddress) || preferredAddress < 0x400000 || !Number.isSafeInteger(actual) || actual < 0 || actual > 0xffffffff) throw Error('Invalid explicit native code address.');
  return actual;
}

export function registerNativeMemorySpans(memory, regions) {
  if (!Buffer.isBuffer(memory) || sparseSpans.has(memory) || !Array.isArray(regions) || !regions.length) throw Error('Native sparse spans require one explicit ownership registration.');
  const rows = regions.map(({address, bytes}) => {
    if (!Buffer.isBuffer(bytes) || !bytes.length || !validRange(memory, address, bytes.length)) throw Error('Invalid native sparse ownership span.');
    const live = memory.subarray(address, address + bytes.length);
    if (live.length !== bytes.length || !sameStart(live, bytes)) throw Error('Native sparse ownership must reference the actual live memory span.');
    return {address, bytes};
  }).sort((a, b) => a.address - b.address);
  for (let i = 0; i < rows.length; i++) {
    if (i && rows[i - 1].address + rows[i - 1].bytes.length > rows[i].address) throw Error('Native sparse ownership addresses overlap.');
    for (let j = 0; j < i; j++) {
      const a = rows[i].bytes, b = rows[j].bytes;
      if (a.buffer === b.buffer && a.byteOffset < b.byteOffset + b.length && b.byteOffset < a.byteOffset + a.length) throw Error('Native sparse ownership backing spans overlap.');
    }
  }
  sparseSpans.set(memory, rows);
  return memory;
}

export function assertNativeMemorySpan(memory, address, length) {
  if (!Buffer.isBuffer(memory) || !validRange(memory, address, length)) throw Error('Native memory span exceeds supplied storage.');
  // The facade resolves only explicit aliases and fails at uncaptured bytes.
  if (sparseSpans.has(memory) && memory.subarray(address, address + length).length !== length) throw Error('Incomplete native sparse memory span.');
}

export function nativeMemorySpan(memory, address, length) {
  assertNativeMemorySpan(memory, address, length);
  return memory.subarray(address, address + length);
}

export function nativeMemoryAddress(memory, bytes) {
  if (!Buffer.isBuffer(memory) || !Buffer.isBuffer(bytes)) return null;
  const rows = sparseSpans.get(memory);
  if (rows) {
    const row = rows.find(row => containsBytes(row.bytes, bytes));
    return row ? row.address + bytes.byteOffset - row.bytes.byteOffset : null;
  }
  return containsBytes(memory, bytes) ? bytes.byteOffset - memory.byteOffset : null;
}

export function resolveNativeMemoryAddress(memory, address, length = 1) {
  assertNativeMemorySpan(memory, address, length);
  if (!sparseSpans.has(memory)) return address;
  const result = nativeMemoryAddress(memory, memory.subarray(address, address + length));
  if (result === null) throw Error('Native memory address has no registered ownership.');
  return result;
}

export function sharesNativeMemorySpan(memory, bytes, address, minimumLength) {
  if (!Buffer.isBuffer(bytes) || bytes.length < minimumLength) return false;
  const live = nativeMemorySpan(memory, address, bytes.length);
  return sameStart(live, bytes);
}

export function copyToNativeMemory(memory, address, bytes) {
  if (!Buffer.isBuffer(bytes)) throw Error('Native memory copy requires explicit source bytes.');
  return bytes.copy(nativeMemorySpan(memory, address, bytes.length));
}

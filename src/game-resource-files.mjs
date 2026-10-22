const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const short = (m, p) => m.readInt16LE(p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const platform = (runtime, name, args) => {if (typeof runtime.services?.platformCall !== 'function') throw Error(`Resource files require platform service ${name}.`); return runtime.services.platformCall(name, args, runtime);};
const crt = (runtime, name, args) => {if (typeof runtime.services?.libraryCall !== 'function') throw Error(`Resource files require CRT service ${name}.`); return runtime.services.libraryCall(name, args, runtime);};
const copy = (m, out, from, size) => Buffer.from(m.subarray(from, from + size)).copy(m, out);

//401000. The two names deliberately share a live source before their final
//extensions are changed. The supplied entry ESP owns the native32-byte local.
export function initializeRawGameArchive(name, count, runtime) {
  const {memory: m, scratchBase} = runtime, local = scratchBase - 32;
  const forwardString = destination => {let length = 1; while (m[name + length - 1]) length++; let offset = 0; for (; offset + 4 <= length; offset += 4) put(m, destination + offset, get(m, name + offset)); for (; offset < length; offset++) m[destination + offset] = m[name + offset];};
  forwardString(local); forwardString(0x717360);
  const replace = (address, second, third) => {let dot = 0; for (let p = address; m[p]; p++) if (m[p] === 46) dot = p; if (!dot) throw Error('Native archive filename requires an extension.'); m[dot + 2] = second; m[dot + 3] = third;};
  replace(0x717360, 77, 71); replace(local, 68, 88); word(m, 0x717384, count);
  put(m, 0x717388, crt(runtime, 'allocate', [(count << 16 >> 16) << 4]));
  put(m, 0x6e4900, crt(runtime, 'fopen', [local, 0x5e800c])); crt(runtime, 'fread', [ptr(m, 0x717388), 1, short(m, 0x717384) << 4, ptr(m, 0x6e4900)]); crt(runtime, 'fclose', [ptr(m, 0x6e4900)]);
  setGameArchiveMode(0, runtime);
}

//401380. Raw GT20 decoder preserves forward overlap and control-word refill
//ordering. Unlike the archive convenience API, no new bounds policy is added.
export function decodeRawGameResource(source, destination, {memory: m}) {
  let input = source + 16 + get(m, source + 12), bits = 0, left = 0;
  const bit = () => {if (!left) {bits = ptr(m, input); input += 4; left = 32;} const value = bits & 1; bits >>>= 1; left--; return value;};
  for (;;) {
    if (!bit()) m[destination++] = m[input++];
    else {
      if (!bit()) {
        const back = destination + (m[input++] | -256); m[destination++] = m[back]; m[destination++] = m[back + 1]; let from = back + 2;
        if (bit()) {m[destination++] = m[from++]; m[destination++] = m[from++];}
        if (bit()) m[destination++] = m[from];
      } else {
        const packed = m.readUInt16LE(input); input += 2; let count = packed & 7, from = destination + (packed >>> 3 | -8192);
        if (!count) {const extra = m[input++]; if (extra & 128) from -= 8192; count = extra & 127; if (count === 1) return destination; if (!count) {count = m.readUInt16LE(input); input += 2;} else count += 2;}
        else count += 2;
        for (; count; count--) m[destination++] = m[from++];
      }
    }
  }
}

//4010e0 /401250. The original archive-open mode is a live signed short.
export function setGameArchiveMode(mode, runtime) {
  const {memory: m} = runtime; mode = mode << 16 >> 16;
  if (mode !== short(m, 0x5e8008)) {
    if (!mode) {put(m, 0x6e4900, crt(runtime, 'fopen', [0x717360, 0x5e800c])); word(m, 0x5e8008, mode); put(m, 0x717380, 0); return;}
    crt(runtime, 'fclose', [ptr(m, 0x6e4900)]);
  }
  word(m, 0x5e8008, mode);
}

//401140. This metadata query does not select a nearest duplicate.401160
//performs that separate traversal before calling this query again.
export function findRawArchiveResource(index, {memory: m}) {
  return ptr(m, 0x717388) + (index << 16 >> 16) * 16 >>> 0;
}

//401160. Nearest duplicate entry, packed staging buffer and actual
//GT20 expansion; all file/allocator services are the original CRT boundary.
export function readRawArchiveResource(index, destination, runtime) {
  const {memory: m} = runtime; let selected = 0, best = 0x7fffffff, current = index << 16 >> 16;
  do {
    const entry = findRawArchiveResource(current, runtime), difference = get(m, entry) - get(m, 0x717380) | 0, distance = difference < 0 ? -difference | 0 : difference;
    if (distance < best) {best = distance; selected = current;}
    current = short(m, entry + 14);
  } while (current);
  const entry = findRawArchiveResource(selected, runtime);
  if (!destination) destination = crt(runtime, 'allocate', [short(m, entry + 12) + 7 + get(m, entry + 8) | 0]) >>> 0;
  const compressed = get(m, entry + 8) !== get(m, entry + 4), input = compressed ? (short(m, entry + 12) - get(m, entry + 4) + get(m, entry + 8) + 7 + destination) & ~3 : destination;
  crt(runtime, 'fseek', [ptr(m, 0x6e4900), get(m, entry), 0]); crt(runtime, 'fread', [input, 1, ptr(m, entry + 4), ptr(m, 0x6e4900)]); put(m, 0x717380, get(m, entry + 4) + get(m, entry));
  if (compressed) decodeRawGameResource(input, destination, runtime); return destination;
}

const upper = value => value >= 97 && value <= 122 ? value - 32 : value;
function normalizedCharacter(m, address) {let next = address + 1, value = upper(m[address]); if (value === 92) value = 47; else if (value === 95) {value = 46; if (m[next] === 95) {next++; value = 47;}} return {value, next};}

//447ae0. Original324-name table, case folding and encoded '_'/ '__' syntax.
export function findGameResourceName(name, {memory: m}) {
  for (let index = 0; index < 324; index++) {
    let left = name, right = ptr(m, 0x5eb600 + index * 8);
    for (;;) {const a = normalizedCharacter(m, left), b = normalizedCharacter(m, right); if (a.value !== b.value) break; if (!a.value) return m.readUInt16LE(0x5eb604 + index * 8); left = a.next; right = b.next;}
  }
  return -1;
}

//447c20 /447c50. Cache initialization clears pointers, preserving cursors.
export function initializeGameResourceCache({memory: m}) {
  if (!get(m, 0x6e6708)) {for (let p = 0x90c0a0; p < 0x90cb60; p += 8) put(m, p, 0); put(m, 0x6e6708, 1);}
}
export function findGameResourceHandle(handle, runtime) {
  const {memory: m} = runtime; if (!handle) return -1; initializeGameResourceCache(runtime);
  for (let index = 0; index < 344; index++) if (ptr(m, 0x90c0a0 + index * 8) === (handle >>> 0)) return index; return -1;
}

//489270. Real platform sharing-violation retry and basename fallback policy.
export function openGameDiskResource(name, runtime) {
  const {memory: m} = runtime, open = p => platform(runtime, 'CreateFileA', [p, 0x80000000, 1, 0, 3, 0x8000080, 0]) >>> 0;
  let handle = open(name);
  while (handle === 0xffffffff) {if ((platform(runtime, 'GetLastError', []) >>> 0) !== 33) break; platform(runtime, 'Sleep', [500]); handle = open(name);}
  if (handle !== 0xffffffff) return handle;
  let end = name; while (m[end]) end++; let index = end - name; while (index >= 0 && m[name + index] !== 92) index--;
  handle = open(name + index + 1);
  while (handle === 0xffffffff) {if ((platform(runtime, 'GetLastError', []) >>> 0) !== 33) break; platform(runtime, 'Sleep', [500]); handle = open(name + index + 1);}
  return handle === 0xffffffff ? 0 : handle;
}

//447ca0. Archive cache ownership is distinct from Win32 file handles.
export function openGameResource(name, runtime) {
  const {memory: m} = runtime, id = findGameResourceName(name, runtime) & 65535;
  if (id >= 344) return openGameDiskResource(name, runtime);
  initializeGameResourceCache(runtime); const cache = 0x90c0a0 + (id << 16 >> 16) * 8;
  if (!ptr(m, cache)) {const previous = short(m, 0x5e8008); setGameArchiveMode(0, runtime); const data = readRawArchiveResource(id, 0, runtime); setGameArchiveMode(previous, runtime); put(m, cache, data);}
  const result = ptr(m, cache); put(m, cache + 4, 0); return result;
}

//447d60. In-cache reads are unchecked copies with an independent cursor.
export function readGameResource(handle, destination, size, runtime) {
  const {memory: m, scratchBase} = runtime, id = findGameResourceHandle(handle, runtime);
  if (id >= 0 && id < 344) {if ((size | 0) > 0) {const cache = 0x90c0a0 + id * 8; if (destination) copy(m, destination, ptr(m, cache) + ptr(m, cache + 4), size); put(m, cache + 4, get(m, cache + 4) + size);} return 1;}
  return platform(runtime, 'ReadFile', [handle, destination, size >>> 0, scratchBase - 4, 0]) ? 1 : 0;
}

//447d20 /401230. The cached resource allocation is freed on close.
export function closeGameResource(handle, runtime) {
  const {memory: m} = runtime, id = findGameResourceHandle(handle, runtime);
  if (id >= 0 && id < 344) {const cache = 0x90c0a0 + id * 8, data = ptr(m, cache); if (data) crt(runtime, 'free', [data]); put(m, cache, 0); return;}
  if (handle) platform(runtime, 'CloseHandle', [handle]);
}

//4891e0 /489210. Aligned allocation rounds the byte count, not the pointer.
export function allocateGameImageBytes(size, aligned, runtime) {
  const {memory: m} = runtime, count = aligned ? (size + 15 & ~15) >>> 0 : size >>> 0, data = crt(runtime, 'allocate', [count]) >>> 0;
  if (!data) return 0; m.fill(0, data, data + count); if (aligned) for (let p = data; p < data + (count >>> 2) * 4; p += 4) put(m, p, 0); return data;
}

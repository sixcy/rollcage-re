const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const count = bytes => Math.trunc((bytes | 0) / 0x53c);
const library = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Renderer adapters require CRT ${name}.`); return r.services.libraryCall(name, args, r);};
const device = (r, object, method, args) => {if (typeof r.services?.direct3DCall !== 'function') throw Error('Renderer adapters require an explicit Direct3D COM service.'); return r.services.direct3DCall(object, method, args, r) | 0;};
const copyRows = (m, output, input, end) => {for (; input !== end; input += 0x53c, output += 0x53c) if (output) for (let o = 0; o < 0x53c; o += 4) put(m, output + o, get(m, input + o));};

//513140,5135d0,513c30,513c80,513fe0: actual 53ch-byte adapter-vector
//growth and forward record copies, preserving aliases across allocation.
export function appendRendererAdapter(vector, input, runtime) {
  const m = runtime.memory, end = ptr(m, vector + 4), begin = ptr(m, vector), aliased = input < end && input >= begin, index = aliased ? count(input - begin) : 0;
  if (end === ptr(m, vector + 8)) {
    const size = count(get(m, vector + 4) - get(m, vector)), capacity = count(get(m, vector + 8) - get(m, vector)), half = capacity >>> 1;
    if ((0x30e84f - size >>> 0) < 1) throw RangeError('Native renderer adapter vector length error.');
    const desired = Math.max(size + 1, (0x30e84f - half >>> 0) < (capacity >>> 0) ? 0 : capacity + half);
    if ((desired >>> 0) > 0x30e84f) throw Error('Native renderer adapter bad_alloc.');
    const allocation = desired ? library(runtime, 'operatorNew', [Math.imul(desired, 0x53c) >>> 0]) >>> 0 : 0; if (desired && !allocation) throw Error('Native renderer adapter bad_alloc.');
    copyRows(m, allocation, ptr(m, vector), ptr(m, vector + 4));
    const length = count(get(m, vector + 4) - get(m, vector)), old = ptr(m, vector); if (old) library(runtime, 'operatorDelete', [old]);
    put(m, vector, allocation); put(m, vector + 8, allocation + Math.imul(desired, 0x53c)); put(m, vector + 4, allocation + Math.imul(length, 0x53c));
  }
  if (aliased) input = ptr(m, vector) + Math.imul(index, 0x53c);
  const destination = ptr(m, vector + 4); if (destination) for (let o = 0; o < 0x53c; o += 4) put(m, destination + o, get(m, input + o));
  put(m, vector + 4, get(m, vector + 4) + 0x53c);
}

//510d40. All adapter identifiers and capabilities come from the actual COM
//queries. The game's acceptance filters and packed record ownership are local.
export function enumerateRendererAdapters(manager, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = s - 0xadc, caps = f + 0x18, identifier = f + 0x688, record = f + 0x148, vector = manager + 0x47c;
  let object = ptr(m, manager + 0x368); const total = device(runtime, object, 0x10, [object]); put(m, f + 0x14, total); put(m, vector + 4, get(m, vector));
  for (let index = 0; index < get(m, f + 0x14); index++) {
    m.fill(0, caps, caps + 0x130); m.fill(0, identifier, identifier + 0x44c);
    object = ptr(m, manager + 0x368); if (device(runtime, object, 0x38, [object, index, 1, caps]) !== 0) continue;
    object = ptr(m, manager + 0x368); if (device(runtime, object, 0x14, [object, index, 0, identifier]) !== 0) continue;
    m.fill(0, record, record + 0x53c); put(m, record, index); put(m, record + 0x534, 1);
    for (let o = 0; o < 0x130; o += 4) put(m, record + 0x404 + o, get(m, caps + o)); put(m, record + 0x538, 0);
    for (const [destination, source] of [[record + 4, identifier], [record + 0x204, identifier + 0x200]]) {
      //Genuine strcpy_s, including its bounded byte count and return service.
      library(runtime, 'strcpy_s', [destination, 0x200, source]);
    }
    const flags = ptr(m, caps + 0x1c);
    const accepted = get(m, caps) === 1 && (flags & 0x80000) && (flags & 0x10000) && ptr(m, record + 0x4c8) >= 0xfffe0200 && ptr(m, record + 0x4d0) >= 0xffff0200 && !(flags & 0x4000) && ptr(m, caps + 0x94) >= 8 && ptr(m, caps + 0x98) >= 8 && (flags & 0x400) && (get(m, caps + 0x20) & 0x70) === 0x70 && (get(m, caps + 0x28) & 0x88) === 0x88 && (get(m, caps + 0x34) & 0x88) === 0x88 && (get(m, caps + 0x2c) & 0x13) === 0x13 && (get(m, caps + 0x30) & 0x2f) === 0x2f && (get(m, caps + 0x3c) & 0x4005) === 0x4005 && (get(m, caps + 0x4c) & 5) === 5;
    if (accepted) appendRendererAdapter(vector, record, {...runtime, scratchBase: f - 8});
  }
  return count(get(m, vector + 4) - get(m, vector));
}

//510f60, as reached after the caller explicitly zeroes ECX.
const formatBits = (format, m) => {
  const index = format - 20 >>> 0; if (index > 10) return 0;
  return new Map([[0x510f72, 24], [0x510f7c, 32], [0x510f86, 16], [0x510f90, 8], [0x510f95, 0]]).get(ptr(m, 0x510f9c + m[0x510fb0 + index] * 4));
};
const abs = v => {const sign = v >> 31; return ((v ^ sign) - sign) | 0;};

//5110b0. Select the native display mode, keeping its two independent best
//records and signed wrapped score comparisons. Outputs can alias each other.
export function selectRendererDisplayMode(manager, widthPointer, heightPointer, bitDepthPointer, refreshPointer, windowed, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = s - 80;
  [widthPointer, heightPointer, bitDepthPointer, refreshPointer, windowed].forEach((v, i) => put(m, s + 4 + i * 4, v));
  m.fill(0, f + 0x30, f + 0x50); put(m, f + 0x10, 0x7fffffff); put(m, f + 0x14, 0x7fffffff);
  const format = get(m, bitDepthPointer) <= 16 ? 23 : 22; put(m, f + 0x18, format);
  let object = ptr(m, manager + 0x368), caps = ptr(m, manager + 0x488);
  const total = device(runtime, object, 0x18, [object, get(m, caps), format]); put(m, f + 0x1c, total);
  if (total <= 0) return 0;
  for (let index = 0; index < get(m, f + 0x1c); index++) {
    object = ptr(m, manager + 0x368); caps = ptr(m, manager + 0x488); m.fill(0, f + 0x20, f + 0x30);
    if (device(runtime, object, 0x1c, [object, get(m, caps), format, index, f + 0x20]) !== 0) continue;
    object = ptr(m, manager + 0x368); caps = ptr(m, manager + 0x488);
    if (device(runtime, object, 0x24, [object, get(m, caps), get(m, caps + 0x534), format, get(m, f + 0x2c), m[f + 0x64]]) < 0) continue;
    bitDepthPointer = ptr(m, f + 0x5c);
    if (get(m, bitDepthPointer) !== formatBits(get(m, f + 0x2c), m)) continue;
    const width = get(m, ptr(m, f + 0x54)), modeWidth = get(m, f + 0x20); if (modeWidth > width) continue;
    const height = get(m, ptr(m, f + 0x58)), modeHeight = get(m, f + 0x24); if (modeHeight > height) continue;
    const score = abs(width - modeWidth | 0) + abs(height - modeHeight | 0) | 0;
    const refresh = get(m, ptr(m, f + 0x60)), refreshScore = abs(refresh - get(m, f + 0x28) | 0), snapshot = Buffer.from(m.subarray(f + 0x20, f + 0x30));
    if (refresh !== 0) {
      if (score === 0 && get(m, f + 0x14) > refreshScore) {put(m, f + 0x14, refreshScore); snapshot.copy(m, f + 0x40);}
      if (refreshScore !== 0) continue;
    }
    if (get(m, f + 0x10) > score) {put(m, f + 0x10, score); snapshot.copy(m, f + 0x30);}
  }
  let source = f + 0x40; if (get(m, f + 0x14) === 0x7fffffff) {if (get(m, f + 0x10) === 0x7fffffff) return 0; source = f + 0x30;}
  const selected = Buffer.from(m.subarray(source, source + 16));
  put(m, ptr(m, f + 0x54), selected.readInt32LE(0)); put(m, ptr(m, f + 0x58), selected.readInt32LE(4)); selected.copy(m, manager + 0x424);
  put(m, manager + 0x434, get(m, ptr(m, f + 0x5c))); put(m, manager + 0x420, format); return 1;
}

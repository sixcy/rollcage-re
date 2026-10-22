import {appendNativeApplicationDebuggerRecord,registerNativeApplicationDebuggerName} from './application-debugger-records.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const platform = (runtime, name, args) => {if (typeof runtime.services?.platformCall !== 'function') throw Error(`Application bootstrap requires platform service ${name}.`); return runtime.services.platformCall(name, args, runtime);};
const library = (runtime, name, ...args) => {if (typeof runtime.handlers?.[name] !== 'function') throw Error(`Application bootstrap requires CRT service ${name}.`); return runtime.handlers[name](...args, runtime);};
const allocate = (runtime, size) => {const result = library(runtime, 'allocate', size) >>> 0; if (!result) throw Error('Native application allocation failed.'); return result;};

//4a2670 /4a2940, called by the original vector growth policy4a2510.
function growDebuggerVector(vector, capacity, runtime) {
  const {memory: m} = runtime, destination = capacity ? allocate(runtime, capacity * 16 >>> 0) : 0;
  const begin = ptr(m, vector), end = ptr(m, vector + 4); let out = destination;
  for (let source = begin; source !== end; source += 16, out += 16) for (let lane = 0; lane < 4; lane++) put(m, out + lane * 4, get(m, source + lane * 4));
  const old = ptr(m, vector), current = get(m, vector + 4); if (old) library(runtime, 'free', old);
  put(m, vector, destination); put(m, vector + 8, destination + capacity * 16); put(m, vector + 4, (current - old & ~15) + destination);
}

//4a23a0. Aliased input records are rebased after a growth allocation.
export function appendApplicationDebuggerRecord(vector, record, runtime) {
  if (runtime.nativeDebuggerRecords) return appendNativeApplicationDebuggerRecord(vector, record, runtime);
  const {memory: m} = runtime, end = ptr(m, vector + 4), begin = ptr(m, vector), aliased = record < end && begin <= record;
  if (end === ptr(m, vector + 8)) {
    const length = get(m, vector + 4) - get(m, vector) >> 4, capacity = get(m, vector + 8) - get(m, vector) >> 4;
    if ((length >>> 0) >= 0xfffffff) throw RangeError('Native debugger vector length error.');
    const half = capacity >>> 1, grown = (0xfffffff - half >>> 0) < (capacity >>> 0) ? 0 : capacity + half;
    growDebuggerVector(vector, Math.max(grown >>> 0, length + 1 >>> 0), runtime);
  }
  if (aliased) record = (record - begin & ~15) + ptr(m, vector);
  const destination = ptr(m, vector + 4); if (destination) for (let lane = 0; lane < 4; lane++) put(m, destination + lane * 4, get(m, record + lane * 4)); put(m, vector + 4, get(m, vector + 4) + 16);
}

//4a0e90. Original debugger storage and both critical-section producers.
export function constructApplicationDebugger(runtime) {
  const {memory: m} = runtime;
  const native = runtime.nativeDebuggerFrame, S = runtime.scratchBase;
  if (native) {put(m, S - 4, 4096); put(m, S - 8, 0x715b34);}
  put(m, 0x715b30, 0x5d38b0); put(m, 0x715b4c, 0); put(m, 0x715b50, 0); if (native) {put(m, S - 12, 0x4a0ebe); platform({...runtime, scratchBase: S - 12}, 'InitializeCriticalSectionAndSpinCount', [0x715b34, 4096]);} else platform(runtime, 'InitializeCriticalSectionAndSpinCount', [0x715b34, 4096]);
  Buffer.from(m.subarray(0x5dcbd0, 0x5dcbe0)).copy(m, 0x716b64); m.writeUInt16LE(1, 0x715b54);
  put(m, 0x715b30, 0x5d38f0); if (native) {put(m, S - 4, 4096); put(m, S - 8, 0x716be8);} put(m, 0x715b58, -1); put(m, 0x716b5c, 0); put(m, 0x716b60, -1);
  m.fill(0, 0x716b74, 0x716b84); put(m, 0x716b94, 0); m.fill(0, 0x716b84, 0x716b94); put(m, 0x716b98, 0);
  for (const address of [0x716b9c, 0x716ba0, 0x716ba4]) put(m, address, 1);
  for (const address of [0x716ba8, 0x716bac, 0x716bb0, 0x716bb4, 0x716bb8, 0x716bbc]) put(m, address, 0);
  put(m, 0x716bc0, 0x3d4ccccd); put(m, 0x716bc4, -1); m[0x716bc8] = 0;
  for (const address of [0x716bcc, 0x716bd0, 0x716c00, 0x716c04]) put(m, address, 0);
  if (native) {put(m, S - 12, 0x4a0fd3); platform({...runtime, scratchBase: S - 12}, 'InitializeCriticalSectionAndSpinCount', [0x716be8, 4096]);} else platform(runtime, 'InitializeCriticalSectionAndSpinCount', [0x716be8, 4096]);
  if (m[0x715b55] === 1) throw Error('Native application debugger breakpoint.');
  return 0x715b30;
}

//4a0e80→4a2290. Platform lock services may change the singleton while held.
export function getApplicationDebugger(runtime) {
  if (runtime.nativeDebuggerFrame) return getNativeApplicationDebugger(runtime);
  const {memory: m} = runtime;
  if (!(get(m, 0x715b08) & 1)) {put(m, 0x715b08, get(m, 0x715b08) | 1); put(m, 0x715b24, 0); put(m, 0x715b28, 0); platform(runtime, 'InitializeCriticalSectionAndSpinCount', [0x715b0c, 4096]); library(runtime, 'registerExit', 0x56d9e0);}
  if (!ptr(m, 0x714afc)) {
    platform(runtime, 'EnterCriticalSection', [0x715b0c]); put(m, 0x715b28, platform(runtime, 'GetCurrentThreadId', [])); put(m, 0x715b24, get(m, 0x715b24) + 1);
    if (!ptr(m, 0x714afc)) {if (!(get(m, 0x715b08) & 2)) {put(m, 0x715b08, get(m, 0x715b08) | 2); constructApplicationDebugger(runtime); library(runtime, 'registerExit', 0x56d9d0);} put(m, 0x714afc, 0x715b30);}
    put(m, 0x715b24, get(m, 0x715b24) - 1); if (!get(m, 0x715b24)) put(m, 0x715b28, 0); platform(runtime, 'LeaveCriticalSection', [0x715b0c]);
  }
  return ptr(m, 0x714afc);
}

//Optional exact 4a0e80 wrapper /4a2290 frame producers. Existing semantic
//callers retain their API; raw callers provide the incoming volatile ECX.
function getNativeApplicationDebugger(runtime) {
  const {memory: m} = runtime; let S = runtime.scratchBase;
  if (!Number.isInteger(S) || !Number.isInteger(runtime.entryRegisters?.ECX)) throw Error('Native debugger frame requires entry ESP and ECX.');
  if (runtime.nativeDebuggerFrame === 'wrapper') {
    if (Number.isInteger(runtime.entryRegisters.EBP)) put(m, S - 4, runtime.entryRegisters.EBP);
    S = ((S - 4) & ~7) - 4; put(m, S, 0x4a0e8b);
  }
  const F = S - 4; put(m, F, runtime.entryRegisters.ECX);
  const invoke = (name, args, ret, crt = false) => {
    args.forEach((v, i) => put(m, F - 4 * args.length + i * 4, v)); const entry = F - 4 * args.length - 4; put(m, entry, ret);
    const context = {...runtime, scratchBase: entry};
    return crt ? library(context, name, ...args) : platform(context, name, args);
  };
  let guard = get(m, 0x715b08);
  if (!(guard & 1)) {
    put(m, F - 4, 4096); put(m, 0x715b24, 0); put(m, F - 8, 0x715b0c); put(m, 0x715b08, guard | 1); put(m, 0x715b28, 0);
    put(m, F - 12, 0x4a22c6); platform({...runtime, scratchBase: F - 12}, 'InitializeCriticalSectionAndSpinCount', [0x715b0c, 4096]);
    invoke('registerExit', [0x56d9e0], 0x4a22d0, true);
  }
  if (!ptr(m, 0x714afc)) {
    invoke('EnterCriticalSection', [0x715b0c], 0x4a22eb); const thread = invoke('GetCurrentThreadId', [], 0x4a22f1), depth = get(m, 0x715b24) + 1 | 0;
    put(m, 0x715b28, thread); const current = ptr(m, 0x714afc); put(m, 0x715b24, depth);
    let owner = thread, count = depth;
    if (!current) {
      guard = get(m, 0x715b08);
      if (!(guard & 2)) {
        put(m, 0x715b08, guard | 2); put(m, F - 4, 0x4a2326);
        constructApplicationDebugger({...runtime, scratchBase: F - 4}); invoke('registerExit', [0x56d9d0], 0x4a2330, true);
        owner = get(m, 0x715b28); count = get(m, 0x715b24);
      }
      put(m, 0x714afc, 0x715b30);
    }
    count = count - 1 | 0; put(m, 0x715b24, count); put(m, F - 4, 0x715b0c); put(m, 0x715b28, count ? owner : 0); put(m, F - 8, 0x4a2367);
    platform({...runtime, scratchBase: F - 8}, 'LeaveCriticalSection', [0x715b0c]);
  }
  return ptr(m, 0x714afc);
}

//4a1840 /4a1a20. Actual registration vectors and sequential integer IDs.
export function registerApplicationDebuggerName(debuggerObject, name, second, runtime) {
  if (runtime.nativeDebuggerRecords) return registerNativeApplicationDebuggerName(debuggerObject, name, second, runtime);
  const {memory: m, scratchBase} = runtime; if (m[debuggerObject + 0x24] !== 1) return 0;
  const frame = ((scratchBase - 4) & ~7) - 24, field = debuggerObject + (second ? 0x1070 : 0x106c), id = get(m, field);
  put(m, frame + 8, id); m.writeBigUInt64LE(0n, frame + 16); put(m, field, id + 1); put(m, frame + 12, name);
  const lock = debuggerObject + 4; platform(runtime, 'EnterCriticalSection', [lock]); const thread = platform(runtime, 'GetCurrentThreadId', []);
  put(m, lock + 24, get(m, lock + 24) + 1); put(m, lock + 28, thread); appendApplicationDebuggerRecord(debuggerObject + (second ? 0x1054 : 0x1048), frame + 8, runtime);
  put(m, lock + 24, get(m, lock + 24) - 1); if (!get(m, lock + 24)) put(m, lock + 28, 0); platform(runtime, 'LeaveCriticalSection', [lock]); return get(m, frame + 8);
}

//402a20→403430. Application class fields, real viewport head and debugger IDs.
export function constructViewportApplication(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20;
  put(m, 0x715470, 0x57037c); m.writeUInt16LE(0, 0x715490);
  for (const p of [0x7154a8, 0x7154bc]) put(m, p, 0); m.writeUInt16LE(0, 0x7154ac);
  for (const p of [0x7154c4, 0x715480, 0x715474, 0x715484, 0x715488]) put(m, p, 0); m[0x71548c] = 1;
  put(m, 0x7154a4, 7); put(m, 0x7154a0, 0); put(m, 0x7154c0, 7); m.writeBigUInt64LE(0n, 0x715478);
  put(m, 0x715470, 0x570308); put(m, 0x7154d8, -1); put(m, 0x7154ec, 0); put(m, 0x7154f0, 0);
  const head = allocate(runtime, 100); for (const offset of [0, 4, 8]) put(m, head + offset, head); m.writeUInt16LE(0x101, head + 12); put(m, 0x7154ec, head);
  let logger = getApplicationDebugger({...runtime, scratchBase: frame - 8}); put(m, 0x7154c8, registerApplicationDebuggerName(logger, 0x570068, false, {...runtime, scratchBase: frame - 8}));
  logger = getApplicationDebugger({...runtime, scratchBase: frame - 8}); put(m, 0x7154cc, registerApplicationDebuggerName(logger, 0x570068, true, {...runtime, scratchBase: frame - 8}));
  m[0x7154d0] = 0; put(m, 0x715474, 0); return 0x715470;
}

//402d10 singleton publication before the caller's actual CRT RTTI conversion.
export function obtainViewportApplication(runtime) {
  const {memory: m, scratchBase} = runtime; let application = ptr(m, 0x6efb38);
  if (!application) {
    if (!(get(m, 0x715060) & 1)) {put(m, 0x715060, get(m, 0x715060) | 1); constructViewportApplication({...runtime, scratchBase: scratchBase - 24}); library(runtime, 'registerExit', 0x56d660);}
    application = 0x715470; put(m, 0x6efb38, application);
  }
  return application;
}

import {appendGameImagePointer} from './game-image-storage.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, value) => m.writeInt32LE(value | 0, p);
function invoke(runtime, kind, name, args, top, returned) {
  const m = runtime.memory;
  for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const entry = top - args.length * 4 - 4; put(m, entry, returned);
  if (typeof runtime.services?.[kind] !== 'function') throw Error(`Audio listener requires ${kind} ${name}.`);
  return runtime.services[kind](name, args.map((_, i) => ptr(m, entry + 4 + i * 4)), {...runtime, scratchBase: entry});
}
function save(runtime, S, rows) {for (const [name, offset] of rows) if (Number.isInteger(runtime.entryRegisters?.[name])) put(runtime.memory, S + offset, runtime.entryRegisters[name]);}

//40f2c0. Copy/move specialization for the actual captured listener-index
//lambda. Its12-byte allocation has only its vtable/index DWORDs written.
export function copyAudioListenerFunction(input, destination, runtime) {
  const {memory: m, scratchBase: S} = runtime; save(runtime, S, [['ESI', -4]]); put(m, S + 4, destination);
  if (!destination) {
    destination = invoke(runtime, 'libraryCall', 'operatorNew', [12], S - 4, 0x40f2d3) >>> 0;
    if (!destination) {invoke(runtime, 'libraryCall', '_Xbad_alloc', [], S - 4, 0x40f2e0); throw Error('Nonreturning CRT bad_alloc returned.');}
  }
  put(m, destination, 0x5d0304); put(m, destination + 4, get(m, input + 4)); return destination;
}
//40eea0. Base callable destruction rewrites its vtable before optional delete.
export function releaseAudioListenerFunctionBase(input, flags, runtime) {
  const {memory: m, scratchBase: S} = runtime; put(m, S + 4, flags); save(runtime, S, [['ESI', -4]]);
  put(m, input, 0x5d02dc);
  if (flags & 1) invoke(runtime, 'libraryCall', 'operatorDelete', [input], S - 4, 0x40eeb7);
  return input;
}
//40f2a0→actual40eea0. Outer deletion uses the low-byte argument after that
//base target call, so retired heap and stack functors retain the base vtable.
export function destroyAudioListenerFunction(input, deallocate, runtime) {
  const {memory: m, scratchBase: S} = runtime; save(runtime, S, [['ESI', -4]]); put(m, S + 4, deallocate);
  const target = ptr(m, ptr(m, input) + 0x14); put(m, S - 8, 0); put(m, S - 12, 0x40f2aa);
  if (target !== 0x40eea0) throw Error(`Unclassified listener lambda target destructor 0x${target.toString(16)}.`);
  releaseAudioListenerFunctionBase(input, 0, {...runtime, scratchBase: S - 12, entryRegisters: {...runtime.entryRegisters, ESI: input}});
  if (m[S + 4]) invoke(runtime, 'libraryCall', 'operatorDelete', [input], S - 4, 0x40f2b8);
}
function clone(input, destination, top, returned, runtime) {
  const m = runtime.memory, target = ptr(m, ptr(m, input)); put(m, top - 4, destination); put(m, top - 8, returned);
  if (target !== 0x40f2c0) throw Error(`Unclassified audio listener callback copy 0x${target.toString(16)}.`);
  return copyAudioListenerFunction(input, destination, {...runtime, scratchBase: top - 8});
}
function destroy(input, deallocate, top, returned, runtime) {
  const m = runtime.memory, target = ptr(m, ptr(m, input) + 0x10); put(m, top - 4, deallocate); put(m, top - 8, returned);
  if (target !== 0x40f2a0) throw Error(`Unclassified audio listener callback destruction 0x${target.toString(16)}.`);
  destroyAudioListenerFunction(input, deallocate, {...runtime, scratchBase: top - 8});
}

//4a9ec0. PCBaseListener construction, original callback clone/destruction,
//zero vectors and once-only default quaternion. Seven stack DWORDs are live.
export function constructAudioListener(object, primary, functionWords, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 40, storage = object + 8;
  if (functionWords.length !== 6) throw Error('Listener construction requires six native function-value DWORDs.');
  [primary, ...functionWords].forEach((v, i) => put(m, S + 4 + i * 4, v));
  put(m, S - 4, 0); put(m, S - 8, 0x56a5a3); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  save(runtime, S, [['ESI', -36], ['EDI', -40]]); put(m, F + 8, object);
  put(m, object, 0x5d3cec); m[S - 4] = 1; put(m, object, 0x5d3cc4); m[object + 4] = m[S + 4]; put(m, S + 4, storage);
  put(m, object + 24, 0); m[S - 4] = 2;
  let callback = ptr(m, S + 24);
  if (callback) put(m, object + 24, clone(callback, callback === S + 8 ? storage : 0, F, 0x4a9f31, {...runtime, entryRegisters: {...runtime.entryRegisters, ESI: object, EDI: storage}}));
  m[S - 4] = 3;
  for (const offset of [0x20, 0x24, 0x28, 0x2c]) put(m, object + offset, 0);
  put(m, F - 4, 0x4a9f5d); for (const offset of [0x30, 0x34, 0x38, 0x3c]) put(m, object + offset, 0); //actual402100
  if (!(m[0x714b38] & 1)) {
    put(m, 0x714b38, get(m, 0x714b38) | 1); put(m, F - 4, 0x4a9f80);
    for (let i = 0; i < 4; i++) put(m, F + 12 + i * 4, 0); //actual4020e0 with zero XMM lanes
    for (let i = 0; i < 3; i++) put(m, 0x714b28 + i * 4, get(m, F + 12 + i * 4)); put(m, 0x714b34, 0x3f800000);
  }
  put(m, F - 4, 0x714b28); put(m, F - 8, 0x4a9fbd);
  //4020c0 is four live DWORD reads/stores, including overlapping inputs.
  for (let i = 0; i < 4; i++) put(m, object + 0x40 + i * 4, get(m, 0x714b28 + i * 4));
  m[object + 0x50] = 0; put(m, S - 4, -1); callback = ptr(m, S + 24);
  if (callback) {destroy(callback, callback !== S + 8 ? 1 : 0, F, 0x4a9fe3, {...runtime, entryRegisters: {...runtime.entryRegisters, ESI: object, EDI: storage}}); put(m, S + 24, 0);}
  return object;
}

//4a9b00, established SoundManager virtual4c. The real game listener and
//captured callback are created and appended while holding the native lock.
export function createAudioListener(manager, primary, functionWords, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 32;
  if (functionWords.length !== 6) throw Error('Listener factory requires six native function-value DWORDs.');
  [primary, ...functionWords].forEach((v, i) => put(m, S + 4 + i * 4, v));
  put(m, S - 4, 0); put(m, S - 8, 0x56a56c); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  save(runtime, S, [['EBX', -24], ['ESI', -28], ['EDI', -32]]);
  let listener = invoke(runtime, 'libraryCall', 'operatorNew', [0x58], F, 0x4a9b2d) >>> 0;
  put(m, F + 12, listener);
  if (listener) {
    const record = F - 24; put(m, F + 16, record); put(m, record + 16, 0); m[S - 4] = 2;
    const callback = ptr(m, S + 24);
    if (callback) put(m, record + 16, clone(callback, callback === S + 8 ? record : 0, record, 0x4a9b6d, {...runtime, entryRegisters: {...runtime.entryRegisters, EBX: listener, ESI: record, EDI: manager}}));
    const words = Array.from({length: 6}, (_, i) => get(m, record + i * 4)); put(m, record - 4, get(m, S + 4)); m[S - 4] = 1; put(m, record - 8, 0x4a9b80);
    listener = constructAudioListener(listener, get(m, record - 4), words, {...runtime, scratchBase: record - 8, entryRegisters: {...runtime.entryRegisters, EBX: listener, ESI: record, EDI: manager}, sehWord: S - 12});
  }
  const critical = manager + 0x854; m[S - 4] = 0; put(m, F + 12, listener);
  invoke(runtime, 'platformCall', 'EnterCriticalSection', [critical], F, 0x4a9b9c);
  const thread = invoke(runtime, 'platformCall', 'GetCurrentThreadId', [], F, 0x4a9ba2);
  put(m, critical + 24, get(m, critical + 24) + 1); put(m, critical + 28, thread);
  const vector = ptr(m, manager + 0x82c);
  if (m[S + 4] === 1 || get(m, vector) === get(m, vector + 4)) put(m, manager + 0x828, listener);
  put(m, F - 4, F + 12); put(m, F - 8, 0x4a9bd2);
  appendGameImagePointer(ptr(m, manager + 0x82c), F + 12, {...runtime, scratchBase: F - 8, entryRegisters: {...runtime.entryRegisters, EBX: listener, ESI: critical, EDI: manager}});
  put(m, critical + 24, get(m, critical + 24) - 1); if (!get(m, critical + 24)) put(m, critical + 28, 0);
  invoke(runtime, 'platformCall', 'LeaveCriticalSection', [critical], F, 0x4a9be5); put(m, S - 4, -1);
  const callback = ptr(m, S + 24);
  if (callback) destroy(callback, callback !== S + 8 ? 1 : 0, F, 0x4a9c07, {...runtime, entryRegisters: {...runtime.entryRegisters, EBX: listener, ESI: critical, EDI: manager}});
  return ptr(m, F + 12);
}

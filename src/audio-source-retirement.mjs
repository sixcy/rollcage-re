import {appendGameImagePointer} from './game-image-storage.mjs';
import {copyQueuedAudioCallback, destroyQueuedAudioCallback} from './queued-audio-callback.mjs';
import {copyAudioListenerFunction, destroyAudioListenerFunction} from './audio-listener-construction.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function save(r, name, address) {if (Number.isInteger(r.entryRegisters?.[name])) put(r.memory, address, r.entryRegisters[name]);}
function call(r, kind, name, args, top, returned) {
  const m = r.memory; for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof r.services?.[kind] !== 'function') throw Error(`Audio retirement requires ${kind} ${name}.`);
  return r.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...r, scratchBase: S});
}
function callback(input, offset, argument, top, returned, runtime) {
  const m = runtime.memory, table = ptr(m, input), target = ptr(m, table + offset);
  put(m, top - 4, argument); put(m, top - 8, returned);
  const context = {...runtime, scratchBase: top - 8};
  if (offset === 0) {
    if (target === 0x4ab790) return copyQueuedAudioCallback(input, argument, context);
    if (target === 0x40f2c0) return copyAudioListenerFunction(input, argument, context);
  } else if (offset === 16 && target === 0x40f2a0) {
    const base = ptr(m, table + 20);
    if (base === 0x40ee80) return destroyQueuedAudioCallback(input, argument, context);
    if (base === 0x40eea0) return destroyAudioListenerFunction(input, argument, context);
  }
  throw Error(`Unported game audio callback operation0x${target.toString(16)}.`);
}

//4ad420 consumes the caller's24-byte by-value std::function at S+4. Clearing
//a callback is distinct from stopping or immediately deleting the sound source.
export function replaceAudioSampleCallback(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 16, storage = object + 0x930;
  put(m, S - 4, -1); put(m, S - 8, 0x56a6d8); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  save(runtime, 'ESI', F); put(m, S - 4, 0);
  const child = {...runtime, entryRegisters: {...runtime.entryRegisters, ESI: storage}};
  let incoming;
  if (storage !== S + 4) {
    const old = ptr(m, storage + 16);
    if (old) {callback(old, 16, Number(old !== storage), F, 0x4ad461, child); put(m, storage + 16, 0);}
    incoming = ptr(m, S + 20);
    if (!incoming) put(m, storage + 16, 0);
    else {put(m, storage + 16, callback(incoming, 0, incoming === S + 4 ? storage : 0, F, 0x4ad486, child)); incoming = ptr(m, S + 20);}
  } else incoming = ptr(m, S + 20);
  put(m, S - 4, -1);
  if (incoming) callback(incoming, 16, Number(incoming !== S + 4), F, 0x4ad4ab, child);
}

//4a7950 clears the source callback and appends its cast pointer to vector840h
//only if absent. Actual destruction happens elsewhere, after this deferral.
export function retireGameAudioSource(manager, source, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 16;
  put(m, S + 4, source); put(m, S - 4, manager);
  for (const [name, offset] of [['EBX', 8], ['ESI', 4], ['EDI', 0]]) save(runtime, name, F + offset);
  const cast = call(runtime, 'libraryCall', '__RTDynamicCast', [source, 0, 0x6e27d4, 0x6e27f8, 0], F, 0x4a796e) >>> 0;
  put(m, S + 4, cast); if (!cast) return 0;
  const target = ptr(m, ptr(m, source) + 0x5c);
  if (target !== 0x4ad420) throw Error(`Unported audio-source callback setter0x${target.toString(16)}.`);
  put(m, F - 8, 0); put(m, F - 28, 0x4a798e);
  replaceAudioSampleCallback(source, {...runtime, scratchBase: F - 28, entryRegisters: {...runtime.entryRegisters, EBX: manager, ESI: cast, EDI: source}});
  const critical = manager + 0x874;
  call(runtime, 'platformCall', 'EnterCriticalSection', [critical], F, 0x4a799b);
  const thread = call(runtime, 'platformCall', 'GetCurrentThreadId', [], F, 0x4a79a1);
  put(m, critical + 24, ptr(m, critical + 24) + 1); put(m, critical + 28, thread);
  const vector = ptr(m, manager + 0x840), end = ptr(m, vector + 4); let item = ptr(m, vector);
  while (item !== end && ptr(m, item) !== cast) item = item + 4 >>> 0;
  if (item === end) {
    put(m, F - 4, S + 4); put(m, F - 8, 0x4a79cf);
    appendGameImagePointer(vector, S + 4, {...runtime, scratchBase: F - 8, nativePointerVector: true, entryRegisters: {...runtime.entryRegisters, EBX: manager, ESI: cast, EDI: critical}});
  }
  const depth = ptr(m, critical + 24) - 1; put(m, critical + 24, depth); if (!depth) put(m, critical + 28, 0);
  call(runtime, 'platformCall', 'LeaveCriticalSection', [critical], F, 0x4a79e2); return 0;
}

//4aa250 destroys the queued wrapper, deferring its actual source through the
//manager root read after its own vtable store. Header ownership is captured.
export function destroyQueuedAudioSource(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 24;
  put(m, S - 4, -1); put(m, S - 8, 0x56a5db); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  save(runtime, 'ESI', F + 4); save(runtime, 'EDI', F); put(m, F + 8, object); put(m, object, 0x5d3d3c); put(m, S - 4, 0);
  const manager = ptr(m, 0x714b08), target = ptr(m, ptr(m, manager) + 32);
  if (target !== 0x4a7950) throw Error(`Unported manager retirement0x${target.toString(16)}.`);
  put(m, F - 4, ptr(m, object + 44)); put(m, F - 8, 0x4aa28a);
  retireGameAudioSource(manager, ptr(m, object + 44), {...runtime, scratchBase: F - 8, sehWord: S - 12, entryRegisters: {...runtime.entryRegisters, EDI: object}});
  const header = ptr(m, object + 36); put(m, object + 44, 0); put(m, object + 52, -1);
  if (header) {
    const buffer = ptr(m, header);
    if (buffer) {call(runtime, 'libraryCall', 'operatorDelete', [buffer], F, 0x4aa2ac); for (const offset of [0, 4, 8]) put(m, header + offset, 0);}
    call(runtime, 'libraryCall', 'operatorDelete', [header], F, 0x4aa2ca); put(m, object + 36, 0);
  }
  call(runtime, 'platformCall', 'DeleteCriticalSection', [object + 4], F, 0x4aa2de);
}

//4aa000. Both callback-destruction checks and the final low-byte deleting
//flag remain live; the final vtable is Listener, before optional CRT deletion.
export function releaseGameAudioListener(object, flags, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 8, storage = object + 8;
  put(m, S + 4, flags); save(runtime, 'ESI', S - 4); save(runtime, 'EDI', F); put(m, object, 0x5d3cc4);
  const context = {...runtime, entryRegisters: {...runtime.entryRegisters, ESI: object, EDI: storage}};
  for (const returned of [0x4aa022, 0x4aa03e]) {
    const value = ptr(m, storage + 16);
    if (value) {callback(value, 16, Number(value !== storage), F, returned, context); put(m, storage + 16, 0);}
  }
  const deallocate = m[S + 4] & 1; put(m, object, 0x5d3cec);
  if (deallocate) call(runtime, 'libraryCall', 'operatorDelete', [object], F, 0x4aa059);
  return object;
}

import {getApplicationDebugger} from './application-bootstrap.mjs';
import {eraseRendererPointers} from './renderer-scene-nodes.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function save(r, name, p) {if (Number.isInteger(r.entryRegisters?.[name])) put(r.memory, p, r.entryRegisters[name]);}
function call(r, kind, name, args, top, returned) {
  const m = r.memory; for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof r.services?.[kind] !== 'function') throw Error(`Voice pool requires ${kind} ${name}.`);
  return r.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...r, scratchBase: S});
}
function com(owner, offset, top, returned, runtime) {
  if (typeof runtime.services?.xAudio2Call !== 'function') throw Error('Voice pool requires genuine XAudio2 COM interface.');
  return call({...runtime, services: {...runtime.services, com: (_name, args, r) => runtime.services.xAudio2Call(owner, offset, args, r)}}, 'com', offset, [owner], top, returned);
}

//4b2240 scalar-deleting voice-pool record destructor (RET4). The argument
//is unused: destruction always releases the record itself with operatorDelete.
export function destroyAudioVoicePoolRecord(object, unused, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 4;
  put(m, S + 4, unused); save(runtime, 'ESI', F);
  if (ptr(m, object + 12)) {
    put(m, F - 4, 0x4b224e);
    getApplicationDebugger({...runtime, scratchBase: F - 4, nativeDebuggerFrame: 'wrapper', entryRegisters: {...runtime.entryRegisters, ECX: object, ESI: object}, handlers: {...runtime.handlers, registerExit: runtime.handlers?.registerExit ?? ((p, r) => r.services.libraryCall('registerExit', [p], r))}});
    com(ptr(m, object + 12), 0x48, F, 0x4b2257, runtime); put(m, object + 12, 0);
  }
  const engine = ptr(m, object + 8);
  if (engine) {com(engine, 8, F, 0x4b226b, runtime); put(m, object + 8, 0);}
  call(runtime, 'libraryCall', 'operatorDelete', [object], F, 0x4b2279); return object;
}

//4b2130 decrements the exact-zero count, destroys the pool record first,
//then removes every matching pointer from the live manager vector d68h.
export function releaseAudioVoicePoolRecord(manager, object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 16;
  put(m, S + 4, object); put(m, S - 4, manager); save(runtime, 'ESI', S - 8); save(runtime, 'EDI', S - 12);
  if (!object) return;
  const count = ptr(m, object) - 1 >>> 0; put(m, object, count); if (count) return;
  save(runtime, 'EBX', F); put(m, F - 4, manager); put(m, F - 8, 0x4b2152);
  destroyAudioVoicePoolRecord(object, manager, {...runtime, scratchBase: F - 8, entryRegisters: {...runtime.entryRegisters, ESI: object, EDI: manager}});
  const vector = manager + 0xd68, end = ptr(m, manager + 0xd6c); let first = ptr(m, vector), edi = manager;
  put(m, S - 4, vector);
  while (first !== end && ptr(m, first) !== object) first += 4;
  let returned = 0x4b21cb;
  if (first !== end) {
    save(runtime, 'EBP', F - 4);
    let input = first + 4; const count = input > end ? 0 : (end - input + 3 >>> 2); edi = 0;
    for (; edi < count; edi++, input += 4) if (ptr(m, input) !== object) {put(m, first, ptr(m, input)); first += 4;}
  } else if (ptr(m, vector) !== end) returned = 0x4b2181;
  put(m, F - 4, end); put(m, F - 8, first); put(m, F - 12, S + 4); put(m, F - 16, returned);
  eraseRendererPointers(vector, S + 4, first, end, {...runtime, scratchBase: F - 16, nativePointerErase: true, entryRegisters: {...runtime.entryRegisters, EBX: vector, ESI: object, EDI: edi}});
}

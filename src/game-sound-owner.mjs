import {copyGameAudioDescriptor} from './game-audio-descriptor-copy.mjs';
import {createGameAudioSample} from './game-audio-sample-factory.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function save(runtime, name, address) {if (Number.isInteger(runtime.entryRegisters?.[name])) put(runtime.memory, address, runtime.entryRegisters[name]);}
function crt(runtime, name, args, top, returned) {
  const m = runtime.memory;
  for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof runtime.services?.libraryCall !== 'function') throw Error(`Sound ownership requires CRT ${name}.`);
  return runtime.services.libraryCall(name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...runtime, scratchBase: S});
}

//40f170/40f1b0 are distinct compiler instantiations from the listener vector.
export function chooseGameSoundOwnerCapacity(requested, runtime) {
  const m = runtime.memory; requested >>>= 0; put(m, runtime.scratchBase + 4, requested);
  const old = (get(m, 0x6f241c) - get(m, 0x6f2414)) >> 2, half = old >>> 1;
  const grown = ((0x3fffffff - half) >>> 0) < (old >>> 0) ? 0 : (old + half) >>> 0;
  return Math.max(grown, requested) >>> 0;
}
export function reserveGameSoundOwners(capacity, runtime) {
  const {memory: m, scratchBase: S} = runtime; capacity >>>= 0;
  put(m, S + 4, capacity); save(runtime, 'ESI', S - 4); save(runtime, 'EDI', S - 8);
  let output = 0;
  if (capacity) {
    if (capacity <= 0x3fffffff) output = crt(runtime, 'operatorNew', [capacity * 4], S - 8, 0x40f1d2) >>> 0;
    if (!output) {crt(runtime, '_Xbad_alloc', [], S - 8, 0x40f1e1); throw Error('Nonreturning CRT bad_alloc returned.');}
  }
  save(runtime, 'EBX', S - 12);
  crt(runtime, 'memmove', [output, ptr(m, 0x6f2414), ((get(m, 0x6f2418) - get(m, 0x6f2414)) & ~3) >>> 0], S - 12, 0x40f1fb);
  const old = ptr(m, 0x6f2414), length = (get(m, 0x6f2418) - old) >> 2;
  if (old) crt(runtime, 'operatorDelete', [old], S - 12, 0x40f219);
  put(m, 0x6f2414, output); put(m, 0x6f241c, output + Math.imul(capacity, 4)); put(m, 0x6f2418, output + Math.imul(length, 4));
}
//40ee30 tail-calls40f1b0 with its original entry ESP and a replaced argument.
export function growGameSoundOwners(unusedEnd, runtime) {
  const {memory: m, scratchBase: S} = runtime; put(m, S + 4, unusedEnd);
  if ((((get(m, 0x6f241c) - get(m, 0x6f2418)) >> 2) >>> 0) >= 1) return;
  const length = (get(m, 0x6f2418) - get(m, 0x6f2414)) >> 2;
  if (((0x3fffffff - length) >>> 0) < 1) {crt(runtime, '_Xlength_error', [0x570294], S, 0x40ee65); throw Error('Nonreturning CRT length_error returned.');}
  put(m, S - 4, length + 1); put(m, S - 8, 0x40ee6e);
  const capacity = chooseGameSoundOwnerCapacity(length + 1, {...runtime, scratchBase: S - 8});
  put(m, S + 4, capacity); reserveGameSoundOwners(capacity, runtime);
}
//40ec20. Self-references are rebased after growth; external input values are
//read only after all allocation/copy/delete side effects have completed.
export function appendGameSoundOwner(input, runtime) {
  const {memory: m, scratchBase: S} = runtime; input >>>= 0; put(m, S + 4, input); save(runtime, 'ESI', S - 4);
  let end = ptr(m, 0x6f2418), start = ptr(m, 0x6f2414);
  const aliased = input < end && start <= input, index = (input - start) >> 2;
  if (end === ptr(m, 0x6f241c)) {
    put(m, S - 8, end); put(m, S - 12, aliased ? 0x40ec4b : 0x40ec6d);
    growGameSoundOwners(end, {...runtime, scratchBase: S - 12, entryRegisters: {...runtime.entryRegisters, ESI: aliased ? index : input}});
    end = ptr(m, 0x6f2418); if (aliased) start = ptr(m, 0x6f2414);
  }
  if (end) {put(m, end, get(m, aliased ? start + Math.imul(index, 4) : input)); end = ptr(m, 0x6f2418);}
  put(m, 0x6f2418, end + 4);
}

//40d7d0. The first native stack argument is unused. The second is read live
//for descriptor copying, then overwritten with the allocated12-byte wrapper.
//The known samplefactory virtual14 binds actual4a7710. Reached codec and
//streaming descendants retain their own explicit, separately validated scope.
export function constructGameSoundOwner(object, unused, descriptor, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 36, data = object + 16;
  put(m, S + 4, unused); put(m, S + 8, descriptor); put(m, S - 4, -1); put(m, S - 8, 0x569ee5);
  if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  for (const [name, offset] of [['EBX', 12], ['ESI', 8], ['EDI', 4]]) save(runtime, name, F + offset);
  put(m, F, get(m, 0x5e8890) ^ (F + 4)); put(m, F + 16, object);
  for (const offset of [0, 4, 8, 12]) put(m, object + offset, 0); put(m, F + 32, 0);
  const input = ptr(m, F + 44); put(m, F - 4, input); put(m, F - 8, 0x40d82d);
  copyGameAudioDescriptor(data, input, {...runtime, scratchBase: F - 8, entryRegisters: {...runtime.entryRegisters, EBX: data, ESI: object}});
  put(m, object + 0x480, 0); m[F + 32] = 1;
  put(m, F - 4, 12); put(m, object + 0x488, 0); put(m, object + 0x48c, 0); put(m, F - 8, 0x40d858);
  if (typeof runtime.services?.libraryCall !== 'function') throw Error('Sound owner requires CRT operatorNew.');
  const wrapper = runtime.services.libraryCall('operatorNew', [ptr(m, F - 4)], {...runtime, scratchBase: F - 8}) >>> 0;
  put(m, F + 44, wrapper); m[F + 32] = 3;
  if (wrapper) {
    const manager = ptr(m, 0x714b08), record = F - 24;
    put(m, F - 28, data); put(m, record + 16, 0); put(m, F - 32, 0x40d882);
    const target = ptr(m, ptr(m, manager) + 0x14), handler = runtime.handlers?.soundManagerSample;
    const context = {...runtime, scratchBase: F - 32, entryRegisters: {...runtime.entryRegisters, EBX: data, ESI: object, EDI: wrapper}, sehWord: F + 24};
    let response;
    if (typeof handler === 'function') response = handler({thisAddress: manager, virtualAddress: target, descriptor: ptr(m, F - 28), arguments: Array.from({length: 7}, (_, i) => ptr(m, F - 28 + i * 4))}, context);
    else if (target === 0x4a7710) response = createGameAudioSample(manager, ptr(m, F - 28), context);
    else throw Error(`Sound owner requires actual sample factory0x${target.toString(16)}.`);
    const sample = typeof response === 'number' ? response : response?.eax;
    if (!Number.isInteger(sample)) throw Error('Sound sample factory requires native EAX.');
    put(m, wrapper, sample); put(m, wrapper + 4, 0); put(m, wrapper + 8, 0); put(m, object, wrapper);
  } else put(m, object, 0);
  return object;
}

import {createAudioListener} from './audio-listener-construction.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, value) => m.writeInt32LE(value | 0, p);
function save(runtime, register, address) {if (Number.isInteger(runtime.entryRegisters?.[register])) put(runtime.memory, address, runtime.entryRegisters[register]);}
function crt(runtime, name, args, top, returned) {
  const m = runtime.memory;
  for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const entry = top - args.length * 4 - 4; put(m, entry, returned);
  if (typeof runtime.services?.libraryCall !== 'function') throw Error(`Audio listeners require CRT ${name}.`);
  return runtime.services.libraryCall(name, args.map((_, i) => ptr(m, entry + 4 + i * 4)), {...runtime, scratchBase: entry});
}

//40f0e0. The listener vector is global; length is recaptured after memmove,
//before delete. Deletion may mutate globals, but publication uses that capture.
export function reserveAudioListenerVector(capacity, runtime) {
  const {memory: m, scratchBase: S} = runtime; capacity >>>= 0;
  put(m, S + 4, capacity); save(runtime, 'ESI', S - 4); save(runtime, 'EDI', S - 8);
  let output = 0;
  if (capacity) {
    if (capacity <= 0x3fffffff) output = crt(runtime, 'operatorNew', [capacity * 4], S - 8, 0x40f102) >>> 0;
    if (!output) {crt(runtime, '_Xbad_alloc', [], S - 8, 0x40f111); throw Error('Nonreturning CRT bad_alloc returned.');}
  }
  save(runtime, 'EBX', S - 12);
  const old = ptr(m, 0x6f2408), bytes = (get(m, 0x6f240c) - old & ~3) >>> 0;
  crt(runtime, 'memmove', [output, old, bytes], S - 12, 0x40f12b);
  const capturedOld = ptr(m, 0x6f2408), length = get(m, 0x6f240c) - capturedOld >> 2;
  if (capturedOld) crt(runtime, 'operatorDelete', [capturedOld], S - 12, 0x40f149);
  put(m, 0x6f2408, output); put(m, 0x6f2410, output + Math.imul(capacity, 4)); put(m, 0x6f240c, output + Math.imul(length, 4));
}

//484560. ECX/EDX are first forward/up pointers. Stack arguments contain first
//position, three further forward/up/position triples, then listener count.
//Established SoundManager virtual4c executes actual4a9b00 by default; optional
//overrides are probes. Unclassified virtual targets remain reached contracts.
export function initializeAudioListeners(forward, up, args, runtime) {
  if (args.length !== 11) throw Error('484560 requires its eleven native stack arguments.');
  const {memory: m, scratchBase: S} = runtime, F = S - 32;
  for (const [register, offset] of [['EBX', -20], ['EBP', -24], ['ESI', -28], ['EDI', -32]]) save(runtime, register, S + offset);
  args.forEach((value, i) => put(m, S + 4 + i * 4, value));
  //Native stores these after pushing memset's arguments.
  put(m, F - 4, 0x150); put(m, F - 8, 0); put(m, F - 12, 0x849480);
  put(m, F + 0x1c, up); put(m, F + 0x18, forward); put(m, F - 16, 0x484580);
  if (typeof runtime.services?.libraryCall !== 'function') throw Error('Audio listeners require CRT memset.');
  runtime.services.libraryCall('memset', [ptr(m, F - 12), ptr(m, F - 8), ptr(m, F - 4)], {...runtime, scratchBase: F - 16});
  let count = get(m, F + 0x4c), index = 0;
  put(m, F + 0x14, 0);
  if (count > 0) {
    let end = ptr(m, 0x6f240c), capacity = ptr(m, 0x6f2410), start = ptr(m, 0x6f2408);
    do {
      let size = get(m, 0x6f240c) - start >> 2;
      //After a previous listener, the original retains freshly loaded EAX/EDX/
      //ESI. The explicit live loads below are side-effect free native memory.
      end = ptr(m, 0x6f240c); capacity = ptr(m, 0x6f2410);
      if (size <= index) {
        put(m, F + 0x10, 0);
        do {
          const valueAddress = F + 0x10, aliased = valueAddress < end && start <= valueAddress;
          const aliasIndex = valueAddress - start >> 2;
          if (end === capacity && (capacity - end >> 2) < 1) {
            const oldSize = end - start >> 2;
            if ((0x3fffffff - oldSize >>> 0) < 1) {crt(runtime, '_Xlength_error', [0x570294], F, 0x4847e2); throw Error('Nonreturning CRT length error returned.');}
            const oldCapacity = capacity - start >> 2, half = oldCapacity >>> 1;
            const grown = (0x3fffffff - half >>> 0) < (oldCapacity >>> 0) ? 0 : oldCapacity + half >>> 0;
            const requested = Math.max(grown, oldSize + 1 >>> 0);
            put(m, F - 4, requested); put(m, F - 8, aliased ? 0x484620 : 0x48468f);
            reserveAudioListenerVector(requested, {...runtime, scratchBase: F - 8, entryRegisters: {...runtime.entryRegisters, ESI: start, EDI: aliased ? aliasIndex : oldSize + 1, EBX: size}});
            capacity = ptr(m, 0x6f2410); end = ptr(m, 0x6f240c); start = ptr(m, 0x6f2408);
            if (aliased) index = get(m, F + 0x14);
          }
          if (end) {put(m, end, aliased ? get(m, start + aliasIndex * 4) : 0); capacity = ptr(m, 0x6f2410); start = ptr(m, 0x6f2408); end = ptr(m, 0x6f240c);}
          end = end + 4 >>> 0; size++; put(m, 0x6f240c, end);
        } while (size <= index);
        count = get(m, F + 0x4c);
      }
      if (!get(m, start + Math.imul(index, 4))) {
        let listener = crt(runtime, 'operatorNew', [0x50], F, 0x4846df) >>> 0;
        if (listener) {
          const manager = ptr(m, 0x714b08), record = F - 24;
          put(m, record, 0x5d0304); put(m, record + 4, index); put(m, record + 16, record);
          put(m, F - 28, index === 0 ? 1 : 0); put(m, F - 32, 0x48470d);
          const request = {thisAddress: manager, virtualAddress: ptr(m, ptr(m, manager) + 0x4c), offset: 0x4c, arguments: Array.from({length: 7}, (_, i) => ptr(m, F - 28 + i * 4))};
          const context = {...runtime, scratchBase: F - 32, entryRegisters: {...runtime.entryRegisters, EBX: size, EBP: index, ESI: listener, EDI: count}};
          let result;
          if (typeof runtime.handlers?.soundManagerCall === 'function') result = runtime.handlers.soundManagerCall(request, context);
          else if (request.virtualAddress === 0x4a9b00) result = createAudioListener(manager, request.arguments[0], request.arguments.slice(1), context);
          else throw Error(`Unclassified SoundManager listener factory 0x${request.virtualAddress.toString(16)}.`);
          const value = typeof result === 'number' ? result : result?.eax;
          if (!Number.isInteger(value)) throw Error('Audio listener creation requires native EAX from SoundManager virtual4c.');
          put(m, listener, value); crt(runtime, 'memset', [listener + 4, 0, 0x4c], F, 0x48471c);
        }
        const liveStart = ptr(m, 0x6f2408); put(m, liveStart + Math.imul(index, 4), listener);
        capacity = ptr(m, 0x6f2410); end = ptr(m, 0x6f240c); start = ptr(m, 0x6f2408);
      }
      index++; m[0x849480] = 1; put(m, F + 0x14, index);
    } while (index < count);
    if (count > 0) {put(m, 0x849484, get(m, F + 0x18)); put(m, 0x849488, get(m, F + 0x1c)); put(m, 0x84948c, get(m, F + 0x24));}
  }
  for (let listener = 1; listener < 4; listener++) if (count > listener) {
    for (let component = 0; component < 3; component++) put(m, 0x849484 + listener * 0x54 + component * 4, get(m, F + 0x28 + (listener - 1) * 12 + component * 4));
  }
}

//485130. The selected participant entries each point to a pointer holder.
//Mode4 falls through3 and1/2; unsupported modes still produce one listener.
export function initializeRaceAudioListeners(runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 36;
  for (const [register, offset] of [['EBX', -24], ['EBP', -28], ['ESI', -32], ['EDI', -36]]) save(runtime, register, S + offset);
  for (const offset of [0x20, 0x1c, 0x18, 0x14, 0x10]) put(m, F + offset, 0);
  let thirdForward = 0, fourthForward = 0, fourthUp = 0, fourthPosition = 0, count = 1;
  const participant = slot => ptr(m, ptr(m, 0x909318 + Math.imul(get(m, 0x5ec120 + slot * 4), 0x30c)));
  const mode = m[ptr(m, 0x5ecb1c) + 0x552];
  if (mode === 4) {const body = participant(3); count = 2; fourthForward = body + 0x34; fourthUp = body + 0x68; fourthPosition = body + 0xc4;}
  if (mode === 3 || mode === 4) {const body = participant(2); thirdForward = body + 0x34; put(m, F + 0x14, body + 0x68); put(m, F + 0x10, body + 0xc4); count++;}
  if (mode >= 1 && mode <= 4) {const body = participant(1); put(m, F + 0x20, body + 0x34); put(m, F + 0x1c, body + 0x68); put(m, F + 0x18, body + 0xc4); count++;}
  const first = participant(0), args = [first + 0xc4, get(m, F + 0x20), get(m, F + 0x1c), get(m, F + 0x18), thirdForward, get(m, F + 0x14), get(m, F + 0x10), fourthForward, fourthUp, fourthPosition, count];
  for (let i = args.length - 1; i >= 0; i--) put(m, F - (args.length - i) * 4, args[i]); put(m, F - 48, 0x48522b);
  initializeAudioListeners(first + 0x34, first + 0x68, args, {...runtime, scratchBase: F - 48, entryRegisters: {...runtime.entryRegisters, EBX: fourthPosition, EBP: thirdForward, ESI: fourthForward, EDI: fourthUp}});
}

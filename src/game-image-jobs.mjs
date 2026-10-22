import {convertGameImageRows} from './game-image-conversion-rows.mjs';
import {resampleGameImageRows} from './game-image-resample-rows.mjs';
import {copyGameImageRows} from './game-image-copy-rows.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const service = (runtime, name, request) => {if (typeof runtime.services?.[name] !== 'function') throw Error(`Game image jobs require STL service ${name}.`); return runtime.services[name](request, runtime);};
const crt = (runtime, name, args) => {if (typeof runtime.services?.libraryCall !== 'function') throw Error(`Game image jobs require CRT ${name}.`); return runtime.services.libraryCall(name, args, runtime);};

//4bddf0's actual capture wrapper.4bde50 is a genuine std::async / future
//construction boundary, with the actual game worker supplied as execute().
export function constructGameImageTask(future, functionPointer, sourcePointer, parameters, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 48; put(m, frame + 8, 0); put(m, frame + 0x38, get(m, sourcePointer)); put(m, frame + 0x34, get(m, functionPointer));
  Buffer.from(m.subarray(parameters, parameters + 16)).copy(m, frame + 12); const last = get(m, parameters + 32), tail = Buffer.from(m.subarray(parameters + 16, parameters + 32)); put(m, frame + 0x2c, last); tail.copy(m, frame + 0x1c);
  const functionAddress = ptr(m, frame + 0x34), thisAddress = ptr(m, frame + 0x38), args = Array.from({length: 9}, (_, i) => get(m, frame + 12 + i * 4));
  service({...runtime, scratchBase: frame - 16}, 'stlAsyncConstruct', {futureAddress: future, functionAddress, thisAddress, arguments: args, execute(options) {if (functionAddress !== 0x4bd770) throw Error(`Unported game image worker0x${functionAddress.toString(16)}.`); return convertGameImageRows(thisAddress, args, {...runtime, ...options});}});
  return future;
}

//4c5750, the corresponding ten-argument resampling capture wrapper. Its
//4c57c0 callee is the same genuine STL async machinery with a larger tuple.
export function constructGameImageResampleTask(future, functionPointer, sourcePointer, parameters, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 48;
  put(m, frame + 4, 0); put(m, frame + 0x38, get(m, sourcePointer)); put(m, frame + 0x34, get(m, functionPointer));
  Buffer.from(m.subarray(parameters, parameters + 16)).copy(m, frame + 8);
  Buffer.from(m.subarray(parameters + 16, parameters + 32)).copy(m, frame + 24);
  Buffer.from(m.subarray(parameters + 32, parameters + 40)).copy(m, frame + 40);
  const functionAddress = ptr(m, frame + 0x34), thisAddress = ptr(m, frame + 0x38), args = Array.from({length: 10}, (_, i) => get(m, frame + 8 + i * 4));
  service({...runtime, scratchBase: frame - 16}, 'stlAsyncConstruct', {futureAddress: future, functionAddress, thisAddress, arguments: args, execute(options) {if (functionAddress !== 0x4c4f40) throw Error(`Unported game resample worker0x${functionAddress.toString(16)}.`); return resampleGameImageRows(thisAddress, args, {...runtime, ...options});}});
  return future;
}

//4c87e0's fourteen-word tuple capture;4c8850 is genuine STL state creation.
export function constructGameImageCopyTask(future, functionPointer, sourcePointer, parameters, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 64;
  put(m, frame + 4, 0); put(m, frame + 0x48, get(m, sourcePointer)); put(m, frame + 0x44, get(m, functionPointer));
  for (const offset of [0, 16, 32]) Buffer.from(m.subarray(parameters + offset, parameters + offset + 16)).copy(m, frame + 8 + offset);
  Buffer.from(m.subarray(parameters + 48, parameters + 56)).copy(m, frame + 56);
  const functionAddress = ptr(m, frame + 0x44), thisAddress = ptr(m, frame + 0x48), args = Array.from({length: 14}, (_, i) => get(m, frame + 8 + i * 4));
  service({...runtime, scratchBase: frame - 16}, 'stlAsyncConstruct', {futureAddress: future, functionAddress, thisAddress, arguments: args, execute(options) {if (functionAddress !== 0x4c75b0) throw Error(`Unported game copy worker0x${functionAddress.toString(16)}.`); return copyGameImageRows(thisAddress, args, {...runtime, ...options});}});
  return future;
}

//4bdf80. Refcount arithmetic and virtual-target selection remain game code.
export function releaseGameImageFutureState(state, runtime) {
  const {memory: m} = runtime; if (!state) return; const references = get(m, state + 4) - 1 | 0; put(m, state + 4, references); if (!references) {const delegate = ptr(m, state + 0x28), thisAddress = delegate || state, virtualAddress = ptr(m, ptr(m, thisAddress)); service(runtime, 'stlFutureDestroy', {stateAddress: state, thisAddress, virtualAddress, argument: delegate ? state : 1});}
}
export function releaseGameImageFutureRange(begin, end, runtime) {
  const {memory: m, scratchBase} = runtime;
  for (let row = begin; row !== end; row += 8) releaseGameImageFutureState(ptr(m, row), {...runtime, scratchBase: scratchBase - 16});
}

//4bdd10/4be180. Move only the pointer and ownership byte, leaving padding
//untouched; old elements are nulled before the old range is released.
export function reserveGameImageJobs(vector, count, runtime) {
  const {memory: m} = runtime; count >>>= 0; let output = 0; if (count) {if (count >= 0x20000000) throw RangeError('Native image job bad_alloc.'); output = crt(runtime, 'operatorNew', [count * 8]) >>> 0; if (!output) throw Error('Native image job bad_alloc.');}
  let source = ptr(m, vector), end = ptr(m, vector + 4), destination = output;
  for (; source !== end; source += 8, destination += 8) if (destination) {put(m, destination, 0); if (destination !== source) {put(m, destination, get(m, source)); put(m, source, 0); m[destination + 4] = m[source + 4];} m[destination + 4] = 1;}
  const old = ptr(m, vector), used = (get(m, vector + 4) - get(m, vector)) >> 3; if (old) {releaseGameImageFutureRange(old, ptr(m, vector + 4), {...runtime, scratchBase: runtime.scratchBase - 48}); crt(runtime, 'operatorDelete', [old]);}
  put(m, vector + 8, output + count * 8); put(m, vector, output); put(m, vector + 4, output + used * 8);
}
export function appendGameImageJob(vector, input, runtime) {
  const {memory: m} = runtime; let relative = null; if ((input >>> 0) < ptr(m, vector + 4) && (input >>> 0) >= ptr(m, vector)) relative = (input - ptr(m, vector)) >> 3;
  if (ptr(m, vector + 4) === ptr(m, vector + 8)) {const used = (get(m, vector + 4) - get(m, vector)) >> 3, capacity = (get(m, vector + 8) - get(m, vector)) >> 3, half = capacity >>> 1; if (0x1fffffff - used < 1) throw RangeError('Native image job vector length error.'); reserveGameImageJobs(vector, Math.max(used + 1, (0x1fffffff - half >>> 0) < (capacity >>> 0) ? 0 : capacity + half), runtime);}
  if (relative !== null) input = ptr(m, vector) + relative * 8; const output = ptr(m, vector + 4); if (output) {put(m, output, 0); if (output !== input) {put(m, output, get(m, input)); put(m, input, 0); m[output + 4] = m[input + 4];} m[output + 4] = 1;} put(m, vector + 4, get(m, vector + 4) + 8);
}

//4c1310. The actual future-state checks precede each STL virtual await.
export function waitGameImageJobs(vector, runtime) {
  const {memory: m} = runtime; let row = ptr(m, vector); const end = ptr(m, vector + 4);
  for (; row !== end; row += 8) {const state = ptr(m, row); if (!state || m[row + 4] && m[state + 0x1c]) {service({...runtime, scratchBase: runtime.scratchBase - 28}, 'stlFutureError', {code: 4}); throw Error('Native invalid image future.');} service({...runtime, scratchBase: runtime.scratchBase - 24}, 'stlFutureWait', {stateAddress: state, thisAddress: state, virtualAddress: ptr(m, ptr(m, state) + 4)});}
}
export function releaseGameImageJobs(vector, runtime) {
  const {memory: m} = runtime, begin = ptr(m, vector); if (!begin) return; releaseGameImageFutureRange(begin, ptr(m, vector + 4), {...runtime, scratchBase: runtime.scratchBase - 20}); crt(runtime, 'operatorDelete', [ptr(m, vector)]); put(m, vector, 0); put(m, vector + 4, 0); put(m, vector + 8, 0);
}

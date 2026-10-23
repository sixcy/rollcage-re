//Captured sound24/484bb0 binding. No bank constructor, source allocation, or
//empty-vector replacement occurs here. Reached missing bytes remain failures.
import {emitNativeEffectOnStack, dispatchNativeSoundOnStack, dispatchPopulatedNativeSoundOnStack} from '../../src/native-effect-emitter.mjs';
import {assertNativeMemorySpan, resolveNativeMemoryAddress} from '../../src/native-memory-spans.mjs';
import {createHash} from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const unsigned = (value, label) => {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value))) throw Error(`Invalid captured thread ${label}.`);
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0 || result > 0xffffffff) throw Error(`Invalid captured thread ${label}.`);
  return result;
};
function verified(bytes, hash, label) {
  if (!Buffer.isBuffer(bytes) || typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash) || digest(bytes) !== hash.toLowerCase()) throw Error(`Captured thread ${label} hash/bytes differ.`);
}

export function nativeFrameSoundAdditionalRegions({moduleBaseAddress} = {}) {
  const address = moduleBaseAddress + 0x1e8890;
  if (!Number.isSafeInteger(moduleBaseAddress) || moduleBaseAddress <= 0 || !Number.isSafeInteger(address) || address + 4 > 0x100000000) throw Error('Sound cookie alias requires the observed main-module base.');
  return [{id: 'active-sound-cookie', address, preferredAddress: 0x5e8890, length: 4, comparison: 'read-only', evidence: '40db35/40db3a retained153 ev_e7b66afda8bc1259f35bae13abb5f5ad007af72d368288d98dca50fc8ee1e855'}];
}

//Admit only this exact observed FS:[0] word. Neither context SegFs alone nor
//stale stack/TLS conventions establish the original descriptor base or head.
export function bindCapturedNativeThreadEnvironment(snapshot, {memory} = {}) {
  const metadata = snapshot?.threadEnvironment;
  const rows = snapshot?.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot?.ranges;
  const heads = Array.isArray(rows) ? rows.filter(row => row.id === 'thread-seh-head') : [];
  if (metadata === undefined) {
    if (heads.length) throw Error('Captured SEH head has no explicit thread-environment metadata.');
    return {nativeTls: undefined, comparisonRegions: []};
  }
  if (!metadata || heads.length !== 1) throw Error('Captured thread environment requires exactly one explicit SEH-head range.');
  const head = heads[0];
  if (head.length !== 4 || head.bytes?.length !== 4 || head.source !== 'stopped-owned-thread-fs-zero') throw Error('Captured SEH head must be its exact four-byte observation range.');
  verified(head.bytes, head.sha256, 'SEH head');
  if (snapshot.context?.length !== 716) throw Error('Captured thread environment requires the actual716-byte context.');
  verified(snapshot.context, snapshot.contextSha256, 'context');
  const selector = unsigned(metadata.fsSelector, 'selector'), base = unsigned(metadata.fsBase, 'FS base'), sehWord = unsigned(metadata.sehWord, 'SEH word');
  if (!selector || selector > 0xffff || snapshot.context.readUInt32LE(144) !== selector) throw Error('Captured thread FS selector differs from raw context DWORD144.');
  if (typeof metadata.descriptorHex !== 'string' || !/^[0-9a-f]{16}$/i.test(metadata.descriptorHex)) throw Error('Captured thread selector requires its exact eight-byte descriptor.');
  const descriptor = Buffer.from(metadata.descriptorHex, 'hex');
  const descriptorBase = (descriptor.readUInt16LE(2) | descriptor[4] << 16 | descriptor[7] << 24) >>> 0;
  if (!base || base + 4 > 0x100000000 || descriptorBase !== base || unsigned(head.address, 'head address') !== base || head.bytes.readUInt32LE() !== sehWord) throw Error('Captured thread descriptor/base/SEH bytes disagree.');
  if (!Number.isSafeInteger(snapshot.tid) || snapshot.tid < 1 || metadata.tid !== snapshot.tid || metadata.contextSelectorOffset !== 144 || metadata.source !== 'stopped-owned-thread-selector-query' || !['Wow64GetThreadSelectorEntry', 'GetThreadSelectorEntry'].includes(metadata.selectorApi)) throw Error('Captured thread environment lacks its owned-thread selector-query provenance.');
  assertNativeMemorySpan(memory, base, 4);
  if (resolveNativeMemoryAddress(memory, base, 4) !== base || !memory.subarray(base, base + 4).equals(head.bytes)) throw Error('Captured thread SEH head differs from its actual live memory identity/bytes.');
  const nativeTls = {};
  Object.defineProperties(nativeTls, {
    fsBase: {enumerable: true, value: base}, fsSelector: {enumerable: true, value: selector},
    sehWord: {enumerable: true, get() {return memory.readUInt32LE(base);}, set(value) {memory.writeUInt32LE(unsigned(value, 'SEH store'), base);}},
  });
  return {nativeTls, comparisonRegions: [{id: 'thread-seh-head', address: base, length: 4, comparison: 'mutable', evidence: 'Stopped owned-thread selector descriptor and hash-verified FS:[0] bytes; context DWORD144.'}]};
}

//40dee8's PUSH490/operatornew and40df02 constructor call prove owner size;
//retained9083 ev_46bcabb10c7f22695d3aaf8697963cd496246d5cfed4b596a40f0b17737eb507.
export function nativeFrameActiveSoundCaptureRanges({maxRegionBytes = 64 * 1024 * 1024, includeChannelVector = false} = {}) {
  if (!Number.isInteger(maxRegionBytes) || maxRegionBytes < 1 || maxRegionBytes > 64 * 1024 * 1024 || typeof includeChannelVector !== 'boolean') throw Error('Invalid active-sound capture observation bound.');
  const ranges = [
    {id: 'active-sound-bank-region', rva: '0x2f2414', dereferenceOffsets: ['0'], readableRegion: true, maxRegionBytes},
    {id: 'active-sound24-owner', rva: '0x2f2414', dereferenceOffsets: ['0', '0x60'], length: 0x490},
    {id: 'active-sound-cookie', rva: '0x1e8890', length: 4},
  ];
  if (includeChannelVector) ranges.push({id: 'active-sound24-channel-vector-region', rva: '0x2f2414', dereferenceOffsets: ['0', '0x60', '4'], readableRegion: true, maxRegionBytes});
  return ranges;
}

export function createNativeFrameSoundBindings({memory, moduleBaseAddress, numericalContext, dispatchPopulated40ea40, nativeTls,
  selectAdaptiveSoundChannelOnStack, playSelectedNativeSoundOnStack} = {}) {
  if (numericalContext?.x87?.precisionBits !== 24 || numericalContext.x87.roundingMode !== 'nearest-even' || numericalContext.sse?.roundingMode !== 'nearest-even' || numericalContext.sse.flushToZero || numericalContext.sse.denormalsAreZero || numericalContext.x87.exceptionMask !== 63 || numericalContext.sse.exceptionMask !== 63) throw Error('Native frame sound requires explicit captured PC24/nearest-even masked numerical context.');
  for (const handler of [selectAdaptiveSoundChannelOnStack, playSelectedNativeSoundOnStack]) if (handler !== undefined && typeof handler !== 'function') throw Error('Native sound continuations must be explicit game-source functions.');
  const comparisonRegions = [], seen = new Set();
  function admit(address, length, label, comparison = 'read-only') {
    assertNativeMemorySpan(memory, address, length);
    const actual = resolveNativeMemoryAddress(memory, address, length), key = `${actual}:${length}`;
    if (!seen.has(key)) {
      seen.add(key); comparisonRegions.push({id: `sound-${label}-${actual.toString(16)}`, address: actual, length, comparison, evidence: '40ea40 retained151 ev_276e723742684068016129e93a54f6b66c48ae2564c6cbdd1d58fc0dd8998ee6'});
    }
  }
  //The actual ASLR aliases must already map these source-known roots. Keeping
  //pointer bytes unchanged is essential: descendants retain native addresses.
  admit(0x6f2414, 8, 'bank-roots');
  const populated = dispatchPopulated40ea40 ?? (nativeTls ? dispatchPopulatedNativeSoundOnStack : undefined);
  const soundRuntime = {memory, moduleBaseAddress, numericalContext, nativeTls, selectAdaptiveSoundChannelOnStack, playSelectedNativeSoundOnStack,
    ...(populated ? {dispatchPopulated40ea40(request, runtime) {
      admit(runtime.soundAddress, 0x490, 'owner', 'mutable');
      admit(0x5e8890, 4, 'cookie');
      return populated(request, runtime);
    }} : {}),
    onSoundChannelRead({address, length}) {admit(address, length, 'channel-slot');},
    onSoundBankRead({address, length}) {admit(address, length, 'bank-entry');}};
  function dispatch40ea40(request) {
    if (request.memory !== memory) throw Error('Native frame dispatcher must share captured memory.');
    return dispatchNativeSoundOnStack(request, {...soundRuntime, scratchBase: request.scratchBase, nativeStack: request.nativeStack});
  }
  function call484bb0(request) {
    if (request.memory !== memory) throw Error('Native frame emitter must share captured memory.');
    return emitNativeEffectOnStack(request.code, request.registerEdx, request.args, {...request, moduleBaseAddress, numericalContext, soundRuntime, dispatch40ea40});
  }
  return {soundRuntime, dispatch40ea40, call484bb0, comparisonRegions,
    limits: ['Integer-only484bb0,40ea40 early exits and the explicit-TLS round-robin null-channel branch preserve shared stack.', 'Nonnull channels/adaptive selection require complete child-stack/service bindings; numeric-only source handlers are insufficient.', 'This binding does not establish audible playback, native wall-clock timing or populated-bank runtime equivalence.']};
}

import {nativeCodeAddress} from '../../src/native-memory-spans.mjs';
import {setGameAudioSampleGain, setGameAudioSampleFrameOffset, clearGameAudioSamplePending, queryGameAudioSampleActivity} from '../../src/audio-sample-controls.mjs';
import {hasAudioSourceEffect} from '../../src/audio-source-parameters.mjs';

export class NativeControlAudioBoundary extends Error {
  constructor(message, details = {}) {super(message); this.boundary = {kind: 'native-control-audio', message, ...details};}
}
const fail = (message, details) => {throw new NativeControlAudioBoundary(message, details);};
const direct = new Map([
  [0x4855cd, [0x38, 0x4855cf]], [0x485c62, [0x20, 0x485c65]], [0x485cc1, [0x14, 0x485cc4]],
  [0x485da0, [0x20, 0x485da3]], [0x485dfb, [0x14, 0x485dfe]], [0x485ee0, [0x20, 0x485ee3]],
  [0x485f3b, [0x14, 0x485f3e]], [0x4861c5, [0x20, 0x4861c8]], [0x485fdc, [0x34, 0x485fdf]], [0x486121, [0x34, 0x486124]],
]);
const arity = new Map([[0x14, 1], [0x20, 1], [0x34, 0], [0x38, 1], [0x50, 0], [0x58, 0]]);
const floatBits = value => {const b = Buffer.alloc(4); b.writeFloatLE(value); return b.readUInt32LE();};

//The parent supplies exact retained caller metadata. No site is inferred from
//source identity and the outer485300 ESP is never used as a virtual entry.
export function createNativeControlAudioBindings({memory, moduleBaseAddress = 0x400000, numericalContext, nativeTls, source} = {}) {
  if (!memory || source?.memory && source.memory !== memory) throw Error('Native control audio requires one shared memory identity.');
  const actual = p => nativeCodeAddress(p, {moduleBaseAddress}), preferred = p => p - moduleBaseAddress + 0x400000;
  const comparisonRegions = [], events = [], seen = new Set();
  const compare = (id, address, length, evidence) => {const key = `${address}:${length}`; if (!seen.has(key)) {seen.add(key); comparisonRegions.push({id, address, length, comparison: 'mutable', evidence});}};
  const sourceCall = (object, method, args, runtime) => {
    const meta = runtime?.nativeSourceCall;
    if (runtime?.memory !== memory || !runtime.nativeAudioCalls || !meta || !Number.isInteger(meta.entryEsp) || runtime.scratchBase !== meta.entryEsp)
      fail('Audio virtual call lacks its actual native caller frame; outer485300 ESP is not a valid substitute.');
    const caller = preferred(meta.callerAddress), site = preferred(meta.callAddress), count = arity.get(method);
    if (count === undefined || args.length !== count) fail('Unimplemented actual control-audio source method.', {method, caller, site});
    let expectedEsp, expectedReturn;
    if (caller === 0x485300) {
      const row = direct.get(site); if (!row || row[0] !== method) fail('Unknown actual485300 virtual call site.', {method, site});
      expectedEsp = meta.callerEntryEsp - 84 - count * 4 - 4; expectedReturn = actual(row[1]);
    } else if (caller === 0x484d90 && site === 0x484dc5 && method === 0x20) {expectedEsp = meta.callerEntryEsp - 8; expectedReturn = actual(0x484dc8);}
    else if (caller === 0x484d30 && site === 0x484d86 && method === 0x14) {expectedEsp = meta.callerEntryEsp - 16; expectedReturn = actual(0x484d89);}
    else if (caller === 0x484d10 && site === 0x484d24 && method === 0x34 && meta.tailCall) {expectedEsp = meta.callerEntryEsp; expectedReturn = meta.returnAddress;}
    else if (caller === 0x40e5e0 && [0x40e628, 0x40e639, 0x40e673, 0x40e6b9].includes(site)
      && method === (site === 0x40e6b9 ? 0x58 : 0x50)) {expectedEsp = meta.callerEntryEsp - 0x84; expectedReturn = actual(site === 0x40e6b9 ? 0x40e6bc : site + 2);}
    else fail('Unknown actual control-audio wrapper virtual site.', {method, caller, site});
    if (expectedEsp !== meta.entryEsp || expectedReturn !== meta.returnAddress || memory.readUInt32LE(expectedEsp) !== expectedReturn)
      fail('Audio virtual caller ESP/return word differs from retained ABI.', {method, caller, site, expectedEsp, actualEsp: meta.entryEsp});
    for (const [i, argument] of args.entries()) if (memory.readUInt32LE(expectedEsp + 4 + i * 4) !== (method === 0x14 ? floatBits(argument) : argument >>> 0)) fail('Audio virtual caller argument stores differ.', {method, caller, site});
    for (const name of ['EBX', 'EBP', 'ESI', 'EDI']) if (!Number.isInteger(meta.entryRegisters?.[name]) || runtime.entryRegisters?.[name] !== meta.entryRegisters[name]) fail(`Audio virtual caller requires actual incoming ${name}.`, {method, caller, site});
    const target = memory.readUInt32LE(memory.readUInt32LE(object) + method), r = {...runtime, moduleBaseAddress, numericalContext, nativeTls,
      services: source?.services, sehWord: nativeTls?.sehWord ?? source?.sehWord};
    const stackOffsets = method === 0x20 ? (memory.readUInt32LE(object + 0x964) ? [-12, -8, -4, 0, 4] : [-4, 0, 4]) : count ? [0, 4] : [0];
    const event = {object, method, target, caller, site, entryEsp: expectedEsp, returnAddress: expectedReturn, entryRegisters: {...meta.entryRegisters},
      inputWords: Array.from({length: count}, (_, i) => memory.readUInt32LE(expectedEsp + 4 + i * 4))};
    let result;
    if (method === 0x14 && target === actual(0x4ad6a0)) {setGameAudioSampleGain(object, {bits: event.inputWords[0]}, r); compare(`control-audio-gain-${object.toString(16)}`, object + 0x8d0, 4, '4ad6a0 original gain setter, called from retained271/705.');}
    else if (method === 0x20 && target === actual(0x4ad5f0)) {setGameAudioSampleFrameOffset(object, args[0], r); compare(`control-audio-offset-${object.toString(16)}`, object + 0x8d4, 4, '4ad5f0 ->4ad650 original frame/offset setters; retained271/707 and actual incoming ESI.');}
    else if (method === 0x34 && target === actual(0x4ad5b0)) {clearGameAudioSamplePending(object, r); compare(`control-audio-pending-${object.toString(16)}`, object + 0x94c, 4, '4ad5b0 original deferred-state clear.');}
    else if (method === 0x38 && target === actual(0x4ad580)) result = queryGameAudioSampleActivity(object, args[0], r);
    else if (method === 0x50 && target === actual(0x4ae4a0)) result = hasAudioSourceEffect(object, r);
    else if (method === 0x58 && target === actual(0x4ae350)) {
      result = memory.readUInt32LE(object + 0x9a0); //Original4ae350: MOV EAX,[ECX+9a0]; RET.
      if (result) compare(`control-audio-effect-${result.toString(16)}`, result + 8, 12, '40e6ea/40e6f5/40e6fa original effect amount/duration stores.');
    } else fail('Unimplemented reached original source virtual target.', {method, caller, site, target});
    event.outputStack = stackOffsets.map(offset => ({address: expectedEsp + offset, value: memory.readUInt32LE(expectedEsp + offset)}));
    event.result = result; events.push(event); return result;
  };
  const unbound = name => request => fail(`Native485300 reached unbound ${name}; no observed sound output or null replacement is supplied.`, {nativeCaller: request?.nativeCaller});
  return {handlers: {sourceCall, call484bb0: unbound('484bb0/40ea40 creation/play continuation'), call484cb0: unbound('484cb0 start continuation'), dispatch40ea40: unbound('40ea40 continuation')},
    comparisonRegions, events,
    limits: ['Exact retained source-control caller frames only; complete485300 private CPU/stack modeling is not claimed.', 'Reached creation/play, reverb installation and native haptic caller frames remain explicit dependencies.']};
}

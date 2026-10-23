import {createHash} from 'node:crypto';
import {createCapturedMemory} from './captured-memory.mjs';
import {bindCapturedNativeThreadEnvironment} from './native-frame-sound.mjs';
import {decodePhysicsNumericalContext} from '../../src/race-clock.mjs';
import {updateAudioSourceParameters} from '../../src/audio-source-parameters.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => {throw Error(`Worker gain entry replay: ${message}.`);};
const number = (value, name) => {
  const n = Number(value);
  if ((typeof value !== 'number' && (typeof value !== 'string' || !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value))) || !Number.isInteger(n) || n < 0 || n > 0xffffffff) fail(`invalid ${name}`);
  return n;
};
export class NativeWorkerGainReplayBoundary extends Error {
  constructor(details) {super(`Unbound original worker external service ${details.name}.`); this.details = details;}
}

//No native after snapshot or observed service-result input is accepted here.
//This helper deliberately stops rather than inventing an OS/COM/CRT answer.
export function replayNativeWorkerGainEntry(before, options = {}) {
  if (!options || typeof options !== 'object' || Object.keys(options).some(name => name !== 'moduleBaseAddress')) fail('only an explicit module base is accepted; no after state or injected services');
  let {moduleBaseAddress} = options;
  if (before?.breakpointId !== 'worker-gain-entry' || before.ownedWorkerGainPair?.role !== 'entry' || before.ownedWorkerGainPair.beforeOriginalInstruction !== true) fail('requires the actual pre-prologue entry, not a lookup or exit snapshot');
  const rows = before.ranges instanceof Map ? [...before.ranges.values()] : before.ranges;
  if (!Array.isArray(rows) || !rows.length || new Set(rows.map(r => r.id)).size !== rows.length) fail('missing or duplicate original entry ranges');
  const bases = new Set([moduleBaseAddress, before.moduleBaseAddress, ...rows.map(r => r.moduleBaseAddress)].filter(v => v !== undefined && v !== null).map(v => number(v, 'module base')));
  if (bases.size !== 1 || ![...bases][0]) fail('requires one original module base');
  moduleBaseAddress = [...bases][0];
  const actual = p => moduleBaseAddress + p - 0x400000;
  if (!Buffer.isBuffer(before.context) || before.context.length !== 716 || sha(before.context) !== before.contextSha256) fail('raw context hash differs');
  for (const row of rows) if (!Buffer.isBuffer(row.bytes) || sha(row.bytes) !== row.sha256) fail(`original entry blob hash differs: ${row.id}`);
  const registers = {};
  for (const [name, offset] of Object.entries({edi: 156, esi: 160, ebx: 164, edx: 168, ecx: 172, eax: 176, ebp: 180, eip: 184, esp: 196})) {
    registers[name] = number(before.registers[name], name);
    if (before.context.readUInt32LE(offset) !== registers[name]) fail(`raw ${name} differs`);
  }
  const cw = number(before.registers.fpuControlWord, 'CW'), mxcsr = number(before.registers.mxcsr, 'MXCSR');
  if ((before.context.readUInt32LE(28) & 65535) !== cw || before.context.readUInt32LE(228) !== mxcsr) fail('raw numerical context differs');
  const numericalContext = decodePhysicsNumericalContext({x87ControlWord: cw, mxcsr});
  if (numericalContext.x87.precisionBits !== 53 || numericalContext.x87.roundingMode !== 'nearest-even' || numericalContext.x87.exceptionMask !== 63 || numericalContext.sse.roundingMode !== 'nearest-even' || numericalContext.sse.exceptionMask !== 63 || numericalContext.sse.flushToZero || numericalContext.sse.denormalsAreZero) fail('unsupported actual worker numerical mode; PC24 is not substituted');
  const input = createCapturedMemory(rows), {memory, span} = input, S = registers.esp, proof = before.ownedWorkerGainPair;
  const expectedRange = (id, address, length) => {
    const row = rows.find(r => r.id === id);
    if (!row || number(row.address, `${id} address`) !== address || row.bytes.length !== length) fail(`${id} extent differs`);
    return span(address, length);
  };
  const args = expectedRange('worker-gain-arguments', S, 12), returned = args.readUInt32LE(), source = args.readUInt32LE(4), force = args.readUInt32LE(8), manager = registers.ecx;
  expectedRange('worker-gain-stack', S - 432, 444); expectedRange('worker-gain-source', source, 0x9a8);
  const caller = force === 0 ? 0x4a722c : force === 1 ? 0x4a72f6 : null;
  if (registers.eip !== actual(0x4b12d0) || !caller || returned !== actual(caller) || registers.esi !== source || number(proof.entryEsp, 'bound ESP') !== S || number(proof.source, 'bound source') !== source || number(proof.manager, 'bound manager') !== manager || number(proof.returnAddress, 'bound caller') !== returned || proof.force !== force || proof.tid !== before.tid || proof.expectedTid !== before.tid) fail('entry source/caller/force/thread binding differs');
  if (memory.readUInt32LE(actual(0x714b08)) !== manager || memory.readUInt32LE(memory.readUInt32LE(manager) + 0x60) !== actual(0x4b12d0) || memory.readUInt32LE(source) !== actual(0x5d3f60)) fail('actual manager/source method identities differ');
  if (!before.threadEnvironment) fail('actual worker thread environment is missing');
  const thread = bindCapturedNativeThreadEnvironment(before, {memory});
  const inputs = rows.map(r => ({id: r.id, address: number(r.address, 'range address'), length: r.bytes.length, sha256: r.sha256}));
  const sourceBefore = Buffer.from(span(source, 0x9a8)), managerBefore = Buffer.from(span(manager, 0xd74));
  const stackBefore = Buffer.from(span(S - 432, 444)), externalRequests = [];
  const stopExternal = (kind, name, values, runtime) => {
    const top = runtime.scratchBase, words = [memory.readUInt32LE(top), ...values.map((_, i) => memory.readUInt32LE(top + 4 + i * 4))];
    if (kind !== 'Win32' || name !== 'EnterCriticalSection' || externalRequests.length || top !== S - 0x194 || words[0] !== actual(0x4a7a05) || values.length !== 1 || values[0] !== manager + 0x854 || words[1] !== values[0]) fail('first external boundary differs from genuine4a79ff ABI');
    const details = {kind, name, preferredCallAddress: 0x4a79ff, preferredReturnAddress: 0x4a7a05,
      entryEsp: top, returnAddress: words[0], args: values, argumentWords: words.slice(1),
      criticalSectionAddress: manager + 0x854, preCallWin32BytesHex: span(manager + 0x854, 24).toString('hex'),
      preCallGameWrapperBytesHex: span(manager + 0x854 + 24, 8).toString('hex'),
      outcomeApplied: false, missing: 'Actual owned worker EnterCriticalSection call/return context and Win32-only memory outcome; concurrent producer effects remain separate.'};
    externalRequests.push(details); throw new NativeWorkerGainReplayBoundary(details);
  };
  const runtime = {memory, moduleBaseAddress, scratchBase: S, numericalContext, nativeTls: thread.nativeTls,
    sehWord: thread.nativeTls?.sehWord, roundingMode: numericalContext.x87.roundingMode, x87PrecisionBits: numericalContext.x87.precisionBits,
    entryRegisters: Object.fromEntries(Object.entries(registers).map(([name, value]) => [name.toUpperCase(), value])),
    services: {platformCall: (name, values, r) => stopExternal('Win32', name, values, r)}};
  let boundary = null, failure = null, complete = false;
  try {updateAudioSourceParameters(manager, source, force, runtime); complete = true;}
  catch (error) {if (error instanceof NativeWorkerGainReplayBoundary) boundary = error.details; else failure = error.stack ?? String(error);}
  const changed = (address, original) => {const current = span(address, original.length); return original.reduce((n, v, i) => n + Number(v !== current[i]), 0);};
  const report = {schemaVersion: 1, method: 'genuine-worker-gain-source-entry-to-first-unbound-service', originalEntryOrdinal: before.ordinal,
    originalEntryTid: before.tid, moduleBaseAddress, inputContextSha256: before.contextSha256,
    input: {entryEsp: S, returnAddress: returned, manager, source, force, registers, numericalContext, regions: inputs},
    sourceReplayComplete: complete, wholeGainCallMatched: false, fullPrivateAbiMatched: false, fullWorkerInterleavingProved: false,
    reachedGenuineMixerLookup: boundary !== null, externalRequests, externalOutcomesApplied: 0, boundary, failure,
    partialChanges: {sourceBytes: changed(source, sourceBefore), managerBytes: changed(manager, managerBefore), stackBytes: changed(S - 432, stackBefore)},
    limits: ['Source executes4b12d0 and genuine4a79f0 from actual entry only; there is no after-snapshot/service-outcome option.',
      'No source or manager output equality is claimed at an unbound service; partial private writes are diagnostic only.',
      'Never reuse main-thread lock outcomes, seed native mixer getter answers, or classify concurrent wrapper/manager writes as OS outcomes.',
      'Actual mixer/voice/waveform/decoder and later COM/CRT service inputs remain required when reached.']};
  return {...input, runtime, report};
}

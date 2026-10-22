import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {emitNativeEffect} from '../src/effect-emitter.mjs';
import {dispatchNativeSound, configureSoundPlayback} from '../src/sound-dispatch.mjs';

const names = ['149-event-emitter-assembly.json', '151-effect-dispatch-assembly.json',
  '153-sound-channel-selection-assembly.json', '155-sound-playback-setup-assembly.json',
  '158-sound-channel-position-assembly.json', '160-sound-reverb-parameters-assembly.json',
  '162-sound-descriptor-copy-assembly.json'];
const {evidence, instructions} = await readInstructionEvidence(names, {directory: 'analysis/native-simulation/results'});
const byteEvidence = await Promise.all(['156-sound-volume-scale.json', '163-sound-reverb-constants.json', '164-sound-position-constants.json'].map(async name => {
  const reply = JSON.parse(await readFile(`analysis/native-simulation/results/${name}`, 'utf8'));
  return reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);
}));
const machine = new BoundedX86(instructions, {entry: 0x484bb0});
let seed = 0x484bb0ab;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const randomSigned = () => random(0xffffffff) | 0;
const BANK = 0x1000, SOUND = 0x10000, VECTOR = 0x20000, CHANNELS = 0x30000, NEW = 0x3f000;
const SOURCES = 0x40000, VTABLE = 0x50000, DEVICE = 0x59000, DEVICE_VTABLE = 0x59100;
const CALLABLE = 0x5a000, CALLABLE_VTABLE = 0x5a100, CLONE = 0x5b000, POSITION = 0x70000, VELOCITY = 0x70100, ALT = 0x70200, EFFECTS = 0x78000;
const METHOD_BASE = 0x61000, NEW_EXTERNAL = 0x62000, COPY_EXTERNAL = 0x62004, CREATE_EXTERNAL = 0x62008, CLONE_EXTERNAL = 0x6200c;
const methods = [4, 8, 12, 0x14, 0x20, 0x2c, 0x38, 0x3c, 0x48, 0x50, 0x54, 0x58, 0x5c];
let instructionSteps = 0, invalid = 0, created = 0, reused = 0, positional = 0, reverbInstalls = 0, capped = 0, failedAllocations = 0, cloneCalls = 0;
const fixtures = 3000, adapterFixtures = 2400;
for (let fixture = 0; fixture < fixtures; fixture++) {
  const directSetup = fixture >= adapterFixtures;
  machine.reset(); machine.fs0 = 0x12345678; const bytes = machine.bytes;
  bytes.fill(0xa5, 0x8000, 0x9000); bytes.writeUInt32LE(0x12345678, 0);
  byteEvidence.forEach(item => Buffer.from(item.normalized_result.bytes_hex, 'hex').copy(bytes, Number(item.normalized_result.address)));
  bytes.writeFloatLE(fixture % 2 ? -(2 ** -20) : 2 ** -20, 0x5ecdb4);
  bytes.writeFloatLE(fixture % 2 ? -(30 * 2 ** -20) : 30 * 2 ** -20, 0x5ecdb0);
  bytes.writeUInt32LE(0x36d4c921, 0x5e8890); bytes.writeInt32LE(fixture % 5 ? 1 : 0, 0x6e6bd4);
  bytes.writeUInt32LE(BANK, 0x6f2414); bytes.writeUInt32LE(BANK + 64 * 4, 0x6f2418);
  bytes.fill(0, BANK, BANK + 64 * 4);
  const code = [-1, 0, 1, 2, 22, 43, 63, 64, -2147483648, 43, 43, 43][fixture % 12];
  if (code >= 0 && code < 64 && fixture % 37) bytes.writeUInt32LE(SOUND, BANK + code * 4);
  bytes.fill(0x69, SOUND, SOUND + 0x490);
  bytes.fill(0x97, VECTOR, VECTOR + 16 * 4);
  const count = fixture % 19 === 0 ? 16 : fixture % 5 === 0 ? 1 + random(4) : random(6);
  const roundRobin = fixture % 5 === 0;
  bytes.writeUInt32LE(VECTOR, SOUND + 4); bytes.writeUInt32LE(VECTOR + count * 4, SOUND + 8); bytes.writeUInt32LE(VECTOR + 16 * 4, SOUND + 12);
  bytes.writeInt32LE(roundRobin ? count : 0, SOUND + 0x488); bytes.writeInt32LE(roundRobin ? random(count) : 0, SOUND + 0x48c);
  const callableMode = fixture % 3;
  bytes.writeUInt32LE(callableMode === 0 ? 0 : callableMode === 1 ? SOUND + 0x470 : CALLABLE, SOUND + 0x480);
  bytes.writeUInt32LE(CALLABLE_VTABLE, SOUND + 0x470); bytes.writeUInt32LE(CALLABLE_VTABLE, CALLABLE);
  bytes.writeUInt32LE(CLONE_EXTERNAL, CALLABLE_VTABLE);
  bytes.writeUInt32LE(DEVICE, 0x714b08); bytes.writeUInt32LE(DEVICE_VTABLE, DEVICE); bytes.writeUInt32LE(CREATE_EXTERNAL, DEVICE_VTABLE + 0x14);
  bytes.writeUInt32LE(NEW_EXTERNAL, 0x56e220); bytes.writeUInt32LE(COPY_EXTERNAL, 0x56e21c);
  for (const method of methods) bytes.writeUInt32LE(METHOD_BASE + method, VTABLE + method);
  for (let index = 0; index < 17; index++) {
    const channel = index === 16 ? NEW : CHANNELS + index * 16, source = SOURCES + index * 0x100;
    bytes.fill(0x5a, channel, channel + 16); bytes.writeUInt32LE(source, channel);
    bytes.writeUInt32LE(VTABLE, source); bytes.fill(0x33, EFFECTS + index * 32, EFFECTS + (index + 1) * 32);
    if (index < count) bytes.writeUInt32LE(channel, VECTOR + index * 4);
  }
  for (const pointer of [POSITION, VELOCITY, ALT]) for (let axis = 0; axis < 3; axis++) bytes.writeInt32LE(fixture % 7 ? randomSigned() : axis - 1, pointer + axis * 4);
  bytes.write('Rollcage reverb\0', 0x5d0388, 'ascii');
  const registerEdx = fixture % 3 ? POSITION : 0;
  const args = [fixture % 4 ? VELOCITY : 0, [-1, -2, 0, 1536, 0x3fff, 0x7fffffff, -2147483648][fixture % 7],
    fixture % 3 ? randomSigned() : 9000, [0, 6, 9, -1][fixture % 4], randomSigned(), fixture % 2, fixture % 4 ? 1 : 0];
  const sourceMemory = Buffer.from(bytes), sourceLog = [], nativeLog = [];
  let sourceParameters;
  const stateFor = (memory, log, parameters) => {
    const statuses = new Map();
    const record = (...items) => log.push(items);
    const sourceCall = (source, method, values) => {
      const index = (source - SOURCES) / 0x100;
      const channel = index === 16 ? NEW : CHANNELS + index * 16;
      if (method === 8 || method === 12) {
        record('source', source, method, values[0].toString('hex'));
        if (method === 8 && fixture % 11 === 0) memory.writeUInt32LE(ALT, channel + 8);
      } else if (method === 0x54) {
        const buffer = values[1], end = buffer.indexOf(0);
        record('source', source, method, values[0], buffer.toString('ascii', 0, end < 0 ? 24 : end), buffer.subarray(24).toString('hex'));
      } else if (method === 0x5c) record('source', source, method, values[0]);
      else record('source', source, method, ...values);
      if (method === 0x38) return fixture % 4 === 0 ? 0 : fixture % 4 === 1 ? 1 : 2;
      if (method === 0x3c || method === 0x48) return fixture % 4 === 1 ? 0 : 1;
      if (method === 0x50) {
        const step = statuses.get(source) ?? 0; statuses.set(source, step + 1);
        const mode = parameters().readInt32LE(12);
        return (mode === 0 ? [1, 0, 1] : [0, 1])[step] ?? 1;
      }
      if (method === 0x58) return EFFECTS + index * 32;
      if (method === 0x14 && fixture % 13 === 0) {parameters().writeInt32LE(-1, 4); parameters().writeInt32LE(0, 12);}
      return 0;
    };
    const allocate = size => {record('allocate', size); return fixture % 23 === 0 ? 0 : NEW;};
    const cloneCallable = (callable, inPlace) => {record('clone', callable, inPlace); return CLONE;};
    const createSource = (device, name, callable) => {record('create', device, name, callable); return SOURCES + 16 * 0x100;};
    const appendChannel = (vectorAddress, channel) => {
      record('append', vectorAddress, channel);
      const end = memory.readUInt32LE(vectorAddress + 4); memory.writeUInt32LE(channel, end); memory.writeUInt32LE(end + 4, vectorAddress + 4);
    };
    return {sourceCall, allocate, cloneCallable, createSource, appendChannel};
  };
  const sourceHandlers = stateFor(sourceMemory, sourceLog, () => sourceParameters);
  const runtime = {memory: sourceMemory, handlers: sourceHandlers, reverbScratch: Buffer.alloc(76, 0xa5)};
  const setupChannel = [CHANNELS, 0, 0x100, CHANNELS][fixture % 4], setupMode = fixture % 3, setupFirst = fixture % 2;
  let expectedReturn;
  if (directSetup) {
    sourceParameters = Buffer.alloc(16); sourceParameters.writeInt32LE(setupMode, 12);
    sourceParameters.copy(bytes, 0x71000);
    if (fixture % 7 === 0) {bytes.writeUInt32LE(0, CHANNELS); sourceMemory.writeUInt32LE(0, CHANNELS);}
    expectedReturn = configureSoundPlayback(setupChannel, setupMode, setupFirst, runtime);
  } else expectedReturn = emitNativeEffect(code, registerEdx, args, {dispatch40ea40: request => {
    sourceParameters = request.parameters; return dispatchNativeSound(request, runtime);
  }});
  const nativeParameters = () => bytes.subarray(directSetup ? 0x71000 : 0x8fe0, directSetup ? 0x71010 : 0x8ff0);
  const nativeHandlers = stateFor(bytes, nativeLog, nativeParameters);
  for (const method of methods) machine.externalCalls.set(METHOD_BASE + method, m => {
    const source = m.r.ECX >>> 0, stack = m.r.ESP;
    let values = [], cleanup = 0;
    if ([4, 0x20, 0x2c, 0x38].includes(method)) {values = [bytes.readInt32LE(stack)]; cleanup = 4;}
    else if (method === 0x14) {values = [bytes.readFloatLE(stack)]; cleanup = 4;}
    else if (method === 8 || method === 12) {const pointer = bytes.readUInt32LE(stack); values = [Buffer.from(bytes.subarray(pointer, pointer + 16))]; cleanup = 4;}
    else if (method === 0x54) {const pointer = bytes.readUInt32LE(stack + 4); values = [bytes.readInt32LE(stack), Buffer.from(bytes.subarray(pointer, pointer + 76))]; cleanup = 8;}
    else if (method === 0x5c) {values = [{vtable: bytes.readUInt32LE(stack), channelAddress: bytes.readUInt32LE(stack + 4)}]; cleanup = 24;}
    m.r.EAX = nativeHandlers.sourceCall(source, method, values) | 0; m.r.ESP += cleanup;
  });
  machine.externalCalls.set(NEW_EXTERNAL, m => {m.r.EAX = nativeHandlers.allocate(bytes.readInt32LE(m.r.ESP));});
  machine.externalCalls.set(CLONE_EXTERNAL, m => {m.r.EAX = nativeHandlers.cloneCallable(m.r.ECX >>> 0, bytes.readUInt32LE(m.r.ESP) !== 0); m.r.ESP += 4;});
  machine.externalCalls.set(CREATE_EXTERNAL, m => {
    m.r.EAX = nativeHandlers.createSource(m.r.ECX >>> 0, bytes.readUInt32LE(m.r.ESP), bytes.readUInt32LE(m.r.ESP + 4 + 16)); m.r.ESP += 28;
  });
  machine.externalCalls.set(0x40ebc0, m => {nativeHandlers.appendChannel(m.r.ECX >>> 0, bytes.readUInt32LE(bytes.readUInt32LE(m.r.ESP))); m.r.ESP += 4;});
  machine.externalCalls.set(0x405e30, m => {
    const from = bytes.readUInt32LE(m.r.ESP); let count = 0; while (count < 23 && bytes[from + count]) count++;
    bytes.copy(bytes, m.r.ECX, from, from + count + 1); m.r.EAX = m.r.ECX; m.r.ESP += 4;
  });
  machine.externalCalls.set(COPY_EXTERNAL, m => {
    const destination = bytes.readUInt32LE(m.r.ESP), size = bytes.readUInt32LE(m.r.ESP + 4), from = bytes.readUInt32LE(m.r.ESP + 8), limit = bytes.readUInt32LE(m.r.ESP + 12);
    let count = 0; while (count < Math.min(limit, size - 1) && bytes[from + count]) count++;
    bytes.copy(bytes, destination, from, from + count); bytes[destination + count] = 0; m.r.EAX = 0;
  });
  machine.externalCalls.set(0x568162, () => {});
  machine.entry = directSetup ? 0x40e5e0 : 0x484bb0; machine.r.ECX = directSetup ? setupChannel : code; machine.r.EDX = directSetup ? setupMode : registerEdx; machine.r.ESP = 0x9000;
  bytes.writeUInt32LE(0xffffffff, 0x9000);
  if (directSetup) bytes.writeInt32LE(setupFirst, 0x9004);
  else args.forEach((value, index) => bytes.writeInt32LE(value | 0, 0x9004 + index * 4));
  instructionSteps += machine.run();
  try {
    assert.equal(machine.r.EAX, expectedReturn, `return ${fixture}`); assert.deepEqual(nativeLog, sourceLog, `services ${fixture}`);
    assert.deepEqual(bytes.subarray(SOUND, SOUND + 0x490), sourceMemory.subarray(SOUND, SOUND + 0x490), `sound record ${fixture}`);
    assert.deepEqual(bytes.subarray(VECTOR, VECTOR + 64), sourceMemory.subarray(VECTOR, VECTOR + 64), `channel pointers ${fixture}`);
    assert.deepEqual(bytes.subarray(CHANNELS, CHANNELS + 16 * 16), sourceMemory.subarray(CHANNELS, CHANNELS + 16 * 16), `retained channels ${fixture}`);
    assert.deepEqual(bytes.subarray(NEW, NEW + 16), sourceMemory.subarray(NEW, NEW + 16), `allocated channel ${fixture}`);
    assert.deepEqual(bytes.subarray(EFFECTS, EFFECTS + 17 * 32), sourceMemory.subarray(EFFECTS, EFFECTS + 17 * 32), `effect state ${fixture}`);
    assert.equal(machine.fs0, 0x12345678, 'restored explicit TLS exception chain');
    assert.equal(bytes.readUInt32LE(0), sourceMemory.readUInt32LE(0), 'ordinary address zero remains unchanged');
    if (sourceParameters) assert.deepEqual(nativeParameters(), sourceParameters, `mutable parameter block ${fixture}`);
  } catch (error) {console.error(JSON.stringify({fixture, code, registerEdx, args, count, roundRobin, nativeLog, sourceLog})); throw error;}
  if (!directSetup && !nativeLog.length) invalid++;
  if (nativeLog.some(item => item[0] === 'create')) created++;
  if (nativeLog.filter(item => item[0] === 'source' && item[2] === 4).length === 2) reused++;
  if (nativeLog.some(item => item[0] === 'source' && item[2] === 8)) positional++;
  reverbInstalls += nativeLog.filter(item => item[0] === 'source' && item[2] === 0x54).length;
  if (count === 16 && !nativeLog.some(item => item[0] === 'allocate') && expectedReturn === 127) capped++;
  if (nativeLog.some(item => item[0] === 'allocate') && !nativeLog.some(item => item[0] === 'create')) failedAllocations++;
  cloneCalls += nativeLog.filter(item => item[0] === 'clone').length;
}
const report = {method: 'Complete retained484bb0 adapter,40ea40 sound dispatcher,40db20 channel selection,40d6d0 positional arithmetic,40e5e0 reverb setup,40ce20 descriptor constants and40eb10 callable-copy adapter. libaudio virtual methods, operator new, vector append, valid-domain CRT string/name construction and callable virtual clone are explicit service fixtures; cookie check inert. Compares complete sound/channel/vector/effect bytes, restored exception chain, mutable16-byte parameter block, return and service arguments/order including float32 vectors/volume. No audio device or original executable execution. Uninitialized std::function padding and string-name tail are outside service semantics; live callable pointer/captured channel/name/descriptor fields are checked.',
  evidence: [...evidence, ...byteEvidence].map(item => item.evidence_id), instructions: instructions.length, fixtures, adapterFixtures, standalonePlaybackFixtures: fixtures - adapterFixtures,
  invalid, created, reused, positional, reverbInstalls, capped, failedAllocations, cloneCalls, instructionSteps, matched: true};
await writeFile('analysis/effect-emitter-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createModelContactEffectFixture} from './lib/model-contact-effect-fixtures.mjs';
import {updatePlacedModelContactEffects, applyPlacedModelEffectDamage} from '../src/placed-model-effect-update.mjs';

const put = (m, p, value) => m.writeInt32LE(value | 0, p), word = (m, p, value) => m.writeUInt16LE(value & 65535, p);
export const placedModelEffectAddresses = {stack: 0x9000, rows: 0x920800, segments: 0x500000, segment: 0x501000, regions: 0x502000, vertices: 0x503000, palette: 0x510000, pulse: 0x520000, bank: 0x600000, sounds: 0x610000, channels: 0x630000, sources: 0x640000, vtable: 0x650000, effects: 0x660000, vectors: 0x670000};
const methods = [4, 8, 12, 0x14, 0x20, 0x2c, 0x38, 0x3c, 0x48, 0x50, 0x54, 0x58, 0x5c], SERVICE = 0x750000;

//Explicit constructed model/pool/terrain/audio runtime. No loader provenance.
export function createPlacedModelEffectFixture(program, fixture = 0) {
  const base = createModelContactEffectFixture(program, fixture), {memory: m} = base, a = placedModelEffectAddresses;
  m.fill(0x53, a.stack - 4096, a.stack + 64); m.fill(0x69, 0x91cd60, 0x91cd94); m.fill(0x6b, 0x8106e0, 0x810920); m.fill(0x67, a.pulse, a.pulse + 3 * 0xf14);
  put(m, 0x9153c0, a.pulse); for (let index = 0; index < 3; index++) put(m, a.pulse + index * 0xf14 + 12, index < fixture % 4 ? 1 : 0);
  put(m, 0x9153dc, fixture % 24); put(m, 0x9153e0, 0x0900bbdd); put(m, 0x810920, fixture % 18); put(m, 0x811180, fixture & 1); put(m, 0x80f210, fixture % 66);
  put(m, 0x909240, a.segments); put(m, a.segments, a.segment); put(m, a.segment + 8, 3); put(m, a.segment + 12, 24); put(m, a.segment + 32, a.vertices); put(m, 0x9092c0, a.regions); put(m, 0x90b980, a.palette);
  for (let index = 0; index < 8; index++) {word(m, a.regions + index * 6, 10); word(m, a.regions + index * 6 + 2, 0);}
  for (let index = 0; index < 3; index++) put(m, base.addresses.nodes + index * 12, 1 | 2 << 7 | 2 << 1);
  for (let index = 0; index < 100; index++) {word(m, a.vertices + index * 8, index % 4 * 4 - 8); word(m, a.vertices + index * 8 + 2, -6); put(m, a.vertices + index * 8 + 4, (index % 5 << 22) | ((Math.floor(index / 4) - 12) * 4 & 65535));}
  for (let index = 0; index < 1024; index++) put(m, a.palette + index * 4, index & 1 ? 0xffffff : 0x808080);
  put(m, 0x9207e4, fixture % 7);
  for (let index = 0; index < 6; index++) {
    const row = a.rows + index * 16;
    for (let lane = 0; lane < 3; lane++) word(m, row + lane * 2, [index * 3 - 8, -6, index * 2 - 8][lane]);
    m[row + 6] = index < fixture % 4 ? 255 : 0; m[row + 7] = [0, 1, 2, 255][Math.floor(fixture / 7 + index) % 4];
    m[row + 8] = [0, 1, 2, 4, 127, 128, 255][Math.floor(fixture / 3 + index) % 7]; m[row + 9] = fixture % 3 === 0 ? 1 : 0;
    put(m, row + 12, 0x250000 + index % 3 * 0x1000);
  }
  //Some selected calls deliberately exhaust the free lists; the actual
  //allocator's active-particle reuse remains part of the interpreted graph.
  if (fixture % 5 === 0) put(m, 0x902b8c, -1);
  put(m, 0x6f2414, fixture % 4 ? a.bank : 0); put(m, 0x6f2418, fixture % 4 ? a.bank + 64 * 4 : 0); put(m, 0x6e6bd4, fixture % 3 ? 1 : 0);
  m.writeFloatLE(2 ** -20, 0x5ecdb4); m.writeFloatLE(30 * 2 ** -20, 0x5ecdb0); m.write('Rollcage reverb\0', 0x5d0388, 'ascii');
  for (let code = 0; code < 64; code++) {
    const sound = a.sounds + code * 0x500, channel = a.channels + code * 16, source = a.sources + code * 0x100, vector = a.vectors + code * 16;
    put(m, a.bank + code * 4, sound); put(m, sound + 4, vector); put(m, sound + 8, vector + 4); put(m, vector, channel); put(m, sound + 0x488, 1); put(m, channel, source); put(m, source, a.vtable); put(m, source + 0x10000, a.vtable);
  }
  methods.forEach(method => put(m, a.vtable + method, SERVICE + method));
  put(m, 0x56e21c, SERVICE + 0x100);
  return {...base, fixture, scratchBase: a.stack, reverbScratch: Buffer.alloc(76, 0x53)};
}

function createSoundServices(context, log) {
  const {memory: m, fixture} = context, a = placedModelEffectAddresses, status = new Map(), queried = new Map();
  return {sourceCall(source, method, args) {
    const index = (source - a.sources >>> 8) & 63;
    log.push([source, method, args.map(value => Buffer.isBuffer(value) ? method === 0x54 ? [value.toString('ascii', 0, value.indexOf(0)), value.subarray(24).toString('hex')] : value.toString('hex') : value)]);
    if (method === 4 && fixture % 11 === 0) {put(m, a.channels + index * 16, a.sources + 0x10000 + index * 256); put(m, 0x9153d8, 0x0b123456); put(m, 0x9153e0, 0x0c654321); put(m, 0x811180, 1);}
    if (method === 0x50) {
      const calls = queried.get(source) ?? 0; queried.set(source, calls + 1);
      //A declared library availability transition reaches the game's actual
      //reverb installation branch, including its bounded CRT name copy.
      if (fixture % 13 === 0 && !status.has(source)) return calls === 0 ? 1 : 0;
      return status.get(source) ?? (fixture & 1);
    }
    if (method === 0x54) status.set(source, 1);
    if (method === 0x58) return a.effects + index * 64;
    return 0;
  }};
}

export async function verifyPlacedModelEffectUpdate({fixtures = 1800, ticks = 4, damageScenarios = 160, damageTicks = 6, output = 'analysis/placed-model-effect-update-linked-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), a = placedModelEffectAddresses;
  const own = await readInstructionEvidence(['2801-outer-contact-phase-assembly.json', '2804-pending-model-effect-activation-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const reached = new Set(), visits = {}, entries = new Set([0x413fc0, 0x414060, 0x4142a0, 0x435f20, 0x475a10, 0x436410, 0x437670, 0x437aa0, 0x484bb0, 0x40ea40, 0x40db20, 0x40d6d0, 0x40e5e0, 0x44ef90]);
  let steps = 0, cookies = 0, particleEmits = 0, debrisEmits = 0, terrainWrites = 0, sourceCalls = 0, reverbInstalls = 0;
  machine.onInstruction = address => {steps++; reached.add(address); if (entries.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; if (address === 0x435fc4) particleEmits++; if (address === 0x475a71) debrisEmits++; if (address === 0x437c9e) terrainWrites++;};
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)); cookies++;});
  machine.externalCalls.set(SERVICE + 0x100, m => {
    const destination = m.bytes.readUInt32LE(m.r.ESP), size = m.bytes.readUInt32LE(m.r.ESP + 4), source = m.bytes.readUInt32LE(m.r.ESP + 8), limit = m.bytes.readUInt32LE(m.r.ESP + 12);
    let count = 0; while (count < Math.min(limit, size - 1) && m.bytes[source + count]) count++;
    m.bytes.copy(m.bytes, destination, source, source + count); m.bytes[destination + count] = 0; m.r.EAX = 0;
  });
  let damageActivations = 0;
  for (let fixture = 0; fixture < fixtures + damageScenarios; fixture++) {
    const source = createPlacedModelEffectFixture(program, fixture), sourceLog = [], nativeLog = [], sourceServices = createSoundServices(source, sourceLog);
    const damageSequence = fixture >= fixtures;
    if (damageSequence) {
      put(source.memory, 0x9207e4, 6); put(source.memory, 0x91cd90, 1); put(source.memory, 0x91cd80, 0); put(source.memory, 0x91cd84, 0); put(source.memory, 0x91cd88, 0); put(source.memory, 0x91cd8c, 4);
      for (let index = 0; index < 6; index++) {const row = a.rows + index * 16; source.memory[row + 6] = index < 4 ? index + 1 : 255; source.memory[row + 7] = index & 3; source.memory[row + 8] = [0, 1, 3, 5, 127, 255][index];}
    }
    machine.reset(); machine.fs0 = 0; source.memory.copy(machine.bytes); const nativeServices = createSoundServices({...source, memory: machine.bytes}, nativeLog); // Explicit synthetic exception chain.
    for (const method of methods) machine.externalCalls.set(SERVICE + method, m => {
      const stack = m.r.ESP; let args = [], cleanup = 0;
      if ([4, 0x20, 0x2c, 0x38].includes(method)) {args = [m.bytes.readInt32LE(stack)]; cleanup = 4;}
      else if (method === 0x14) {args = [m.bytes.readFloatLE(stack)]; cleanup = 4;}
      else if (method === 8 || method === 12) {const pointer = m.bytes.readUInt32LE(stack); args = [Buffer.from(m.bytes.subarray(pointer, pointer + 16))]; cleanup = 4;}
      else if (method === 0x54) {const pointer = m.bytes.readUInt32LE(stack + 4); args = [m.bytes.readInt32LE(stack), Buffer.from(m.bytes.subarray(pointer, pointer + 76))]; cleanup = 8;}
      else if (method === 0x5c) {args = [{vtable: m.bytes.readUInt32LE(stack), channelAddress: m.bytes.readUInt32LE(stack + 4)}]; cleanup = 24;}
      m.r.EAX = nativeServices.sourceCall(m.r.ECX >>> 0, method, args); m.r.ESP += cleanup;
    });
    const compare = label => {const native = machine.bytes.subarray(0x10000), js = source.memory.subarray(0x10000); if (!native.equals(js)) {const offset = native.findIndex((value, index) => value !== js[index]); assert.fail(`${label}: byte 0x${(0x10000 + offset).toString(16)} native ${native[offset]} JS ${js[offset]}`);}};
    for (let tick = 0; tick < (damageSequence ? damageTicks : ticks); tick++) {
      try {
        if (damageSequence) {
          const before = Array.from({length: 6}, (_, index) => source.memory[a.rows + index * 16 + 6]);
          applyPlacedModelEffectDamage(source); machine.entry = 0x413fc0; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); machine.run(); compare(`damage ${fixture}/${tick}`);
          damageActivations += before.filter((value, index) => value > 0 && value < 128 && !source.memory[a.rows + index * 16 + 6]).length;
        }
        updatePlacedModelContactEffects({...source, soundRuntime: {...source, handlers: sourceServices}});
        machine.entry = 0x414060; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); machine.run(3_000_000); assert.equal(machine.fs0, 0, 'Thread exception chain restored');
        assert.deepEqual(nativeLog, sourceLog, `audio services ${fixture}/${tick}`);
        compare(`fixture ${fixture}/tick ${tick}`);
      } catch (error) {console.error({fixture, tick, nativeLog: nativeLog.slice(-4), sourceLog: sourceLog.slice(-4)}); throw error;}
    }
    sourceCalls += sourceLog.length; reverbInstalls += sourceLog.filter(call => call[1] === 0x54).length;
  }
  const report = {method: 'Complete 414060 global pending-model effect stage with actual class-two model break, attachment release, particles, debris, terrain brightness/ranges, flash queue, pulse claim and sound emitter/dispatcher/channel/reverb descendants. Multiple sequential calls share row timers, one-activation gate, arena/pools/RNG and effect memory. Additional actual 413fc0 damage -> 414060 activation sequences connect the same raw rows through the existing checked world-effect arithmetic. Original tables and explicit model/terrain/audio storage initialized; populated fixed channels include source-pointer/color mutations and actual reverb installation after a declared library availability transition. All mapped data bytes >=10000h and exact audio-service order/arguments compared. Only libaudio virtual services, bounded CRT name copying and compiler-cookie checks are admitted; no game mocks or original-process execution. Upstream row/model/pool/audio producers remain explicit.', targetSha256: program.sha256, evidence: own.evidence.map(value => value.evidence_id), ownInstructions: 158, damageInstructions: own.instructions.length - 158, fixtures, ticks, damageScenarios, damageTicks, damageActivations, parentCalls: fixtures * ticks + damageScenarios * damageTicks, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, particleEmits, debrisEmits, terrainWrites, sourceCalls, reverbInstalls, cookieChecks: cookies, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report, 'Existing report differs; use a new output.');}}
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyPlacedModelEffectUpdate()));

import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import * as pools from '../src/particle-pools.mjs';
import {advanceRawEffectParticles, advanceRawBodyDebris} from '../src/particle-lifetime.mjs';
import {emitRawEffectParticles, emitRawBodyDebris, initializeBodyRetirementEffectTables} from '../src/body-retirement-effects.mjs';

const owned = await readInstructionEvidence(['965-world-particle-pools-initialize-assembly.json', '967-world-particle-storage-initialize-assembly.json', '969-world-debris-storage-initialize-assembly.json', '1041-world-effects-4375f0-assembly.json', '1043-world-effects-4359f0-assembly.json', '1045-world-effects-437540-assembly.json', '1049-world-effect-curve-assembly.json', '943-world-effects-stage-b-assembly.json', '945-world-effect-4381c0-assembly.json', '947-world-effect-438790-assembly.json', '949-world-effect-4383d0-assembly.json', '951-world-effect-438280-assembly.json', '953-world-effect-4384b0-assembly.json', '955-world-effect-438330-assembly.json', '957-world-effect-435ec0-assembly.json', '663-retirement-4386b0-assembly.json', '118-particle-removal-assembly.json', '115-effect-allocation-assembly.json', '117-particle-registration-assembly.json', '655-retirement-435f20-assembly.json', '665-retirement-4286e0-assembly.json', '669-retirement-4746f0-assembly.json'], {directory: 'analysis/native-simulation/results'});
const debrisEvidence = await readInstructionEvidence(['1052-world-debris-pool-initialize-assembly.json', '659-retirement-475a10-assembly.json', '941-world-effects-stage-a-assembly.json', '959-world-effect-432a70-assembly.json', '961-world-color-long-multiply-assembly.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['211-sqrt-leading-zeros-assembly.json']);
const instructions = [...owned.instructions, ...math.instructions, ...debrisEvidence.instructions], machine = new BoundedX86(instructions), memory = Buffer.alloc(0xa00000), sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8'));
const switchEvidence = JSON.parse(await readFile('analysis/native-simulation/results/960-world-effect-update-switch.json', 'utf8')).structuredContent;
const serviceEvidence = await Promise.all(['1047-world-particle-count-convert-assembly.json', '1046-world-effect-initialize-float-constants.json', '1050-world-particle-count-scale.json'].map(async name => JSON.parse(await readFile(`analysis/native-simulation/results/${name}`, 'utf8')).structuredContent));
const sourceConstants = JSON.parse(await readFile('src/particle-pool-constants.json', 'utf8'));
for (const item of sourceConstants.constants) {const owner = serviceEvidence.find(e => e.operation === 'read_bytes' && item.address >= Number(e.normalized_result.address) && item.address + 4 <= Number(e.normalized_result.address) + e.normalized_result.returned_bytes); assert.ok(owner); const offset = item.address - Number(owner.normalized_result.address); assert.equal(item.bytesHex, owner.normalized_result.bytes_hex.slice(offset * 2, offset * 2 + 8));}
const entries = [0x4356a0, 0x4357c0, 0x435970, 0x4375f0, 0x4359f0, 0x437540, 0x432ee0, 0x4758d0], entryCounts = {}, fixtures = 2400, MALLOC = 0x5a000, STACK = 0x9000;
let instructionSteps = 0, conversions = 0, mallocCalls = 0, memsetCalls = 0, connectedSteps = 0, connectedCalls = 0;
const put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p);
//This is the declared ordinary CRT service, not a game routine replacement.
//Retained1047 invalid fallback returns signed64 min (lowEAXzero).
const convertCRT = value => !Number.isFinite(value) || value < -(2 ** 63) || value >= 2 ** 63 ? -(1n << 63n) : BigInt(Math.trunc(value));
const makeAllocator = log => {let next = 0; return size => {log.push(size); return 0x300000 + next++ * 0x20000;};};
let allocator;
machine.externalCalls.set(MALLOC, m => {m.r.EAX = allocator(m.bytes.readUInt32LE(m.r.ESP)); mallocCalls++;});
machine.externalCalls.set(0x568a50, m => {const p = m.bytes.readUInt32LE(m.r.ESP), value = m.bytes.readUInt32LE(m.r.ESP + 4), size = m.bytes.readUInt32LE(m.r.ESP + 8); assert.equal(value, 0); assert.ok([0x12db8, 0x2d3c, 0x3c00, 0x400].includes(size)); m.bytes.fill(0, p, p + size); m.r.EAX = p; memsetCalls++;});
machine.externalCalls.set(0x568a60, m => {const value = convertCRT(m.scalars.XMM0); m.r.EAX = Number(BigInt.asIntN(32, value)); m.r.EDX = Number(BigInt.asIntN(32, value >> 32n)); conversions++;});
const initialize = (quality, offset, extra) => {
  memory.fill(0); machine.reset(); memory.fill(0x69, 0xf0000, 0x3a0000); memory.fill(0x93, 0x9153c0, 0x91cd94); memory.fill(0x36, STACK - 0x400, STACK + 64); pools.initializeParticlePoolConstants(memory); initializeBodyRetirementEffectTables(memory);
  sqrt.values.forEach((value, index) => word(0x5eb290 + index * 2, value)); Buffer.from(switchEvidence.normalized_result.bytes_hex, 'hex').copy(memory, 0x438670);
  put(0x56e258, MALLOC); put(0x5ecefc, 0x30000); memory.writeFloatLE(quality, 0x30068); put(0x902eec, 0x100000); put(0x70dcf4, offset); put(0x90b990, 0x40000); word(0x4002e, 12); put(0x90b988, 0x50000); put(0x90b984, extra); put(0x90b980, 0x60000);
  for (let i = 0; i < 256 * 16; i++) memory[0x50000 + i] = i * 17 + 3 & 255;
};
const ranges = [[0xf0000, 0x2b0000], [0x30000, 0x40000], [0x9153c0, 0x79d4], [0x6e65b4, 24], [0x6fb950, 0x58], [0x91d45c, 8], [0x70dcf4, 4], [0x5eb500, 8], [0x90b984, 4], [0x902b7c, 20], [0x91d3b0, 0xa8]];
const compare = label => {for (const [address, length] of ranges) if (!machine.bytes.subarray(address, address + length).equals(memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, index) => value !== memory[address + index]); assert.fail(`${label}/0x${(address + offset).toString(16)} native${machine.bytes[address + offset]} JS${memory[address + offset]}`);}};
const execute = (entry, ecx = 0, edx = 0, args = []) => {machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = STACK; machine.bytes.writeUInt32LE(0xffffffff, STACK); args.forEach((value, index) => machine.bytes.writeInt32LE(value | 0, STACK + 4 + index * 4)); return machine.run(1000000);};
for (let fixture = 0; fixture < fixtures; fixture++) {
  const quality = [0.032, 0.5, 0.999, 1, 1.0125, 1.0375, 10, 11, 0, -0.1, NaN][Math.floor(fixture / entries.length) % 11], entry = entries[fixture % entries.length], roundingMode = ['nearest-even', 'toward-zero', 'down', 'up'][Math.floor(fixture / entries.length) % 4];
  initialize(quality, fixture % 128, [58, 59, 70, 96][Math.floor(fixture / entries.length) % 4]); const sourceLog = [], nativeLog = []; allocator = makeAllocator(nativeLog); memory.copy(machine.bytes); machine.fpuRounding = roundingMode;
  const context = {memory, allocate: makeAllocator(sourceLog), convertFloatToInt64: convertCRT, roundingMode}; let value;
  if (entry === 0x4356a0) pools.initializeRawParticlePools(context); else if (entry === 0x4357c0) pools.initializeRawParticleStorage(context); else if (entry === 0x435970) pools.initializeRawLargeEffectRecords(context); else if (entry === 0x4375f0) pools.initializeRawSmallEffectRecords(context); else if (entry === 0x4359f0) pools.initializeRawEffectRecordBanks(context); else if (entry === 0x437540) pools.initializeRawTerrainEffectRecords(context); else if (entry === 0x432ee0) value = pools.lookupRawEffectRoot(fixture * 128, context); else pools.initializeRawBodyDebrisPool(context);
  try {instructionSteps += execute(entry, fixture * 128); compare(`fixture${fixture}/${entry.toString(16)}`); assert.deepEqual(nativeLog, sourceLog); if (value !== undefined) assert.equal(machine.r.EAX >>> 0, value >>> 0);}
  catch (error) {console.error({fixture, entry: entry.toString(16), quality, roundingMode}); throw error;}
  entryCounts[entry.toString(16)] = (entryCounts[entry.toString(16)] ?? 0) + 1;
}
const connectedScenarios = 12, connectedFrames = 160;
for (let scenario = 0; scenario < connectedScenarios; scenario++) {
  initialize(0.032, 0, 96); const sourceLog = [], nativeLog = []; allocator = makeAllocator(nativeLog);
  put(0x909254, 0x80000); put(0x909278, 0x85000); for (let row = 0; row < 256; row++) {word(0x80000 + row * 16, 0xff00); word(0x80002 + row * 16, 255); put(0x8000c + row * 16, 0x83000);}
  put(0x5ec958, scenario * 32769 + 1); put(0x70000, 0); put(0x70004, 0); put(0x70008, 0); put(0x70100, 0x100000); put(0x70104, -0x80000); put(0x70108, 0x100000);
  memory.copy(machine.bytes); machine.fpuRounding = 'nearest-even'; const sourceAllocate = makeAllocator(sourceLog);
  pools.initializeRawParticlePools({memory, allocate: sourceAllocate, roundingMode: 'nearest-even'}); connectedSteps += execute(0x4356a0); connectedCalls++; compare(`connected${scenario}/init`);
  pools.initializeRawBodyDebrisPool({memory, allocate: sourceAllocate}); connectedSteps += execute(0x4758d0); connectedCalls++; compare(`connected${scenario}/init-debris`); assert.deepEqual(nativeLog, sourceLog);
  for (let frame = 0; frame < connectedFrames; frame++) {
    if (frame < 30 && frame % 6 === 0 || frame === 120 || frame === 130) {
      emitRawEffectParticles(0x70000, 0x70100, 64, 0x0700aaff, 4, {memory}); connectedSteps += execute(0x435f20, 0x70000, 0x70100, [64, 0x0700aaff, 4]); connectedCalls++;
      emitRawBodyDebris(0x70000, 0x70100, 1, {memory}); connectedSteps += execute(0x475a10, 0x70000, 0x70100, [1]); connectedCalls++;
    }
    advanceRawBodyDebris({memory}); connectedSteps += execute(0x475e50); connectedCalls++;
    advanceRawEffectParticles({memory}); connectedSteps += execute(0x438550); connectedCalls++; compare(`connected${scenario}/frame${frame}`);
    for (const [address, length] of [[0x80000, 0x6000], [0x5ec958, 4]]) assert.deepEqual(machine.bytes.subarray(address, address + length), memory.subarray(address, address + length));
    if (frame === 119) {assert.equal(memory.readUInt32LE(0x6e65c0), 0); assert.equal(memory.readUInt32LE(0x6e65c8), 0); assert.equal(memory.readUInt16LE(0x8500a), 0); assert.equal(memory.readUInt32LE(0x902b88), 0); assert.equal(memory.readInt32LE(0x902b8c), 511);}
  }
}
const report = {method: 'Actual4356a0 complete game-owned particle/effect pool constructor and five children plus432ee0 root/clz;4758d0 complete512-debris arena/free-active-ID constructor. Constructor→actual435f20/475a10 emission→438550/475e50 advancement/expiry→reclamation→later reuse connected sequences. Explicit ordinaryCRTmalloc/memset/568a60 float→signed64 services only; game quality allocation-before-clamp and explicitx87 rounding modes preserved. Full arena/effect/render-record/texture-copy/flag-alias/list/palette/quality/global scratch bytes and allocation size/order compared. Synthetic mapped/readable storage inclzero/negativecounts/NaN explicitCRTfallback,overlappingforward texture rows,unalignedarenaoffsets,originalfloatconstants independentlymatched toretainedbytes. No original process execution.', evidence: [...owned.evidence, ...math.evidence, ...debrisEvidence.evidence, ...serviceEvidence].map(item => item.evidence_id).concat(switchEvidence.evidence_id), instructions: instructions.length, fixtures, entryCounts, instructionSteps, mallocCalls, memsetCalls, conversions, connectedScenarios, connectedFrames, connectedSteps, connectedCalls, matched: true};
await writeFile('analysis/particle-pools-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

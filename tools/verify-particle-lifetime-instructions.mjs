import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import * as lifetime from '../src/particle-lifetime.mjs';
import {registerRawEffectSpatial, initializeBodyRetirementEffectTables, emitRawEffectParticles, emitRawBodyDebris} from '../src/body-retirement-effects.mjs';
const names = ['941-world-effects-stage-a-assembly.json', '943-world-effects-stage-b-assembly.json', '945-world-effect-4381c0-assembly.json', '947-world-effect-438790-assembly.json', '949-world-effect-4383d0-assembly.json', '951-world-effect-438280-assembly.json', '953-world-effect-4384b0-assembly.json', '955-world-effect-438330-assembly.json', '957-world-effect-435ec0-assembly.json', '959-world-effect-432a70-assembly.json', '961-world-color-long-multiply-assembly.json', '663-retirement-4386b0-assembly.json', '118-particle-removal-assembly.json', '115-effect-allocation-assembly.json', '117-particle-registration-assembly.json', '655-retirement-435f20-assembly.json', '665-retirement-4286e0-assembly.json', '669-retirement-4746f0-assembly.json'];
names.push('659-retirement-475a10-assembly.json');
const {instructions, evidence} = await readInstructionEvidence(names, {directory: 'analysis/native-simulation/results'}), machine = new BoundedX86(instructions), memory = Buffer.alloc(0xa00000);
const switchEvidence = JSON.parse(await readFile('analysis/native-simulation/results/960-world-effect-update-switch.json', 'utf8')).structuredContent;
const PARTICLES = 0x100000, DEBRIS = 0x110000, ROWS = 0x40000, INDICES = 0x43000, BUCKET = 0x45000, FREE = 0x46000, ACTIVE = 0x46100, POSITION = 0x47000, VELOCITY = 0x47100, STACK = 0x9000;
const entries = [0x438550, 0x475e50, 0x4381c0, 0x438790, 0x4383d0, 0x438280, 0x4384b0, 0x438330, 0x435ec0, 0x432a70], entryCounts = {}, fixtures = 10000;
let seed = 0x438550ab, instructionSteps = 0, freedParticles = 0, spatialRemovals = 0, freedDebris = 0, fadedDebris = 0, colorBlends = 0, constructorFixtures = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;}, put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p);
const lives = [0, 1, 2, 3, 4, 7, 8, 11, 12, 15, 16, 17, 31, 32, 33, 59, 60, 63, 64, 127, 32767, 32768, 65535];
machine.onInstruction = address => {if (address === 0x435ec0) freedParticles++; if (address === 0x4748d0) spatialRemovals++; if (address === 0x475f01) freedDebris++; if (address === 0x475ff5) fadedDebris++; if (address === 0x432a70) colorBlends++;};
const ranges = [[PARTICLES, 0x14000], [ROWS, 0x1000], [BUCKET, 32], [FREE, 0x200], [POSITION, 0x110], [0x6e65b4, 24], [0x902b7c, 20], [0x9153c4, 4], [0x91900c, 4], [0x91d3b0, 0xa8], [0x5ec958, 4]];
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); machine.reset(); initializeBodyRetirementEffectTables(memory); memory.fill(0x69, 0x91d3b0, 0x91d458); memory.fill(0x93, STACK - 0x400, STACK + 64); Buffer.from(switchEvidence.normalized_result.bytes_hex, 'hex').copy(memory, 0x438670);
  const entry = entries[fixture % entries.length], p = PARTICLES + (fixture % 8) * 256, particleCount = entry === 0x438550 ? Math.floor(fixture / 10) % 33 : 32;
  entryCounts[entry.toString(16)] = (entryCounts[entry.toString(16)] ?? 0) + 1;
  put(0x902eec, PARTICLES); put(0x9153c4, PARTICLES); put(0x91900c, PARTICLES + particleCount * 256); put(0x909254, ROWS); put(0x909278, BUCKET);
  for (let row = 0; row < 256; row++) {word(ROWS + row * 16, 0xff00); word(ROWS + row * 16 + 2, 255); put(ROWS + row * 16 + 12, INDICES);}
  put(0x5ec958, [0, 1, -1, 0x7fffffff, random(0x100000000)][fixture % 5]); put(0x5eb500, 256); put(0x5ec9b0, random(0x100000000));
  let previous = 0, head = 0;
  for (let index = 0; index < 32; index++) {
    const particle = PARTICLES + index * 256; memory.fill(0x69, particle, particle + 256);
    put(particle, [8, 23, 27, 28, 30, 34, 9, 0, -1][(index + Math.floor(fixture / 10)) % 9]); word(particle + 0xa2, [1, 4, 8, 16, 0x4000, 0, 0x8000][random(7)]); word(particle + 0x96, lives[(index + Math.floor(fixture / 10)) % lives.length]); memory[particle + 0x95] = [0, 127, 128, 252, 253, 255][random(6)];
    for (let axis = 0; axis < 3; axis++) {put(particle + 0x88 + axis * 4, random(0x100000000)); word(particle + 0x9c + axis * 2, random(65536));}
    memory[particle + 0x94] = index % 5 === 0 && particle !== p ? 0 : index % 3 + 1; put(particle + 4, 0); put(particle + 12, BUCKET);
    if (memory[particle + 0x94]) {put(particle + 0xac, previous); put(particle + 0xa8, 0); if (previous) put(previous + 0xa8, particle); else head = particle; previous = particle; registerRawEffectSpatial(particle, 0, 0, 0, {memory});}
    else {put(particle + 0xa8, 0); put(particle + 0xac, 0);}
  }
  put(0x6e65c0, head); put(0x6e65c8, previous); put(0x6e65b4, 0);
  if (entry === 0x438550 && fixture % 70 === 0 && particleCount >= 8) {
    //Creation/reuse through the real source allocator precedes the compared
    //native lifetime call; those constructors have their own instruction check.
    for (const offset of [0, 4, 8]) {put(POSITION + offset, 0); put(VELOCITY + offset, random(0x100000000));}
    emitRawEffectParticles(POSITION, VELOCITY, 8, 0x0700aaff, 4, {memory}); constructorFixtures++;
  }
  const debrisCount = Math.floor(fixture / 10) % 17; put(0x902b7c, FREE); put(0x902b80, ACTIVE); put(0x902b84, DEBRIS); put(0x902b88, debrisCount); put(0x902b8c, -1);
  for (let index = 0; index < 16; index++) {
    word(ACTIVE + index * 2, index); const d = DEBRIS + index * 128; memory.fill(0x93, d, d + 128); word(d + 8, lives[(index + Math.floor(fixture / 10)) % lives.length]);
    for (let axis = 0; axis < 3; axis++) {put(d + 0x4c + axis * 4, random(0x100000000)); put(d + 0x58 + axis * 4, random(0x100000000));}
    memory[d + 0x6c] = index % 2; put(d + 4, 0); put(d + 12, BUCKET); if (index < debrisCount && memory.readUInt16LE(d + 8) >= 3) registerRawEffectSpatial(d, 0, 0, 0, {memory});
  }
  const kind = [0, 1, 4, 8, 16, 0x4000, 0x8000, 65535][Math.floor(fixture / 10) % 8], life = (lives[Math.floor(fixture / 10) % lives.length] << 16) >> 16, mode = (fixture >>> 3) & 1;
  if (entry === 0x432a70) {word(0x91d404, random(65536)); for (let channel = 0; channel < 3; channel++) {word(0x91d408 + channel * 4, random(65536)); put(0x91d3b4 + channel * 4, random(0x100000000));}}
  memory.copy(machine.bytes); let ecx = p, edx = life, args = [];
  if (entry === 0x438550) lifetime.advanceRawEffectParticles({memory}); else if (entry === 0x475e50) lifetime.advanceRawBodyDebris({memory});
  else if (entry === 0x4381c0) lifetime.advanceRawType8Particle(p, life, {memory}); else if (entry === 0x438790) {lifetime.advanceRawEffectKind(p, kind, {memory}); edx = kind;}
  else if (entry === 0x4383d0) lifetime.advanceRawType23Particle(p, {memory}); else if (entry === 0x438280) {lifetime.advanceRawType27Particle(p, life, mode, {memory}); args = [mode];}
  else if (entry === 0x4384b0) lifetime.advanceRawType30Particle(p, {memory}); else if (entry === 0x438330) lifetime.advanceRawType34Particle(p, life, {memory});
  else if (entry === 0x435ec0) lifetime.freeRawEffectParticle(p, {memory}); else lifetime.blendRawEffectColor({memory});
  machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = STACK; machine.bytes.writeUInt32LE(0xffffffff, STACK); args.forEach((value, index) => machine.bytes.writeInt32LE(value, STACK + 4 + index * 4));
  try {instructionSteps += machine.run(1000000); for (const [address, length] of ranges) if (!machine.bytes.subarray(address, address + length).equals(memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, index) => value !== memory[address + index]); assert.fail(`fixture${fixture}/entry${entry.toString(16)}/0x${(address + offset).toString(16)} native${machine.bytes[address + offset]} JS${memory[address + offset]}`);}}
  catch (error) {console.error({fixture, entry: entry.toString(16), kind, life, mode, particleCount, debrisCount}); throw error;}
}
const connectedScenarios = 40, connectedFrames = 160; let connectedSteps = 0, connectedCalls = 0, connectedParticleEmits = 0, connectedDebrisEmits = 0;
const executeConnected = (entry, ecx = 0, edx = 0, args = []) => {machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = STACK; machine.bytes.writeUInt32LE(0xffffffff, STACK); args.forEach((value, index) => machine.bytes.writeInt32LE(value | 0, STACK + 4 + index * 4)); connectedSteps += machine.run(1000000); connectedCalls++;};
const compareConnected = (scenario, frame, label) => {for (const [address, length] of ranges) assert.deepEqual(machine.bytes.subarray(address, address + length), memory.subarray(address, address + length), `connected${scenario}/frame${frame}/${label}/0x${address.toString(16)}`);};
for (let scenario = 0; scenario < connectedScenarios; scenario++) {
  memory.fill(0); machine.reset(); initializeBodyRetirementEffectTables(memory); Buffer.from(switchEvidence.normalized_result.bytes_hex, 'hex').copy(memory, 0x438670);
  put(0x902eec, PARTICLES); put(0x9153c4, PARTICLES); put(0x91900c, PARTICLES + 16 * 256); put(0x6e65b4, PARTICLES); put(0x909254, ROWS); put(0x909278, BUCKET);
  for (let row = 0; row < 256; row++) {word(ROWS + row * 16, 0xff00); word(ROWS + row * 16 + 2, 255); put(ROWS + row * 16 + 12, INDICES);}
  for (let index = 0; index < 16; index++) put(PARTICLES + index * 256 + 0xac, index < 15 ? PARTICLES + (index + 1) * 256 : 0);
  put(0x902b7c, FREE); put(0x902b80, ACTIVE); put(0x902b84, DEBRIS); put(0x902b8c, 31); for (let index = 0; index < 32; index++) word(FREE + index * 2, index);
  put(0x5ec958, scenario * 65537 + 1); put(0x5eb500, scenario % 2 ? 128 : 256); put(0x5ec9b0, 0xab000000);
  for (let axis = 0; axis < 3; axis++) {put(POSITION + axis * 4, scenario * 65536); put(VELOCITY + axis * 4, axis === 1 ? -0x80000 : 0x100000);}
  memory.copy(machine.bytes);
  for (let frame = 0; frame < connectedFrames; frame++) {
    if ((frame < 30 && frame % 6 === 0) || frame === 120 || frame === 130) {
      const kind = frame === 0 && scenario % 2 ? 8 : 4;
      emitRawEffectParticles(POSITION, VELOCITY, 8, 0x0700aaff, kind, {memory}); executeConnected(0x435f20, POSITION, VELOCITY, [8, 0x0700aaff, kind]); connectedParticleEmits++; compareConnected(scenario, frame, 'emit');
      emitRawBodyDebris(POSITION, VELOCITY, 1, {memory}); executeConnected(0x475a10, POSITION, VELOCITY, [1]); connectedDebrisEmits++; compareConnected(scenario, frame, 'debris');
    }
    lifetime.advanceRawBodyDebris({memory}); executeConnected(0x475e50); compareConnected(scenario, frame, 'advance-debris');
    lifetime.advanceRawEffectParticles({memory}); executeConnected(0x438550); compareConnected(scenario, frame, 'advance-particles');
    if (frame === 119) {assert.equal(memory.readUInt32LE(0x6e65c0), 0); assert.equal(memory.readUInt32LE(0x6e65c8), 0); assert.equal(memory.readUInt32LE(0x902b88), 0); assert.equal(memory.readInt32LE(0x902b8c), 31); assert.equal(memory.readUInt16LE(BUCKET + 10), 0);}
  }
}
const report = {method: 'Actual438550 particle range advancement/expiry and475e50 debris active-ID advancement/expiry with all actual game motion,color,freeing and packed spatial-removal children; actualCRT__allmul instructions too. No external calls or arithmetic stubs. All raw particle/debris/list/free/active/spatial/RNG/color-scratch bytes compared. Synthetic0..32 scanned particles,0..16 debris,all7 motion classes/default effect kinds,signed16/unsigned cutoff differences,lifetimes0/1/2/3/4/exactthresholds/highbit,negative velocity/truncation/overflow,alpha/RGB wrapping,head/middle/tail unlinking,debris swap-reprocessing. Additional40 connected160-frame scenarios execute actual435f20/475a10 emitters,allocation,exhaustion/reuse,advancement,expiry/freeing andlater emissions from fully reclaimed lists,comparing persistent bytes after every operation. Assert all effects/spatialheads cleared before later emissions. No original process execution.', evidence: evidence.map(item => item.evidence_id).concat(switchEvidence.evidence_id), instructions: instructions.length, fixtures, entryCounts, instructionSteps, freedParticles, spatialRemovals, freedDebris, fadedDebris, colorBlends, constructorFixtures, connectedScenarios, connectedFrames, connectedSteps, connectedCalls, connectedParticleEmits, connectedDebrisEmits, matched: true};
await writeFile('analysis/particle-lifetime-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

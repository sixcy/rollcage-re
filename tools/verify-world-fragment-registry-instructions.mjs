import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeWorldFragmentTemplates, initializeWorldFragments, activateWorldFragment, maintainWorldFragments, recordWorldFragmentImpact} from '../src/world-fragment-registry.mjs';
import {initializeBodyRetirementEffectTables} from '../src/body-retirement-effects.mjs';
import {registerRawBodyShapes, registerRawBodySpatial} from '../src/raw-body-construction.mjs';

const own = await readInstructionEvidence(['727-world-registry-initialize-assembly.json', '728-world-registry-register-assembly.json', '729-world-registry-maintain-assembly.json', '780-world-body-create-assembly.json', '783-world-body-storage-size-assembly.json', '785-world-body-storage-publish-assembly.json', '781-world-body-initialize-assembly.json', '789-world-body-inertia-basis-assembly.json', '790-world-body-inertia-matrix-assembly.json', '005-shape-registration-assembly.json', '644-physical-unregister-assembly.json', '651-retirement-474850-assembly.json', '665-retirement-4286e0-assembly.json', '669-retirement-4746f0-assembly.json', '655-retirement-435f20-assembly.json', '659-retirement-475a10-assembly.json', '663-retirement-4386b0-assembly.json', '115-effect-allocation-assembly.json', '118-particle-removal-assembly.json', '117-particle-registration-assembly.json', '149-event-emitter-assembly.json', '151-effect-dispatch-assembly.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['100-body-dynamics-assembly.json', '111-body-velocity-assembly.json', '300-quaternion-matrix-assembly.json', '315-contact-inertia-transform-assembly.json', '316-contact-quaternion-product-assembly.json', '360-spatial-body-insert-assembly.json', '152-vector-length-assembly.json', '221-fixed-sqrt-assembly.json', '217-wheel-capacity-curve-assembly.json', '220-wheel-drive-dot-assembly.json', '256-wheel-cross-assembly.json', '133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json']);
const byAddress = new Map(); for (const item of [...own.instructions, ...math.instructions]) {const prior = byAddress.get(item.address); if (prior) assert.deepEqual(prior, item); else byAddress.set(item.address, item);}
const instructions = [...byAddress.values()].sort((a, b) => a.address - b.address), machine = new BoundedX86(instructions), memory = Buffer.alloc(0xa00000), sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8'));
const switchReply = JSON.parse(await readFile('analysis/native-simulation/results/736-world-registry-size-switch.json', 'utf8')).structuredContent;
const switchBytes = Buffer.from(switchReply.normalized_result.bytes_hex, 'hex');
const BODY = 0x100000, MODEL = 0x20000, PACK = 0x30000, MODELS = 0x31000, INDICES = 0x32000, ROWS = 0x40000, MAP = 0x43000, BUCKET = 0x45000, REGISTRY = 0x60000, AUXILIARY = 0x62000, WORKSPACE = 0x64000, POSITION = 0x70000, VELOCITY = 0x70100, PARTICLES = 0x130000, DEBRIS = 0x140000, SHAPES = 0x180000, FREE = 0x190000, ACTIVE = 0x190100, REVERSE = 0x190200, PHYSICAL = 0x170000, STACK = 0x9000, MALLOC = 0x5a000;
let seed = 0x480760ab, instructionSteps = 0, mallocCalls = 0, memsetCalls = 0, activations = 0, retirements = 0, emissions = 0, splits = 0, syntheticTailRows = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p);
const initialize = fixture => {
  memory.fill(0); memory.fill(0x69, BODY, BODY + 0x10000); memory.fill(0x36, STACK - 0x1000, STACK + 64); memory.fill(0x93, REGISTRY, WORKSPACE + 0x2000);
  initializeWorldFragmentTemplates(memory); initializeBodyRetirementEffectTables(memory); sqrt.values.forEach((value, index) => word(0x5eb290 + index * 2, value)); switchBytes.copy(memory, 0x480e80);
  put(0x902eec, BODY); put(0x70dcf4, fixture % 4 * 128); put(0x6e6b44, fixture % 7); put(0x5e8890, 0x17b842a0); put(0x56e258, MALLOC);
  put(0x90b98c, PACK); put(PACK + 0x18, MODELS); put(PACK + 0x58, INDICES); word(INDICES + 2, 0); word(INDICES + 4, 1); word(INDICES + 6, 2);
  for (let index = 0; index < 3; index++) {
    const model = MODEL + index * 0x1000; put(MODELS + index * 4, model); put(model + 0x10, 0x300); put(model + 0x14, 0x300 + (fixture % 3) * 40); put(model + 12, model + 0x800); put(model + 0x40, model + 0x900); memory[model + 4] = 3; word(model + 0x32, 100 + random(65000));
    for (let offset = 0x300; offset < 0x500; offset += 4) put(model + offset, random(0xffffffff));
  }
  put(0x909254, ROWS); put(0x909278, BUCKET); for (let row = 0; row < 256; row++) {word(ROWS + row * 16, 0xff00); word(ROWS + row * 16 + 2, 255); put(ROWS + row * 16 + 12, MAP);}
  put(0x91e79c, SHAPES); put(0x91e780, FREE); put(0x91e78c, ACTIVE); put(0x91e790, REVERSE); put(0x91e794, 255); put(0x91e784, -1); put(0x91e798, 0); for (let index = 0; index < 256; index++) memory[FREE + index] = index;
  put(0x902bc0, PHYSICAL); word(0x902bc4, 0); memory.fill(0x69, SHAPES, SHAPES + 256 * 72);
  put(0x6e65b4, PARTICLES); for (let index = 0; index < 32; index++) put(PARTICLES + index * 256 + 0xac, index < 31 ? PARTICLES + (index + 1) * 256 : 0);
  put(0x902b7c, 0x71000); put(0x902b80, 0x71200); put(0x902b84, DEBRIS); put(0x902b8c, fixture % 33 - 1); for (let index = 0; index < 32; index++) word(0x71000 + index * 2, index);
  put(0x5ec958, random(0x7fffffff)); put(0x5eb500, fixture % 3 ? 256 : 64); put(0x9153d8, 0x0700aaff); put(0x90a548, fixture % 3 ? fixture * 17 | 1 : fixture * 64); put(0x6f2414, 0x72000); put(0x6f2418, 0x72000);
  for (let axis = 0; axis < 3; axis++) {put(POSITION + axis * 4, random(0x2000000) - 0x1000000); put(VELOCITY + axis * 4, random(0x800000) - 0x400000);}
};
const allocateFrom = () => {let index = 0; return size => {const expected = [0x120, 0x2a0, 0x2000][index]; assert.equal(size, expected); return [REGISTRY, AUXILIARY, WORKSPACE][index++];};};
machine.onInstruction = address => {if (address === 0x480c93) activations++; if (address === 0x480f3c) retirements++; if (address === 0x435f20) emissions++; if (address === 0x481067) splits++;};
const ranges = [[BODY, 0x60000], [MODEL, 0x3000], [ROWS, 0x6000], [REGISTRY, 0x6000], [POSITION, 0x2200], [SHAPES, 256 * 72], [FREE, 0x300], [PHYSICAL, 256], [0x6e6b44, 4], [0x70dcf4, 4], [0x70e200, 512 * 4], [0x849940, 36], [0x849980, 36 * 4], [0x849a20, 64], [0x9205d8, 8], [0x9207e0, 2], [0x6e6bc8, 12], [0x91e780, 32], [0x91d45c, 8], [0x902bc0, 8], [0x6e65b4, 24], [0x902b7c, 20], [0x5ec958, 4]];
const fixtures = 1800, entryCounts = {};
for (let fixture = 0; fixture < fixtures; fixture++) {
  initialize(fixture); machine.reset(); const entry = fixture % 3 === 0 ? 0x480760 : fixture % 3 === 1 ? 0x480bf0 : 0x480e90;
  entryCounts[entry.toString(16)] = (entryCounts[entry.toString(16)] ?? 0) + 1;
  if (entry !== 0x480760) initializeWorldFragments({memory, scratchBase: STACK, allocate: allocateFrom()});
  const selector = [0, 1, 2, 3, 4, 255][Math.floor(fixture / 3) % 6], tag = random(65536);
  if (entry === 0x480bf0) {
    const occupied = Math.floor(fixture / 18) % 5;
    if (occupied === 1) memory[REGISTRY + 4] = 1;
    if (occupied === 2) memory.fill(1, 0x849940, 0x849944);
    if (occupied === 3) memory.fill(1, 0x849940, 0x84994c);
    if (occupied === 4) memory.fill(1, 0x849940, 0x84995c);
    put(0x6e6bcc, fixture % 28);
    if (occupied === 1) memory[REGISTRY + fixture % 28 * 8 + 4] = 1;
  }
  if (entry === 0x480e90) {
    const active = 1 + fixture % 16;
    for (let index = 0; index < active; index++) activateWorldFragment(POSITION, VELOCITY, index % 4, index * 7, {memory});
    //The native activator selects only0..27. Directly constructed extra rows
    //independently exercise the maintenance loop's complete36-row read domain.
    if (fixture % 5 === 2) for (let index = 28; index < 36; index++) {
      const row = REGISTRY + index * 8, body = memory.readUInt32LE(0x849980 + index * 4);
      put(row, body); memory[row + 4] = 64; memory[row + 5] = index; memory[row + 6] = index % 3 + 1; memory[0x849940 + index] = 1;
      for (let axis = 0; axis < 3; axis++) {put(body + 0x34 + axis * 4, memory.readInt32LE(POSITION + axis * 4)); put(body + 0x40 + axis * 4, memory.readInt32LE(VELOCITY + axis * 4) << 8);}
      put(body + 0x164, row); registerRawBodyShapes(body, 3, 0x849a20, {memory}); registerRawBodySpatial(body, {memory}); syntheticTailRows++;
    }
    for (let index = 0; index < 36; index++) {
      const row = REGISTRY + index * 8;
      if (memory[row + 4]) {const kind = memory[row + 6], body = memory.readUInt32LE(row), limit = kind === 1 ? 700 : kind === 2 ? 1000 : 1200; memory[row + 4] = [1, 2, 61, 62, 64, 255][random(6)]; word(body + 0x160, [0, limit - 1, limit, limit + 1, 65535][random(5)]);}
    }
    put(0x6e6bcc, fixture % 28);
  }
  memory.copy(machine.bytes);
  let ecx = 0, edx = 0, args = [];
  if (entry === 0x480760) initializeWorldFragments({memory, scratchBase: STACK, allocate: allocateFrom()});
  else if (entry === 0x480bf0) {activateWorldFragment(POSITION, VELOCITY, selector, tag, {memory}); ecx = POSITION; edx = VELOCITY; args = [selector, tag];}
  else maintainWorldFragments({memory, scratchBase: STACK});
  const allocator = allocateFrom(); machine.externalCalls.set(MALLOC, m => {m.r.EAX = allocator(m.bytes.readUInt32LE(m.r.ESP)); mallocCalls++;});
  machine.externalCalls.set(0x568a50, m => {const dest = m.bytes.readUInt32LE(m.r.ESP) >>> 0, value = m.bytes.readUInt32LE(m.r.ESP + 4) & 255, count = m.bytes.readUInt32LE(m.r.ESP + 8) >>> 0; assert.ok([0x120, 0x2a0, 0x2000].includes(count)); m.bytes.fill(value, dest, dest + count); m.r.EAX = dest; memsetCalls++;});
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)));
  machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = STACK; machine.bytes.writeUInt32LE(0xffffffff, STACK); args.forEach((value, index) => machine.bytes.writeInt32LE(value | 0, STACK + 4 + index * 4));
  try {
    instructionSteps += machine.run(1000000);
    for (const [address, length] of ranges) if (!machine.bytes.subarray(address, address + length).equals(memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, index) => value !== memory[address + index]); assert.fail(`fixture${fixture}/entry${entry.toString(16)}/0x${(address + offset).toString(16)} native${machine.bytes[address + offset]} JS${memory[address + offset]}`);}
  } catch (error) {console.error({fixture, entry: entry.toString(16), selector, tag}); throw error;}
}
const impact = await readInstructionEvidence(['799-world-fragment-impact-callback-assembly.json'], {directory: 'analysis/native-simulation/results'}), impactMachine = new BoundedX86(impact.instructions);
const impactFixtures = 2000; let impactSteps = 0;
for (let fixture = 0; fixture < impactFixtures; fixture++) {
  impactMachine.reset(); const body = 0x10000, other = fixture % 7 === 0 ? 0 : fixture % 11 === 0 ? body : 0x11000;
  for (const selected of [body, 0x11000]) {memory.fill(0x69, selected, selected + 512); for (const offset of [0x6a, 0x6e, 0x72]) word(selected + offset, random(65536)); memory.copy(impactMachine.bytes, selected, selected, selected + 512);}
  const result = recordWorldFragmentImpact(body, other, {memory}); impactMachine.r.ESP = STACK; impactMachine.bytes.writeUInt32LE(0xffffffff, STACK); impactMachine.bytes.writeUInt32LE(body, STACK + 4); impactMachine.bytes.writeUInt32LE(other, STACK + 8); impactSteps += impactMachine.run();
  assert.equal(impactMachine.r.EAX, result); for (const selected of [body, 0x11000]) assert.deepEqual(impactMachine.bytes.subarray(selected, selected + 512), memory.subarray(selected, selected + 512));
}
const report = {method: 'Actual480760 fragment-pool construction,480bf0 activation and480e90 maintenance with actual raw body constructors,shape registration/unregistration,physical spatial insertion/removal,fragment splitting,particle/debris/RNG and484bb0→40ea40 game guards. Explicit successful CRTmalloc/memset/cookie services only; empty sound bank follows actual native early return. Synthetic mapped model/spatial/body/effect pools,not original process execution. Extra directly constructed rows28..35 test maintenance beyond activator0..27 without asserting their producer. Full persistent raw pool/body/model/spatial/shape/allocator/counter/RNG bytes compared. Separately actual4810b0 impactcallback signed highword differences/low16 output,otherzero andbody aliases.', evidence: [...own.evidence, ...math.evidence, ...impact.evidence].map(item => item.evidence_id).concat(switchReply.evidence_id), instructions: instructions.length, fixtures, entryCounts, instructionSteps, mallocCalls, memsetCalls, activations, retirements, emissions, splits, syntheticTailRows, impactInstructions: impact.instructions.length, impactFixtures, impactSteps, matched: true};
await writeFile('analysis/world-fragment-registry-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

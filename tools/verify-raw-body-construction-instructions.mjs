import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createRawBody, measureRawBodyStorage, publishRawBodyStorage, initializeRawBody, updateRawBodyDerived, registerRawBodySpatial, registerRawBodyShapes} from '../src/raw-body-construction.mjs';
import {quaternionMatrix} from '../src/fixed-math.mjs';

const own = await readInstructionEvidence(['780-world-body-create-assembly.json', '783-world-body-storage-size-assembly.json', '785-world-body-storage-publish-assembly.json', '781-world-body-initialize-assembly.json', '789-world-body-inertia-basis-assembly.json', '790-world-body-inertia-matrix-assembly.json', '005-shape-registration-assembly.json', '665-retirement-4286e0-assembly.json', '669-retirement-4746f0-assembly.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['100-body-dynamics-assembly.json', '111-body-velocity-assembly.json', '300-quaternion-matrix-assembly.json', '315-contact-inertia-transform-assembly.json', '316-contact-quaternion-product-assembly.json', '360-spatial-body-insert-assembly.json', '152-vector-length-assembly.json', '221-fixed-sqrt-assembly.json', '217-wheel-capacity-curve-assembly.json', '220-wheel-drive-dot-assembly.json', '256-wheel-cross-assembly.json', '133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json']);
const byAddress = new Map(); for (const item of [...own.instructions, ...math.instructions]) {const prior = byAddress.get(item.address); if (prior) assert.deepEqual(prior, item); else byAddress.set(item.address, item);}
const instructions = [...byAddress.values()].sort((a, b) => a.address - b.address), machine = new BoundedX86(instructions), memory = Buffer.alloc(0xa00000), sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8'));
const BODY = 0x10000, MODEL = 0x20000, CONFIG = 0x30000, OUTPUT = 0x35000, ROWS = 0x40000, MAP = 0x43000, BUCKET = 0x45000, SHAPES = 0x180000, FREE = 0x190000, ACTIVE = 0x190100, REVERSE = 0x190200, PHYSICAL = 0x170000, STACK = 0x9000;
let seed = 0x4741c0ab, instructionSteps = 0, registrations = 0, initialized = 0, derived = 0, cookieChecks = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const put = (p, value) => memory.writeInt32LE(value | 0, p), word = (p, value) => memory.writeUInt16LE(value & 65535, p), vector = (p, values) => values.forEach((value, index) => put(p + index * 4, value));
const entries = [0x4741c0, 0x474510, 0x474490, 0x4798d0, 0x4799f0, 0x474600, 0x428270], fixtures = 5600, entryCounts = {};
machine.onInstruction = address => {if (address === 0x4798d0) initialized++; if (address === 0x4799f0) derived++; if (address === 0x428270) registrations++;};
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); machine.reset(); const entry = entries[fixture % 7], body = BODY + 0x1000, requested = [0x180, 0x181, 0x1ff, 0x200][Math.floor(fixture / 7) % 4], mode = (fixture >>> 3) & 1, model = fixture % 13 === 0 ? 0 : MODEL, flags = [7, 17, 0x1c07, 0x8000, -1][random(5)];
  entryCounts[entry.toString(16)] = (entryCounts[entry.toString(16)] ?? 0) + 1;
  memory.fill(0x93, BODY, MODEL); memory.fill(0xa5, MODEL, MODEL + 0x1000); memory.fill(0x69, SHAPES, SHAPES + 256 * 72); memory.fill(0x36, STACK - 0x1000, STACK + 64);
  put(0x902eec, BODY); put(0x70dcf4, fixture % 128); put(0x6e6b44, [0, 1, 511, 512, 513][random(5)]); put(0x5e8890, 0x17b842a0);
  const auxiliary = [0, 0x100][random(2)], third = [0, 0x100, 0x200][random(3)]; word(MODEL + 0x1c, auxiliary); word(MODEL + 0x1e, third);
  for (const offset of [0, 0x100, 0x200]) {
    const selected = MODEL + offset, faces = random(4); put(selected + 0x10, 0x300); put(selected + 0x14, 0x300 + faces * 40); put(selected + 0xc, 0x36000 + offset); put(selected + 0x40, 0x37000 + offset); memory[selected + 4] = random(256); word(selected + 10, random(65536));
  }
  for (let offset = 0x300; offset < 0x700; offset += 4) put(MODEL + offset, random(0xffffffff));
  const quaternion = [[65536, 0, 0, 0], [0, 65536, 0, 0], [0, 0, 65536, 0], [32768, 32768, 32768, 32768]][random(4)];
  const momentum = Array.from({length: 3}, () => random(200 * 65536) - 100 * 65536), angular = Array.from({length: 3}, () => random(4 * 65536) - 2 * 65536), inertia = [32768, 65536, 98304], inverse = [32768, 65536, 131072][random(3)];
  vector(CONFIG, [random(0x2000000) - 0x1000000, 0, random(0x2000000) - 0x1000000]); vector(CONFIG + 12, momentum); vector(CONFIG + 24, angular); vector(CONFIG + 36, quaternion); vector(CONFIG + 0x68, [...inertia, 65536, inverse, 123]);
  put(body, flags); vector(body + 0x34, [0, 0, 0]); vector(body + 0x40, momentum); vector(body + 0x4c, angular); vector(body + 0x58, quaternion); vector(body + 0x9c, [...inertia, 65536, inverse]); quaternionMatrix(quaternion).forEach((value, index) => word(body + 0xc4 + index * 2, value));
  put(0x909254, ROWS); put(0x909278, BUCKET); for (let row = 0; row < 256; row++) {word(ROWS + row * 16, 0xff00); word(ROWS + row * 16 + 2, 255); put(ROWS + row * 16 + 12, MAP);} word(BUCKET + 8, fixture % 3 === 0 ? 257 : 0);
  put(0x91e79c, SHAPES); put(0x91e780, FREE); put(0x91e78c, ACTIVE); put(0x91e790, REVERSE); put(0x91e794, 255); put(0x91e784, -1); put(0x91e798, 0); for (let index = 0; index < 256; index++) memory[FREE + index] = index;
  put(0x902bc0, PHYSICAL); word(0x902bc4, 0); const shapeCount = Math.floor(fixture / 7) % 6;
  for (let index = 0; index < shapeCount; index++) {for (let axis = 0; axis < 3; axis++) word(OUTPUT + index * 20 + axis * 4, random(65536)); put(OUTPUT + index * 20 + 12, random(0x20000)); word(OUTPUT + index * 20 + 16, random(65536));}
  const outputs = Array.from({length: 6}, (_, index) => OUTPUT + index * 4), enabled = [fixture & 1, (fixture >>> 1) & 1, (fixture >>> 2) & 1];
  const ranges = [[BODY, 0x10000], [MODEL, 0x1000], [CONFIG, 0x8000], [ROWS, 0x6000], [SHAPES, 256 * 72], [FREE, 0x300], [PHYSICAL, 256], [0x6e6b44, 4], [0x70dcf4, 4], [0x70e200, 512 * 4], [0x902eec, 4], [0x902bc0, 8], [0x909254, 4], [0x909278, 4], [0x91e780, 32], [0x91d45c, 8]];
  for (const [address, length] of ranges) memory.copy(machine.bytes, address, address, address + length); memory.copy(machine.bytes, STACK - 0x1000, STACK - 0x1000, STACK + 64); machine.bytes.writeInt32LE(0x17b842a0, 0x5e8890); sqrt.values.forEach((value, index) => machine.bytes.writeUInt16LE(value, 0x5eb290 + index * 2));
  const context = {memory, scratchBase: STACK}; let expected, ecx, edx, args;
  if (entry === 0x4741c0) {expected = createRawBody(model, flags, requested, mode, context); ecx = model; edx = flags; args = [requested, mode];}
  else if (entry === 0x474510) {expected = measureRawBodyStorage(MODEL, requested, enabled, outputs, context); ecx = MODEL; edx = requested; args = [...enabled, ...outputs];}
  else if (entry === 0x474490) {publishRawBodyStorage(OUTPUT, MODEL, body, body + 0x800, context); ecx = OUTPUT; edx = MODEL; args = [body, body + 0x800];}
  else if (entry === 0x4798d0) {initializeRawBody(body, CONFIG, context); ecx = body; edx = CONFIG; args = [];}
  else if (entry === 0x4799f0) {updateRawBodyDerived(body, context); ecx = body + 0x34; args = [];}
  else if (entry === 0x474600) {registerRawBodySpatial(body, context); ecx = body; args = [];}
  else {registerRawBodyShapes(body, shapeCount, OUTPUT, context); ecx = body; edx = shapeCount; args = [OUTPUT];}
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)); cookieChecks++;}); machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx ?? 0; machine.r.ESP = STACK; machine.bytes.writeUInt32LE(0xffffffff, STACK); args.forEach((value, index) => machine.bytes.writeInt32LE(value | 0, STACK + 4 + index * 4));
  instructionSteps += machine.run(200000);
  if (expected !== undefined) assert.equal(machine.r.EAX >>> 0, expected >>> 0, `return ${fixture}`);
  try {for (const [address, length] of ranges) if (!machine.bytes.subarray(address, address + length).equals(memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, index) => value !== memory[address + index]); assert.fail(`state ${fixture}/entry${entry.toString(16)}/0x${(address + offset).toString(16)} native${machine.bytes[address + offset]} JS${memory[address + offset]}`);}}
  catch (error) {console.error({fixture, entry: entry.toString(16), model, mode, requested, auxiliary, third, enabled, shapeCount}); throw error;}
}
const report = {method: 'Raw4741c0/474510/474490 object arena/model storage,4798d0 initialization,4799f0 derived state,474600 physical spatial insertion and428270 shape registration with all actual game arithmetic/spatial callees. Only compiler cookie equality is external. Full raw object/model/storage/configuration/spatial/shape/free-active-reverse/physical-list/global state compared. Synthetic aux aliases,zero/nonzero models,modes,128-byte size alignment,index512 cutoff,three config/inertia/mass branches,velocity limiting,orientation matrices,packed body IDs,zero/nonzero shape counts and stale fields. Successful readable arithmetic and mapped storage domain; no original process execution.', evidence: [...own.evidence, ...math.evidence].map(item => item.evidence_id), instructions: instructions.length, fixtures, entryCounts, registrations, initialized, derived, cookieChecks, instructionSteps, matched: true};
await writeFile('analysis/raw-body-construction-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

import assert from 'node:assert/strict';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {planAutonomousRoute} from '../src/autonomous-route-planner.mjs';
import {initializeAutonomousCandidateModifierTables} from '../src/autonomous-candidate-modifiers.mjs';
import {initializeAutonomousOpponentTables} from '../src/autonomous-opponent-candidates.mjs';
import {initializeAutonomousWeaponTables} from '../src/autonomous-weapon-policy.mjs';
import {initializeAutonomousProfileTables} from '../src/autonomous-profile-plan.mjs';

export const connectedAddresses = {body: 0x10000, pack: 0x30000, groups: 0x31000, points: 0x40000, session: 0x50000, resource: 0x51000, registry: 0x52000, stack: 0x9000, rows: 0x91f1e0};
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address), put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const vec = (memory, address, values) => values.forEach((value, axis) => put(memory, address + axis * 4, value));
const point = (memory, address, values) => values.forEach((value, axis) => word(memory, address + axis * 2, value));

//Declared synthetic producer state: complete native-shaped registries, routes,
//events and model planes. No constructor/visibility/original-runtime claim.
export function createConnectedPlannerFixture(fixture) {
  const memory = Buffer.alloc(0xa00000), {body, pack, groups, points, session, resource, registry, stack} = connectedAddresses;
  let seed = (0x421430ad ^ Math.imul(fixture + 1, 0x41a7)) | 0;
  const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
  initializeAutonomousWeaponTables(memory); initializeAutonomousProfileTables(memory); initializeAutonomousOpponentTables(memory); initializeAutonomousCandidateModifierTables(memory);
  put(memory, 0x5e8890, 0x17b842a0); put(memory, 0x90b98c, pack); put(memory, 0x9092a0, groups); put(memory, pack + 0x60, groups); put(memory, pack + 8, resource); put(memory, 0x90b990, resource); put(memory, 0x5ecb1c, session); put(memory, 0x849a5c, registry);
  memory.fill(0x36, stack - 4096, stack + 64); memory.fill(0x69, 0x91f1e0, 1040 + 0x91f1e0); memory.fill(0x7b, 0x6fb3a0, 0x6fb440);
  const profile = fixture % 8, reverse = profile === 6, direction = reverse ? -1 : 1, count = 3 + random(4), ownGroup = 1;
  memory[session + 0x54d] = count; memory[session + 0x586] = fixture % 5; memory[session + 0x553] = fixture % 2; memory[session + 0x58c] = fixture % 3; put(memory, session + 0x57c, 4);
  put(memory, 0x5ea4d8, fixture % 3); put(memory, 0x5ea4d4, 0x1234567); put(memory, 0x90a548, [0, 349, 350, 1000, -1][fixture % 5]);
  for (let group = 0; group < 8; group++) {
    const address = groups + group * 12, base = points + group * 0x1000;
    word(memory, address, 12); memory[address + 2] = reverse ? 1 : 0; memory[address + 3] = profile === 7 && group === 3 ? 1 : 0; memory[address + 4] = fixture % 3 ? 1 : 0; memory[address + 5] = group; memory.writeInt8(random(21) - 10, address + 6); put(memory, address + 8, base);
    for (let index = 0; index < 12; index++) {
      const p = base + index * 16;
      point(memory, p, [index * 100, profile === 5 ? (index % 3) * 10 : 0, group * 300 + (profile === 4 ? index * index * 2 : 0)]);
      memory[p + 6] = profile === 7 ? [0, 100, 255][index % 3] : 0; memory[p + 7] = 255;
      const flags = ((profile === 0 ? 0 : 0x700) | (index % 5 === 0 ? 0x24 : 0) | (profile === 7 ? random(256) : 0) | ((group % 4) << 28) | ((index % 4) << 30)) >>> 0;
      memory.writeUInt32LE(flags, p + 8); memory[p + 10] = 1 + (fixture % 3);
      const linked = fixture % 4 === 0 ? 0 : group === 1 ? 2 : group === 2 ? 3 : 0;
      memory.writeUInt32LE((linked | ((index % 12) << 5)) >>> 0, p + 12);
    }
  }
  for (let index = 0; index < 6; index++) {
    const vehicle = body + index * 0x4000, record = 0x909300 + index * 0x30c, model = 0x80000 + index * 0x400, group = index ? 1 + (index % 3) : ownGroup;
    put(memory, vehicle + 0x10, model); word(memory, model + 0x32, [16, 24, 32][index % 3]); word(memory, vehicle + 0x65e, index); word(memory, vehicle + 0x6c0, group); word(memory, vehicle + 0x6c2, reverse ? 8 : 3);
    const speed = index ? 280 + random(40) : [0, 100, 101, 250, 300, 500, 280, 320][profile];
    word(memory, vehicle + 0x668, speed); put(memory, vehicle + 0x664, speed ? (10 + index * 2) * 65536 : 0);
    vec(memory, vehicle + 0x34, [(reverse ? 850 : 150) * 65536 + index * direction * 70 * 65536, 0, (group * 300 + (index % 2) * 20) * 65536]);
    vec(memory, vehicle + 0x68, [direction * (10 + index) * 65536, 0, profile === 5 ? 65536 : 0]);
    [0, 0, direction * 4096, 0, 4096, 0, -direction * 4096, 0, 0].forEach((value, axis) => word(memory, vehicle + 0xc4 + axis * 2, value));
    memory[vehicle + 0x718] = index % 2 ? 10 : 8; put(memory, vehicle + 0x6bc, profile === 3 ? -1 : 0); put(memory, vehicle + 0x3d00, index % 3);
    memory[vehicle + 0x6f1] = (fixture + index) % 5; memory[vehicle + 0x6f0] = fixture % 8; put(memory, vehicle + 0x6f8, random(0x400000));
    put(memory, record, vehicle); memory[record + 0x1c] = index % 3; put(memory, record + 0x24, index ? [-1501, -1499, 100, 16000][index % 4] : 0); put(memory, record + 0x54, groups + group * 12); word(memory, record + 0x58, reverse ? 8 : 3); memory[record + 0x249] = fixture % 3 === 0 ? 1 : 0;
    put(memory, registry + index * 8, vehicle); memory[registry + index * 8 + 4] = index ? 1 : 0; memory[registry + index * 8 + 6] = 2;
  }
  //Original policy bits enable costs/opponents, then selectively special kinds.
  const specials = profile === 1 ? 4 : profile === 2 ? 0x800 : profile === 3 ? 8 : profile === 0 ? 0 : 0x80c;
  put(memory, body + 0x6ec, 0x463 | specials); memory[body + 0x68c] = profile === 7 ? 4 : 255; memory[body + 0x68d] = 255; memory[body + 0x6ca] = fixture % 32; memory[body + 0x6cb] = 0;
  for (let index = 0; index < 6; index++) word(memory, body + 0x6fc + index * 2, index % 2 ? 6000 : 0);
  if (profile === 0 || profile === 5 || profile === 7) {
    const other = body + 0x4000, ownX = memory.readInt32LE(body + 0x34), ownZ = memory.readInt32LE(body + 0x3c);
    word(memory, body + 0x668, profile === 5 ? 500 : 300); word(memory, other + 0x668, 300);
    vec(memory, body + 0x68, [(profile === 5 ? 30 : 20) * 65536, 0, 0]); vec(memory, other + 0x68, [20 * 65536, 0, 0]);
    vec(memory, other + 0x34, [ownX + (profile === 7 ? -200 : profile === 5 ? 60 : 0) * 65536, 0, ownZ + (profile === 0 ? 40 : 0) * 65536]);
    word(memory, other + 0xc8, 4096); word(memory, other + 0xce, 0); word(memory, other + 0xd4, 0);
  }
  for (let index = 6; index < 36; index++) {
    const object = 0x60000 + index * 0x400, model = 0x80000 + index * 0x400;
    put(memory, object + 0x10, model); word(memory, model + 0x32, 20 + index); vec(memory, object + 0x34, [(200 + (index - 6) * 25) * 65536, 0, (300 + (index % 3) * 20) * 65536]);
    put(memory, registry + index * 8, object); memory[registry + index * 8 + 4] = fixture % 11 === 0 ? 0 : 1; memory[registry + index * 8 + 6] = 1 + index % 3;
  }
  const obstacleCount = profile === 0 ? 0 : 4; put(memory, 0x6e6514, obstacleCount);
  for (let index = 0; index < 4; index++) {
    const object = 0x60000 + (6 + index) * 0x400, model = 0x80000 + (6 + index) * 0x400, polygons = 0x90000 + index * 0x200, normal = 0x98000 + index * 0x100, vertices = 0xa0000 + index * 0x100;
    put(memory, 0x920b40 + index * 12, object); put(memory, 0x920b44 + index * 12, 1); put(memory, 0x920b48 + index * 12, polygons); put(memory, polygons, polygons + 0x40); put(memory, polygons + 0x50, profile % 2 ? 0 : 1 << 16);
    put(memory, object + 0x2c, normal); memory[object + 0x199] = (fixture + index * 17) & 255; memory[object + 0x19a] = profile === 7 && index === 2 ? 5 : 0;
    word(memory, model + 0x38, 0x100); put(memory, model + 0x40, vertices + 8); put(memory, normal + 4, 256 << 20); point(memory, vertices, [0, 0, 0]);
  }
  //Every source row has a legitimate producer-supplied route association.
  const sourceCount = profile === 0 ? 0 : 12;
  put(memory, 0x902020, 0xb4000); put(memory, 0x902024, sourceCount); put(memory, resource + 0xec, 0xb5000); put(memory, 0x82e904, sourceCount); put(memory, resource + 0xe4, 0xb6000); memory[resource + 0xf5] = sourceCount;
  for (let index = 0; index < 12; index++) {
    const object = 0xb0000 + index * 0x200, row = 0xb5000 + index * 20, marker = 0xb6000 + index * 20, metadata = 0xb8000 + index * 0x200, x = (reverse ? index * 100 - 500 : index * 100 + 500), z = 300;
    put(memory, 0xb4000 + index * 4, object); put(memory, object + 0x34, x * 65536); put(memory, object + 0x38, 0); put(memory, object + 0x3c, z * 65536); word(memory, object + 0x182, 0x81); word(memory, object + 0x18c, 1); word(memory, object + 0x18e, index);
    put(memory, row, object); put(memory, row + 4, metadata); point(memory, row + 8, [x, 0, z]); word(memory, row + 16, index); memory[row + 18] = 1; put(memory, metadata + 0x194, 0xbc000); memory[metadata + 0x192] = index; memory[0xbc003] = 0;
    point(memory, marker, [x, 0, z]); word(memory, marker + 16, index); memory[marker + 18] = 1;
  }
  put(memory, resource + 0xf8, 0xbd000); memory[resource + 0xf6] = profile === 0 ? 0 : 4;
  for (let index = 0; index < 4; index++) {const event = 0xbd000 + index * 8; word(memory, event, index === 0 ? 1 : 2); word(memory, event + 2, 2 + index); memory[event + 4] = index % 2 ? 1 : 4; memory[event + 5] = fixture % 3; memory[event + 6] = [0, 4, 255, 7][index];}
  return {memory, body, scratchBase: stack, profile};
}

export async function loadConnectedPlannerInstructionSet() {
  const directory = 'analysis/native-simulation/results', filenames = await readdir(directory);
  const ids = [345, 348, 350, 501, 382, 352, 378, 358, 360, 529, 531, 533, 537, 364, 368, 535, 370, 372, 216, 354, 356, 362, 366, 541, 543, 374, 376, 521, 523, 525, 601, 603, 605, 608, 610, 612, 614, 616, 618, 211, 229, 218, 226, 220, 223, 224, 232, 239, 134, 243];
  const names = ids.map(id => {const name = filenames.find(name => name.startsWith(`${id}-`) && name.endsWith('-assembly.json')); if (!name) throw Error(`Missing connected dependency ${id}`); return name;});
  const own = await readInstructionEvidence(names, {directory}), math = await readInstructionEvidence(['133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json', '217-wheel-capacity-curve-assembly.json']);
  const byAddress = new Map();
  for (const instruction of [...own.instructions, ...math.instructions]) {const prior = byAddress.get(instruction.address); if (prior) assert.deepEqual(instruction, prior, `conflicting retained instruction0x${instruction.address.toString(16)}`); else byAddress.set(instruction.address, instruction);}
  const tables = await Promise.all(['520-candidate-bias-switch.json', '538-candidate-mode-bias-switch-bytes.json', '539-candidate-mode-bias-profile-table.json'].map(async name => {const reply = JSON.parse(await readFile(`${directory}/${name}`, 'utf8')); return reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);}));
  return {instructions: [...byAddress.values()].sort((first, second) => first.address - second.address), own, math, tables};
}

export async function verifyConnectedPlanner({fixtures = 800, output = 'analysis/autonomous-route-planner-connected-instruction-check.json'} = {}) {
  const {instructions, own, math, tables} = await loadConnectedPlannerInstructionSet();
  const machine = new BoundedX86(instructions, {tables: tables.map(item => item.normalized_result)}), sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8'));
  const visits = new Map(), nativeTypes = Array(6).fill(0), chosenTypes = Array(6).fill(0); let steps = 0, compilerCookieChecks = 0, populatedBodyLists = 0, populatedObstacleLists = 0;
  machine.onInstruction = address => {if ([0x4210b0, 0x420ba0, 0x420de0, 0x411e70, 0x4125a0, 0x492d80, 0x4938f0, 0x493610, 0x493290, 0x493b00, 0x4919d0, 0x411fa0, 0x412070, 0x4126d0, 0x412870, 0x434f80, 0x434c60, 0x434550, 0x434800, 0x4352f0].includes(address)) visits.set(address, (visits.get(address) ?? 0) + 1);};
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890), 'compiler security cookie'); compilerCookieChecks++;}); machine.externalCalls.set(0x5684da, () => {throw Error('Compiler range failure reached');});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const context = createConnectedPlannerFixture(fixture), source = context.memory;
    machine.reset(); source.copy(machine.bytes); sqrt.values.forEach((value, index) => machine.bytes.writeUInt16LE(value, 0x5eb290 + index * 2));
    for (const table of tables) Buffer.from(table.normalized_result.bytes_hex, 'hex').copy(machine.bytes, Number(table.normalized_result.address));
    planAutonomousRoute(context.body, context);
    machine.entry = 0x421430; machine.r.ECX = context.body; machine.r.ESP = context.scratchBase; machine.bytes.writeUInt32LE(0xffffffff, context.scratchBase);
    try {
      steps += machine.run(2_000_000);
      for (const [address, length] of [[0x10000, 0x18000], [0x30000, 0x20000], [0x50000, 0x70000], [0x909300, 6 * 0x30c], [0x91f1c0, 0x4e0], [0x6fb3a0, 160], [0x6e650e, 16], [0x920b40, 0x500], [0x7136d0, 128], [0x80df20, 104], [0x6e6cc0, 8]]) {
        const actual = machine.bytes.subarray(address, address + length), expected = source.subarray(address, address + length);
        if (!actual.equals(expected)) {const offset = actual.findIndex((value, index) => value !== expected[index]); assert.fail(`fixture${fixture}/profile${context.profile}:0x${(address + offset).toString(16)} native=${actual[offset]} JS=${expected[offset]}`);}
      }
    } catch (error) {console.error({fixture, profile: context.profile, nearbyBodies: source[0x6e650e], nearbyObstacles: source.readUInt32LE(0x6e651c), bodyGroup: source.readUInt16LE(context.body + 0x6c0), bodyPoint: source.readUInt16LE(context.body + 0x6c2)}); throw error;}
    if (source[0x6e650e]) populatedBodyLists++; if (source.readUInt32LE(0x6e651c)) populatedObstacleLists++;
    chosenTypes[source[context.body + 0x6c9]]++;
    for (let row = 0; row < 20; row++) nativeTypes[source[0x91f1e0 + row * 52 + 37]]++;
  }
  const report = {method: 'Full421430 parent using every reconstructed game callee as its actual default. No game mocks; only compiler security-cookie equality/range-failure interfaces admitted. Explicit synthetic producer state includes six racer records,36 registered bodies,model radius/yaw/packed planes,four obstacles,authored routes and links,pickup/object/marker sources,event rows and profile tables. Compares whole bodies,registries,model/routes/session/source storage,candidate/target/forecast/nearby tables and graph queue state. This is interpreted shipped x86,not original-process runtime evidence.', evidence: [...own.evidence, ...math.evidence, ...tables].map(item => item.evidence_id), instructions: instructions.length, fixtures, instructionSteps: steps, compilerCookieChecks, populatedBodyLists, populatedObstacleLists, candidateTypes: nativeTypes, chosenTypes, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyConnectedPlanner()));

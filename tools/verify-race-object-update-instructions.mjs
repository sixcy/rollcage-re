import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import {updateRaceObjects, updateRaceObjectType20, updateRaceObjectType31, updateRaceObjectType32, initializeRaceObjectType20, initializeRaceObjectTables} from '../src/race-object-update.mjs';

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address), word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
export const raceObjectAddresses = {session: 0x150000, list: 0x151000, objects: 0x160000, uvOwner: 0x170000, polygons: 0x180000, secondPolygons: 0x190000, trails: 0x1a0000, pulses: 0x1c0000, stack: 0x9000};

export function createRaceObjectFixture(fixture, memory = Buffer.alloc(0xa00000)) {
  const runtime = createRawScriptFixture({memory, freeCount: fixture % 33}), a = raceObjectAddresses;
  initializeRaceObjectTables(memory);
  put(memory, 0x5ecb1c, a.session); memory[a.session + 0x551] = [0, 3, 8, 1, 7][Math.floor(fixture / 5) % 5];
  put(memory, 0x91e778, 4); put(memory, 0x91e77c, a.list);
  for (let index = 0; index < 4; index++) {
    const body = a.objects + index * 0x1000; memory.fill(0x69, body, body + 0x400); put(memory, a.list + index * 4, body); put(memory, body, [20, 31, 32, fixture & 511][index]);
    put(memory, body + 4, 0); put(memory, body + 12, 0x45000);
    for (let lane = 0; lane < 3; lane++) put(memory, body + 0x34 + lane * 4, (fixture * (lane + 1) * 131071) | 0);
    for (let lane = 0; lane < 9; lane++) word(memory, body + 0xc4 + lane * 2, [-32768, -1, 0, 1, 32767][(fixture + lane) % 5]);
    put(memory, body + 0x180, Math.floor(fixture / 5) % 5); put(memory, body + 0x184, index === 1 ? [0, 2, 3, 2][Math.floor(fixture / 100) % 4] : [0, 1, 63, 64, 65535, 32768][fixture % 6]); word(memory, body + 0x186, [-1, 0, 1, 2, 4, 5][fixture % 6]);
    if (index === 1) word(memory, body + 0x188, fixture % 100);
  }
  put(memory, 0x91e744, Math.floor(fixture / 25) % 10); put(memory, 0x91e740, [-2147483648, -1, 0, 1, 55, 90, 127, 128, 200, 201, 1024, 2147483647][Math.floor(fixture / 10) % 12]); put(memory, 0x91e774, 0x12345678);
  put(memory, 0x91e748, a.uvOwner); word(memory, 0x91e74c, [0, 1, 2, 4, -1][Math.floor(fixture / 3) % 5]);
  put(memory, a.uvOwner + 0x14, a.polygons); put(memory, a.uvOwner + 0x18, fixture % 7 ? a.secondPolygons : a.polygons);
  for (let index = 0; index < 4; index++) memory[0x91e750 + index] = [0, 2, 255, 128][index];
  for (let index = 0; index < 32; index++) memory[0x91e754 + index] = (fixture * 19 + index * 37) & 255;
  memory.fill(0x5a, a.polygons - 0x5000, a.polygons + 0x2000); memory.fill(0xa6, a.secondPolygons - 0x5000, a.secondPolygons + 0x2000);
  put(memory, 0x90a548, fixture % 4 ? fixture * 25 : fixture * 25 + 1);
  put(memory, 0x919008, a.trails); put(memory, 0x9153c0, a.pulses);
  for (let index = 0; index < 10; index++) put(memory, a.trails + index * 0x1e2c + 12, index < fixture % 11 ? 1 : 0);
  for (let index = 0; index < 3; index++) put(memory, a.pulses + index * 0xf14 + 12, index < fixture % 4 ? 1 : 0);
  for (const address of [0x9153d8, 0x9153e0, 0x9153e4, 0x919000, 0x9153c8]) put(memory, address, 0x0700aaff);
  put(memory, 0x5e8890, 0x429f30ab);
  return {...runtime, fixture, addresses: a};
}

export async function verifyRaceObjectUpdate({fixtures = 1200, frames = 3, output = 'analysis/race-object-update-complete-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), a = raceObjectAddresses;
  const own = await readInstructionEvidence(['1335-race-object-update-assembly.json', '1338-race-object-type31-assembly.json', '1340-race-object-type20-assembly.json', '1342-race-object-type32-assembly.json', '1352-race-object-control-init-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const tableEvidence = [];
  for (const filename of ['1343-race-object-type31-index-table.json', '1344-race-object-type31-effect-table.json', '1345-race-object-type20-switch.json']) tableEvidence.push(JSON.parse(await readFile(`analysis/native-simulation/results/${filename}`, 'utf8')).structuredContent.evidence_id);
  let steps = 0, cookies = 0; const visits = {}, reached = new Set(), branches = {};
  const watched = new Set([0x429f30, 0x429fa0, 0x42a1f0, 0x42a0e0, 0x44ac80, 0x435ba0, 0x474850, 0x474670, 0x484bb0, 0x40ea40, 0x435f20, 0x475a10, 0x436510]);
  machine.onInstruction = address => {reached.add(address); if (watched.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX | 0, m.bytes.readInt32LE(0x5e8890)); cookies++;});
  const compare = (fixture, frame) => {
    for (const [start, end] of [[0, a.stack - 4096], [a.stack + 64, memory.length]]) {
      const native = machine.bytes.subarray(start, end), source = memory.subarray(start, end);
      if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`object fixture${fixture}/frame${frame} difference0x${(start + offset).toString(16)} native${native[offset]} JS${source[offset]}`);}
    }
  };
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); machine.reset(); program.initializeMemory(memory); const runtime = createRaceObjectFixture(fixture, memory);
    memory.copy(machine.bytes);
    for (let frame = 0; frame < frames; frame++) {
      const phase = memory.readInt32LE(0x91e744); branches[phase] = (branches[phase] ?? 0) + 1;
      const selector = fixture % 5, body = a.objects + (selector === 2 ? 1 : selector === 3 ? 2 : 0) * 0x1000;
      const entry = [0x429f30, 0x42a1f0, 0x429fa0, 0x44ac80, 0x429f30][selector];
      if (entry === 0x42a1f0) updateRaceObjectType20(body, runtime); else if (entry === 0x429fa0) updateRaceObjectType31(body, runtime); else if (entry === 0x44ac80) updateRaceObjectType32(body, runtime); else updateRaceObjects(runtime);
      machine.entry = entry; machine.r.ECX = body; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1);
      try {steps += machine.run(3000000); compare(fixture, frame);} catch (error) {console.error({fixture, frame, entry: entry.toString(16), visits}); throw error;}
    }
  }
  const aliasFixtures = 120;
  for (let fixture = 0; fixture < aliasFixtures; fixture++) {
    memory.fill(0); machine.reset(); program.initializeMemory(memory); const runtime = createRaceObjectFixture(fixture, memory);
    memory[a.session + 0x551] = 0; put(memory, 0x91e744, 2); word(memory, 0x91e74c, 1); memory[0x91e750] = 0; memory[0x91e754] = 0; memory[0x91e755] = fixture % 2 ? 0x10 : 0;
    const polygons = fixture % 2 ? a.list + 4 - 0x20 : 0x91e778 - 0x20;
    put(memory, a.uvOwner + 0x14, polygons); put(memory, a.uvOwner + 0x18, polygons);
    if (fixture % 2) {const replacement = a.objects + 0x1040; put(memory, replacement, 32); put(memory, replacement + 0x180, 0); word(memory, replacement + 0x186, 0);}
    memory.copy(machine.bytes); updateRaceObjects(runtime); machine.entry = 0x429f30; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1);
    steps += machine.run(3000000); compare(fixture, 'live UV/list alias');
  }
  const constructorFixtures = 120;
  for (let fixture = 0; fixture < constructorFixtures; fixture++) {
    memory.fill(0); machine.reset(); program.initializeMemory(memory); const runtime = createRaceObjectFixture(fixture, memory);
    memory[a.session + 0x551] = 0;
    for (const offset of [0x122c, 0x126c, 0x12b0, 0x12f0, 0x1334, 0x1374, 0x122d, 0x124d, 0x126d, 0x128d]) memory[a.polygons + offset] = (fixture * 17 + offset * 11) & 255;
    memory.copy(machine.bytes); initializeRaceObjectType20(a.uvOwner, runtime); machine.entry = 0x42a0e0; machine.r.ECX = a.uvOwner; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); steps += machine.run(); compare(fixture, 'type20 constructor');
    put(memory, 0x91e744, 2); put(machine.bytes, 0x91e744, 2);
    updateRaceObjectType20(a.objects, runtime); machine.entry = 0x42a1f0; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); steps += machine.run(); compare(fixture, 'constructed UV phase2');
  }
  const report = {method: 'Complete429f30 list dispatcher and actual type20/31/32 children42a1f0/429fa0/44ac80, with actual effect burst,particle/debris/trail/color policy,spatial removal/registration and484bb0→40ea40 sound decisions. No game mocks. Empty sound bank is an explicit synthetic runtime case; compiler cookie is the only external service. Original static mask/index/switch bytes initialized from retained evidence. Persistent calls compare the entire declared memory except native stack scratch,including body matrices/state,global phases,double-buffer UVs,signed polygon IDs,free/active pools,RNG and all reached effect globals. Alias cases mutate captured global list count or a later live object pointer through actual UV writes. Actual42a0e0 UV-control constructor is followed by phase2 updates. Parent captures list/count once. No original-process execution.', targetSha256: program.sha256, evidence: [...own.evidence.map(item => item.evidence_id), ...tableEvidence], ownInstructions: own.instructions.length, fixtures, frames, aliasFixtures, constructorFixtures, calls: fixtures * frames + aliasFixtures + constructorFixtures * 2, phaseVisits: branches, actualGameCalls: visits, reachedInstructions: reached.size, instructionSteps: steps, cookieChecks: cookies, externalCalls: [...machine.externalCalls.keys()], matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report, 'Existing report differs; choose a new output filename.');}}
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRaceObjectUpdate()));

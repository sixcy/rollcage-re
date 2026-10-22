import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import * as animation from '../src/vehicle-auxiliary-animation.mjs';
import {populateRawVehicleTrackBasis} from '../src/raw-track-basis.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
export const auxiliaryAnimationAddresses = {body: 0x100000, control: 0x140000, object: 0x160000, session: 0x170000, pack: 0x180000, sectors: 0x181000, sector: 0x182000, vertices: 0x183000, packets: 0x184000, normals: 0x185000, routes: 0x186000, first: 0x190000, second: 0x191000, output: 0x192000, stack: 0x9000, record: 0x909300};
export function createAuxiliaryAnimationFixture(fixture, memory = Buffer.alloc(0xa00000)) {
  const runtime = createRawScriptFixture({memory}), a = auxiliaryAnimationAddresses;
  animation.initializeVehicleAnimationTables(memory); memory.fill(0x69, a.object, a.object + 0x400); memory.fill(0x71, a.output, a.output + 64);
  put(memory, 0x5ecb1c, a.session); memory[a.session + 0x58c] = fixture % 3; memory[a.session + 0x552] = fixture % 2; memory[a.session + 0x579] = [0, 11, 12][fixture % 3];
  put(memory, a.record, a.body); put(memory, a.record + 0x18, a.control); put(memory, a.record + 0x30c + 0x18, fixture % 3 ? 0 : a.control); memory[a.record + 0x20] = [4, 6, 11][fixture % 3];
  put(memory, a.control, a.object); put(memory, a.control + 4, a.body);
  for (const [offset, values] of [[8, [0, 65536, 0]], [0x14, [0, 65536, 0]], [0x20, [20 * 65536, 6 * 65536, 50 * 65536]], [0x2c, [21 * 65536, 7 * 65536, 49 * 65536]]]) values.forEach((value, lane) => put(memory, a.control + offset + lane * 4, value));
  memory[a.control + 0x38] = [0, 4, 5, 6, 254, 255][Math.floor(fixture / 256) % 6]; memory[a.control + 0x39] = (fixture ^ fixture >>> 4) & 255; memory[a.control + 0x3b] = [0, 0x40, 0x80, 0xc0][Math.floor(fixture / 64) % 4];
  word(memory, a.control + 0x40, [-32768, -1, 0, 50, 110, 32767][Math.floor(fixture / 16) % 6]); word(memory, a.control + 0x42, [-1, 0, 6, 40, 32767][Math.floor(fixture / 96) % 5]); put(memory, a.control + 0x44, fixture % 7 ? 0 : 65536); word(memory, a.control + 0x48, [-1, 0, 1][fixture % 3]); word(memory, a.control + 0x4a, [-32768, -1, 0, 1, 7, 8, 32767][fixture % 7]);
  put(memory, a.body + 0x710, [0, 0x10000, 0x20000, 0x4000, 0x34000][Math.floor(fixture / 32) % 5]); put(memory, a.body + 0x714, Math.floor(fixture / 16) & 3); put(memory, 0x91ff80, fixture % 7 ? 0 : 14);
  put(memory, a.object, 0x8003); put(memory, a.object + 4, 0); put(memory, a.object + 12, 0x45000);
  for (let lane = 0; lane < 3; lane++) {const value = [10, 20, -30][lane] * 65536; put(memory, a.body + 0x34 + lane * 4, value); put(memory, a.object + 0x34 + lane * 4, value + memory.readInt32LE(a.control + 0x20 + lane * 4)); put(memory, a.body + 0x68 + lane * 4, lane === 1 ? 0 : (fixture % 9 - 4) * 65536); put(memory, a.body + 0xb8 + lane * 4, lane === 1 ? (fixture % 15) * 1000 : 0);}
  for (let index = 0; index < 4; index++) {const wheel = a.body + 0x324 + index * 200; memory[wheel] = Math.floor(fixture / 16) >>> index & 1; for (let lane = 0; lane < 3; lane++) {put(memory, wheel + 0x40 + lane * 4, lane === 1 ? 65536 : 0); put(memory, wheel + 0x1c + lane * 4, (index + lane + 1) * 131072);}}
  word(memory, a.body + 0x65e, 0); put(memory, a.body + 0x11c, fixture % 5 ? 0x00010100 : -1); put(memory, 0x90b98c, a.pack); put(memory, a.pack, a.sectors); put(memory, a.pack + 0x1c, a.normals); put(memory, a.sectors, a.sector); put(memory, a.sector + 8, 3); put(memory, a.sector + 12, 4); put(memory, a.sector + 0x20, a.vertices); put(memory, a.sector + 0x50, a.packets); put(memory, a.normals, 0x40000); put(memory, 0x9092b0, a.routes);
  for (let row = 0; row <= 4; row++) for (let column = 0; column <= 3; column++) {const p = a.vertices + (row * 4 + column) * 8; word(memory, p, column * 16); word(memory, p + 2, 0); word(memory, p + 4, row * 16);}
  word(memory, a.routes + 16, 256);
  for (let lane = 0; lane < 3; lane++) {put(memory, a.first + lane * 4, [65536, 0, 0][lane]); put(memory, a.second + lane * 4, fixture % 2 ? [0, 65536, 0][lane] : [-65536, 0, 0][lane]);}
  return {...runtime, fixture, addresses: a};
}

export async function verifyVehicleAuxiliaryAnimation({fixtures = 2400, persistentScenarios = 160, basisFixtures = 1200, output = 'analysis/vehicle-auxiliary-animation-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), a = auxiliaryAnimationAddresses; let steps = 0;
  const entries = [0x416400, 0x416510, 0x416da0, 0x416fa0, 0x4168d0, 0x416c50, 0x4165c0, 0x416620, 0x4166d0, 0x417390, 0x417490, 0x417590, 0x416f20, 0x4167f0, 0x417210, 0x492900], visits = {}, reached = new Set();
  machine.onInstruction = address => {reached.add(address); if (entries.includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
  const compare = label => {for (const [start, end] of [[0, a.stack - 4096], [a.stack + 64, memory.length]]) {const native = machine.bytes.subarray(start, end), source = memory.subarray(start, end); if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`${label} difference0x${(start + offset).toString(16)} native${native[offset]} JS${source[offset]}`);}}};
  const run = (entry, ecx, edx, args = []) => {machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); args.forEach((value, index) => put(machine.bytes, a.stack + 4 + index * 4, value)); steps += machine.run(3000000);};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); machine.reset(); program.initializeMemory(memory); const runtime = createAuxiliaryAnimationFixture(fixture, memory), selector = fixture % entries.length, entry = entries[selector]; memory.copy(machine.bytes);
    let ecx = a.control, edx = a.body, args = [];
    try {
      if (selector === 0) {ecx = a.record; animation.updateVehicleAuxiliaryAnimation(ecx, runtime);}
      else if (selector === 1) animation.stepAuxiliaryAnimationPose(ecx, edx, runtime);
      else if (selector === 2) {edx = fixture & 3; args = [memory.readInt32LE(a.body + 0x710)]; animation.updateAuxiliaryAnimationControls(ecx, edx, args[0], runtime);}
      else if (selector === 3) {ecx = a.output; args = [a.control]; animation.sampleAuxiliaryAnimationDirection(ecx, edx, args[0], runtime);}
      else if (selector === 4) {args = [a.first, a.output, a.output + 16]; animation.blendAuxiliaryAnimationContacts(ecx, edx, ...args, runtime);}
      else if (selector === 5) animation.recoverAuxiliaryAnimation(ecx, edx, runtime);
      else if (selector === 6) animation.snapAuxiliaryAnimationBody(ecx, edx, runtime);
      else if (selector === 7) animation.applyAuxiliaryAnimationForces(ecx, edx, runtime);
      else if (selector === 8) animation.updateAuxiliaryAnimationMatrix(ecx, edx, runtime);
      else if (selector === 9) {ecx = a.control + 0x2c; edx = a.control + 0x20; animation.filterAnimationPosition(ecx, edx, runtime);}
      else if (selector === 10) {ecx = a.output; edx = a.first; args = [a.second, 15, 1, fixture % 3 ? 0 : a.body]; animation.mixAnimationDirections(ecx, edx, ...args, runtime);}
      else if (selector === 11) {ecx = a.output; edx = a.first; args = [a.body]; animation.mixAntipodalAnimationDirection(ecx, edx, args[0], runtime);}
      else if (selector === 12) {edx = a.control + 0x20; animation.updateAnimationMotionGate(ecx, edx, runtime);}
      else if (selector === 13) {ecx = a.first; edx = a.second; args = [a.output]; animation.publishAnimationMatrix(ecx, edx, args[0], runtime);}
      else if (selector === 14) {ecx = a.output; edx = a.output + 16; args = [a.body]; populateRawVehicleTrackBasis(args[0], ecx, edx, runtime);}
      else {ecx = a.control + 8; edx = a.first; animation.rotateAnimationVector(ecx, edx, runtime);}
      run(entry, ecx, edx, args); compare(`animation fixture${fixture} entry${entry.toString(16)}`);
    } catch (error) {console.error({fixture, entry: entry.toString(16), pc: machine.pc?.toString(16)}); throw error;}
  }
  const persistentFrames = 5, parentStates = {acquired: 0, active: 0, airborne: 0, snapped: 0};
  for (let scenario = 0; scenario < persistentScenarios; scenario++) {
    memory.fill(0); machine.reset(); program.initializeMemory(memory); const runtime = createAuxiliaryAnimationFixture(scenario, memory);
    word(memory, a.control + 0x40, 50); word(memory, a.control + 0x42, 6); memory[a.control + 0x38] = scenario % 4 ? 0 : 6; memory[a.control + 0x39] = scenario % 3 ? 0 : 4; memory[a.control + 0x3b] = scenario % 2 ? 0x40 : 0; memory.copy(machine.bytes);
    for (let frame = 0; frame < persistentFrames; frame++) {
      const mask = [15, 7, 0, 15, 3][(scenario + frame) % 5];
      for (let wheel = 0; wheel < 4; wheel++) {memory[a.body + 0x324 + wheel * 200] = mask >>> wheel & 1; machine.bytes[a.body + 0x324 + wheel * 200] = memory[a.body + 0x324 + wheel * 200];}
      put(memory, a.body + 0x714, frame % 3); put(machine.bytes, a.body + 0x714, frame % 3);
      parentStates.acquired += mask === 15 ? 1 : 0; parentStates.active += memory[a.control + 0x3b] & 0xc0 ? 1 : 0; parentStates.airborne += memory[a.control + 0x38] > 5 ? 1 : 0; parentStates.snapped += memory[a.control + 0x39] & 4 ? 1 : 0;
      animation.updateVehicleAuxiliaryAnimation(a.record, runtime); run(0x416400, a.record, 0); compare(`persistent animation${scenario}/frame${frame}`);
    }
  }
  for (let fixture = 0; fixture < basisFixtures; fixture++) {
    memory.fill(0); machine.reset(); program.initializeMemory(memory); const runtime = createAuxiliaryAnimationFixture(fixture, memory), width = 2 + fixture % 3, sectorId = [0, 3, 4, 5, 7, 8, 10, 16, 24][fixture % 9], row = [0, 15, 16, 18, 19, 23, 24, 59, 60, 70, 71, 79, 80][Math.floor(fixture / 9) % 13], column = fixture % (width + 1), player = fixture % 6;
    put(memory, a.sectors + sectorId * 4, a.sector); put(memory, a.sector + 8, width); put(memory, a.sector + 12, 80); word(memory, a.body + 0x65e, player); put(memory, a.body + 0x11c, fixture % 17 ? row << 16 | column << 8 | sectorId : -1);
    memory[a.session + 0x579] = [0, 11, 12][Math.floor(fixture / 13) % 3]; memory[0x909320 + player * 0x30c] = [4, 6, 7, 8, 11, 13, 14][Math.floor(fixture / 3) % 7]; memory[0x909322 + player * 0x30c] = fixture & 255;
    for (let r = 0; r <= 80; r++) for (let c = 0; c <= width; c++) {const p = a.vertices + (r * (width + 1) + c) * 8; for (let lane = 0; lane < 3; lane++) word(memory, p + lane * 2, fixture * (lane + 1) * 701 + r * r * 13 + c * 997);}
    for (let index = 0; index < 8; index++) put(memory, a.normals + index * 4, Math.imul(fixture * 7919 + index, 0x1727341));
    for (let index = 0; index < width * 80; index++) word(memory, a.packets + index * 8 + 2, index & 7);
    for (let lane = 0; lane < 3; lane++) word(memory, a.routes + (fixture & 255) * 20 + 12 + lane * 2, fixture * (lane + 1) * 919);
    const normal = fixture % 11 ? a.output + 16 : a.output + 4; memory.copy(machine.bytes); const result = populateRawVehicleTrackBasis(a.body, a.output, normal, runtime);
    run(0x417210, a.output, normal, [a.body]); assert.equal(machine.r.EAX, result); compare(`raw basis fixture${fixture}`);
  }
  const own = await readInstructionEvidence(['283-vehicle-state-416400-assembly.json', '1513-aux-animation-driver-assembly.json', '1515-aux-animation-publisher-assembly.json', '1517-aux-animation-sample-assembly.json', '1519-aux-animation-blend-assembly.json', '1521-aux-animation-special-assembly.json', '1523-aux-animation-secondary-assembly.json', '1525-aux-animation-geometry-assembly.json', '1527-aux-animation-output-assembly.json', '1534-aux-animation-spring-assembly.json', '1536-aux-animation-pose-filter-assembly.json', '1538-aux-animation-motion-cap-assembly.json', '1581-aux-animation-matrix-output-assembly.json', '1583-aux-animation-direction-frame-assembly.json', '1585-aux-animation-antipodal-mix-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const basis = await readInstructionEvidence(['266-vehicle-track-basis-assembly.json', '268-track-basis-axis-assembly.json', '271-track-basis-route-sign-assembly.json']);
  const report = {method: 'Complete416400 auxiliary-animation parent and actual416da0/416510 control/acquisition plus every reached track-basis,weighted direction/antipodal filter,spatial snap,force/hysteresis,quaternion rotation and matrix publisher. No game mocks or external services. Raw417210 bridge uses actual44a1c0 mode policy and449cd0 route sign. All declared non-stack bytes compared,including full body/control/auxiliary-body/session/progression/terrain/pool/RNG/root scratch. Persistent parent calls take declared contact/edge changes between ticks. Extra raw-basis corpus covers original signed short geometry,normal packets,route sign,sector/mode/progress policies,grid endpoints,negative references and overlapping output buffers. Runtime storage/records/shape/model constructor producers remain explicit; no original-process execution.', targetSha256: program.sha256, evidence: [...own.evidence, ...basis.evidence].map(item => item.evidence_id), ownInstructions: own.instructions.length, rawBasisInstructions: basis.instructions.length, fixtures, persistentScenarios, persistentFrames, parentStates, basisFixtures, calls: fixtures + persistentScenarios * persistentFrames + basisFixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, externalCalls: [...machine.externalCalls.keys()], matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report, 'Existing report differs; choose a new output filename.');}}
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyVehicleAuxiliaryAnimation()));

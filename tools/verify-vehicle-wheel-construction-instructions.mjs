import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createWheelRenderFixture, wheelRenderAddresses as w} from './verify-wheel-render-state-instructions.mjs';
import {createVehicleWheels, initializeVehicleWheelConstructionTables} from '../src/vehicle-wheel-construction.mjs';
import {prepareVehicleWheelRender} from '../src/wheel-render-state.mjs';
import {createAuxiliaryAnimationFixture, auxiliaryAnimationAddresses as aux} from './verify-vehicle-auxiliary-animation-instructions.mjs';
import {updateVehicleAuxiliaryAnimation} from '../src/vehicle-auxiliary-animation.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
export const wheelConstructionAddresses = {...w, arena: 0x200000, model: 0x300000};
export function createVehicleWheelConstructionFixture(fixture, memory = Buffer.alloc(0xa00000)) {
  const runtime = createWheelRenderFixture(fixture, memory), a = wheelConstructionAddresses;
  initializeVehicleWheelConstructionTables(memory); memory.fill(0x93, a.arena, a.arena + 0x20000); memory.fill(0x4e, a.model, a.model + 0x2000);
  const model = fixture % 7 ? a.model : 0, offsets = [0, fixture % 2 ? 0x100 : 0, fixture % 3 ? 0x200 : 0x100];
  word(memory, a.model + 0x1c, offsets[1]); word(memory, a.model + 0x1e, offsets[2]);
  for (const offset of [0, 0x100, 0x200]) {const p = a.model + offset, faces = (fixture + offset / 256) % 4; put(memory, p + 0x10, 0x300); put(memory, p + 0x14, 0x300 + faces * 40); put(memory, p + 12, 0x310000 + offset); put(memory, p + 0x40, 0x320000 + offset); memory[p + 4] = fixture + offset / 256 & 255; word(memory, p + 10, fixture * 997);}
  for (let offset = 0x300; offset < 0x1600; offset += 4) put(memory, a.model + offset, Math.imul(fixture * 31 + offset, 0x1727341));
  put(memory, 0x902eec, a.arena); put(memory, 0x70dcf4, fixture % 4); put(memory, 0x6e6b44, [-1, 0, 508, 510, 511, 512, 513][fixture % 7]); put(memory, a.body + 0xa8, [0, 32768, 65536, -65536, 2147483647][fixture % 5]);
  for (let index = 0; index < 4; index++) for (let lane = 0; lane < 3; lane++) word(memory, a.body + 0x180 + index * 28 + lane * 2, [fixture % 127 - 63, index * 13 + 8, 12][lane]);
  return {...runtime, model, vehicleIndex: [0, 1, 5, 255, 256, -1, -2147483648][fixture % 7], arenaOffset: fixture % 4};
}

export async function verifyVehicleWheelConstruction({fixtures = 2400, consumerScenarios = 120, coefficientFixtures = 256, output = 'analysis/vehicle-wheel-construction-complete-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), a = wheelConstructionAddresses;
  const own = await readInstructionEvidence(['1531-wheel-render-constructor-owner-assembly.json'], {directory: 'analysis/native-simulation/results'});
  let steps = 0, cookies = 0; const reached = new Set(), visits = {}, coefficientStates = {completed: 0, divideByZero: 0}, watched = new Set([0x41caf0, 0x4741c0, 0x474510, 0x474490, 0x41d460, 0x41ca60, 0x41c990, 0x41d2b0, 0x416400]);
  machine.onInstruction = address => {steps++; reached.add(address); if (watched.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX | 0, m.bytes.readInt32LE(0x5e8890)); cookies++;});
  const run = (entry, ecx, edx = 0, args = []) => {machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); args.forEach((value, index) => put(machine.bytes, a.stack + 4 + index * 4, value)); machine.run(3000000);};
  const compare = label => {for (const [start, end] of [[0, a.stack - 4096], [a.stack + 64, memory.length]]) {const native = machine.bytes.subarray(start, end), source = memory.subarray(start, end); if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`${label} byte0x${(start + offset).toString(16)} native${native[offset]} JS${source[offset]}`);}}};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); machine.reset(); program.initializeMemory(memory); const runtime = createVehicleWheelConstructionFixture(fixture, memory); memory.copy(machine.bytes);
    try {createVehicleWheels(a.body, runtime.model, runtime.vehicleIndex, runtime); run(0x41caf0, a.body, runtime.model, [runtime.vehicleIndex]); compare(`wheel constructor${fixture}`);} catch (error) {console.error({fixture, model: runtime.model}); throw error;}
  }
  for (let fixture = 0; fixture < coefficientFixtures; fixture++) {
    memory.fill(0); machine.reset(); program.initializeMemory(memory); const runtime = createVehicleWheelConstructionFixture(fixture, memory);
    const values = [[0, 0, 0], [32767, 32767, 32767], [-32768, -32768, -32768], [32767, 0, 0], [1, 0, 0], [-32768, 0, 0], [-1, -1, -1], [32767, -32768, 1]][fixture % 8];
    for (let index = 0; index < 4; index++) for (let lane = 0; lane < 3; lane++) word(memory, a.body + 0x180 + index * 28 + lane * 2, values[lane]);
    memory.copy(machine.bytes); let sourceError, nativeError;
    try {createVehicleWheels(a.body, runtime.model, runtime.vehicleIndex, runtime);} catch (error) {sourceError = error;}
    try {run(0x41caf0, a.body, runtime.model, [runtime.vehicleIndex]);} catch (error) {nativeError = error;}
    if (sourceError || nativeError) {assert.match(sourceError?.message ?? '', /division by zero/); assert.match(nativeError?.message ?? '', /IDIV by zero/); coefficientStates.divideByZero++;} else coefficientStates.completed++;
    compare(`coefficient boundary${fixture}`);
  }
  const consumerFrames = 4;
  for (let scenario = 0; scenario < consumerScenarios; scenario++) {
    memory.fill(0); machine.reset(); program.initializeMemory(memory); createAuxiliaryAnimationFixture(scenario, memory);
    //The standalone render fixture uses the same address for public angle
    //input as this coherent animation fixture uses for its controller.
    const controller = Buffer.from(memory.subarray(aux.control, aux.control + 0x4c));
    const runtime = createVehicleWheelConstructionFixture(scenario, memory); controller.copy(memory, aux.control);
    //Connected consumers require a nondegenerate orientation and bounded
    //motion, unlike the standalone constructor's overflow-heavy matrix cases.
    for (let lane = 0; lane < 9; lane++) word(memory, a.body + 0xc4 + lane * 2, lane % 4 ? 0 : 4096);
    for (let lane = 0; lane < 3; lane++) {put(memory, a.body + 0x34 + lane * 4, [10, 20, -30][lane] * 65536); put(memory, a.body + 0x68 + lane * 4, lane === 1 ? 0 : (scenario % 9 - 4) * 65536); put(memory, a.body + 0xb8 + lane * 4, lane === 1 ? (scenario % 15) * 1000 : 0);}
    put(memory, a.body + 0x710, 0); put(memory, a.body + 0x714, 0);
    //The constructor supplies wheels; the separately declared auxiliary
    //controller/body and terrain/spatial mapping remain shared live inputs.
    put(memory, aux.record, a.body); word(memory, a.body + 0x65e, 0); put(memory, a.body + 0x11c, -1); word(memory, aux.control + 0x40, 50); word(memory, aux.control + 0x42, 6); memory[aux.control + 0x39] = 0; memory[aux.control + 0x3b] = 64;
    memory.copy(machine.bytes); createVehicleWheels(a.body, runtime.model, runtime.vehicleIndex, runtime); run(0x41caf0, a.body, runtime.model, [runtime.vehicleIndex]); compare(`consumer constructor${scenario}`);
    for (let frame = 0; frame < consumerFrames; frame++) {
      //Declared producer updates supplied between connected consumers.
      for (let wheel = 0; wheel < 4; wheel++) {const p = a.body + 0x324 + wheel * 200; const flags = frame % 2 ? 1 : 0; memory[p] = flags; machine.bytes[p] = flags; put(memory, p + 0x78, frame * (wheel + 1) * 4097); put(machine.bytes, p + 0x78, frame * (wheel + 1) * 4097); if (flags) {put(memory, p + 0x44, 65536); put(machine.bytes, p + 0x44, 65536);}}
      prepareVehicleWheelRender(a.body, runtime); run(0x41d2b0, a.body); compare(`constructor/render${scenario}/frame${frame}`);
      updateVehicleAuxiliaryAnimation(aux.record, runtime); run(0x416400, aux.record); compare(`constructor/auxiliary${scenario}/frame${frame}`);
    }
  }
  const report = {method: 'Complete 41caf0 wheel/render constructor with actual 4741c0 arena/model allocation, 474510/474490 geometry publication, 41d460 and every render/numeric descendant. Compares all declared non-stack memory including vehicle/wheels, allocated render bodies, model aliases/reference counts, arena/registration/global state, original tables and coefficient root scratch. Coefficient boundaries compare completed paths and all mutations before native divide-by-zero faults. Consumer scenarios execute constructor -> actual 41d2b0 -> actual 416400 repeatedly on shared bytes, with declared wheel contacts/spin and existing auxiliary/spatial runtime. Caller supplies arena, model storage and descriptors; their upstream producers are separate. The compiler cookie checker is admitted but no external service is reached. No original process execution.', targetSha256: program.sha256, evidence: own.evidence.map(item => item.evidence_id), ownInstructions: own.instructions.length, fixtures, coefficientFixtures, coefficientStates, consumerScenarios, consumerFrames, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, cookieChecks: cookies, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report, 'Existing report differs; choose a new output filename.');}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyVehicleWheelConstruction()));

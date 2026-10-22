import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {prepareVehicleWheelRender, prepareWheelRender, buildRenderRotationMatrix, transformRenderShortVector, updateWheelRenderOffset, initializeWheelRenderTables} from '../src/wheel-render-state.mjs';
import {updateVehicleControlState} from '../src/vehicle-control-state.mjs';

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address), word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
export const wheelRenderAddresses = {body: 0x100000, outputs: 0x120000, angles: 0x140000, matrix: 0x141000, stack: 0x9000};
export function createWheelRenderFixture(fixture, memory = Buffer.alloc(0xa00000)) {
  const a = wheelRenderAddresses;
  initializeWheelRenderTables(memory); memory.fill(0x69, a.body, a.body + 0x3000); memory.fill(0x55, a.outputs, a.outputs + 0x5000); memory.fill(0xa5, a.stack - 0x1000, a.stack + 64); memory.fill(0x77, a.matrix, a.matrix + 32);
  memory.fill(0x53, 0x91cdc0, 0x91ce00); memory.fill(0x67, 0x91d360, 0x91d374); memory.fill(0x79, 0x91d3e4, 0x91d454);
  for (let lane = 0; lane < 10; lane++) word(memory, a.body + 0xc4 + lane * 2, fixture % 3 ? [-32768, -32767, -4096, -1, 0, 1, 4096, 32766, 32767][(fixture + lane * 3) % 9] : lane % 4 ? 0 : 4096);
  put(memory, a.body + 12, fixture ^ 0x415234); put(memory, a.body + 0x11c, fixture % 2 ? -1 : 0x12341234);
  for (let lane = 0; lane < 3; lane++) put(memory, a.body + 0x34 + lane * 4, (fixture * 1234567 * (lane + 1)) | 0);
  put(memory, a.body + 0x644, [-2147483648, -65537, -65536, -1, 0, 1, 65536, 65537, 2147483647][fixture % 9]); put(memory, a.body + 0x648, [-2147483648, -7, -1, 0, 1, 7, 2147483647][Math.floor(fixture / 9) % 7]); memory[a.body + 0x718] = fixture % 2 ? 8 : 1; memory[a.body + 0x64f] = Math.floor(fixture / 2) % 4;
  for (let index = 0; index < 4; index++) {
    const wheel = a.body + 0x324 + index * 200;
    memory[wheel] = (fixture + index) & 1; word(memory, wheel + 2, [-32768, -97, -1, 0, 1, 97, 32767][(fixture + index) % 7]);
    put(memory, wheel + 0x6c, fixture % 17 === 0 && !index ? a.body : a.outputs + index * 0x1000);
    word(memory, wheel + 0x70, (fixture * 37 + index * 101) | 0); word(memory, wheel + 0x72, 500); word(memory, wheel + 0x74, -(fixture * 71 + index)); word(memory, wheel + 0x76, 0x7799);
    put(memory, wheel + 0x78, [-2147483648, -4097, -4096, -1, 0, 1, 4095, 4096, 2147483647][(fixture + index) % 9]); put(memory, wheel + 0x80, [-2147483648, -1, 0, 0x1dffff, 0x1e0000, 0x1e0001, 2147483647][(fixture + index) % 7]);
  }
  for (let lane = 0; lane < 3; lane++) word(memory, a.angles + lane * 2, (fixture * (lane + 1) * 173 - 32768) | 0);
  return {memory, fixture, scratchBase: a.stack};
}

export async function verifyWheelRenderState({fixtures = 2400, output = 'analysis/wheel-render-state-complete-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), a = wheelRenderAddresses;
  const own = await readInstructionEvidence(['281-vehicle-state-41d2b0-assembly.json', '1501-wheel-render-child-assembly.json', '1505-wheel-render-rotation-builder-assembly.json', '1507-wheel-render-matrix-transform-assembly.json', '1509-wheel-render-position-assembly.json', '1180-dynamic-stage-transform-assembly.json'], {directory: 'analysis/native-simulation/results'});
  let steps = 0; const reached = new Set(), visits = {}, histogram = {}, watched = new Set([0x41d2b0, 0x41d460, 0x432680, 0x433400, 0x41d610, 0x4334b0]);
  machine.onInstruction = address => {reached.add(address); if (watched.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); machine.reset(); program.initializeMemory(memory); const runtime = createWheelRenderFixture(fixture, memory), wheel = a.body + 0x324;
    const selector = fixture % 6, entry = [0x41d2b0, 0x41d460, 0x432680, 0x433400, 0x41d610, 0x41d2b0][selector]; histogram[entry.toString(16)] = (histogram[entry.toString(16)] ?? 0) + 1;
    if (selector === 3) {for (let lane = 0; lane < 10; lane++) word(memory, 0x91d360 + lane * 2, memory.readUInt16LE(a.body + 0xc4 + lane * 2)); for (let lane = 0; lane < 3; lane++) word(memory, 0x91d408 + lane * 4, fixture * (lane + 1) * 701);}
    memory.copy(machine.bytes);
    let ecx = a.body, edx = 0, args = [];
    if (selector === 1) {ecx = wheel; edx = a.body; args = [memory.readInt32LE(a.body + 0x644)]; prepareWheelRender(wheel, a.body, args[0], runtime);}
    else if (selector === 2) {ecx = a.angles; edx = a.matrix; buildRenderRotationMatrix(ecx, edx, runtime);}
    else if (selector === 3) transformRenderShortVector(runtime);
    else if (selector === 4) {ecx = wheel; edx = a.body; updateWheelRenderOffset(ecx, edx, runtime);}
    else prepareVehicleWheelRender(a.body, runtime);
    machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); args.forEach((value, index) => put(machine.bytes, a.stack + 4 + index * 4, value));
    try {
      steps += machine.run(1000000);
      for (const [start, end] of [[0, a.stack - 4096], [a.stack + 64, memory.length]]) {
        const native = machine.bytes.subarray(start, end), source = memory.subarray(start, end);
        if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`wheel render fixture${fixture} entry${entry.toString(16)} difference0x${(start + offset).toString(16)} native${native[offset]} JS${source[offset]}`);}
      }
    } catch (error) {console.error({fixture, entry: entry.toString(16)}); throw error;}
  }
  const producerChains = 120;
  for (let fixture = 0; fixture < producerChains; fixture++) {
    memory.fill(0); machine.reset(); program.initializeMemory(memory); const runtime = createWheelRenderFixture(fixture, memory);
    put(memory, 0x5ecb1c, 0x150000); put(memory, 0x15057c, fixture % 6);
    memory[a.body + 0x708] = fixture * 17 & 255; memory[a.body + 0x709] = fixture * 31 & 255; memory[a.body + 0x70a] = fixture & 31; memory[a.body + 0x710] = fixture & 16;
    memory.copy(machine.bytes);
    for (const [entry, source] of [[0x42a9a0, updateVehicleControlState], [0x41d2b0, prepareVehicleWheelRender]]) {
      source(a.body, runtime); machine.entry = entry; machine.r.ECX = a.body; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); steps += machine.run(1000000);
      assert.ok(machine.bytes.subarray(a.stack + 64).equals(memory.subarray(a.stack + 64)), `input/render producer fixture${fixture}/entry${entry.toString(16)}`);
    }
  }
  const tableEvidence = [];
  for (const filename of ['1510-wheel-render-angle-table.json', '1511-wheel-render-scale-bytes.json']) tableEvidence.push(JSON.parse(await readFile(`analysis/native-simulation/results/${filename}`, 'utf8')).structuredContent.evidence_id);
  const report = {method: 'Complete41d2b0 wheel/render parent with actual41d460 wheel,432680 phase-table rotation,433400 short matrix transform,41d610 suspension offset and4334b0 offset transform. No callbacks,game mocks or imported services. Original16384-byte phase-pair table and float scale retained. Full declared non-stack memory compared after mixed parent/helper cases,including aliased render-body/source body,signed/overflowing steering,mode8 smoothing,front/rear steering split,orientation reversal,negative division,offset clamp,short/low32 matrix products,renderer float scratch and live copied terrain/position. Additional actual42a9a0 input-axis→steering producer chains precede the full render parent. Synthetic supplied body/wheel/render-object storage; no upstream constructor or original-process claim.', targetSha256: program.sha256, evidence: [...own.evidence.map(item => item.evidence_id), ...tableEvidence], instructions: own.instructions.length, fixtures, producerChains, calls: fixtures + producerChains * 2, entryCalls: histogram, actualGameCalls: visits, reachedInstructions: reached.size, instructionSteps: steps, externalCalls: [...machine.externalCalls.keys()], matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report, 'Existing report differs; choose a new output filename.');}}
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWheelRenderState()));

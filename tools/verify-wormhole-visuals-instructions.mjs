import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {initializeWormholeVisualTables, scaleWormholeColor, orientWormholeBody, positionWormholeRing, randomizeWormholeSpark, buildWormholeMesh} from '../src/wormhole-visuals.mjs';
const put = (m, p, value) => m.writeInt32LE(value | 0, p), word = (m, p, value) => m.writeUInt16LE(value & 65535, p);
export const wormholeVisualAddresses = {body: 0x100000, first: 0x110000, second: 0x111000, output: 0x112000, color: 0x113000, stack: 0x9000};
export function createWormholeVisualFixture(fixture = 0, memory = Buffer.alloc(0xa00000)) {
  const a = wormholeVisualAddresses; initializeWormholeVisualTables(memory); memory.fill(0x69, a.body, a.body + 0x3000); memory.fill(0x53, a.stack - 4096, a.stack + 64); memory.fill(0x77, a.output, a.output + 64); memory.fill(0x67, a.color, a.color + 64);
  for (let lane = 0; lane < 10; lane++) word(memory, a.body + 0xc4 + lane * 2, fixture % 3 ? [32767, -32768, -1, 0, 1, 4096][(fixture + lane * 3) % 6] : lane % 4 ? 0 : 4096);
  for (let lane = 0; lane < 3; lane++) {put(memory, a.body + 0x34 + lane * 4, fixture * (lane + 1) * 1727341); put(memory, a.first + lane * 4, [65536, -65536, 16384][(fixture + lane) % 3]); put(memory, a.second + lane * 4, [-65536, 32768, 65536][(fixture * 3 + lane) % 3]);}
  put(memory, a.body + 0x33c, [-176, -1, 0, 1, 63, 128, 176, 32767][fixture % 8]); put(memory, a.body + 0x188, [0, 1, 2, 4, 0x40, 0x80][fixture % 6]); word(memory, a.body + 0x2a34, [-32768, -1, 0, 4095, 4096, 32767][fixture % 6]);
  memory[a.body + 0x341] = fixture & 255; put(memory, 0x5ed2c8, [0, 1, -1, 0x7fffffff, fixture * 1727341 | 0][fixture % 5]); memory[0x6e65a7] = fixture * 3 & 255; memory[0x6e65da] = fixture * 7 & 255;
  return {memory, scratchBase: a.stack, roundingMode: ['nearest-even', 'toward-zero', 'down', 'up'][fixture % 4]};
}
export async function verifyWormholeVisuals({fixtures = 2400, output = 'analysis/wormhole-visuals-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), a = wormholeVisualAddresses;
  const own = await readInstructionEvidence(['3117-object-stage-46b070-assembly.json', '3129-object-stage-49cc60-assembly.json', '3131-object-stage-49cde0-assembly.json', '3135-object-stage-49d310-assembly.json', '3143-object-stage-49cf60-assembly.json', '3145-object-stage-407190-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const reached = new Set(), visits = {}, entries = new Set([0x46b070, 0x407190, 0x49cc60, 0x49cde0, 0x49cf60, 0x49d310, 0x432080, 0x422c70, 0x41c9c0, 0x492cc0, 0x491f40]); let steps = 0, aliases = 0;
  machine.onInstruction = address => {steps++; reached.add(address); if (entries.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createWormholeVisualFixture(fixture, memory), selector = fixture % 6;
    let ecx, edx, args = [], entry, outputAddress = a.output, color = a.color;
    if ((selector === 2 || selector === 3) && fixture % 5 === 0) {outputAddress = fixture & 1 ? a.first : a.second; color = outputAddress + 4; aliases++;}
    machine.reset(); machine.fpuRounding = runtime.roundingMode; memory.copy(machine.bytes);
    if (selector === 0) {ecx = a.first; edx = a.output; entry = 0x46b070; orientWormholeBody(ecx, edx, runtime);}
    else if (selector === 1) {ecx = [0, -1, 0x12345678, 0xffabcdef][Math.floor(fixture / 6) % 4]; edx = [-1, 0, 1, 127, 255, 256, 65535, -2147483648][Math.floor(fixture / 24) % 8]; args = [a.output, a.output + 3]; entry = 0x407190; scaleWormholeColor(ecx, edx, ...args, runtime);}
    else if (selector === 2 || selector === 3) {ecx = a.first; edx = a.second; args = [[-128, -1, 0, 1, 64, 88, 127, 65535][Math.floor(fixture / 6) % 8], fixture * 7919 | 0, outputAddress, color]; entry = selector === 2 ? 0x49cc60 : 0x49cde0; positionWormholeRing(ecx, edx, ...args, runtime, selector === 3);}
    else if (selector === 4) {ecx = a.output; entry = 0x49cf60; randomizeWormholeSpark(ecx, runtime);}
    else {ecx = a.body; entry = 0x49d310; buildWormholeMesh(ecx, runtime);}
    machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx ?? 0; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); args.forEach((value, index) => put(machine.bytes, a.stack + 4 + index * 4, value));
    try {
      machine.run(3_000_000); const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000);
      if (!actual.equals(expected)) {const offset = actual.findIndex((value, index) => value !== expected[index]); assert.fail(`fixture ${fixture}/entry ${entry.toString(16)} byte 0x${(0x10000 + offset).toString(16)} native ${actual[offset]} JS ${expected[offset]}`);}
    } catch (error) {console.error({fixture, entry: entry.toString(16)}); throw error;}
  }
  const report = {method: 'Actual wormhole orientation46b070, ring positioning49cc60/49cde0, spark randomization49cf60, complete mesh49d310 and packed-channel arithmetic407190. Real float normalization, fixed root/division/cross and x87 attachment transform descendants. All mapped data >=10000h compared, with four rounding modes, signed phase-prefix bytes, RNG/alpha thresholds and overlapping ring inputs/outputs/colors. No game mocks, services or original execution. This validates the named helpers only; full49ac30 state/transport/constructor graph remains separate ongoing work.', targetSha256: program.sha256, evidence: own.evidence.map(value => value.evidence_id), instructions: own.instructions.length, fixtures, aliases, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, externalCalls: [...machine.externalCalls.keys()], matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report, 'Existing report differs; choose a new path.');}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWormholeVisuals()));

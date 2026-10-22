import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createWormholeVisualFixture, wormholeVisualAddresses as a} from './verify-wormhole-visuals-instructions.mjs';
import {selectWormholeTarget, writeWormholeTargetPoint, clampWormholeVelocity, captureWormholeBasis, updateWormholeEmergence, updateWormholeChase, updateWormholeCapture} from '../src/wormhole-targeting.mjs';
const put = (m, p, value) => m.writeInt32LE(value | 0, p), word = (m, p, value) => m.writeUInt16LE(value & 65535, p);
export const wormholeTargetAddresses = {...a, owner: 0x120000, target: 0x124000, session: 0x128000};
export function createWormholeTargetFixture(fixture = 0, memory = Buffer.alloc(0xa00000)) {
  const runtime = createWormholeVisualFixture(fixture, memory), b = wormholeTargetAddresses;
  put(memory, 0x5ecb1c, b.session); memory[b.session + 0x54d] = fixture % 3; put(memory, 0x909300, b.owner); put(memory, 0x90960c, b.target); put(memory, 0x909324, fixture * 7919 & 65535); put(memory, 0x909630, fixture * 12347 & 65535);
  put(memory, a.body + 0x194, b.owner); put(memory, a.body + 0x198, fixture % 7 ? b.target : 1); put(memory, a.body + 0x180, [-1, 0, 39, 40, 58, 59, 89, 90, 298, 299, 2147483647][fixture % 11]); put(memory, a.body + 0x18c, (fixture % 16 - 8) * 65536); put(memory, a.body + 0x1a8, [0, 65536, 0x4000000, -1][fixture % 4]);
  for (const body of [a.body, b.owner, b.target]) {
    for (let lane = 0; lane < 9; lane++) word(memory, body + 0xc4 + lane * 2, lane % 4 ? 0 : 4096);
    for (let lane = 0; lane < 3; lane++) {put(memory, body + 0x34 + lane * 4, body === b.target ? [0, 65536, 4 * 65536, 16 * 65536, 512 * 65536, 2147483647, -2147483648][Math.floor(fixture / 7 + lane) % 7] : lane * 65536); put(memory, body + 0x68 + lane * 4, (fixture % 3 - 1) * 65536);}
    memory[body + 0x64f] = fixture & 1; memory[body + 0x6b4] = fixture & 1; memory[body + 0x70b] = fixture % 2; memory[body + 0x71e] = [0, 10, 11, 255][fixture % 4];
  }
  word(memory, b.owner + 0x65e, 0); word(memory, b.target + 0x65e, 1);
  for (const base of [0x19c, 0x1ac, 0x1d0]) for (let lane = 0; lane < 3; lane++) put(memory, a.body + base + lane * 4, lane === 2 ? 65536 : 0);
  put(memory, 0x6f2414, 0); put(memory, 0x6f2418, 0);
  return runtime;
}
export async function verifyWormholeTargeting({fixtures = 3500, output = 'analysis/wormhole-targeting-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), b = wormholeTargetAddresses;
  const own = await readInstructionEvidence(['3105-object-stage-49af70-assembly.json', '3107-object-stage-49b220-assembly.json', '3109-object-stage-49b3f0-assembly.json', '3119-object-stage-49aaa0-assembly.json', '3121-object-stage-49beb0-assembly.json', '3123-object-stage-49bdf0-assembly.json', '3125-object-stage-49bd50-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const reached = new Set(), visits = {}, entries = [0x49af70, 0x49b220, 0x49b3f0, 0x49aaa0, 0x49beb0, 0x49bdf0, 0x49bd50]; let steps = 0;
  machine.onInstruction = address => {steps++; reached.add(address); if (entries.includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createWormholeTargetFixture(fixture, memory), selector = fixture % 7, entry = entries[selector];
    //Capture/chase point queries require a real selected body, not sentinel1.
    if (selector === 2) put(memory, a.body + 0x198, b.target);
    machine.reset(); memory.copy(machine.bytes); let ecx = a.body, edx = 0, returned;
    if (selector === 0) updateWormholeEmergence(ecx, runtime);
    else if (selector === 1) returned = updateWormholeChase(ecx, runtime);
    else if (selector === 2) updateWormholeCapture(ecx, runtime);
    else if (selector === 3) {ecx = b.owner; edx = a.body; selectWormholeTarget(ecx, edx, runtime);}
    else if (selector === 4) {ecx = a.first; clampWormholeVelocity(ecx, runtime);}
    else if (selector === 5) {edx = a.output; put(memory, a.body + 0x198, b.target); put(machine.bytes, a.body + 0x198, b.target); writeWormholeTargetPoint(ecx, edx, runtime);}
    else captureWormholeBasis(ecx, runtime);
    machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1);
    try {
      machine.run(3_000_000); if (returned !== undefined) assert.equal(machine.r.EAX, returned);
      const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000); if (!actual.equals(expected)) {const offset = actual.findIndex((value, index) => value !== expected[index]); assert.fail(`fixture ${fixture}/entry ${entry.toString(16)} byte 0x${(0x10000 + offset).toString(16)} native ${actual[offset]} JS ${expected[offset]}`);}
    } catch (error) {console.error({fixture, entry: entry.toString(16)}); throw error;}
  }
  const report = {method: 'Actual wormhole emergence49af70, chasing49b220, capture49b3f0, target selection49aaa0, prediction49bdf0, clamp49beb0 and basis capture49bd50; actual fixed root/normalize/direction blend/sound absent-bank descendants, no game mocks/services. All mapped data>=10000h compared, including body/owner/target/registry/HUD/root/RNG. The wider state machine, launch and transport remain ongoing separate work.', targetSha256: program.sha256, evidence: own.evidence.map(value => value.evidence_id), instructions: own.instructions.length, fixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report, 'Existing report differs; choose a new path.');}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = process.argv.indexOf('--output'), output = flag < 0 ? undefined : process.argv[flag + 1];
  if (flag >= 0 && (!output || output.startsWith('--'))) throw Error('--output requires a new report filename.');
  console.log(JSON.stringify(await verifyWormholeTargeting(output === undefined ? {} : {output})));
}

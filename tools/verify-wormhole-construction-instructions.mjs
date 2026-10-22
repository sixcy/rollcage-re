import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createWormholeEffectFixture, wormholeEffectAddresses as a} from './verify-wormhole-effect-lifecycle-instructions.mjs';
import {initializeWormholeConstructionTables, createWormholeBody, activateWormhole} from '../src/wormhole-construction.mjs';
const put = (m, p, value) => m.writeInt32LE(value | 0, p), word = (m, p, value) => m.writeUInt16LE(value & 65535, p);
export const wormholeConstructionAddresses = {...a, owner: 0x120000, packet: 0x124000, record: 0x128000, shapes: 0x180000, free: 0x190000, active: 0x190100, reverse: 0x190200, physical: 0x170000};
export function createWormholeConstructionFixture(fixture = 0, memory = Buffer.alloc(0xa00000)) {
  const runtime = createWormholeEffectFixture(fixture, memory), b = wormholeConstructionAddresses; initializeWormholeConstructionTables(memory);
  put(memory, 0x6e6b44, [0, 1, 511, 512, 513][fixture % 5]); put(memory, 0x91e79c, b.shapes); put(memory, 0x91e780, b.free); put(memory, 0x91e78c, b.active); put(memory, 0x91e790, b.reverse); put(memory, 0x91e794, 255); put(memory, 0x91e784, -1); put(memory, 0x91e798, 0);
  for (let i = 0; i < 256; i++) memory[b.free + i] = i;
  put(memory, 0x902bc0, b.physical); word(memory, 0x902bc4, 0); put(memory, b.record, b.owner); memory[b.packet + 0x57] = 7;
  for (const body of [b.owner, b.packet - 0x34]) {
    for (let lane = 0; lane < 3; lane++) {put(memory, body + 0x34 + lane * 4, (fixture % 3 - 1) * 65536 + lane * 65536); put(memory, body + 0x40 + lane * 4, (fixture % 11 - 5) * 65536 + lane * 65536);}
    for (let i = 0; i < 9; i++) word(memory, body + 0xc4 + i * 2, i % 4 ? 0 : 4096);
    put(memory, body + 0xac, [0x8000, 65536, 0x20000][fixture % 3]); word(memory, body + 0x65e, fixture % 6); memory[body + 0x64f] = fixture & 1; memory[body + 0x6b4] = fixture & 1;
  }
  for (let i = 0; i < 9; i++) word(memory, b.packet + 0xc + i * 2, i % 4 ? 0 : 4096);
  put(memory, b.packet + 0x2c, [0x8000, 65536, 0x20000][fixture % 3]); for (let lane = 0; lane < 3; lane++) put(memory, b.packet + 0x30 + lane * 4, (fixture % 11 - 5) * 65536 + lane * 65536);
  put(memory, 0x6eafe0, [0, 1, 2, 6, 0x80, 0x81][fixture % 6]); put(memory, 0x6f2414, 0); put(memory, 0x6f2418, 0); put(memory, 0x810920, fixture % 3 === 0 ? 16 : fixture % 16);
  memory.fill(0x69, a.stack - 0x1000, a.stack + 64);
  return runtime;
}
export async function verifyWormholeConstruction({scenarios = 240, preservePrivateStack = true, output = 'analysis/wormhole-construction-connected-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), b = wormholeConstructionAddresses;
  const own = await readInstructionEvidence(['3157-wormhole-pool-constructor-assembly.json', '3149-object-stage-49a820-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const reached = new Set(), visits = {}, entries = [0x49a6f0, 0x49a820, 0x49bf10, 0x49c190, 0x4798d0, 0x428270, 0x474600, 0x44e470, 0x4710f0]; let steps = 0, cookies = 0, calls = 0;
  machine.onInstruction = address => {steps++; reached.add(address); if (entries.includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)); cookies++;});
  const run = (entry, ecx = 0, edx = 0, args = []) => {machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); args.forEach((value, i) => put(machine.bytes, a.stack + 4 + i * 4, value)); machine.run(3_000_000); calls++;};
  const compare = (memory, label) => {const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000); if (!actual.equals(expected)) {const offset = actual.findIndex((value, index) => value !== expected[index]); assert.fail(`${label}: byte0x${(offset + 0x10000).toString(16)} native${actual[offset]} JS${expected[offset]}`);}};
  for (let fixture = 0; fixture < scenarios; fixture++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createWormholeConstructionFixture(fixture, memory); machine.reset(); machine.fpuRounding = runtime.roundingMode; memory.copy(machine.bytes);
    try {
      const body = createWormholeBody(runtime); run(0x49a6f0); compare(memory, `constructor${fixture}`);
      //The native constructor's last4901d0→474670 call produces both stale
      //light payload words; source now publishes those exact stack producers.
      //Optional fresh-stack leaf mode remains available as a narrower proof.
      if (!preservePrivateStack) {memory.fill(0x69, a.stack - 0x1000, a.stack + 64); machine.bytes.fill(0x69, a.stack - 0x1000, a.stack + 64);}
      const localMode = fixture & 1, result = activateWormhole(b.record, localMode, 0x87654321, b.packet, fixture % 2, runtime); run(0x49a820, b.record, localMode, [0x87654321, b.packet, fixture % 2]); assert.equal(machine.r.EAX, result); compare(memory, `activation${fixture}`);
      const again = activateWormhole(b.record, localMode, 0, b.packet, 0, runtime); run(0x49a820, b.record, localMode, [0, b.packet, 0]); assert.equal(machine.r.EAX, again); compare(memory, `busy${fixture}`);
      assert.equal(body, memory.readUInt32LE(0x80b5e0));
    } catch (error) {console.error({fixture}); throw error;}
  }
  const report = {method: 'Actual49a6f0 body→47render-particle/material constructor,49a820 received/local activation and busy-slot rejection, with actual initialization/dynamics/orientation/spatial/shape-registration/visual/light/sound descendants. Local launch exercises4710f0 actual early-return flags; valid network sends/invalid-packet diagnostics have separate actual adapters but are not covered here. Stale arena/stack bytes, alignment, registry512 cutoff, queue16 capacity, both packet modes, FPU rounding and all mapped data>=10000h compared after each call. Compiler-cookie validation only; no original process/device execution.', preservedConstructorStack: preservePrivateStack, lightPayloadProducer: preservePrivateStack ? 'Actual last4901d0 saves advanced arena EDI and474670 pushes outside-output pointer; both survive from constructor to activation without stack reset.' : 'Fresh equal caller-owned stack at activation leaf ABI, narrower than connected producer proof.', targetSha256: program.sha256, evidence: own.evidence.map(value => value.evidence_id), instructions: own.instructions.length, scenarios, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, cookieChecks: cookies, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWormholeConstruction()));

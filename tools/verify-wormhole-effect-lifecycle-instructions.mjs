import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createWormholeVisualFixture, wormholeVisualAddresses} from './verify-wormhole-visuals-instructions.mjs';
import {initializeWormholeEffectPool, activateWormholeEffects, updateWormholeEffects, removeWormholeEffects} from '../src/wormhole-visuals.mjs';
const put = (m, p, value) => m.writeInt32LE(value | 0, p), word = (m, p, value) => m.writeUInt16LE(value & 65535, p);
export const wormholeEffectAddresses = {...wormholeVisualAddresses, arena: 0x200000, rows: 0x40000, map: 0x43000, bucket: 0x45000, pack: 0x60000, materials: 0x61000};
export function createWormholeEffectFixture(fixture = 0, memory = Buffer.alloc(0xa00000)) {
  const runtime = createWormholeVisualFixture(fixture, memory), a = wormholeEffectAddresses;
  put(memory, 0x902eec, a.arena); put(memory, 0x70dcf4, fixture % 4); memory.fill(0x93, a.arena, a.arena + 0x10000); put(memory, 0x909254, a.rows); put(memory, 0x909278, a.bucket);
  for (let row = 0; row < 256; row++) {word(memory, a.rows + row * 16, 0xff00); word(memory, a.rows + row * 16 + 2, 255); put(memory, a.rows + row * 16 + 12, a.map);}
  word(memory, a.map, 0); put(memory, a.bucket, 0); put(memory, a.bucket + 4, 0); put(memory, a.bucket + 8, 0);
  put(memory, 0x90b990, a.pack); put(memory, 0x90b988, a.materials); word(memory, a.pack + 0x2e, fixture % 3);
  for (let index = 0; index < 160; index++) {put(memory, a.materials + index * 16, 0xa1b20000 | fixture * 1727341 + index & 65535); put(memory, a.materials + index * 16 + 4, 0xc3d40000 | fixture * 1234567 + index & 65535); put(memory, a.materials + index * 16 + 8, fixture * 713 + index * 7919);}
  return runtime;
}
export async function verifyWormholeEffectLifecycle({scenarios = 96, frames = 64, output = 'analysis/wormhole-effect-lifecycle-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), a = wormholeEffectAddresses;
  const own = await readInstructionEvidence(['3113-object-stage-49c790-assembly.json', '3115-object-stage-49c930-assembly.json', '3133-object-stage-49cfd0-assembly.json', '3153-wormhole-effects-constructor-assembly.json', '3159-wormhole-pool-effects-assembly.json', '3165-wormhole-mesh-material-init-assembly.json', '3167-wormhole-render-allocation-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const reached = new Set(), visits = {}, watched = new Set([0x49bf10, 0x49c190, 0x49c790, 0x49c930, 0x49cfd0, 0x49d180, 0x4901d0, 0x49d310]); let steps = 0, cookies = 0;
  machine.onInstruction = address => {steps++; reached.add(address); if (watched.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)); cookies++;});
  const run = (entry, body) => {machine.entry = entry; machine.r.ECX = body; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); machine.run(3_000_000);};
  const compare = (memory, label) => {const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000); if (!actual.equals(expected)) {const offset = actual.findIndex((value, index) => value !== expected[index]); assert.fail(`${label}: byte 0x${(0x10000 + offset).toString(16)} native ${actual[offset]} JS ${expected[offset]}`);}};
  for (let scenario = 0; scenario < scenarios; scenario++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createWormholeEffectFixture(scenario, memory); machine.reset(); machine.fpuRounding = runtime.roundingMode; memory.copy(machine.bytes);
    try {
      initializeWormholeEffectPool(a.body, runtime); run(0x49bf10, a.body); compare(memory, `pool ${scenario}`);
      activateWormholeEffects(a.body, runtime); run(0x49c190, a.body); compare(memory, `activate ${scenario}`);
      for (let frame = 0; frame < frames; frame++) {updateWormholeEffects(a.body, runtime); run(0x49c930, a.body); compare(memory, `scenario ${scenario}/frame ${frame}`);}
      removeWormholeEffects(a.body, runtime); run(0x49c790, a.body); compare(memory, `remove ${scenario}`);
    } catch (error) {console.error({scenario}); throw error;}
  }
  const report = {method: 'Actual wormhole effect arena construction49bf10→4901d0/49d180, activation49c190→49c930, persistent spatial/RNG/ring/spark/mesh updates and final49c790 removal. Original materials/yaw/palette/signed-prefix memory, all four FPU rounding modes and stale arena bytes. All mapped data>=10000h compared at every stage; compiler cookie only, no game mocks/original execution. This isolates effect storage lifecycle; broader49ac30 state/transport/activation-body parent remains separate ongoing work.', targetSha256: program.sha256, evidence: own.evidence.map(value => value.evidence_id), instructions: own.instructions.length, scenarios, frames, calls: scenarios * (frames + 3), reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, cookieChecks: cookies, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report, 'Existing report differs; choose a new path.');}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWormholeEffectLifecycle()));

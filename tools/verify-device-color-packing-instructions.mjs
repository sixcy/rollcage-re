import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {packDevicePalette16, packDevicePalette32} from '../src/device-color-packing.mjs';
import {initializeProceduralTexturePalette} from '../src/procedural-texture.mjs';

const own = await readInstructionEvidence(['2439-procedural-texture-palette-assembly.json', '2446-texture-palette16-assembly.json', '2448-texture-palette32-assembly.json', '2428-remaining-stage-433d50-assembly.json', '2430-remaining-stage-408310-assembly.json'], {directory: 'analysis/native-simulation/results'});
const machine = new BoundedX86(own.instructions), memory = Buffer.alloc(0xa00000), STACK = 0x9000, SOURCE = 0x10000, OUT = 0x12000, MANAGER = 0x50000, OBJECT = 0x51000, DESCRIPTOR = 0x52000, VTABLE = 0x53000, SERVICE = 0x7e0000;
const put = (m, p, v) => m.writeInt32LE(v | 0, p); let seed = 0x40a1e0ab, steps = 0, serviceCalls = 0, aliases = 0;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;}, reached = new Set(); machine.onInstruction = p => reached.add(p);
const fixtures = 1200;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); machine.reset();
  put(memory, 0x714ae8, MANAGER); put(memory, MANAGER + 0x444, DESCRIPTOR); put(memory, DESCRIPTOR + 0x18, fixture & 1);
  const shifts = [[0, 0, 0, 8, 0, 16, 0, 24], [3, 11, 2, 5, 3, 0, 7, 15], [8, 31, 255, 32, 5, 17, 0, 24]][fixture % 3]; shifts.forEach((v, i) => {memory[DESCRIPTOR + 4 + i] = v;});
  for (let i = 0; i < 1024; i += 4) put(memory, SOURCE + i, i < 4 ? 0 : random());
  const entry = [0x40a1e0, 0x40a2f0, 0x499a90][fixture % 3], alphaMode = fixture % 5 ? 1 : 0, count = [-1, 0, 1, 16, 256][Math.floor(fixture / 3) % 5];
  const destination = entry === 0x499a90 ? OUT : [OUT, SOURCE + 2, SOURCE - 16, DESCRIPTOR - 64][fixture % 11] ?? OUT; if (destination !== OUT) aliases++;
  put(memory, MANAGER, VTABLE); put(memory, OBJECT, VTABLE); put(memory, VTABLE + 0x90, SERVICE + 0x90); put(memory, VTABLE + 8, SERVICE + 8); put(memory, VTABLE + 12, SERVICE + 12);
  put(memory, 0x5ed02c, 2); put(memory, 0x6e1628, fixture % 17 ? 77 : -1); put(memory, OBJECT + 0x42c, 32);
  memory.fill(0x53, 0x7139b0, 0x7143b0);
  const sourceLog = [], nativeLog = [], services = (m, log) => (object, method, args) => {
    log.push([object, method, args]); if (method === 0x90) return fixture % 19 ? OBJECT : 0;
    if (method === 8) {put(m, args[0], OUT); put(m, args[2], 512); return fixture % 23 ? 1 : 0;} return 0;
  };
  const sourceService = services(memory, sourceLog), nativeService = services(machine.bytes, nativeLog);
  for (const [method, n] of [[0x90, 1], [8, 3], [12, 1]]) machine.externalCalls.set(SERVICE + method, m => {const args = Array.from({length: n}, (_, i) => m.bytes.readInt32LE(m.r.ESP + i * 4)); m.r.EAX = nativeService(m.r.ECX >>> 0, method, args); m.r.ESP += n * 4;});
  //Both raw helpers consume original stack args; some branches reuse arg2.
  const args = entry === 0x40a1e0 ? [destination] : entry === 0x40a2f0 ? [destination, alphaMode] : [];
  args.forEach((v, i) => put(memory, STACK + 4 + i * 4, v)); memory.copy(machine.bytes);
  const runtime = {memory, scratchBase: STACK, handlers: {rendererCall: sourceService}};
  if (entry === 0x40a1e0) packDevicePalette16(SOURCE, destination, runtime);
  else if (entry === 0x40a2f0) packDevicePalette32(SOURCE, count, destination, alphaMode, runtime);
  else initializeProceduralTexturePalette(runtime);
  machine.entry = entry; machine.r.ECX = SOURCE; machine.r.EDX = count; machine.r.ESP = STACK; put(machine.bytes, STACK, -1); steps += machine.run(50000);
  assert.deepEqual(nativeLog, sourceLog, `renderer${fixture}`); serviceCalls += sourceLog.length;
  const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
  if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`fixture${fixture}/${entry.toString(16)} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
}
const report = {method: 'Full40a1e0 palette16,40a2f0 palette32 and499a90 procedural palette constructor with actual lock/unlock adapters. All mapped bytes>=10000h and exact renderer calls compare. Live device shifts including oversized counts, alpha/no-alpha, first black entry, negative/zero counts, source/output/descriptor aliases, palette stale alpha/index128 bytes and missing renderer states. Only renderer virtual services are external. Field/phase constructor499760 is a separate unfinished scope. No original process execution.', fixtures, aliases, serviceCalls, executedInstructions: reached.size, instructionSteps: steps, evidence: own.evidence.map(e => e.evidence_id), matched: true};
await writeFile('analysis/device-color-packing-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

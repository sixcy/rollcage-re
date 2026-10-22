import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {renderProceduralTexture, updateProceduralTexture} from '../src/procedural-texture.mjs';

const evidence = await readInstructionEvidence(['2424-remaining-stage-499de0-assembly.json', '2426-remaining-stage-499b90-assembly.json', '2428-remaining-stage-433d50-assembly.json', '2430-remaining-stage-408310-assembly.json'], {directory: 'analysis/native-simulation/results'});
const machine = new BoundedX86(evidence.instructions), memory = Buffer.alloc(0xa00000), STACK = 0x9000, FIELD = 0x100000, PHASES = 0x130000, OUTPUT = 0x200000, CONFIG = 0x50000, MANAGER = 0x51000, OBJECT = 0x52000, VTABLE = 0x53000, SERVICE = 0x7e0000;
let seed = 0x499b90ab, steps = 0, serviceCalls = 0; const reached = new Set(), formats = {};
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
machine.onInstruction = p => reached.add(p);
const fixtures = Number(process.argv[2] ?? 240);
for (let fixture = 0; fixture < fixtures; fixture++) {
  const format = [8, 16, 32, 24][fixture % 4], pitch = 512 + fixture % 5 * 32, delta = [-1, 0, 1, 3, 10000, 0x7fffffff][fixture % 6], phase = [0, 1, 3599, 3600, 16383][fixture % 5];
  memory.fill(0); machine.reset(); put(memory, 0x713884, FIELD); put(memory, 0x713888, PHASES); put(memory, 0x6e6d00, phase);
  for (let i = 0; i < 0x1c800; i += 4) put(memory, FIELD + i, random());
  for (let i = 0; i < 16384; i++) {word(memory, PHASES + i * 4, (fixture * 7) & 63); word(memory, PHASES + i * 4 + 2, 60 + fixture % 5);}
  for (let i = 0; i < 256; i++) {word(memory, 0x7139b0 + i * 2, random()); put(memory, 0x713bb0 + i * 4, random());}
  const parent = fixture >= fixtures / 2, sourceLog = [], nativeLog = [];
  //A leaf may overwrite palette/neighbor globals. Parent output must preserve
  //the renderer manager/mapping it subsequently uses for the real unlock.
  const destination = fixture % 11 === 0 ? FIELD - pitch * 128 : !parent && fixture % 11 === 1 ? 0x7139b0 - pitch * 128 : OUTPUT;
  put(memory, 0x5ecefc, CONFIG); memory[CONFIG + 0x28] = fixture % 17 ? 1 : 0;
  put(memory, 0x5ed02c, fixture % 19 ? 2 : -1); put(memory, 0x6e1628, fixture % 13 ? 77 : -1); put(memory, 0x714ae8, MANAGER); put(memory, MANAGER, VTABLE); put(memory, OBJECT, VTABLE); put(memory, OBJECT + 0x42c, format);
  put(memory, VTABLE + 0x90, SERVICE + 0x90); put(memory, VTABLE + 8, SERVICE + 8); put(memory, VTABLE + 12, SERVICE + 12);
  put(memory, 0x5ed2c4, [100, -1, 99, 97, 98][fixture % 5]); put(memory, 0x90a548, 100);
  //Output starts can intentionally alias input fields and live palette words.
  memory.copy(machine.bytes);
  const services = (m, log) => (object, method, args) => {
    log.push([object, method, args]);
    if (method === 0x90) return fixture % 23 ? OBJECT : 0;
    if (method === 8) {put(m, args[0], destination); put(m, args[2], pitch); if (fixture % 7 === 0) put(m, 0x90a548, 101); return fixture % 29 ? 1 : 2;}
    return 0;
  };
  const sourceService = services(memory, sourceLog), nativeService = services(machine.bytes, nativeLog);
  for (const [method, count] of [[0x90, 1], [8, 3], [12, 1]]) machine.externalCalls.set(SERVICE + method, m => {
    const args = Array.from({length: count}, (_, i) => m.bytes.readInt32LE(m.r.ESP + i * 4)); m.r.EAX = nativeService(m.r.ECX >>> 0, method, args); m.r.ESP += count * 4;
  });
  const runtime = {memory, scratchBase: STACK, handlers: {rendererCall: sourceService}};
  if (parent) {updateProceduralTexture(runtime); machine.entry = 0x499de0;}
  else {put(memory, STACK + 4, pitch); put(machine.bytes, STACK + 4, pitch); put(memory, STACK + 8, format); put(machine.bytes, STACK + 8, format); renderProceduralTexture(destination, pitch, format, delta, runtime); machine.entry = 0x499b90; machine.r.ECX = delta; machine.r.EDX = destination; formats[format] = (formats[format] ?? 0) + 1;}
  machine.r.ESP = STACK; put(machine.bytes, STACK, -1); steps += machine.run(1_000_000);
  assert.deepEqual(nativeLog, sourceLog, `renderer${fixture}`); serviceCalls += sourceLog.length;
  const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
  if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`fixture${fixture}/${format} byte0x${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
}
const report = {method: 'Complete499de0->actual408310 lock adapter->499b90 8/16/32-bit packed renderer->433d50 unlock adapter. All mapped bytes>=10000h and exact renderer service calls compare, including input-field/palette-output overlaps, signed phase and tick boundaries, missing handles/objects, lock failures and unsupported formats. Native method90/resource lock8/unlock12 are explicit renderer-library services. Procedural field/phase/palette producers remain separate and are not replaced with game callbacks. No original-process execution.', fixtures, formats, serviceCalls, executedInstructions: reached.size, instructionSteps: steps, evidence: evidence.evidence.map(e => e.evidence_id), matched: true};
await writeFile('analysis/procedural-texture-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

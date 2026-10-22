import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {constructRendererResourcePool} from '../src/renderer-resource-pools.mjs';
import {obtainRendererTextureIndex, acquireRendererTextureIndex, assignRendererTextureResource} from '../src/renderer-texture-ownership.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRendererTextureOwnership({scenarios = 6, acquisitions = 132, output = 'analysis/renderer-texture-ownership-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let steps = 0, calls = 0;
  machine.onInstruction = p => {steps++; reached.add(p); if ([0x5208d0, 0x520ee0, 0x521030, 0x5210d0, 0x51f0f0, 0x51f150, 0x513640, 0x513940].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  for (let scenario = 0; scenario < scenarios; scenario++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), manager = 0x100000, outputIndex = 0x120000, trace = [], nativeTrace = [], r = {memory: m, scratchBase: [0x9000, 0x9200, 0x9400][scenario % 3]}; m.fill(0x69, 0x7000, 0x9600); m.fill(0xa7, manager, manager + 0xb00);
    const imports = [['operatorNew', 0x56e220, 0xa24000], ['operatorDelete', 0x56e210, 0xa24004], ['operatorNewArray', 0x56e474, 0xa24008], ['operatorDeleteArray', 0x56e470, 0xa2400c]]; for (const [, address, target] of imports) put(m, address, target); put(m, 0x56e478, 0xa24010);
    const services = (memory, log) => {let next = 0x180000; return (name, args) => {if (name.includes('New')) {const p = next; next += args[0] + 15 & ~15; assert(next < 0x980000); memory.fill(0x93, p, next); log.push([name, args[0], p]); return p;} log.push([name, args[0]]);};}; r.services = {libraryCall: services(m, trace)};
    machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const nativeServices = services(machine.bytes, nativeTrace); for (const [name, , target] of imports) machine.externalCalls.set(target, state => {const value = nativeServices(name, [ptr(state.bytes, state.r.ESP)]); if (name.includes('New')) state.r.EAX = value;});
    const move = state => {const b = state.bytes, out = ptr(b, state.r.ESP), input = ptr(b, state.r.ESP + 4), n = ptr(b, state.r.ESP + 8); Buffer.from(b.subarray(input, input + n)).copy(b, out); state.r.EAX = out;}; machine.externalCalls.set(0xa24010, move); machine.externalCalls.set(0x568a48, move); machine.externalCalls.set(0x568a50, state => {const b = state.bytes, out = ptr(b, state.r.ESP), n = ptr(b, state.r.ESP + 8); b.fill(b[state.r.ESP + 4], out, out + n); state.r.EAX = out;});
    const check = (entry, ecx, args, action, label) => {try {action(); machine.entry = entry; machine.r.ECX = ecx; machine.r.ESP = r.scratchBase; put(machine.bytes, r.scratchBase, -1); args.forEach((v, i) => put(machine.bytes, r.scratchBase + 4 + i * 4, v)); machine.run(4_000_000); calls++; assert.equal(machine.fs0, 0); assert.deepEqual(nativeTrace, trace); if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (m[p] === machine.bytes[p]) p++; throw Error(`Mismatch0x${p.toString(16)} JS=${m.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}} catch (error) {console.error({scenario, label, entry: entry.toString(16), lastJS: trace.slice(-8), lastNative: nativeTrace.slice(-8)}); throw error;}};
    check(0x5131b0, manager + 0x48c, [], () => constructRendererResourcePool(manager + 0x48c, 'texture', r), 'texture constructor');
    check(0x513330, manager + 0x890, [], () => constructRendererResourcePool(manager + 0x890, 'integer', r), 'integer constructor');
    for (let tick = 0; tick < acquisitions; tick++) check(0x5208d0, manager, [outputIndex, 0], () => obtainRendererTextureIndex(manager, outputIndex, r), `acquire${tick}`);
    for (const offset of [0, 4, 8]) {const output = ptr(m, manager + 0x48c + 40) + offset; check(0x520ee0, manager + 0x48c, [output], () => acquireRendererTextureIndex(manager + 0x48c, output, r), `aliasedOutput${offset}`);}
    //Real assignment instructions are also checked with partial overlap.
    for (const delta of [0, 4, -4, 0x800]) {
      const input = 0x140000, output = input + delta; for (let p = input - 4; p < input + 0xd00; p++) m[p] = machine.bytes[p] = (p * 31 + scenario) & 255;
      check(0x521030, output, [input], () => assignRendererTextureResource(output, input, r), `assignment${delta}`);
    }
  }
  const report = {method: 'Actual5131b0/513330 pool constructors followed by persistent5208d0 texture acquisitions (default132 includes queue exhaustion and real texture/integer pool growth),520ee0 free-queue ownership and allocated-vector insertion,50ee50 native temporary and521030/5210d0 assignment. Three caller-declared acquisition-output aliases within the allocated-index vector and four same/partial/disjoint assignment alias cases per scenario. All mapped memory>=10000h,ordered genuine CRT services and balanced explicit FS:[0],no game mocks/original process/device execution. Resource creation/upload/release consumers remain separate open work.', targetSha256: program.sha256, scenarios, acquisitionsPerScenario: acquisitions, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRendererTextureOwnership()));

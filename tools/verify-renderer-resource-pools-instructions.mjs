import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {constructRendererResourcePool, resizeRendererResourcePool} from '../src/renderer-resource-pools.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRendererResourcePools({scenarios = 90, output = 'analysis/renderer-resource-pools-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}, kinds = ['vertex', 'texture', 'integer'], constructors = [0x514600, 0x5131b0, 0x513330], resizers = [0x514310, 0x513640, 0x513940]; let steps = 0, calls = 0;
  machine.onInstruction = p => {steps++; reached.add(p); if ([...constructors, ...resizers, 0x40eee0, 0x40ecc0, 0x5141f0, 0x50ee50, 0x514a70].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  for (let scenario = 0; scenario < scenarios; scenario++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), pool = 0x100000, kindIndex = scenario % 3, kind = kinds[kindIndex], trace = [], nativeTrace = [], r = {memory: m, scratchBase: [0x9000, 0x9200, 0x9400][Math.floor(scenario / 3) % 3]}; m.fill(0x69, 0x7000, 0x9600); m.fill(0xa7, pool, pool + 64);
    const imports = [['operatorNew', 0x56e220, 0xa24000], ['operatorDelete', 0x56e210, 0xa24004], ['operatorNewArray', 0x56e474, 0xa24008], ['operatorDeleteArray', 0x56e470, 0xa2400c]]; for (const [, address, target] of imports) put(m, address, target); put(m, 0x56e478, 0xa24010);
    const services = (memory, log) => {let next = 0x180000; return (name, args) => {if (name.includes('New')) {const p = next; next += args[0] + 15 & ~15; if (next > 0x980000) throw Error('Synthetic pool allocator exceeded its declared arena.'); memory.fill(0x93, p, next); log.push([name, args[0], p]); return p;} log.push([name, args[0]]);};}; r.services = {libraryCall: services(m, trace)};
    machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const nativeServices = services(machine.bytes, nativeTrace); for (const [name, , target] of imports) machine.externalCalls.set(target, state => {const value = nativeServices(name, [ptr(state.bytes, state.r.ESP)]); if (name.includes('New')) state.r.EAX = value;});
    const move = state => {const b = state.bytes, out = ptr(b, state.r.ESP), input = ptr(b, state.r.ESP + 4), n = ptr(b, state.r.ESP + 8); Buffer.from(b.subarray(input, input + n)).copy(b, out); state.r.EAX = out;}; machine.externalCalls.set(0xa24010, move); machine.externalCalls.set(0x568a48, move); machine.externalCalls.set(0x568a50, state => {const b = state.bytes, out = ptr(b, state.r.ESP), n = ptr(b, state.r.ESP + 8); b.fill(b[state.r.ESP + 4], out, out + n); state.r.EAX = out;});
    for (let tick = 0; tick < 5; tick++) {
      const requested = [128, 8, 160, 3, 0][tick];
      try {if (!tick) constructRendererResourcePool(pool, kind, r); else resizeRendererResourcePool(pool, requested, kind, r); machine.entry = tick ? resizers[kindIndex] : constructors[kindIndex]; machine.r.ECX = pool; machine.r.ESP = r.scratchBase; put(machine.bytes, r.scratchBase, -1); put(machine.bytes, r.scratchBase + 4, tick ? requested : 0); machine.run(4_000_000); calls++;
        assert.equal(machine.fs0, 0); assert.deepEqual(nativeTrace, trace); if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (m[p] === machine.bytes[p]) p++; throw Error(`Mismatch0x${p.toString(16)} JS=${m.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}
      } catch (error) {console.error({scenario, kind, tick, requested, lastJS: trace.slice(-12), lastNative: nativeTrace.slice(-12)}); throw error;}
    }
  }
  const report = {method: 'Actual514600/5131b0/513330 resource pool constructors and514310/513640/513940 resize parents,with real object constructors100-byte vertex/460h-byte texture/int IDs,pointer/chunk vectors and circular free-index deque children. Five connected storage operations per declared raw-memory fixture,all mapped memory>=10000h,ordered genuine CRT allocation/delete/copy services and balanced explicit FS:[0]. No game mocks/original execution.', targetSha256: program.sha256, scenarios, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRendererResourcePools()));

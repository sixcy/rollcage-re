import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {constructRendererTarget, constructRendererViewport, constructRendererListeners, constructRendererFrustum, findRendererScene, resetRendererBatches, dispatchRendererViewportEvent} from '../src/renderer-state-producers.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), ptr = (m, p) => m.readUInt32LE(p);
export async function verifyRendererStateProducers({fixtures = 2100, output = 'analysis/renderer-state-producers-boundaries-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), entries = [0x516a10, 0x50e370, 0x50ec10, 0x50dff0, 0x517ce0, 0x50ee00, 0x50e2e0], visits = {}, reached = new Set(); let steps = 0, callbacks = 0, allocations = 0, releases = 0;
  machine.onInstruction = p => {steps++; reached.add(p); if (entries.includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568a48, state => {const m = state.bytes, output = ptr(m, state.r.ESP), input = ptr(m, state.r.ESP + 4), count = ptr(m, state.r.ESP + 8); Buffer.from(m.subarray(input, input + count)).copy(m, output); state.r.EAX = output;});
  machine.externalCalls.set(0x568a50, state => {const m = state.bytes, output = ptr(m, state.r.ESP), count = ptr(m, state.r.ESP + 8); m.fill(m[state.r.ESP + 4], output, output + count); state.r.EAX = output;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), object = 0x100000, name = 0x110000, scene = 0x110100, list = 0x120000, output = 0x130000, selector = fixture % 7, trace = [], nativeTrace = [], r = {memory: m, scratchBase: 0x9000};
    m.fill(0x69, 0x8000, 0x9200); m.fill(0xa7, object, object + 0x1000); put(m, 0x714b44, 0); put(m, 0x56e220, 0xa24000); put(m, 0x56e210, 0xa24004); put(m, 0x56e470, 0xa24004);
    const string = (p, value) => {const data = value.length >= 16 ? p + 64 : p; if (data !== p) put(m, p, data); m.write(value, data); m[data + value.length] = 0; put(m, p + 16, value.length); put(m, p + 20, value.length >= 16 ? 63 : 15);};
    string(name, fixture % 3 ? '0 Player' : 'StockRenderTarget'); string(scene, 'StockScene');
    const allocator = (memory, log) => {let cursor = 0x180000; return size => {const p = cursor; cursor += size + 15 & ~15; memory.fill(0x93, p, cursor); log.push(['allocate', size, p]); return p;};};
    r.handlers = {allocate: allocator(m, trace), free: address => trace.push(['free', address])};
    const callback = (memory, log, callbackObject, method, args) => {log.push(['callback', callbackObject >>> 0, method, args[0] >>> 0, memory.readInt32LE(args[1])]); callbacks++; const end = memory.readUInt32LE(object + 124); if (fixture % 3 === 1 && end > list + 4) put(memory, object + 124, list + 4); else if (fixture % 3 === 2 && log.filter(row => row[0] === 'callback').length === 1) put(memory, object + 124, list + 16); return 7;};
    r.services = {rendererCallback: (self, method, args) => callback(m, trace, self, method, args)};
    if (selector === 4) {
      put(m, object + 32, list); put(m, object + 36, list + fixture % 5 * 4);
      for (let i = 0; i < 4; i++) {const candidate = 0x140000 + i * 0x100; put(m, list + i * 4, candidate); string(candidate, i === fixture % 4 ? '0 Player' : 'Other');}
    } else if (selector === 5) for (let i = 0; i < 3; i++) {const queue = 0x140000 + i * 0x100; put(m, object + 0xe4 + i * 4, queue); put(m, queue + 4, output + i * 64); put(m, queue + 8, output + 0x200 + i * 4); put(m, queue + 28, 8); put(m, queue + 32, (fixture + i) % 3 - 1); put(m, queue + 36, 73); m.fill(0x71, output + i * 64, output + i * 64 + 64); put(m, output + 0x200 + i * 4, 99);}
    else if (selector === 6) {
      put(m, object + 120, list); put(m, object + 124, list + fixture % 4 * 4); put(m, object + 80, output);
      for (let i = 0; i < 4; i++) {const binding = 0x140000 + i * 0x100, target = binding + 0x40; put(m, list + i * 4, i); put(m, output + i * 4, binding); put(m, binding + 16, target); put(m, target, target + 16); put(m, target + 24, 0xa24008);}
    }
    machine.reset(); machine.fs0 = 0x12345678; m.copy(machine.bytes); const nativeAllocate = allocator(machine.bytes, nativeTrace);
    machine.externalCalls.set(0xa24000, state => {state.r.EAX = nativeAllocate(ptr(state.bytes, state.r.ESP)); allocations++;}); machine.externalCalls.set(0xa24004, state => {nativeTrace.push(['free', ptr(state.bytes, state.r.ESP)]); releases++;});
    machine.externalCalls.set(0xa24008, state => {state.r.EAX = callback(state.bytes, nativeTrace, state.r.ECX, 8, [ptr(state.bytes, state.r.ESP), ptr(state.bytes, state.r.ESP + 4)]); state.r.ESP += 8;});
    let args = [], result;
    try {
      if (selector === 0) {args = [name, fixture * 713]; result = constructRendererTarget(object, ...args, r);}
      else if (selector === 1) {args = [name, scene, fixture % 3]; result = constructRendererViewport(object, ...args, r);}
      else if (selector === 2) result = constructRendererListeners(object, r);
      else if (selector === 3) result = constructRendererFrustum(object, r);
      else if (selector === 4) {args = [name]; result = findRendererScene(object, name, r);}
      else if (selector === 5) resetRendererBatches(object, r);
      else {args = [fixture % 4]; result = dispatchRendererViewportEvent(object, args[0], r);}
      machine.entry = entries[selector]; machine.r.ESP = r.scratchBase; machine.r.ECX = object; put(machine.bytes, r.scratchBase, -1); args.forEach((v, i) => put(machine.bytes, r.scratchBase + 4 + i * 4, v)); machine.run(1_000_000);
      if (result !== undefined) assert.equal(machine.r.EAX, result);
      assert.equal(machine.fs0 >>> 0, 0x12345678); assert.deepEqual(nativeTrace, trace);
      if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (m[p] === machine.bytes[p]) p++; throw Error(`Mismatch0x${p.toString(16)} JS=${m.subarray(p, p + 12).toString('hex')} native=${machine.bytes.subarray(p, p + 12).toString('hex')}`);}
    } catch (error) {console.error({fixture, entry: entries[selector].toString(16), trace, nativeTrace}); throw error;}
  }
  const report = {method: 'Actual516a10 target constructor,50e370 viewport constructor through50ec10 listeners/50dff0 frustums and real string algorithms;517ce0 scene lookup,50ee00 batch reset and50e2e0 live listener dispatch. All mapped bytes>=10000h,EAX,allocator requests,ordered callback arguments and balanced explicit synthetic FS:[0] chain compared. CRT allocation/free/memcpy/memset and caller-owned std::function invocations are services. Viewport registration51a650 excluded by explicit zero manager714b44; full singleton bootstrap519df0 and current-view rendering50e9f0/50eb00/50eb90 remain unclosed. No original execution.', targetSha256: program.sha256, fixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, callbackInvocations: callbacks / 2, allocations, releases, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRendererStateProducers()));

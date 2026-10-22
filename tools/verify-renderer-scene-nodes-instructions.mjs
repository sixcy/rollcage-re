import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {obtainRendererIdentity, compareRendererMatrices, multiplyRendererMatrix, transformRendererBounds, updateRendererNode, eraseRendererPointers, detachRendererChild, constructRendererNode, constructRendererScene, constructRendererManager, initializeRendererSceneConstants} from '../src/renderer-scene-nodes.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), ptr = (m, p) => m.readUInt32LE(p);
export async function verifyRendererSceneNodes({fixtures = 3000, withRegistration = false, output = 'analysis/renderer-manager-ownership-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), entries = [0x402160, 0x52e6a0, 0x4a5080, 0x52e710, 0x52e330, 0x4b21e0, 0x52e4e0, 0x516240, 0x51bf70, 0x517720], visits = {}, reached = new Set(); let steps = 0;
  machine.onInstruction = p => {steps++; reached.add(p); if (entries.includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), object = 0x100000, other = 0x110000, outputObject = 0x120000, name = 0x130000, vector = 0x140000, child = 0x150000, selector = fixture % entries.length, variant = Math.floor(fixture / entries.length), trace = [], nativeTrace = [], r = {memory: m, scratchBase: 0x9000};
    const initialized = initializeRendererSceneConstants(Buffer.from(m)); assert.deepEqual(initialized, m);
    m.fill(0x69, 0x7000, 0x9200); put(m, 0x6e6364, fixture % 3 === 0 ? 0 : 1); put(m, 0x56e220, 0xa24000); put(m, 0x56e210, 0xa24004); put(m, 0x56e470, 0xa24004); put(m, 0x56e478, 0xa24008); put(m, 0x56e08c, 0xa2400c); put(m, 0x714b44, 0);
    if (withRegistration) {put(m, 0x714b44, 0x165000); put(m, 0x6f2d34, 0x160000); put(m, 0x6f2d38, 0); for (const offset of [0, 4, 8]) put(m, 0x160000 + offset, 0x160000); m.writeUInt16LE(0x101, 0x16000c);}
    for (let i = 0; i < 16; i++) {m.writeFloatLE(i % 5 === 0 ? 1 : 0, 0x6e6390 + i * 4); m.writeFloatLE(((fixture * 31 + i * 13) % 33 - 16) / 8, object + i * 4); m.writeFloatLE(((fixture * 17 + i * 7) % 21 - 10) / 4, other + i * 4);}
    const initializeNode = (p, parent = 0) => {for (let i = 0; i < 16; i++) {m.writeFloatLE(i % 5 ? 0 : 1, p + i * 4); m.writeFloatLE(i % 5 ? 0 : 1, p + 0x40 + i * 4);} for (let i = 0; i < 4; i++) m.writeFloatLE(i + 1, p + 0x9c + i * 4); put(m, p + 0xc0, parent); put(m, p + 0xc4, 0); put(m, p + 0xc8, 0); put(m, p + 0xcc, 0); m[p + 0xbc] = variant % 3 ? 1 : 0; m[p + 0xbd] = variant % 2;};
    if (selector === 3) for (let i = 0; i < 4; i++) m.writeFloatLE(i + 1, object + i * 4);
    if (selector === 4 || selector === 7) {initializeNode(object); initializeNode(other); initializeNode(child, object); put(m, object + 0xc4, vector); put(m, object + 0xc8, vector + 4); put(m, object + 0xcc, vector + 16); put(m, vector, child); if (selector === 4 && variant % 3) put(m, object + 0xc0, other); if (selector === 7) {put(m, other + 0xc4, vector); put(m, other + 0xc8, vector + variant % 3 * 4); put(m, other + 0xcc, vector + variant % 3 * 4);}}
    if (selector === 5 || selector === 6) {put(m, object + 0xc4, vector); put(m, object + 0xc8, vector + 20); put(m, object + 0xcc, vector + 32); for (let i = 0; i < 5; i++) put(m, vector + i * 4, i % 2 ? child : other);}
    m.write('Scene::RootNode\0', name); put(m, name + 16, 15); put(m, name + 20, 15);
    const allocate = (memory, log) => {let cursor = 0x180000; return size => {const p = cursor; cursor += size + 15 & ~15; memory.fill(0x93, p, cursor); log.push(['allocate', size, p]); return p;};};
    const criticalSection = (memory, log, address, spin) => {log.push(['InitializeCriticalSectionAndSpinCount', address, spin]); for (let i = 0; i < 6; i++) put(memory, address + i * 4, i === 5 ? spin : i - 2); return 1;};
    r.handlers = {allocate: allocate(m, trace), free: p => trace.push(['free', p])}; r.services = {rendererMath: (operation, value, precision) => {trace.push([operation, value, precision]); return Math[operation](value);}, platformCall: (operation, args) => {assert.equal(operation, 'InitializeCriticalSectionAndSpinCount'); return criticalSection(m, trace, ...args);}};
    machine.reset(); machine.fs0 = 0x12345678; m.copy(machine.bytes); const nativeAllocate = allocate(machine.bytes, nativeTrace);
    machine.externalCalls.set(0xa24000, state => {state.r.EAX = nativeAllocate(ptr(state.bytes, state.r.ESP));}); machine.externalCalls.set(0xa24004, state => {nativeTrace.push(['free', ptr(state.bytes, state.r.ESP)]);});
    machine.externalCalls.set(0xa24008, state => {const b = state.bytes, dest = ptr(b, state.r.ESP), source = ptr(b, state.r.ESP + 4), size = ptr(b, state.r.ESP + 8); Buffer.from(b.subarray(source, source + size)).copy(b, dest); state.r.EAX = dest;});
    machine.externalCalls.set(0xa2400c, state => {state.r.EAX = criticalSection(state.bytes, nativeTrace, ptr(state.bytes, state.r.ESP), ptr(state.bytes, state.r.ESP + 4)); state.r.ESP += 8;});
    machine.externalCalls.set(0x568a48, state => {const b = state.bytes, dest = ptr(b, state.r.ESP), source = ptr(b, state.r.ESP + 4), size = ptr(b, state.r.ESP + 8); Buffer.from(b.subarray(source, source + size)).copy(b, dest); state.r.EAX = dest;});
    machine.externalCalls.set(0x5695b6, state => {const value = state.scalars.XMM0; nativeTrace.push(['sqrt', value, 64]); state.scalars.XMM0 = Math.sqrt(value); state.doubleScalars.add('XMM0'); state.integerVectors.delete('XMM0'); state.qwords.delete('XMM0'); state.scalarBits.delete('XMM0'); state.zeroVectors.delete('XMM0');});
    let args = [], result;
    try {
      if (selector === 0) result = obtainRendererIdentity(r);
      else if (selector === 1) {args = [variant % 3 ? other : object]; result = compareRendererMatrices(object, args[0], r);}
      else if (selector === 2) {args = [variant % 3 ? other : object]; result = multiplyRendererMatrix(object, args[0], r);}
      else if (selector === 3) {args = [[outputObject, other, object][variant % 3], other]; result = transformRendererBounds(object, ...args, r);}
      else if (selector === 4) {args = [variant % 2]; result = updateRendererNode(object, args[0], r);}
      else if (selector === 5) {args = [outputObject, vector + variant % 6 * 4, vector + 20]; result = eraseRendererPointers(object + 0xc4, ...args, r);}
      else if (selector === 6) {args = [variant % 3 ? other : 0]; detachRendererChild(object, args[0], r);}
      else if (selector === 7) {args = [object, name, variant % 2 ? other : 0]; result = constructRendererNode(outputObject, ...args, r);}
      else if (selector === 8) {args = [name]; result = constructRendererScene(object, name, r);}
      else result = constructRendererManager(object, r);
      machine.entry = entries[selector]; machine.r.ESP = r.scratchBase; machine.r.ECX = selector === 5 ? object + 0xc4 : selector === 7 ? outputObject : object; put(machine.bytes, r.scratchBase, -1); args.forEach((v, i) => put(machine.bytes, r.scratchBase + 4 + i * 4, v)); machine.run(1_000_000);
      if (result !== undefined) assert.equal(machine.r.EAX, result | 0); assert.equal(machine.fs0 >>> 0, 0x12345678); assert.deepEqual(nativeTrace, trace);
      if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (m[p] === machine.bytes[p]) p++; throw Error(`Mismatch0x${p.toString(16)} JS=${m.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}
    } catch (error) {console.error({fixture, entry: entries[selector].toString(16), trace, nativeTrace}); throw error;}
  }
  const report = {method: 'Actual manager constructor517720,scene constructor51bf70,node constructor516240,lazy identity402160,matrix comparison52e6a0,multiply4a5080,bounds52e710,node update52e330,erase4b21e0,detach52e4e0 and reached original target/viewport/listener/frustum/string/vector children. All mapped memory>=10000h,defined EAX,ordered CRT allocator/free/sqrt and OS critical-section requests,balanced explicit FS:[0] compared. Initializer bytes independently match retained reads. Finite numeric fixtures including matrix/bounds overlap. Manager construction runs real stock scene/target/view allocation with explicit714b44=0, so UI registration51a650 is excluded. No game mocks in exercised graph; full519df0 bootstrap/device/teardown remain open. No original execution.', targetSha256: program.sha256, fixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (withRegistration) report.method = report.method.replace('explicit714b44=0, so UI registration51a650 is excluded.', 'explicit live714b44 and caller-owned initialized map sentinel6f2d34; actual UI registration51a650 and its complete reached map/rotation/string children execute. UI map sentinel bootstrap remains a separate producer boundary.');
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRendererSceneNodes()));

import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {constructRendererFrustum, transformRendererFrustum, updateRendererViewportFrustum, prepareRendererViewport, initializeRendererFrustumConstants} from '../src/renderer-state-producers.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), ptr = (m, p) => m.readUInt32LE(p);
export async function verifyRendererFrustum({fixtures = 2400, output = 'analysis/renderer-frustum-numeric-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), entries = [0x50e160, 0x50e660, 0x50e950], reached = new Set(), visits = {}; let steps = 0, mathCalls = 0, deviceCalls = 0, aliases = 0;
  machine.onInstruction = p => {steps++; reached.add(p); if (entries.includes(p) || [0x4020e0, 0x4020c0, 0x402100].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  const baseline = program.initializeMemory(Buffer.alloc(0xa00000)), literal = Buffer.alloc(baseline.length); initializeRendererFrustumConstants(literal);
  for (const [p, n] of [[0x5d013c, 4], [0x5dcb10, 4], [0x5dc6ec, 4], [0x5dc774, 4], [0x5dc888, 4], [0x5dcf60, 16]]) assert.deepEqual(literal.subarray(p, p + n), baseline.subarray(p, p + n));
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = Buffer.from(baseline), runtime = {memory, scratchBase: 0x9000}, selector = fixture % 3, viewport = 0x100000, source = 0x110000, matrix = 0x120000;
    memory.fill(0x69, 0x8000, 0x9200); constructRendererFrustum(viewport + 0xcc, runtime); constructRendererFrustum(viewport + 0x194, runtime);
    put(memory, viewport + 0x8c, [0, 1, 640, 1920, -1, 2147483647][Math.floor(fixture / 3) % 6]); put(memory, viewport + 0x90, [1, 1, 480, 1080, -1, 32767][Math.floor(fixture / 18) % 6]); memory.writeFloatLE([0, 45, 90, 120, -45, 360][Math.floor(fixture / 108) % 6], viewport + 0xa0); memory.writeFloatLE([0, 1, 1.5, 0.5][Math.floor(fixture / 648) % 4], viewport + 0xb4); memory.writeFloatLE(0.05, viewport + 0x94); memory.writeFloatLE(8192, viewport + 0x98);
    put(memory, 0x714ae8, 0x130000); put(memory, 0x130000, 0x130100); put(memory, 0x131000, 0x130100); for (const method of [0x44, 0x30, 0x2c]) put(memory, 0x130100 + method, 0xa25000 + method);
    put(memory, viewport + 0x4c, 0x140000); put(memory, 0x14003c, matrix - 0x40); put(memory, 0x14103c, matrix + 0x40);
    for (let index = 0; index < 32; index++) memory.writeFloatLE(index % 5 === 0 ? 1 : (fixture % 7 - 3) / 32, matrix + index * 4);
    let ecx = viewport, args = [], output = source + 0x400;
    if (selector === 0) {
      constructRendererFrustum(source, runtime); put(memory, source + 0xc4, [0, 1, 5, 6][Math.floor(fixture / 3) % 4]);
      for (let i = 0; i < 48; i++) memory.writeFloatLE(((fixture * 17 + i * 31) % 101 - 50) / 16, source + i * 4);
      if (fixture % 5 === 0) {output = source; aliases++;} else if (fixture % 5 === 1) {output = source + 16; aliases++;}
      ecx = output; args = [source, matrix];
    }
    const sourceTrace = [], nativeTrace = [], math = (operation, value, precision, log) => {const result = precision === 32 ? Math.fround(Math[operation](value)) : Math[operation](value); log.push([operation, value, precision, result]); return result;};
    const device = (m, log, object, method, rawArgs) => {const args = rawArgs.map(v => v >>> 0); log.push(['device', object >>> 0, method, args, method === 0x30 ? m.subarray(args[0], args[0] + 64).toString('hex') : null]); if (method === 0x44 && fixture % 5 === 1) put(m, viewport + 0x4c, 0x141000); if (method === 0x30 && fixture % 7 === 2) {m.writeFloatLE(0.25, args[0] + 48); put(m, 0x714ae8, 0x131000);} return 0;};
    runtime.services = {rendererMath: (op, value, precision) => math(op, value, precision, sourceTrace), rendererDevice: (object, method, args) => device(memory, sourceTrace, object, method, args)};
    machine.reset(); memory.copy(machine.bytes);
    for (const [address, operation, precision] of [[0x5695bc, 'tan', 64], [0x56958c, 'atan', 64], [0x56934e, 'sin', 32], [0x56933c, 'cos', 32]]) {
      machine.entries.delete(address); machine.externalCalls.set(address, state => {mathCalls++; const input = precision === 64 ? state.scalars.XMM0 : state.floatFromBits(state.lowFloatBits('XMM0')), result = math(operation, input, precision, nativeTrace); state.scalars.XMM0 = result; state.scalarBits.delete('XMM0'); state.qwords.delete('XMM0'); state.integerVectors.delete('XMM0'); state.zeroVectors.delete('XMM0'); if (precision === 64) state.doubleScalars.add('XMM0'); else state.doubleScalars.delete('XMM0');});
    }
    for (const method of [0x44, 0x30, 0x2c]) machine.externalCalls.set(0xa25000 + method, state => {deviceCalls++; state.r.EAX = device(state.bytes, nativeTrace, state.r.ECX, method, [ptr(state.bytes, state.r.ESP)]); state.r.ESP += 4;});
    let result;
    try {
      if (selector === 0) result = transformRendererFrustum(ecx, ...args, runtime);
      else if (selector === 1) updateRendererViewportFrustum(viewport, runtime);
      else result = prepareRendererViewport(viewport, runtime);
      machine.entry = entries[selector]; machine.r.ESP = runtime.scratchBase; machine.r.ECX = ecx; put(machine.bytes, runtime.scratchBase, -1); args.forEach((value, i) => put(machine.bytes, runtime.scratchBase + 4 + i * 4, value)); machine.run(1_000_000);
      if (result !== undefined) assert.equal(machine.r.EAX, result); assert.deepEqual(nativeTrace, sourceTrace);
      if (!memory.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (memory[p] === machine.bytes[p]) p++; throw Error(`Mismatch0x${p.toString(16)} JS=${memory.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}
    } catch (error) {console.error({fixture, entry: entries[selector].toString(16), sourceTrace, nativeTrace}); throw error;}
  }
  const report = {method: 'Actual50e660 viewport aspect/FOV/projection/plane generation with original literal bytes, actual4020e0/4020c0/402100 vector writes;50e160 live-alias float32 frustum transform;50e950 explicit renderer-device setup with64-byte matrix snapshots and actual frustum children. All mapped bytes>=10000h,EAX where defined,and exact ordered CRT math/device calls compared. Finite signed/zero dimensions and angular boundaries include resulting infinite projection ratios; normal planes remain finite (rawNaN payload/sign domain unvalidated), frustum overlap, device-mutated camera/device/matrix pointers. True tan/atan64,sin/cos32 are CRT services;714ae8 virtual renderer-device methods are explicit remaining game-interface contracts, not proven OS imports. Explicit coherent viewport/camera producer input; not singleton bootstrap or full render traversal. No original execution.', targetSha256: program.sha256, fixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, mathCalls, deviceCalls, aliases, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRendererFrustum()));

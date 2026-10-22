import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {getRendererWindowApplication, configureRendererGraphicsMode, configureRendererPresentation} from '../src/renderer-presentation.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRendererPresentation({fixtures = 1200, output = 'analysis/renderer-presentation-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let calls = 0, steps = 0;
  const S = 0x9000, MANAGER = 0x100000, CAPS = 0x110000, DEVICE = 0x120000, VTABLE = 0x130000, APP = 0x140000, SETTINGS = 0x150000;
  machine.onInstruction = p => {reached.add(p); if ([0x5120e0, 0x402aa0, 0x403430, 0x511a30, 0x405010].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  for (let fixture = 0; fixture < fixtures; fixture++) for (let selector = 0; selector < 3; selector++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), trace = [], nativeTrace = [], runtime = {memory: m, scratchBase: S}; m.fill(0x69, 0x7000, 0x9500); m.fill(0xa7, MANAGER, MANAGER + 0x700);
    put(m, MANAGER, 0x5db278); put(m, MANAGER + 0x488, CAPS); put(m, MANAGER + 0x368, DEVICE); put(m, DEVICE, VTABLE); for (const method of [0x28, 0x30, 0x2c]) put(m, VTABLE + method, 0xf0000000 + method);
    put(m, MANAGER + 0x438, fixture % 8); put(m, MANAGER + 0x374, fixture % 3 + 1); put(m, MANAGER + 0x424, [1, 640, 1920, -1][fixture % 4]); put(m, MANAGER + 0x428, 480); put(m, MANAGER + 0x430, 20 + fixture % 11); put(m, MANAGER + 0x42c, [0, 30, 60, 75, 120, 180][fixture % 6]);
    for (const offset of [0x428, 0x444, 0x448]) put(m, CAPS + offset, fixture % 2 ? 0x20400 : 0); put(m, CAPS + 0x470, fixture % 16); put(m, CAPS + 0x534, 1); m[CAPS + 0x418] = fixture % 8;
    put(m, 0x6e64a4, SETTINGS); put(m, 0x6e63d0, 3); for (const o of [0x3c, 0x58, 0x60, 0x62, 0x63, 0xc9]) m[SETTINGS + o] = (fixture + o) % 3; put(m, SETTINGS + 0x54, fixture % 7); put(m, SETTINGS + 0x5c, [0, 30, 60, 75][fixture % 4]);
    put(m, APP + 8, 0x12345678); put(m, APP + 12, 0x23456789); put(m, APP + 16, 0x34567890); put(m, 0x6efb38, fixture % 5 === 0 ? 0 : APP); put(m, 0x715060, 0); put(m, 0x715b08, 3); put(m, 0x714afc, 0x715b30); put(m, 0x5e8890, fixture * 7919);
    put(m, 0x56e220, 0xf1000000); put(m, 0x56e210, 0xf1000004); put(m, 0x56e470, 0xf1000004);
    const services = (memory, log) => {let cursor = 0x200000, serial = 0; return {
      allocate(size) {const p = cursor; cursor += size + 15 & ~15; memory.fill(0x93, p, cursor); log.push(['allocate', size, p]); return p;}, free(address) {log.push(['free', address]);}, registerExit(address) {log.push(['atexit', address]); return 0;}, dynamicCast(...args) {args.pop(); log.push(['RTTI', args.map(v => v >>> 0)]); return args[0];},
      direct3DCall(object, method, args) {log.push(['Direct3D', method, args.map(v => v >>> 0)]); serial++; if (method === 0x2c) return (args[5] + fixture) % 3 === 0 ? -1 : 0; return (serial + fixture) % (fixture % 4 + 2) === 0 ? 0 : -1;}
    };};
    const source = services(m, trace); runtime.handlers = source; runtime.services = source;
    let entry, ecx, args, action, result = false;
    if (selector === 0) {entry = 0x5120e0; ecx = MANAGER; args = []; action = () => configureRendererPresentation(MANAGER, runtime);}
    else if (selector === 1) {entry = 0x402aa0; ecx = 0; args = []; action = () => getRendererWindowApplication(runtime); result = true;}
    else {entry = 0x4068d0; ecx = SETTINGS; const scale = [1, 4 / 3, 1.5, -2][fixture % 4]; args = [[0, 1, 640, 0x7fffffff][fixture % 4], [0, 1, 480, -1][fixture % 4], fixture % 3 ? 32 : 16, fixture % 121, fixture % 3]; const b = Buffer.alloc(4); b.writeFloatLE(scale); args.push(b.readInt32LE(0)); action = () => configureRendererGraphicsMode(SETTINGS, ...args.slice(0, 5), scale, runtime);}
    machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const native = services(machine.bytes, nativeTrace);
    machine.externalCalls.set(0xf1000000, x => {x.r.EAX = native.allocate(ptr(x.bytes, x.r.ESP));}); machine.externalCalls.set(0xf1000004, x => native.free(ptr(x.bytes, x.r.ESP)));
    machine.externalCalls.set(0x56832a, x => {x.r.EAX = native.registerExit(ptr(x.bytes, x.r.ESP));}); machine.externalCalls.set(0x56932a, x => {const args = Array.from({length: 5}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)); x.r.EAX = native.dynamicCast(...args, {});});
    machine.externalCalls.set(0x568162, x => assert.equal(x.r.ECX, x.bytes.readInt32LE(0x5e8890)));
    const move = x => {const p = ptr(x.bytes, x.r.ESP), input = ptr(x.bytes, x.r.ESP + 4), n = ptr(x.bytes, x.r.ESP + 8); Buffer.from(x.bytes.subarray(input, input + n)).copy(x.bytes, p); x.r.EAX = p;}; machine.externalCalls.set(0x568a48, move);
    machine.externalCalls.set(0x568a50, x => {const p = ptr(x.bytes, x.r.ESP); x.bytes.fill(x.bytes[x.r.ESP + 4], p, p + ptr(x.bytes, x.r.ESP + 8)); x.r.EAX = p;});
    for (const [method, n] of [[0x28, 7], [0x30, 6], [0x2c, 7]]) machine.externalCalls.set(0xf0000000 + method, x => {const args = Array.from({length: n}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)); x.r.EAX = native.direct3DCall(args[0], method, args); x.r.ESP += n * 4;});
    try {const value = action(); machine.entry = entry; machine.r.ESP = S; machine.r.ECX = ecx; put(machine.bytes, S, -1); args.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v)); steps += machine.run(1000000); calls++;
      if (result) assert.equal(machine.r.EAX >>> 0, value >>> 0); assert.deepEqual(nativeTrace, trace); assert.equal(machine.fs0, 0);
      if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {const p = m.subarray(0x10000).findIndex((v, i) => v !== machine.bytes[0x10000 + i]) + 0x10000; assert.fail(`difference${p.toString(16)} JS=${m.subarray(p, p + 20).toString('hex')} native=${machine.bytes.subarray(p, p + 20).toString('hex')}`);}
    } catch (error) {console.error({fixture, selector, entry: entry.toString(16), trace: trace.slice(-8), nativeTrace: nativeTrace.slice(-8)}); throw error;}
  }
  const report = {method: 'Actual5120e0 presentation parameters/refresh/multisample/format/window producers with actual511a30 and50f1a0 getter,402aa0 WindowsApplication singleton/CRT RTTI plus actual403430lazy construction,4068d0 scalar-SSE settings writer. All mapped bytes>=10000h and exact CRT/COM requests, restored FS chain; genuine platform COM/CRT only, no game mocks/original process/device execution. Existing settings/debugger roots are explicit fixture inputs.', targetSha256: program.sha256, fixtures, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyRendererPresentation({fixtures: Number(process.argv[2] ?? 1200)})));

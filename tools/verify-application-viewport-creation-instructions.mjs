import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {constructRendererResourcePool} from '../src/renderer-resource-pools.mjs';
import {createApplicationViewport, setApplicationViewportEnabled} from '../src/application-viewports.mjs';
import {initializeRaceViewports} from '../src/race-viewports.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyApplicationViewportCreation({fixtures = 200, views = 9, parent = false, output = 'analysis/application-viewport-creation-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let calls = 0, steps = 0;
  machine.onInstruction = p => {reached.add(p); if ([0x450a90, 0x471770, 0x42ef80, 0x403430, 0x404020, 0x520dc0, 0x520380, 0x520660, 0x517d70, 0x518060, 0x5208d0, 0x5131b0].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  const S = 0x9000, MANAGER = 0x100000, APP = 0x110000, OWNER = 0x120000, CONFIG = 0x130000, DEVICE = 0x140000, HEAD = 0x150000, VTABLE = 0x160000, NAME = 0x170000, CAPS = 0x180000;
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), sourceTrace = [], nativeTrace = [], runtime = {memory: m, scratchBase: S}; m.fill(0x69, 0x7000, 0x9500);
    put(m, MANAGER, 0x5db278); put(m, MANAGER + 0x488, CAPS); put(m, MANAGER + 0x36c, DEVICE); put(m, DEVICE, VTABLE); put(m, 0x714ae8, MANAGER); put(m, 0x6e6388, OWNER); put(m, 0x5ecefc, CONFIG); put(m, 0x6e6c04, fixture % 3); m[CONFIG + 0x41a] = fixture % 2;
    put(m, MANAGER + 0x500, [21, 22, 41, 113][fixture % 4]); put(m, MANAGER + 0x504, 75); put(m, CAPS + 0x45c, 8192); put(m, CAPS + 0x460, 8192); put(m, CAPS + 0x440, fixture % 2 ? 0x120 : 2);
    for (const o of [0x5c, 0x60, 0x64, 0x74]) put(m, VTABLE + o, 0xf0000000 + o);
    put(m, APP + 0x7c, HEAD); for (const o of [0, 4, 8]) put(m, HEAD + o, HEAD); m.writeUInt16LE(0x101, HEAD + 12); put(m, APP + 0x6c, fixture * 13579);
    put(m, 0x715b08, 3); put(m, 0x714afc, 0x715b30); put(m, 0x714b44, 0); put(m, 0x5e8890, fixture * 7919); put(m, 0x91ce1c, 0x12345678 + fixture);
    if (parent) {
      put(m, 0x5ecb1c, 0x1a0000); m[0x1a0552] = [0, 1, 2, 3, 4, 255][fixture % 6]; m.writeUInt16LE([0, 1, 5, 641, 1920, 65535][fixture % 6], CONFIG + 0x42c); m.writeUInt16LE([1, 2, 31, 480, 1080, 65535][fixture % 6], CONFIG + 0x42e);
      put(m, 0x6e6758, fixture % 11 === 0 ? 1 : 0); put(m, 0x6efb38, fixture % 3 === 0 ? 0 : APP); put(m, 0x6eafe0, fixture % 2 ? 0x10 : 0); put(m, 0x6e9f70, fixture % 6);
      for (let i = 0; i < 6; i++) put(m, 0x6e7884 + i * 0x67c, (fixture + i) % 3 ? 1 : 0);
    }
    const imports = [['operatorNew', 0x56e220, 0xf1000000], ['operatorDelete', 0x56e210, 0xf1000004], ['operatorNewArray', 0x56e474, 0xf1000008], ['operatorDeleteArray', 0x56e470, 0xf100000c]];
    for (const [, p, v] of imports) put(m, p, v); put(m, 0x56e478, 0xf1000010); put(m, 0x56e254, 0xf1000014);
    const services = (memory, trace) => {let cursor = 0x200000, serial = 0; const libraryCall = (name, args) => {
      if (name.includes('New')) {const p = cursor; cursor += args[0] + 15 & ~15; memory.fill(0x93, p, cursor); trace.push([name, args[0], p]); return p;} trace.push([name, args[0]]);
    }; return {libraryCall, crtCall(name, args) {assert.equal(name, '_itoa'); trace.push([name, args]); memory.write(`${args[0]}\0`, args[1], 'latin1'); return args[1];}, registerExit(address) {trace.push(['atexit', address]); return 0;}, dynamicCast(...args) {args.pop(); trace.push(['dynamicCast', args.map(v => v >>> 0)]); return args[0];}, direct3DCall(object, method, args) {trace.push(['direct3D', object >>> 0, method, args.map(v => v >>> 0)]); const output = args.at(-2), p = 0x190000 + serial++ * 16; put(memory, output, p); return 0;}};};
    runtime.services = services(m, sourceTrace); runtime.handlers = {allocate: size => runtime.services.libraryCall('operatorNew', [size]), free: p => runtime.services.libraryCall('operatorDelete', [p]), registerExit: runtime.services.registerExit, dynamicCast: runtime.services.dynamicCast};
    machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const native = services(machine.bytes, nativeTrace);
    for (const [name, , target] of imports) machine.externalCalls.set(target, x => {const v = native.libraryCall(name, [ptr(x.bytes, x.r.ESP)]); if (name.includes('New')) x.r.EAX = v;});
    const move = x => {const target = ptr(x.bytes, x.r.ESP), input = ptr(x.bytes, x.r.ESP + 4), count = ptr(x.bytes, x.r.ESP + 8); Buffer.from(x.bytes.subarray(input, input + count)).copy(x.bytes, target); x.r.EAX = target;}; machine.externalCalls.set(0xf1000010, move); machine.externalCalls.set(0x568a48, move);
    machine.externalCalls.set(0x568a50, x => {const p = ptr(x.bytes, x.r.ESP); x.bytes.fill(x.bytes[x.r.ESP + 4], p, p + ptr(x.bytes, x.r.ESP + 8)); x.r.EAX = p;});
    machine.externalCalls.set(0x568162, x => assert.equal(x.r.ECX, x.bytes.readInt32LE(0x5e8890)));
    machine.externalCalls.set(0xf1000014, x => {x.r.EAX = native.crtCall('_itoa', [ptr(x.bytes, x.r.ESP), ptr(x.bytes, x.r.ESP + 4), ptr(x.bytes, x.r.ESP + 8)]);});
    machine.externalCalls.set(0x56832a, x => {x.r.EAX = native.registerExit(ptr(x.bytes, x.r.ESP));});
    machine.externalCalls.set(0x56932a, x => {const args = Array.from({length: 5}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)); x.r.EAX = native.dynamicCast(...args, {});});
    for (const [method, count] of [[0x5c, 9], [0x60, 10], [0x64, 8], [0x74, 9]]) machine.externalCalls.set(0xf0000000 + method, x => {const args = Array.from({length: count}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)); x.r.EAX = native.direct3DCall(args[0], method, args); x.r.ESP += count * 4;});
    const check = (entry, ecx, args, action, label) => {
      try {action(); machine.entry = entry; machine.r.ESP = S; machine.r.ECX = ecx; put(machine.bytes, S, -1); args.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v)); steps += machine.run(5000000); calls++; assert.equal(machine.fs0, 0); assert.deepEqual(nativeTrace, sourceTrace);
        if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {const p = m.subarray(0x10000).findIndex((v, i) => v !== machine.bytes[0x10000 + i]) + 0x10000; assert.fail(`difference${p.toString(16)} JS=${m.subarray(p, p + 24).toString('hex')} native=${machine.bytes.subarray(p, p + 24).toString('hex')}`);}
      } catch (error) {console.error({fixture, label, entry: entry.toString(16), sourceTrace: sourceTrace.slice(-12), nativeTrace: nativeTrace.slice(-12)}); throw error;}
    };
    check(0x5131b0, MANAGER + 0x48c, [], () => constructRendererResourcePool(MANAGER + 0x48c, 'texture', runtime), 'texture pool');
    check(0x513330, MANAGER + 0x890, [], () => constructRendererResourcePool(MANAGER + 0x890, 'integer', runtime), 'integer pool');
    for (let view = 0; view < (parent ? 3 : views); view++) {
      if (parent) {check(0x450a90, 0, [], () => initializeRaceViewports(runtime), `initialize${view}`); continue;}
      const name = ['0 Player', '1 Player', 'Rear View Mirror', 'Cinematic Window', 'A viewport with a heap name', '0 Player'][view % 6], args = [view === 0 && fixture % 7 === 0 ? 0 : NAME, view * 37 - 10, view * -11 + 5, [0, 1, 3, 641, 1024, 65535][(fixture + view) % 6], [1, 2, 3, 480, 768][(fixture + view) % 5]];
      for (const bytes of [m, machine.bytes]) {bytes.fill(0, NAME, NAME + 128); bytes.write(name, NAME, 'latin1');}
      check(0x404020, APP, args, () => createApplicationViewport(APP, ...args, runtime), `create${view}`);
      check(0x406b80, APP, [args[0], view % 3], () => setApplicationViewportEnabled(APP, args[0], view % 3, runtime), `enable${view}`);
    }
  }
  const report = {method: `${parent ? 'Actual450a90 full parent with actual471770 participant producer/42ef80 rectangles/41bef0 count/lazy403430 application construction and repeated one-time-gate calls. ' : ''}Actual5131b0/513330 pool producers followed by persistent404020 application creation and406b80 enable. Actual texture acquisition/growth, renderer virtual80/resource/surface algorithms, target name registration/insertion, scene-linked viewport/listener/frustum construction, pointer vectors and viewport-map rotations. All mapped memory>=10000h, exact ordered CRT/Direct3D COM requests and restored FS chain. Caller explicitly supplies ${parent ? 'renderer/debugger/session roots, peer statuses' : 'initialized application/debugger/renderer roots'} and device caps; no game mocks/original process/device execution.`, targetSha256: program.sha256, fixtures, viewsPerFixture: parent ? null : views, parentCallsPerFixture: parent ? 3 : null, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyApplicationViewportCreation({fixtures: Number(process.argv[2] ?? 200), views: Number(process.argv[3] ?? 9)})));

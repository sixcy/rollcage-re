import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {selectRendererAdapter} from '../src/renderer-device-selection.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRendererDeviceSelection({fixtures = 1500, failure = false, output = 'analysis/renderer-device-selection-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let calls = 0, steps = 0;
  const S = 0x9000, MANAGER = 0x100000, DEVICE = 0x110000, VTABLE = 0x120000, APP = 0x130000, SETTINGS = 0x140000, ROWS = 0x150000;
  machine.onInstruction = p => {reached.add(p); if ([0x512740, 0x5110b0, 0x50f130, 0x4068d0].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), trace = [], nativeTrace = [], runtime = {memory: m, scratchBase: S}; m.fill(0x69, 0x7000, 0x9500);
    put(m, MANAGER + 0x368, DEVICE); put(m, MANAGER + 0x47c, ROWS); put(m, MANAGER + 0x480, ROWS + 3 * 0x53c); put(m, MANAGER + 0x484, ROWS + 3 * 0x53c); put(m, MANAGER + 0x438, -17); put(m, DEVICE, VTABLE);
    for (const method of [0x18, 0x1c, 0x20, 0x24]) put(m, VTABLE + method, 0xf0000000 + method);
    for (let i = 0; i < 3; i++) {const row = ROWS + i * 0x53c; put(m, row, i); put(m, row + 0x420, fixture % 2 ? 0x10000 : 0); put(m, row + 0x4c8, [0, 0xfffe0100, 0xfffe0200][fixture % 3]); put(m, row + 0x4d0, [0, 0xffff0100, 0xffff0200, 0xffff0300, 0xffff0400, 0xffff0500][fixture % 6]); put(m, row + 0x534, 1); m.write(`Adapter${i}\0`, row + 0x204); if (failure && (fixture + i) % 3) put(m, row + 0x538, 0x5db224);}
    put(m, 0x6efb38, APP); put(m, APP + 8, 0x12345678); put(m, 0x6e64a4, SETTINGS); put(m, 0x6e63d0, 3); m[SETTINGS + 0xc8] = fixture % 2; put(m, SETTINGS + 0x2c, 1280); put(m, SETTINGS + 0x30, 720); m.writeFloatLE(4 / 3, SETTINGS + 0x40);
    put(m, 0x715b08, 3); put(m, 0x714afc, 0x715b30); put(m, 0x56e508, 0xf1000000);
    const libraryImports = [['operatorNew', 0x56e220, 0xf1000010], ['operatorDelete', 0x56e210, 0xf1000014], ['operatorNewArray', 0x56e474, 0xf1000018], ['operatorDeleteArray', 0x56e470, 0xf100001c], ['_vsnprintf', 0x56e228, 0xf1000020]]; for (const [, address, target] of libraryImports) put(m, address, target);
    const platformImports = [['GetUserDefaultLangID', 0x56e160, 0xf1000024, 0], ['ShowCursor', 0x56e520, 0xf1000028, 1], ['MessageBeep', 0x56e598, 0xf100002c, 1], ['MessageBoxW', 0x56e59c, 0xf1000030, 4], ['MultiByteToWideChar', 0x56e0c0, 0xf1000034, 6]]; for (const [, address, target] of platformImports) put(m, address, target);
    const services = (memory, log) => {let cursor = 0x200000; return {
      dynamicCast(...args) {args.pop(); log.push(['RTTI', args.map(v => v >>> 0)]); return args[0];},
      libraryCall(name, args) {log.push([name, args.map(v => v >>> 0)]); if (name.includes('New')) {const p = cursor; cursor += args[0] + 15 & ~15; memory.fill(0x93, p, cursor); return p;} if (name === '_vsnprintf') {const read = p => memory.toString('latin1', p, memory.indexOf(0, p)); let i = 0; const text = read(args[2]).replace(/%s/g, () => read(ptr(memory, args[3] + i++ * 4))); memory.write(`${text}\0`, args[0], 'latin1'); return text.length;}},
      platformCall(name, args) {log.push([name, args.map(v => v >>> 0)]); if (name === 'GetClientRect') [7, 9, 1000 + fixture % 500, 700 + fixture % 100].forEach((v, i) => put(memory, args[1] + i * 4, v));
        else if (name === 'GetUserDefaultLangID') return [6, 7, 10, 12, 16, 19, 29, 9][fixture % 8];
        else if (name === 'MultiByteToWideChar') {for (let i = 0; i < args[3]; i++) memory.writeUInt16LE(memory[args[2] + i], args[4] + i * 2); return args[3];}
        else if (name === 'MessageBoxW') {let end = args[1]; while (memory.readUInt16LE(end)) end += 2; log.push(['dialogText', memory.toString('utf16le', args[1], end)]);} return 1;},
      direct3DCall(object, method, args) {log.push(['Direct3D', method, args.map(v => v >>> 0)]); if (method === 0x20) {[640, 480, 60, 22].forEach((v, i) => put(memory, args[2] + i * 4, v)); return 0;} if (method === 0x18) return failure ? 0 : 3;
        if (method === 0x1c) {[[640, 480, 60, 22], [320, 240, 60, 23], [1024, 768, 75, 22]][args[3]].forEach((v, i) => put(memory, args[4] + i * 4, v)); return 0;} if (method === 0x24) return 0; throw Error('Unexpected COM method.');}
    };};
    const source = services(m, trace); runtime.handlers = source; runtime.services = source;
    const args = [fixture % 3, failure ? 0 : [0, 1, 257, 2][fixture % 4], failure ? 800 : fixture % 7 === 0 ? 0 : 800, 600, [16, 24, 32][fixture % 3], fixture % 5 ? 75 : 60];
    machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const native = services(machine.bytes, nativeTrace);
    machine.externalCalls.set(0x56932a, x => {const args = Array.from({length: 5}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)); x.r.EAX = native.dynamicCast(...args, {});});
    machine.externalCalls.set(0xf1000000, x => {x.r.EAX = native.platformCall('GetClientRect', [ptr(x.bytes, x.r.ESP), ptr(x.bytes, x.r.ESP + 4)]); x.r.ESP += 8;});
    for (const [name, , target] of libraryImports) machine.externalCalls.set(target, x => {const n = name === '_vsnprintf' ? 4 : 1, args = Array.from({length: n}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)), result = native.libraryCall(name, args); if (result !== undefined) x.r.EAX = result;});
    for (const [name, , target, n] of platformImports) machine.externalCalls.set(target, x => {x.r.EAX = native.platformCall(name, Array.from({length: n}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4))); x.r.ESP += n * 4;});
    machine.externalCalls.set(0x568980, x => {x.r.ESP -= x.r.EAX;}); machine.externalCalls.set(0x568a48, x => {const target = ptr(x.bytes, x.r.ESP), input = ptr(x.bytes, x.r.ESP + 4), n = ptr(x.bytes, x.r.ESP + 8); Buffer.from(x.bytes.subarray(input, input + n)).copy(x.bytes, target); x.r.EAX = target;});
    for (const [method, n] of [[0x18, 3], [0x1c, 5], [0x20, 3], [0x24, 6]]) machine.externalCalls.set(0xf0000000 + method, x => {const args = Array.from({length: n}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)); x.r.EAX = native.direct3DCall(args[0], method, args); x.r.ESP += n * 4;});
    try {const result = selectRendererAdapter(MANAGER, ...args, runtime); machine.entry = 0x512740; machine.r.ESP = S; machine.r.ECX = MANAGER; put(machine.bytes, S, -1); args.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v)); steps += machine.run(1000000); calls++;
      assert.equal(machine.r.EAX & 255, result); assert.deepEqual(nativeTrace, trace); assert.equal(machine.fs0, 0); assert.deepEqual(machine.bytes.subarray(S + 4, S + 28), m.subarray(S + 4, S + 28));
      if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {const p = m.subarray(0x10000).findIndex((v, i) => v !== machine.bytes[0x10000 + i]) + 0x10000; assert.fail(`difference${p.toString(16)} JS=${m.subarray(p, p + 20).toString('hex')} native=${machine.bytes.subarray(p, p + 20).toString('hex')}`);}
    } catch (error) {console.error({fixture, args, trace: trace.slice(-12), nativeTrace: nativeTrace.slice(-12)}); throw error;}
  }
  const report = {method: `Actual512740 adapter selection with original50f130/category registration,4a18d0 enabled getter,actual5110b0 mode/fallback algorithms,402aa0 window RTTI,405010 settings and4068d0 scalar writer. ${failure ? 'All-three-attempt failure reaches actual50fb20 multilingual error/string/adapter-reason/ACP/Win32 dialog graph.' : 'Fullscreen successful first/second/third attempts,zero-width skip,windowed fixed/client dimensions,wide windowed DWORD257,all capability tiers; failure is covered by the separate connected error report.'} All mapped>=10000h plus mutated caller arguments and exact ordered COM/CRT/platform requests. No reached game mocks/original process/device/window execution.`, targetSha256: program.sha256, fixtures, failure, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyRendererDeviceSelection({fixtures: Number(process.argv[2] ?? 1500)})));

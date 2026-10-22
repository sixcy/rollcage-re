import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {showRendererStartupError} from '../src/renderer-startup-errors.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), string = (m, p) => m.toString('latin1', p, m.indexOf(0, p));
export async function verifyRendererStartupErrors({fixtures = 1200, output = 'analysis/renderer-startup-errors-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(); let calls = 0, steps = 0, formatted = 0;
  const S = 0x9000, MANAGER = 0x100000, ROWS = 0x110000, REASONS = 0x160000, MESSAGE = 0x170000;
  machine.onInstruction = p => reached.add(p);
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), trace = [], nativeTrace = [], runtime = {memory: m, scratchBase: S}; m.fill(0x69, 0x6000, 0x9500);
    put(m, MANAGER + 0x47c, ROWS); put(m, MANAGER + 0x480, ROWS + (fixture % 5) * 0x53c);
    for (let i = 0; i < 4; i++) {m.write(`Adapter${i}\0`, ROWS + i * 0x53c + 0x204); m.write(`missing capability ${i}\0`, REASONS + i * 64); put(m, ROWS + i * 0x53c + 0x538, (fixture + i) % 3 ? REASONS + i * 64 : 0);}
    m.write(`${fixture % 2 ? 'Could not select a display mode.' : ''}\0`, MESSAGE); const message = fixture % 11 === 0 ? 0 : MESSAGE;
    const imports = [['operatorNew', 0x56e220, 0xf1000000], ['operatorDelete', 0x56e210, 0xf1000004], ['operatorNewArray', 0x56e474, 0xf1000008], ['operatorDeleteArray', 0x56e470, 0xf100000c], ['_vsnprintf', 0x56e228, 0xf1000010]];
    for (const [, p, v] of imports) put(m, p, v);
    const platformImports = [['GetUserDefaultLangID', 0x56e160, 0xf1000014, 0], ['ShowCursor', 0x56e520, 0xf1000018, 1], ['MessageBeep', 0x56e598, 0xf100001c, 1], ['MessageBoxW', 0x56e59c, 0xf1000020, 4], ['MultiByteToWideChar', 0x56e0c0, 0xf1000024, 6]]; for (const [, p, v] of platformImports) put(m, p, v);
    const services = (memory, log) => {let cursor = 0x200000, formats = 0; return {
      libraryCall(name, args) {
        log.push([name, args.map(v => v >>> 0)]);
        if (name.includes('New')) {const p = cursor; cursor += args[0] + 15 & ~15; memory.fill(0x93, p, cursor); return p;}
        if (name === '_vsnprintf') {let index = 0; const text = string(memory, args[2]).replace(/%s/g, () => string(memory, ptr(memory, args[3] + index++ * 4))); memory.write(`${text}\0`, args[0], 'latin1'); formats++; formatted++; if (formats === 1 && fixture % 7 === 0) put(memory, MANAGER + 0x480, ROWS + 0x53c); return text.length;}
      },
      platformCall(name, args) {
        log.push([name, args.map(v => v >>> 0)]);
        if (name === 'GetUserDefaultLangID') return [6, 7, 10, 12, 16, 19, 29, 9, 0x409, 0][fixture % 10];
        if (name === 'MultiByteToWideChar') {if (fixture % 17 === 0) return 0; for (let i = 0; i < Math.min(args[3], args[5]); i++) memory.writeUInt16LE(memory[args[2] + i], args[4] + i * 2); return args[3];}
        if (name === 'MessageBoxW') {const wide = p => {let e = p; while (memory.readUInt16LE(e)) e += 2; return memory.toString('utf16le', p, e);}; log.push(['dialogText', wide(args[1]), wide(args[2])]);}
        return 1;
      }
    };};
    runtime.services = services(m, trace); machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const native = services(machine.bytes, nativeTrace);
    for (const [name, , target] of imports) machine.externalCalls.set(target, x => {const n = name === '_vsnprintf' ? 4 : 1, args = Array.from({length: n}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)), result = native.libraryCall(name, args); if (result !== undefined) x.r.EAX = result;});
    for (const [name, , target, n] of platformImports) machine.externalCalls.set(target, x => {x.r.EAX = native.platformCall(name, Array.from({length: n}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4))); x.r.ESP += n * 4;});
    machine.externalCalls.set(0x568980, x => {x.r.ESP -= x.r.EAX;});
    const move = x => {const target = ptr(x.bytes, x.r.ESP), input = ptr(x.bytes, x.r.ESP + 4), n = ptr(x.bytes, x.r.ESP + 8); Buffer.from(x.bytes.subarray(input, input + n)).copy(x.bytes, target); x.r.EAX = target;}; machine.externalCalls.set(0x568a48, move);
    try {showRendererStartupError(MANAGER, message, runtime); machine.entry = 0x50fb20; machine.r.ESP = S; machine.r.ECX = MANAGER; put(machine.bytes, S, -1); put(machine.bytes, S + 4, message); steps += machine.run(2000000); calls++;
      assert.deepEqual(nativeTrace, trace); assert.equal(machine.fs0, 0);
      if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {const p = m.subarray(0x10000).findIndex((v, i) => v !== machine.bytes[0x10000 + i]) + 0x10000; assert.fail(`difference${p.toString(16)} JS=${m.subarray(p, p + 20).toString('hex')} native=${machine.bytes.subarray(p, p + 20).toString('hex')}`);}
    } catch (error) {console.error({fixture, trace: trace.slice(-16), nativeTrace: nativeTrace.slice(-16)}); throw error;}
  }
  const report = {method: 'Actual50fb20 multilingual renderer startup failure with all actual narrow/wide string/growth/append/format/conversion game descendants. Eight translation/default branches, null/empty/ordinary message, populated rejected-adapter reasons and live-vector mutation during genuine CRT formatting, platform conversion failure. All mapped memory>=10000h,exact ordered allocator/CRT/Win32 requests and dialog text,balanced synthetic FS chain; no game mocks/original process/window/dialog execution.', targetSha256: program.sha256, fixtures, calls, formattedAdapterReasons: formatted / 2, reachedInstructions: reached.size, instructionSteps: steps, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyRendererStartupErrors({fixtures: Number(process.argv[2] ?? 1200)})));

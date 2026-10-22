import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from '../../lib/retained-native-program.mjs';
import {BoundedX86} from '../../lib/bounded-x86.mjs';
import {initializeRaceViewports, initializeRaceViewportLiterals} from './parent.mjs';

const ENTRY = 0x9000, FRAME = ENTRY - 60, SESSION = 0x120000, CONFIG = 0x122000, OTHER_CONFIG = 0x124000;
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const cString = (m, p) => m.toString('latin1', p, m.indexOf(0, p));

export async function checkRaceViewportParent({fixtures = 1200, output = null} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set();
  let instructionSteps = 0, definitions = 0, enabled = 0, constructed = 0, current = 0;
  const instructions = new Map(program.instructions.map((row, i) => [row.address, program.instructions[i + 1]?.address]));
  machine.onInstruction = address => {current = address; reached.add(address); if (address === 0x403430) constructed++;};
  const stats = {creationSkipped: 0, liveCountChanges: 0, allocatorMutations: 0, castArgumentAliases: 0};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = Buffer.alloc(0xa00000); program.initializeMemory(memory); initializeRaceViewportLiterals(memory);
    memory.fill(0x36, ENTRY - 0x1800, ENTRY + 64); put(memory, 0x5e8890, Math.imul(fixture + 1, 0x1234567));
    put(memory, 0x5ecb1c, SESSION); memory[SESSION + 0x552] = [0, 1, 2, 3, 4, 255][fixture % 6];
    put(memory, 0x5ecefc, CONFIG); const widths = [0, 1, 5, 12, 320, 640, 1920, 65535], heights = [0, 1, 31, 240, 480, 1080, 65535];
    for (const [base, shift] of [[CONFIG, 0], [OTHER_CONFIG, 3]]) {memory.writeUInt16LE(widths[(fixture + shift) % widths.length], base + 0x42c); memory.writeUInt16LE(heights[(fixture + shift) % heights.length], base + 0x42e);}
    put(memory, 0x6e6758, fixture % 5 === 0 ? -1 : 0); if (fixture % 5 === 0) stats.creationSkipped++;
    if (fixture % 3 === 1) put(memory, 0x6efb38, 0x150000); else if (fixture % 3 === 2) put(memory, 0x715060, 1);
    for (const [address, callback] of [[0x56e220, 0x5a000], [0x56e210, 0x5a010], [0x56e08c, 0x5a020], [0x56e094, 0x5a030], [0x56e090, 0x5a040], [0x56e09c, 0x5a050], [0x56e254, 0x5a060]]) put(memory, address, callback);
    const registers = {EAX: 0, ECX: fixture * 31, EDX: -fixture * 17, EBX: 0x13570000 + fixture, EBP: -fixture - 1, ESI: 0x24680000 + fixture, EDI: fixture * 137};
    const makeServices = bytes => {
      let cursor = 0x200000, allocationIndex = 0, defineIndex = 0, enableIndex = 0;
      const trace = [], names = [];
      const mutateAllocator = () => {
        if (allocationIndex !== 1) return;
        if (fixture % 13 === 0) {put(bytes, FRAME + 0x10, 0x12345678); stats.allocatorMutations++;}
        if (fixture % 17 === 0) put(bytes, 0x6efb38, 0x160000);
        if (fixture % 19 === 0) put(bytes, 0x5ecefc, OTHER_CONFIG);
      };
      const allocate = size => {trace.push(['allocate', size]); const result = cursor; cursor += size + 15 & ~15; bytes.fill(0xa5, result, cursor); allocationIndex++; mutateAllocator(); return result;};
      const platformCall = (name, args) => {trace.push([name, args]); if (name === 'InitializeCriticalSectionAndSpinCount') [0, -1, 0, 0, 0, args[1]].forEach((v, i) => put(bytes, args[0] + i * 4, v)); return name === 'GetCurrentThreadId' ? 42 : 1;};
      const registerExit = address => {trace.push(['atexit', address]); return 0;};
      const dynamicCast = (...args) => {
        const context = args.pop(); trace.push(['dynamicCast', args, context.scratchBase]);
        if (fixture % 29 === 0 && context.scratchBase === FRAME - 44) {put(bytes, FRAME - 12, 0x76543210); stats.castArgumentAliases++;}
        return args[0] + (fixture % 3 === 0 ? 0x200 : 0) >>> 0;
      };
      const crtCall = (name, args, context) => {
        assert.equal(name, '_itoa'); trace.push([name, args, context.scratchBase]); const [value, output, radix] = args; assert.equal(radix, 10);
        bytes.write(`${value}\0`, output, 'latin1'); if (fixture % 23 === 0) put(bytes, 0x5ec120 + value * 4, (value + 3) % 6); return output;
      };
      const game = (id, request) => {
        const {ecx, edx, args, scratchBase} = request;
        trace.push([id, ecx, id === '471770' || id === '42ef80' ? edx : null, args, scratchBase]);
        if (id === '471770') for (let i = 0; i < 4; i++) put(bytes, 0x5ec120 + i * 4, (fixture + i * 3) % 6);
        if (id === '42ef80') for (let i = 0; i < 6; i++) for (let axis = 0; axis < 4; axis++) put(bytes, 0x909308 + i * 0x30c + axis * 4, Math.imul(fixture + 1, axis + 7) + i * 101 - 200);
        if (id === '404020') {
          const name = cString(bytes, args[0] >>> 0); names.push(name); trace.push(['definition', name, ...args.slice(1)]); definitions++; defineIndex++;
          const row = 0x9f0000 + (defineIndex - 1) * 32; put(bytes, row, ecx); args.forEach((v, i) => put(bytes, row + 4 + i * 4, v));
          if (fixture % 7 === 0 && defineIndex === 1) put(bytes, 0x6efb38, 0);
          if (fixture % 11 === 0 && defineIndex === 1) {put(bytes, 0x6efb38, 0); put(bytes, 0x715060, 0);}
        }
        if (id === '406b80') {
          enabled++; enableIndex++; put(bytes, 0x9f0200 + enableIndex * 4, args[1]);
          if (fixture % 31 === 0 && enableIndex === 1) {bytes[SESSION + 0x552] = 4; stats.liveCountChanges++;}
          if (fixture % 37 === 0) put(bytes, 0x5ecefc, OTHER_CONFIG);
        }
      };
      const handlers = {allocate, free: address => trace.push(['free', address]), registerExit, dynamicCast};
      for (const id of ['471770', '42ef80', '404020', '406b80']) handlers[`call${id}`] = request => game(id, request);
      return {trace, handlers, services: {platformCall, crtCall}, game, names};
    };
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); Object.assign(machine.r, registers);
    const source = makeServices(memory), native = makeServices(machine.bytes), runtime = {memory, scratchBase: ENTRY, entryRegisters: registers, handlers: source.handlers, services: source.services};
    const publishReturn = x => put(x.bytes, x.r.ESP - 4, instructions.get(current));
    machine.externalCalls.set(0x568162, x => assert.equal(x.r.ECX | 0, get(x.bytes, 0x5e8890)));
    machine.externalCalls.set(0x56832a, x => {publishReturn(x); x.r.EAX = native.handlers.registerExit(ptr(x.bytes, x.r.ESP));});
    machine.externalCalls.set(0x56932a, x => {publishReturn(x); const args = Array.from({length: 5}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)); x.r.EAX = native.handlers.dynamicCast(...args, {memory: x.bytes, scratchBase: x.r.ESP - 4});});
    machine.externalCalls.set(0x5a000, x => {publishReturn(x); x.r.EAX = native.handlers.allocate(ptr(x.bytes, x.r.ESP));});
    machine.externalCalls.set(0x5a010, x => native.handlers.free(ptr(x.bytes, x.r.ESP)));
    for (const [address, name, count] of [[0x5a020, 'InitializeCriticalSectionAndSpinCount', 2], [0x5a030, 'EnterCriticalSection', 1], [0x5a040, 'LeaveCriticalSection', 1], [0x5a050, 'GetCurrentThreadId', 0]]) machine.externalCalls.set(address, x => {publishReturn(x); x.r.EAX = native.services.platformCall(name, Array.from({length: count}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4))); x.r.ESP += count * 4;});
    machine.externalCalls.set(0x5a060, x => {publishReturn(x); x.r.EAX = native.services.crtCall('_itoa', Array.from({length: 3}, (_, i) => get(x.bytes, x.r.ESP + i * 4)), {memory: x.bytes, scratchBase: x.r.ESP - 4});});
    for (const [id, count, clean] of [['471770', 0, 0], ['42ef80', 2, 0], ['404020', 5, 20], ['406b80', 2, 8]]) machine.externalCalls.set(Number(`0x${id}`), x => {publishReturn(x); native.game(id, {memory: x.bytes, ecx: x.r.ECX, edx: x.r.EDX, args: Array.from({length: count}, (_, i) => get(x.bytes, x.r.ESP + i * 4)), scratchBase: x.r.ESP - 4}); x.r.ESP += clean;});
    initializeRaceViewports(runtime); machine.entry = 0x450a90; machine.r.ESP = ENTRY; put(machine.bytes, ENTRY, -1); instructionSteps += machine.run(2000000);
    assert.equal(machine.fs0, 0, `TLS restored/${fixture}`); assert.deepEqual(native.trace, source.trace, `ordered contracts/services/${fixture}`);
    const a = machine.bytes.subarray(0x10000), b = memory.subarray(0x10000);
    if (!a.equals(b)) {const offset = a.findIndex((v, i) => v !== b[i]); assert.fail(`fixture${fixture} diff${(offset + 0x10000).toString(16)} native${a[offset]} source${b[offset]}`);}
    assert.deepEqual(machine.bytes.subarray(FRAME + 0x10, FRAME + 0x38), memory.subarray(FRAME + 0x10, FRAME + 0x38), `defined parent locals/${fixture}`);
  }
  const report = {method: 'Isolated full450a90 parent plus actual41bef0 and403430/bootstrap game descendants. Four missing game children471770/42ef80/404020/406b80 are explicit state-mutating contracts, not recovered algorithms. All mapped memory>=10000h, defined parent locals, ordered raw ABI/CRT/platform requests and FS restoration. Synthetic roots, rectangles, callback aliases and singleton re-entry; no original process execution or canonical integration.', targetSha256: program.sha256, fixtures, reachedInstructions: reached.size, instructionSteps, definitions: definitions / 2, enabled: enabled / 2, constructed, stats: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, k === 'creationSkipped' ? v : v / 2])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});
  return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await checkRaceViewportParent({fixtures: Number(process.argv[2] ?? 1200), output: process.argv.includes('--save') ? 'analysis/race-viewports-next-phase-parent-check-20261022.json' : null})));

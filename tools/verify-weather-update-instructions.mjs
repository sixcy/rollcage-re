import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {updateWeather, updateWeatherBrightness, updateWeatherThunder, updateWeatherLightning, triggerWeatherLightning} from '../src/weather-update.mjs';
import {initializeWeatherVolume} from '../src/weather-volumes.mjs';
import {getOrCreateViewportRecord} from '../src/weather-viewport.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';

export async function verifyWeatherUpdate({fixtures = 48, withRaceUpdate = false, output = 'analysis/weather-update-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), STACK = 0x9000;
  const outer = await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const boundaries = withRaceUpdate ? [...new Set(outer.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(address => address !== 0x496700) : [];
  for (const address of boundaries) {machine.entries.delete(address); machine.externalCalls.set(address, m => {m.r.EAX = 0;});}
  let steps = 0, operations = 0; const reached = new Set(), calls = new Map(), tracked = new Set([0x496700, 0x496830, 0x4969d0, 0x496e80, 0x496ff0, 0x498cc0, 0x4975b0, 0x497650, 0x497730, 0x498030, 0x4979c0, 0x489cd0, 0x484bb0, 0x40ab70, 0x41bf40]);
  machine.onInstruction = address => {reached.add(address); if (tracked.has(address)) calls.set(address, (calls.get(address) ?? 0) + 1);};
  const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
  machine.externalCalls.set(0x568162, () => {}); machine.externalCalls.set(0x56932a, m => {m.r.EAX = 0x100000;});
  machine.externalCalls.set(0x568a48, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), source = m.bytes.readUInt32LE(m.r.ESP + 4), size = m.bytes.readUInt32LE(m.r.ESP + 8); Buffer.from(m.bytes.subarray(source, source + size)).copy(m.bytes, dest); m.r.EAX = dest;});
  machine.externalCalls.set(0x568a50, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), count = m.bytes.readUInt32LE(m.r.ESP + 8); m.bytes.fill(m.bytes[m.r.ESP + 4], dest, dest + count); m.r.EAX = dest;});
  for (const [address, operation] of [[0x569380, 'divide'], [0x568f10, 'multiply'], [0x5689e0, 'unsigned']]) machine.externalCalls.set(address, m => {const a = m.bytes.readBigUInt64LE(m.r.ESP), b = m.bytes.readBigUInt64LE(m.r.ESP + 8), value = operation === 'multiply' ? a * b : operation === 'unsigned' ? a / b : BigInt.asIntN(64, a) / BigInt.asIntN(64, b), result = BigInt.asUintN(64, value); m.r.EAX = Number(result & 0xffffffffn); m.r.EDX = Number(result >> 32n); m.r.ESP += 16;});
  const compare = label => {const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${label} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${source[offset]}`);}};
  const run = (entry, ecx = 0, args = []) => {machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = 0; machine.r.ESP = STACK; machine.bytes.writeInt32LE(-1, STACK); args.forEach((value, i) => put(machine.bytes, STACK + 4 + i * 4, value)); steps += machine.run(8000000); operations++;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, STACK - 0x3000, STACK + 128);
    put(memory, 0x6efb38, 0x100000); put(memory, 0x10007c, 0x110000); for (const offset of [0, 4, 8]) put(memory, 0x110000 + offset, 0x110000); memory[0x11000c] = 1; memory[0x11000d] = 1;
    memory.write('0 Player\0', 0x120000); put(memory, 0x120010, 8); put(memory, 0x120014, 15);
    const viewport = getOrCreateViewportRecord(0x10007c, 0x120000, {memory, handlers: {allocate: () => 0x140000}}); for (const [offset, value] of [[8, 0], [12, 0], [16, 640], [20, 480]]) put(memory, viewport + offset, value);
    const count = fixture % 2 ? 6 : 3, kind = fixture % 4; put(memory, 0x5ecb1c, 0x60000); memory[0x60553] = kind; memory[0x60552] = fixture % 9 === 0 ? 1 : 0; word(memory, 0x60a80, 480);
    put(memory, 0x90b98c, 0x300000); put(memory, 0x300000, 0x301000); put(memory, 0x301000, 0x302000); put(memory, 0x301014, 0x302100); memory[0x302004] = fixture % 5 === 0 ? 8 : 0; memory[0x302104] = fixture % 7 === 0 ? 8 : 0;
    put(memory, 0x909254, 0x40000); put(memory, 0x909278, 0x45000); put(memory, 0x9092c0, 0x50000); memory[0x50002] = 5;
    for (let i = 0; i < 256; i++) {word(memory, 0x40000 + i * 16, 0xff00); word(memory, 0x40002 + i * 16, 255); put(memory, 0x4000c + i * 16, 0x43000);}
    put(memory, 0x7135b4, 0x230000); put(memory, 0x80ddf8, count); put(memory, 0x6e9f70, -1); put(memory, 0x5ed2bc, fixture * 14723 + 1); put(memory, 0x5ec120, 0); put(memory, 0x90a548, fixture + 2);
    put(memory, 0x80dedc, fixture % 3); put(memory, 0x5ed2b8, fixture % 2 ? 129 : 255); put(memory, 0x6e6ce8, fixture % 3 === 0 ? 30 : -1); memory[0x91ce90] = fixture % 11 === 0 ? 2 : 0;
    for (let index = 0; index < 6; index++) {
      const row = 0x180000 + index * 0x5000, body = 0x200000 + index * 0x4000, control = 0x220000 + index * 0x100;
      put(memory, 0x80dde0 + index * 4, index < count ? row : -1); put(memory, 0x909300 + index * 0x30c, body); put(memory, 0x909318 + index * 0x30c, control); put(memory, control, body);
      for (let axis = 0; axis < 3; axis++) {put(memory, body + 0x34 + axis * 4, (axis * 7 + index + 1) << 16); put(memory, body + 0x68 + axis * 4, (axis + 1) * 12345);}
      for (const offset of [0xc4, 0xcc, 0xd4]) word(memory, body + offset, 4096); word(memory, body + 0x668, fixture % 2 ? 600 : 250); memory[body + 0x64f] = fixture & 1; put(memory, body + 0x11c, 0);
      const pose = 0x91ffc0 + index * 0x184; for (const [offset, value] of [[0, 3 << 16], [4, 4 << 16], [8, 5 << 16]]) put(memory, pose + offset, value); for (const offset of [0x90, 0x98, 0xa0]) word(memory, pose + offset, 4096);
      if (index < count) {put(memory, row + 0x4024, 127); initializeWeatherVolume(index, {memory});}
    }
    if (fixture % 13 === 0) put(memory, 0x80dde0, -1); if (fixture % 17 === 0) put(memory, 0x80dde0, 0);
    put(memory, 0x56e0fc, 0x5a100); put(memory, 0x56e114, 0x5a110); put(memory, 0x6e6c8c, 0); memory.writeBigInt64LE(10000000n, 0x7135a4);
    const clocks = m => {let call = 0; return (name, args) => {if (name === 'QueryPerformanceFrequency') m.writeBigInt64LE(10000000n, args[0]); else m.writeBigInt64LE(123456789n + BigInt(call++ * 10000), args[0]); return 1;};};
    const runtime = {memory, scratchBase: STACK, handlers: {dynamicCast: () => 0x100000}, services: {platformCall: clocks(memory)}};
    if (withRaceUpdate) {
      put(memory, 0x5ecefc, 0x250000); put(memory, 0x714b08, 0x240000); put(memory, 0x240000, 0x240100); put(memory, 0x24015c, 0x5a120);
      for (const address of boundaries) runtime.handlers[`call${address.toString(16)}`] = () => 0;
      runtime.handlers.audioManagerCall = () => 0; machine.externalCalls.set(0x5a120, m => {m.r.ESP += 4; m.r.EAX = 0;});
    }
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); const nativeClock = clocks(machine.bytes);
    machine.externalCalls.set(0x5a100, m => {m.r.EAX = nativeClock('QueryPerformanceCounter', [m.bytes.readUInt32LE(m.r.ESP)]); m.r.ESP += 4;}); machine.externalCalls.set(0x5a110, m => {m.r.EAX = nativeClock('QueryPerformanceFrequency', [m.bytes.readUInt32LE(m.r.ESP)]); m.r.ESP += 4;});
    for (let tick = 0; tick < 8; tick++) {put(memory, 0x90a548, fixture + tick + 2); put(machine.bytes, 0x90a548, fixture + tick + 2); if (withRaceUpdate) {runRaceUpdate(0, 1, runtime); run(0x450e50, 0, [1]);} else {updateWeather(runtime); run(0x496700);} compare(`parent${fixture}/${tick}`);}
  }
  const leaves = [[0x498cc0, updateWeatherBrightness], [0x4975b0, updateWeatherThunder], [0x497650, (runtime, input) => updateWeatherLightning(input, runtime)], [0x497730, triggerWeatherLightning]];
  for (let fixture = 0; fixture < 512; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, STACK - 0x3000, STACK + 128);
    const [entry, source] = leaves[fixture % 4], variant = fixture >>> 2; put(memory, 0x5ed2bc, variant % 3 === 0 ? 1 : variant * 14723 + 1); put(memory, 0x80dedc, variant % 3); put(memory, 0x5ed2b8, variant % 2 ? 129 : 255); put(memory, 0x6e6ce8, variant % 2 ? 30 : -1); put(memory, 0x6e6cf0, variant % 5 === 0 ? 2 : 0); put(memory, 0x6e6ce4, variant % 7 === 0 ? 2 : 0); put(memory, 0x6e6cec, variant % 21); put(memory, 0x6e6cc8, variant % 3);
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); source({memory, scratchBase: STACK}, variant & 1); run(entry, variant & 1); compare(`leaf${fixture}/${entry.toString(16)}`);
  }
  const report = {method: withRaceUpdate ? 'Actual450e50 to full496700 weather update and all reached weather arithmetic/volume/pose/screen/viewport/Application/clock/sound-guard children. Other41 direct outer game stages and final manager virtual call are explicit contracts. Separate512leaf calls remain actual. All mapped memory>=10000h compares after persistent outer calls. Weather row/pool/session/viewport storage is explicit in this checker; successful496290/408680 producers are independently verified by verify-weather-startup-connected-instructions. Only declared CRT/platform/RTTI services, no weather-game mocks or original process execution.' : 'Actual496700 weather update and all reached lower graph, plus512actual leaf calls. All mapped memory>=10000h compares. Explicit supplied weather/session/pool/viewport storage in this checker; successful496290/408680 startup producers are independently verified by verify-weather-startup-connected-instructions. No original process execution.', fixtures, operations, instructionSteps: steps, reachedInstructions: reached.size, calls: Object.fromEntries([...calls].map(([address, count]) => ['0x' + address.toString(16), count])), matched: true}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWeatherUpdate()));

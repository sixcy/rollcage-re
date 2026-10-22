import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createVehicleConstructionFixture} from './lib/vehicle-construction-fixtures.mjs';
import {initializeVehiclePresentation} from '../src/vehicle-construction.mjs';
import {initializeRaceHudTables, setRaceHudBrightness} from '../src/race-hud-state.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRaceHudGaugeConstruction({scenarios = 120, output = 'analysis/race-hud-gauge-construction-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let steps = 0, calls = 0, nativeAllocate;
  machine.onInstruction = p => {steps++; reached.add(p); if ([0x47e240, 0x445e30, 0x47e760, 0x47e890].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0xf0000000, m => {m.r.EAX = nativeAllocate(m.bytes.readUInt32LE(m.r.ESP));}); machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX >>> 0, m.bytes.readUInt32LE(0x5e8890))); machine.externalCalls.set(0x568a50, m => {const p = m.bytes.readUInt32LE(m.r.ESP), count = m.bytes.readUInt32LE(m.r.ESP + 8); m.bytes.fill(m.bytes[m.r.ESP + 4], p, p + count); m.r.EAX = p;}); machine.externalCalls.set(0x568a48, m => {const p = m.bytes.readUInt32LE(m.r.ESP), input = m.bytes.readUInt32LE(m.r.ESP + 4), count = m.bytes.readUInt32LE(m.r.ESP + 8); for (let i = 0; i < count; i++) m.bytes[p + i] = m.bytes[input + i]; m.r.EAX = p;});
  for (let scenario = 0; scenario < scenarios; scenario++) {
    const f = createVehicleConstructionFixture(program, scenario), n = createVehicleConstructionFixture(program, scenario), {memory: m, addresses: a, runtime} = f; initializeRaceHudTables(m); m[a.session + 0x551] = 4; m.writeUInt16LE(0, a.body + 0x65e); m[a.session + 0x552] = scenario % 3; const S = [0x9000, 0x9200, 0x9400][scenario % 3]; runtime.scratchBase = S;
    machine.reset(); m.copy(machine.bytes); nativeAllocate = n.allocate;
    for (let tick = 0; tick < 9; tick++) {
      if (tick) {
        for (const b of [m, machine.bytes]) {put(b, 0x91d518, tick & 1 ? 0x91d528 : 0x91d520); for (let i = 0; i < 4; i++) put(b, a.body + [0x3cfc, 0x3cf4, 0x3d00, 0x3cf8][i], [-80000, 0, 3, 5000, 80000, 0x40000, 0x120000, 0x7fffffff][(scenario + tick + i) % 8]);}
      }
      const brightness = [0, 32, 64, 128, 255, -1][(scenario + tick) % 6], mode = tick % 3;
      if (!tick) initializeVehiclePresentation(a.body, scenario % 6, runtime); else setRaceHudBrightness(tick % 6, brightness, mode, runtime);
      machine.entry = tick ? 0x445e30 : 0x47e240; machine.r.ECX = tick ? tick % 6 : a.body; machine.r.EDX = tick ? brightness : scenario % 6; machine.r.ESP = S; put(machine.bytes, S, -1); if (tick) put(machine.bytes, S + 4, mode);
      try {machine.run(4_000_000); calls++; if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (m[p] === machine.bytes[p]) p++; throw Error(`Mismatch0x${p.toString(16)} JS=${m.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}} catch (error) {console.error({scenario, tick}); throw error;}
    }
  }
  const report = {method: 'Actual47e240 mode-four presentation constructor with all real raw-body/animation/model children creates both panel buffers and publishes5ecb18/902018/90201c; eight persistent445e30→47e760→47e890 calls then consume those real producers. Supplied model/session/body-stat inputs, alternating displayed buffer,all mapped bytes>=10000h. Only genuine CRT allocation/copy/memset and compiler cookie services; no game mocks/original process execution.', targetSHA256: program.sha256, scenarios, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true}; if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRaceHudGaugeConstruction()));

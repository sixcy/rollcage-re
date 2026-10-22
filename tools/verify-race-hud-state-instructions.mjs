import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeRaceHudTables, updateRaceHudGauge, setRaceHudGaugeColors, setRaceHudBrightness} from '../src/race-hud-state.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRaceHudState({fixtures = 3000, output = 'analysis/race-hud-state-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let steps = 0;
  machine.onInstruction = p => {steps++; reached.add(p); if ([0x445e30, 0x47e760, 0x47e890].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), session = 0x100000, body = 0x110000, panel = 0x120000, S = [0x9000, 0x9200, 0x9400][fixture % 3]; initializeRaceHudTables(m); m.fill(0xa7, 0x90d9a0, 0x911ae0); m.fill(0x93, panel, panel + 0x14c0); put(m, 0x5ecb1c, session); put(m, 0x5ecb18, fixture % 13 ? body : -1); put(m, 0x902018, panel); put(m, 0x90201c, panel + 0xa60); put(m, 0x91d518, fixture & 1 ? 0x91d528 : 0x91d520); m[session + 0x551] = fixture % 4 ? 4 : 0; m[session + 0x552] = fixture % 3;
    for (let row = 0; row < 4; row++) {put(m, body + [0x3cfc, 0x3cf4, 0x3d00, 0x3cf8][row], [-2147483648, -80000, -3500, 0, 1, 3, 5000, 80000, 0x40000, 0x120000, 2147483647][(fixture + row) % 11]); m.writeUInt16LE([0, 1, 15, 16, 240, 255, 256, 65520, 65535][(fixture + row) % 9], panel + row * 0x298 + 0x294);}
    const color = [0, 1, 0xffffff, 0x12345678, -1, 0x807fff][Math.floor(fixture / 3) % 6], index = Math.floor(fixture / 3) % 6, brightness = [-1, 0, 1, 64, 160, 255, 256, 0x7fffffff][Math.floor(fixture / 7) % 8], mode = Math.floor(fixture / 11) % 4, which = Math.floor(fixture / 2) % 3, entry = [0x445e30, 0x47e760, 0x47e890][which]; m[0x911ac1 + index * 4] = [0, 1, 2, 255][Math.floor(fixture / 17) % 4];
    if (which === 2) put(m, 0x5ecb18, body); //The raw gauge leaf has no absent-body guard.
    machine.reset(); m.copy(machine.bytes); machine.r.ESP = S; put(machine.bytes, S, -1); const r = {memory: m, scratchBase: S}; let expected;
    if (!which) {setRaceHudBrightness(index, brightness, mode, r); machine.r.ECX = index; machine.r.EDX = brightness; put(machine.bytes, S + 4, mode);} else if (which === 1) {setRaceHudGaugeColors(color, r); machine.r.ECX = color;} else {expected = updateRaceHudGauge(index, r); machine.r.ECX = index;}
    machine.entry = entry;
    try {machine.run(); if (which === 2) assert.equal(machine.r.EAX >>> 0, expected); if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (m[p] === machine.bytes[p]) p++; throw Error(`Mismatch0x${p.toString(16)} JS=${m.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}} catch (error) {console.error({fixture, entry: entry.toString(16), color, index, brightness, mode}); throw error;}
  }
  const report = {method: 'Actual445e30 brightness/countdown and47e760/47e890 gauge state/color descendants, all mapped bytes>=10000h and defined gauge return. Supplied raw panel/body/session inputs, first/second render buffer, wrapped signed numerator, WORD smoothing and partial packed colors. No game/service contracts or original process execution.', targetSHA256: program.sha256, fixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRaceHudState()));

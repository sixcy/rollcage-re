import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';
import {advanceRaceStepCount, initializeRaceGravity} from '../src/race-clock.mjs';

const directory = 'analysis/physics-clock-elevated-20261022/results';
const {evidence, instructions} = await readInstructionEvidence(['010-clock-source-assembly.json', '017-gravity-mode-assembly.json'], {directory});
for (const item of evidence) assert.equal(item.subject.digest.sha256, REDUX_SHA256);
const machine = new BoundedX86(instructions), memory = Buffer.alloc(0xa00000), stack = 0x9000, config = 0x50000;
const put = (bytes, address, value) => bytes.writeInt32LE(value | 0, address);
const mappedEqual = () => assert(machine.bytes.subarray(0x10000).equals(memory.subarray(0x10000)));
let steps = 0, gravityCases = 0, clockCases = 0;
machine.externalCalls.set(0x47ea40, m => {m.r.EAX = 0;});
machine.externalCalls.set(0x49eaf0, m => {m.r.EAX = 0;});
for (let fixture = 0; fixture < 1024; fixture++) {
  memory.fill(0); put(memory, 0x5ecefc, config); put(memory, 0x5eb518, fixture >= 768 ? 1 : 0);
  put(memory, 0x5eb5e0, 1234567); memory[config + 0x82] = fixture >= 256 && fixture < 512 ? 255 : 0;
  memory[config + 0x97] = fixture & 255;
  machine.reset(); memory.copy(machine.bytes); machine.entry = 0x4412c0; machine.r.ESP = stack; put(machine.bytes, stack, -1);
  initializeRaceGravity({memory}); steps += machine.run(); mappedEqual(); gravityCases++;
}
const flags = [0, 1, 2, 4, 6, 0x80, 0x81, 0x83, 0x85, 0x87, 0xffffffff];
const counters = [0, 1, 8, 9, 10, 0x7fffffff, 0xffffffff];
const currents = [1, 100, 0xfffffffe, 0xffffffff];
const targets = [0, 1, 100, 101, 102, 103, 104, 0xfffffffe, 0xffffffff];
memory.writeDoubleLE(0.000029999999999999997, 0x5dc6e0);
machine.externalCalls.set(0x489cd0, m => {m.r.EAX = 0; m.r.EDX = 0;});
machine.externalCalls.set(0x568d6e, m => {m.scalars.XMM0 = 0; m.doubleScalars.add('XMM0');});
for (const flag of flags) for (const counter of counters) for (const current of currents) for (const target of targets) {
  memory.fill(0, 0x6e66b0, 0x6e66fc); put(memory, 0x6eafe0, flag); put(memory, 0x6e66e4, counter); put(memory, 0x6e66f8, current);
  machine.reset(); memory.copy(machine.bytes); machine.entry = 0x441c70;
  machine.externalCalls.set(0x568c41, m => {m.r.EAX = target | 0;});
  machine.r.ESP = stack; put(machine.bytes, stack, -1);
  const expected = advanceRaceStepCount(target, {memory}); steps += machine.run();
  assert.equal(machine.r.EAX, expected); mappedEqual(); clockCases++;
}
const report = {
  method: 'Exact4412c0 gravity producer with47ea40/49eaf0 startup boundary returns0, and actual441c70 prologue/epilogue with exact441cd0..441d66 integer scheduling tail supplied with the converted unsigned target clock through explicit platform-time/CRT conversion boundaries. All mapped memory above10000h and scheduling EAX compare. Platform time, uint64/double conversion, outer render pacing, and native-process execution are outside this instruction check.',
  evidence: evidence.map(item => item.evidence_id), targetSha256: REDUX_SHA256,
  gravityCases, clockCases, instructionSteps: steps, matched: true
};
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(report));

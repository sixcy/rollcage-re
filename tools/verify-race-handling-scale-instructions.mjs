import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {updateRaceHandlingScale} from '../src/race-handling-scale.mjs';

const parent = await readInstructionEvidence(['312-race-handling-scale-assembly.json'], {directory: 'analysis/native-simulation/results'});
const child = await readInstructionEvidence(['134-checkpoint-interpolation-assembly.json'], {directory: 'analysis/native-simulation/results'});
const instructions = [...parent.instructions, ...child.instructions], machine = new BoundedX86(instructions);
const memory = Buffer.alloc(0xa00000), SESSION = 0x50000, BODY = 0x10000, STACK = 0x9000, LOCAL = STACK - 0x38, RANKS = LOCAL + 0x18;
let seed = 0x420500ab, instructionSteps = 0, divisions = 0, writes = 0, neutralWrites = 0, removals = 0, countAliases = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const signed = () => random(0xffffffff) | 0;
machine.onInstruction = address => {if (address === 0x41c990) divisions++; if (address === 0x420657) writes++; if (address === 0x4206a9) neutralWrites++; if (address === 0x42059b) removals++;};
const fixtures = 5000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); machine.reset(); memory.fill(0x9a, BODY, BODY + 6 * 0x4000); memory.fill(0xa5, LOCAL - 128, STACK + 4);
  memory.writeUInt32LE(SESSION, 0x5ecb1c); memory.writeUInt32LE(0x12345678, 0x5e8890);
  const count = fixture % 7, mode = fixture % 13 === 0 ? 4 : 0, enabled = fixture % 17 !== 0;
  memory[SESSION + 0x54d] = count; memory[SESSION + 0x551] = mode; memory[SESSION + 0xa87] = enabled ? 1 : 0;
  const ranks = Array.from({length: count}, (_, index) => index + 1);
  for (let index = count - 1; index > 0; index--) {const next = random(index + 1); [ranks[index], ranks[next]] = [ranks[next], ranks[index]];}
  // Caller-owned stale rank slots remain readable for duplicate/hole cases.
  for (let index = 0; index < 7; index++) memory.writeUInt32LE(0x909300 + (index % 6) * 0x30c, RANKS + index * 4);
  for (let index = 0; index < 6; index++) {
    const record = 0x909300 + index * 0x30c, body = BODY + index * 0x4000;
    memory.fill(0x36, record, record + 0x30c); memory.writeUInt32LE(body, record);
    memory[record + 0x1d] = fixture % 19 === 0 ? 1 : ranks[index] ?? index + 1;
    memory[record + 0x249] = fixture % 5 === 0 ? 1 : fixture % 3 === 0 ? random(2) : 0;
    const lap = fixture % 4 === 0 ? random(256) : 2;
    memory[record + 0x1c] = lap;
    memory.writeInt32LE(fixture % 4 === 0 ? signed() : [0, 1, 8191, 8192, 8193, 32767, 32768, 65535, -1, -8192, -32768][random(11)], record + 0x24);
  }
  // Zero hole causes compaction scan to stop but does not initialize later slots.
  if (fixture % 23 === 0 && count < 6) memory.writeUInt32LE(0, RANKS + (count + 1) * 4);
  if (fixture % 29 === 0 && count && mode !== 4 && enabled) {
    // A first output's zero gap overwrites the live count and ends the loop.
    for (let index = 0; index < count; index++) {memory[0x909300 + index * 0x30c + 0x1d] = index + 1; memory[0x909300 + index * 0x30c + 0x249] = 0;}
    memory.writeUInt32LE(SESSION + 0x54d - 0x6e0, 0x909300); countAliases++;
  }
  const ranges = [[BODY, 6 * 0x4000], [0x909300, 6 * 0x30c], [SESSION - 0x1000, 0x5000], [0x5ecb1c, 4], [LOCAL + 0x10, 0x24]];
  for (const [address, length] of ranges) memory.copy(machine.bytes, address, address, address + length);
  machine.bytes.writeUInt32LE(0x12345678, 0x5e8890);
  updateRaceHandlingScale({memory, scratchBase: STACK});
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX >>> 0, m.bytes.readUInt32LE(0x5e8890)));
  machine.entry = 0x420500; machine.r.ESP = STACK; machine.bytes.writeUInt32LE(0xffffffff, STACK); instructionSteps += machine.run();
  for (const [address, length] of ranges) assert.deepEqual(machine.bytes.subarray(address, address + length), memory.subarray(address, address + length), `fixture ${fixture}/${address.toString(16)}`);
}
const report = {method: 'Complete420500 rank-gap handling producer with actual41c990 signed fixed division, no arithmetic stubs. Full six16384-byte bodies, six780-byte records, session neighborhood and meaningful caller-owned rank/leader/removed scratch compared. Synthetic neutral/active modes, zero count, shuffled and duplicate ranks, stale readable rank slots, finished compaction, signed progress overflow, shift wrap,8192 threshold and output/live-count aliases. Cookie is an explicit CRT boundary; valid readable memory and intact cookie domain. No original process execution.', evidence: [...parent.evidence, ...child.evidence].map(item => item.evidence_id), instructions: instructions.length, fixtures, countAliases, divisions, writes, neutralWrites, removals, instructionSteps, matched: true};
await writeFile('analysis/race-handling-scale-instruction-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

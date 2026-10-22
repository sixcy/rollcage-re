import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {formatRawLapTimeDigits} from '../src/lap-timing.mjs';

const own = await readInstructionEvidence(['128-lap-advance-notification-assembly.json'], {directory: 'analysis/native-simulation/results'});
const reply = JSON.parse(await readFile('analysis/native-simulation/results/129-lap-time-digit-switch.json', 'utf8')), table = reply.structuredContent ?? JSON.parse(reply.content.find(c => c.type === 'text').text);
const machine = new BoundedX86(own.instructions, {tables: [table.normalized_result]}), memory = Buffer.alloc(0xa00000), record = 0x909300;
let seed = 0x4459f0ca, instructionSteps = 0;
const reached = new Set(); machine.onInstruction = address => reached.add(address);
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
const fixtures = 2400;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); Buffer.from(table.normalized_result.bytes_hex, 'hex').copy(memory, Number(table.normalized_result.address));
  for (let row = 0; row < 4; row++) memory.writeInt32LE([-1, 0, -2147483648, 2147483647, random()][(fixture + row) % 5], record + 0x2c + row * 4);
  const stack = 0x9000 + fixture % 3 * 0x200, allRows = [-1, 0, 1, 2][fixture % 4];
  memory.fill(0xa5, stack - 64, stack); machine.reset(); memory.copy(machine.bytes);
  formatRawLapTimeDigits(record, allRows, {memory, scratchBase: stack});
  machine.entry = 0x4459f0; machine.r.ECX = allRows; machine.r.EDX = record; machine.r.ESP = stack; machine.bytes.writeInt32LE(-1, stack);
  instructionSteps += machine.run();
  assert.deepEqual(machine.bytes.subarray(0x10000), memory.subarray(0x10000));
  for (const offset of [-4, -8, -12]) assert.equal(machine.bytes.readInt32LE(stack + offset), memory.readInt32LE(stack + offset), `fixture${fixture}/defined-local${offset}`);
}
const report = {method: 'Full4459f0 raw formatter with actual original dispatch bytes, signed/overflow timer domains, allRows0/nonzero and alternate entry ESP. All mapped data bytes>=10000h plus the three defined local slots entry-4/-8/-12 match. These actual producer stores are later consumed as uninitialized48e310 attached-light payload words; unused saved-register/private bytes are not modeled. No game/platform calls or original process execution.', evidence: [...own.evidence.map(item => item.evidence_id), table.evidence_id], fixtures, executedInstructions: reached.size, instructionSteps, matched: true};
await writeFile('analysis/lap-timing-stack-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

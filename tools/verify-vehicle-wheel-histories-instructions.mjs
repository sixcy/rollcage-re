import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {updateVehicleWheelHistories} from '../src/vehicle-wheel-histories.mjs';

const own = await readInstructionEvidence(['2403-race-stage-494140.json'], {directory: 'analysis/native-simulation/results'}), machine = new BoundedX86(own.instructions), memory = Buffer.alloc(0xa00000);
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
let seed = 0x494140ca, instructionSteps = 0, updates = 0, aliases = 0;
const random = maximum => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % maximum;};
const reached = new Set(); machine.onInstruction = address => reached.add(address);
const fixtures = 1600, frames = 4;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); const count = fixture % 7, session = 0x50000, bodies = [];
  memory.writeFloatLE(1 / 4096, 0x5dc5f4); put(memory, 0x5ecb1c, session); memory[session + 0x54d] = count;
  for (let participant = 0; participant < count; participant++) {
    const body = participant === 0 && fixture % 9 === 0 ? 0x91d29c : participant === 0 && fixture % 9 === 1 ? 0x91ccfc : 0x10000 + participant * 0x5000;
    bodies.push(body); if (body > 0x900000) aliases++;
    memory.fill(0xa5, body, body + 0x3e78); put(memory, 0x909300 + participant * 0x30c, body);
    for (let index = 0; index < 10; index++) word(memory, body + 0xc4 + index * 2, [0, 4096, -4096, -32768, 32767, random(65536) - 32768][(fixture + participant + index) % 6]);
    for (let side = 0; side < 2; side++) {
      const h = body + 0x2f4c + side * 0x6d4, anchor = fixture % 11 === 0 ? h - 0x20 : 0x60000 + participant * 128 + side * 64;
      put(memory, body + 0x520 + side * 200, anchor); for (let axis = 0; axis < 3; axis++) put(memory, anchor + 0x34 + axis * 4, random(0x100000000));
      put(memory, h, [-1, 0, 1, 11, 12][fixture % 5]); put(memory, h + 4, [-2147483648, -1, 0, 11, 12, 2147483647][fixture % 6]);
      word(memory, h + 8, [-32768, -1, 0, 255, 256, 32767][fixture % 6]); memory[h + 10] = fixture & 255;
    }
  }
  put(memory, 0x5ec958, [0, 1, 0x7fffffff, -1, random(0x100000000)][fixture % 5]);
  machine.reset(); memory.copy(machine.bytes);
  for (let frame = 0; frame < frames; frame++) {
    updateVehicleWheelHistories({memory}); machine.entry = 0x494140; machine.r.ESP = 0x9000; put(machine.bytes, 0x9000, -1);
    instructionSteps += machine.run(); updates += count * 2;
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
    if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`history${fixture}/${frame} byte0x${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
  }
}
const report = {method: 'Full494140 with no game or external calls. Six-participant/empty registries, persistent paired12-position histories, signed/overflowed counters, RNG boundaries, negative/overflow phases, matrix/float scratch aliases and anchor/history overlaps. ALL mapped bytes>=10000h compare after every call; private stack excluded. Scale is original finite1/4096; declared readable input indices include-1 and12. This is synthetic instruction equivalence, not scene construction/rendering evidence.', evidence: own.evidence.map(item => item.evidence_id), fixtures, frames, parentCalls: fixtures * frames, historyUpdates: updates, aliases, executedInstructions: reached.size, instructionSteps, matched: true};
await writeFile('analysis/vehicle-wheel-histories-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

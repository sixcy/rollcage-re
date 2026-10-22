import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {updateAutonomousWeaponPolicy} from '../src/autonomous-weapon-policy.mjs';

const evidence = await readInstructionEvidence(['420-autonomous-weapon-policy-assembly.json'], {directory: 'analysis/native-simulation/results'});
const reply = JSON.parse(await readFile('analysis/native-simulation/results/433-autonomous-weapon-dispatch-tables.json', 'utf8'));
const table = reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);
const machine = new BoundedX86(evidence.instructions, {tables: [table.normalized_result]});
const BODY = 0x10000, SESSION = 0x20000, STACK = 0x9000;
const entries = [0x410780, 0x410f80, 0x411340, 0x410930, 0x411ba0, 0x410c90];
let seed = 0x4103f0ad, steps = 0, calls = 0, mutations = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const fixtures = 16000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const bytes = machine.bytes;
  bytes.fill(0xa5, BODY, BODY + 0x4000); bytes.writeUInt32LE(SESSION, 0x5ecb1c);
  const ownIndex = random(6), phase = [-1, 0, 5, 6, 7][random(5)], clock = [0, 349, 350, 351, 0x80000000, 0xffffffff][random(6)];
  bytes.writeUInt16LE(ownIndex, BODY + 0x65e); bytes[0x909549 + ownIndex * 0x30c] = random(4);
  bytes.writeInt32LE(phase, SESSION + 0x57c); bytes.writeInt32LE([-1, 149, 150, 299, 300, 301][random(6)], SESSION + 0x580); bytes.writeUInt32LE(clock, 0x90a548);
  bytes.writeInt32LE([0, 1, 2, -1][random(4)], 0x5ea4d8); bytes.writeInt32LE([0, 1, -1, 0x7fffffff][random(4)], 0x5ea4d4);
  const ids = [-128, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 31, 32, 127], timers = [-32768, -2, -1, 0, 1, 48, 49, 50, 32766, 32767];
  bytes.writeInt8(ids[random(ids.length)], BODY + 0x68c); bytes.writeInt8(ids[random(ids.length)], BODY + 0x68d);
  bytes.writeInt16LE(timers[random(timers.length)], BODY + 0x6e4); bytes.writeInt16LE(timers[random(timers.length)], BODY + 0x6e6);
  bytes.writeInt32LE((random(0xffffffff) | 0), BODY + 0x6ec); bytes.writeInt32LE(random(2) ? -1 : 0, BODY + 0x6bc); bytes.writeInt32LE(random(2), 0x811180);
  bytes.writeUInt32LE(random(0xffffffff), BODY + 0x710); bytes[BODY + 0x70c] = random(16);
  const source = Buffer.from(bytes), nativeLog = [], sourceLog = [];
  const decision = (memory, log, entry, ecx, edx, args, scratchBase) => {
    //Compare only each helper's real low-byte/low-word argument contract.
    const timerArgument = entry === 0x410f80 || entry === 0x411340;
    log.push([entry, ecx, edx & (timerArgument ? 65535 : 255), args, scratchBase]);
    if (fixture % 3 === 0) {
      memory.writeUInt16LE((fixture * 13) & 65535, BODY + 0x6e6);
      memory[BODY + 0x68d] = 7; memory.writeInt32LE(fixture & 1, 0x811180);
      memory.writeInt32LE((memory.readInt32LE(0x5ea4d4) ^ fixture) | 0, 0x5ea4d4);
    }
    return (fixture + entry) & 1 ? 0 : -1;
  };
  const handlers = Object.fromEntries(entries.map(entry => [`call${entry.toString(16)}`, request => decision(source, sourceLog, entry, request.ecx, request.edx, request.args, request.scratchBase)]));
  for (const entry of entries) machine.externalCalls.set(entry, m => {
    const stackArgument = entry === 0x410930 || entry === 0x410c90;
    m.r.EAX = decision(bytes, nativeLog, entry, m.r.ECX >>> 0, m.r.EDX, stackArgument ? [bytes.readUInt32LE(m.r.ESP)] : [], m.r.ESP - 4);
    m.r.ECX = 0x789abcde; m.r.EDX = 0x12345678;
  });
  updateAutonomousWeaponPolicy(BODY, {memory: source, scratchBase: STACK, handlers});
  machine.entry = 0x4103f0; machine.r.ECX = BODY; machine.r.ESP = STACK; bytes.writeUInt32LE(0xffffffff, STACK); steps += machine.run();
  try {
    assert.deepEqual(nativeLog, sourceLog, `decision arguments/order ${fixture}`);
    for (const [address, length] of [[BODY, 0x4000], [SESSION, 0x600], [0x909300, 6 * 0x30c], [0x5ea4d4, 8], [0x90a548, 4], [0x811180, 4]]) assert.deepEqual(bytes.subarray(address, address + length), source.subarray(address, address + length), `memory ${fixture}/${address.toString(16)}`);
  } catch (error) {console.error({fixture, phase, clock, ownIndex}); throw error;}
  calls += sourceLog.length; if (fixture % 3 === 0) mutations += sourceLog.length;
}
const report = {method: 'Complete4103f0 parent compared against retained x86 with admitted deterministic six item-decision callback contracts. Compares full body/session/six progression records/RNG/clock/global storage plus decision order, meaningful low-byte/word/stack arguments and entryESP. Callback return/mutation fixtures are synthetic; this pass does not claim item decision closure or original process execution.', evidence: [...evidence.evidence.map(item => item.evidence_id), table.evidence_id], instructions: evidence.instructions.length, fixtures, decisionCalls: calls, mutatingDecisionCalls: mutations, instructionSteps: steps, matched: true};
await writeFile('analysis/autonomous-weapon-policy-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import * as modifiers from '../src/autonomous-candidate-modifiers.mjs';
import * as scores from '../src/autonomous-candidate-scores.mjs';

const directory = 'analysis/native-simulation/results';
const own = await readInstructionEvidence([
  '358-autonomous-candidate-velocity-cost-assembly.json', '360-autonomous-candidate-opponents-assembly.json',
  '529-candidate-turn-crossing-assembly.json', '531-candidate-mode-bias-prerequisite-assembly.json',
  '533-candidate-mode-bias-cost-assembly.json', '537-candidate-mode-bias-rival-assembly.json',
  '364-autonomous-candidate-modifier-c-assembly.json', '368-autonomous-candidate-modifier-e-assembly.json',
  '535-candidate-event-direction-test-assembly.json', '348-autonomous-candidate-reset-assembly.json',
  '352-autonomous-candidate-selection-pass-assembly.json', '378-autonomous-candidate-route-cost-alt-assembly.json',
  '527-candidate-turn-neighbors-assembly.json', '211-autonomous-next-point-assembly.json',
  '229-autonomous-previous-point-assembly.json', '223-autonomous-vector-normalize-small-assembly.json',
  '224-autonomous-vector-normalize-large-assembly.json', '239-steering-triple-cross-assembly.json',
  '232-steering-dot-assembly.json'
], {directory});
const math = await readInstructionEvidence(['133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json', '217-wheel-capacity-curve-assembly.json']);
const tables = await Promise.all(['520-candidate-bias-switch.json', '538-candidate-mode-bias-switch-bytes.json', '539-candidate-mode-bias-profile-table.json'].map(async name => {
  const reply = JSON.parse(await readFile(`${directory}/${name}`, 'utf8'));
  return reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);
}));
const instructions = [...own.instructions, ...math.instructions], machine = new BoundedX86(instructions, {tables: tables.map(item => item.normalized_result)});
const sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8'));
sqrt.values.forEach((value, index) => machine.bytes.writeUInt16LE(value, 0x5eb290 + index * 2));
const BODY = 0x10000, POSITION = 0x20000, VELOCITY = 0x20020, INCOMING = 0x20040, OUTGOING = 0x20060;
const PACK = 0x30000, GROUPS = 0x31000, POINTS = 0x40000, SESSION = 0x50000, SCENE = 0x51000, EVENTS = 0x52000, PROGRESS = 0x53000, STACK = 0x9000;
const entries = [0x4209d0, 0x420f90, 0x420a90, 0x420ba0, 0x420de0, 0x420ed0, 0x434910, 0x434c00, 0x434a20, 0x434800, 0x4352f0, 0x491ec0];
const perEntry = Array(entries.length).fill(0);
let seed = 0x420ba0ad, instructionSteps = 0, nonzeroReturns = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const store = (memory, address, values) => values.forEach((value, index) => put(memory, address + index * 4, value));
const fixtures = 12000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const memory = machine.bytes;
  memory.fill(0x51, STACK - 1024, STACK + 64); memory.fill(0, 0x909300, 0x90a548);
  put(memory, 0x90b98c, PACK); put(memory, PACK + 0x60, GROUPS); put(memory, 0x5ecb1c, SESSION); put(memory, 0x90b990, SCENE);
  modifiers.initializeAutonomousCandidateModifierTables(memory);
  for (let group = 0; group < 6; group++) {
    const record = GROUPS + group * 12, count = fixture % 29 === 0 ? 1 : 8;
    word(memory, record, count); memory[record + 2] = random(2); memory[record + 4] = random(2); put(memory, record + 8, POINTS + group * 0x1000);
    for (let point = 0; point < 8; point++) {
      const address = POINTS + group * 0x1000 + point * 16;
      for (let axis = 0; axis < 3; axis++) word(memory, address + axis * 2, fixture % 11 === 0 ? random(50000) - 25000 : random(401) - 200);
      put(memory, address + 8, (random(4) << 30) | (random(4) << 28) | (random(2) ? 4 : 0) | (random(2) ? 32 : 0));
      put(memory, address + 12, random(6) | (random(count) << 5) | (random(6) << 14) | (random(count) << 19));
    }
  }
  const ownIndex = random(6), group = 1 + random(5), point = fixture % 29 === 0 ? 0 : random(8), lowest = random(21) - 1;
  word(memory, BODY + 0x65e, ownIndex); word(memory, BODY + 0x6c0, group); word(memory, BODY + 0x6c2, point);
  memory[BODY + 0x6ec] = random(256); put(memory, BODY + 0x6ec, memory[BODY + 0x6ec] | (random(2) ? 0x400 : 0));
  memory[BODY + 0x6f1] = random(6); memory[BODY + 0x6f0] = random(256); put(memory, BODY + 0x6f8, random(1 << 22));
  const competitor = random(7) - 1, gap = [-32769, -32768, -16384, -8193, -8192, -4096, -4095, -1, 0, 4095, 8191, 8192, 16383, 16384, 32767, 32768][random(16)];
  memory.writeInt8(competitor, BODY + 0x6da); put(memory, BODY + 0x6dc, gap);
  memory[BODY + 0x68c] = random(8); memory[BODY + 0x68d] = random(8);
  for (let index = 0; index < 6; index++) {
    const record = 0x909300 + index * 0x30c; put(memory, record + 0x54, PROGRESS + index * 16);
    memory[PROGRESS + index * 16 + 5] = random(6); word(memory, record + 0x58, fixture % 29 === 0 ? 0 : random(8));
    memory[record + 0x1c] = random(5); memory[record + 0x249] = random(2);
  }
  memory[SESSION + 0x58c] = random(3); memory[SESSION + 0x586] = random(6); put(memory, 0x5ea4d8, random(4));
  memory[SCENE + 0xf6] = random(16); put(memory, SCENE + 0xf8, EVENTS);
  for (let index = 0; index < 16; index++) {
    const address = EVENTS + index * 8; word(memory, address, random(6)); word(memory, address + 2, random(8));
    memory[address + 4] = random(6); memory[address + 5] = random(2); memory[address + 6] = random(3) ? random(256) : 255;
  }
  for (let index = 0; index < 20; index++) {
    const row = scores.autonomousCandidateAddress(index); memory.fill(0x7a, row, row + 52);
    word(memory, row, random(6)); memory[row + 2] = fixture % 29 === 0 ? 0 : random(8); memory[row + 3] = random(6);
    memory[row + 37] = random(6); memory[row + 38] = 0;
    put(memory, row + 44, random(3) ? random(10001) - 5000 : 0x7ffffffe); put(memory, row + 48, random(100001) - 50000);
  }
  const index = random(20), gain = [-65536, -16384, 16384, 32768, 65536][random(5)], turn = random(2) ? -1 : 1;
  for (const address of [POSITION, VELOCITY, INCOMING, OUTGOING]) store(memory, address, Array.from({length: 3}, () => random(20000001) - 10000000));
  const source = Buffer.from(memory), context = {memory: source, scratchBase: STACK}, entryIndex = fixture % entries.length, entry = entries[entryIndex];
  let expected, ecx, edx = 0, args = [];
  if (entry === 0x4209d0) scores.resetAutonomousCandidates(context);
  else if (entry === 0x420f90) {scores.applyAutonomousCandidateEntryBias(BODY, lowest, context); ecx = BODY; edx = lowest;}
  else if (entry === 0x420a90) {expected = scores.linkedAutonomousCandidateScore(group, point, context); ecx = group; edx = point;}
  else if (entry === 0x420ba0) {const speed = Math.floor(fixture / 12) % 2 ? 10000 : 9999; modifiers.evaluateAutonomousCandidateAlignment(index, POSITION, VELOCITY, speed, context); ecx = index; edx = POSITION; args = [VELOCITY, speed];}
  else if (entry === 0x420de0) {modifiers.applyAutonomousCandidateTurnBias(group, point, context); ecx = group; edx = point;}
  else if (entry === 0x420ed0) {expected = modifiers.isAutonomousCandidateInsideTurn(POSITION, VELOCITY, INCOMING, OUTGOING, turn, context); ecx = POSITION; edx = VELOCITY; args = [INCOMING, OUTGOING, turn];}
  else if (entry === 0x434910) {expected = modifiers.autonomousCandidateModeGain(BODY, context); ecx = BODY;}
  else if (entry === 0x434c00) {expected = modifiers.isAutonomousCompetitorRouteConnected(ownIndex, group, context); ecx = ownIndex; edx = group;}
  else if (entry === 0x434a20) {expected = modifiers.evaluateAutonomousCandidateModeCost(BODY, gain, index, context); ecx = BODY; edx = gain; args = [index];}
  else if (entry === 0x434800) {modifiers.applyAutonomousCandidateModeBias(BODY, lowest, context); ecx = BODY; edx = lowest;}
  else if (entry === 0x4352f0) {modifiers.applyAutonomousCandidateEventBias(BODY, lowest, context); ecx = BODY; edx = lowest;}
  else {expected = modifiers.hasAutonomousItemFour(BODY, context); ecx = BODY;}
  machine.entry = entry; machine.r.ECX = ecx ?? 0; machine.r.EDX = edx; machine.r.ESP = STACK;
  memory.writeUInt32LE(0xffffffff, STACK); args.forEach((value, index) => put(memory, STACK + 4 + index * 4, value));
  instructionSteps += machine.run();
  try {
    if (expected !== undefined) assert.equal(machine.r.EAX, expected, 'return');
    for (const [address, length] of [[BODY, 0x800], [0x91f1e0, 1040], [GROUPS, 72], [POINTS, 0x6000], [0x909300, 0x1248], [EVENTS, 128]]) {
      const actual = memory.subarray(address, address + length), reference = source.subarray(address, address + length);
      if (!actual.equals(reference)) {const offset = actual.findIndex((value, i) => value !== reference[i]); assert.fail(`firstdiff0x${(address + offset).toString(16)} native=${actual[offset]} JS=${reference[offset]}`);}
    }
  } catch (error) {console.error({fixture, entry: entry.toString(16), lowest, group, point, index, competitor, gap, gain}); throw error;}
  perEntry[entryIndex]++; if (expected) nonzeroReturns++;
}
const report = {method: 'Twelve complete native candidate reset/link/entry/alignment/turn/mode/event/inventory procedures, with actual route walkers, curvature, fixed-point normalizers/cross/dot/root helpers and original switch/profile tables. Synthetic raw route/body/competitor/event storage. No mocked game callees or original executable execution. Compares EAX where defined and complete candidate/body/route/event/competitor records.', evidence: [...own.evidence, ...math.evidence, ...tables].map(item => item.evidence_id), instructions: instructions.length, fixtures, entries: entries.map((entry, index) => ({entry: `0x${entry.toString(16)}`, fixtures: perEntry[index]})), nonzeroReturns, instructionSteps, matched: true};
await writeFile('analysis/autonomous-candidate-modifiers-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

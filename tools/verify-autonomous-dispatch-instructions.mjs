import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {initializeAutonomousDispatchTables, runAutonomousDispatch, runAutonomousMode200,
  runAutonomousMode40, runAutonomousMode20, selectAutonomousStartTimer,
  prepareAutonomousPickupUse, updateAutonomousSharedFrame} from '../src/autonomous-dispatch.mjs';

const own = await readInstructionEvidence(['204-autonomous-vehicle-assembly.json', '252-autonomous-mode200-assembly.json',
  '254-autonomous-mode40-assembly.json', '256-autonomous-mode20-assembly.json', '258-autonomous-start-timer-assembly.json',
  '265-autonomous-shared-frame-assembly.json', '267-autonomous-body-prepass-assembly.json',
  '218-autonomous-route-direction-assembly.json', '211-autonomous-next-point-assembly.json',
  '229-autonomous-previous-point-assembly.json', '223-autonomous-vector-normalize-small-assembly.json',
  '224-autonomous-vector-normalize-large-assembly.json', '301-autonomous-typed-point-assembly.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['220-wheel-drive-dot-assembly.json', '217-wheel-capacity-curve-assembly.json', '133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json']);
const evidence = [...own.evidence, ...math.evidence], instructions = [...own.instructions, ...math.instructions];
const tableEvidence = await Promise.all(['250-autonomous-dispatch-switches.json', '259-autonomous-mode40-switch.json', '263-autonomous-start-timer-switch.json', '260-autonomous-start-probabilities.json', '268-autonomous-pickup-use-shifts.json'].map(async name => {
  const reply = JSON.parse(await readFile(`analysis/native-simulation/results/${name}`, 'utf8'));
  return reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);
}));
const machine = new BoundedX86(instructions, {tables: tableEvidence.map(item => item.normalized_result)});
const productionTables = Buffer.alloc(0xa00000); initializeAutonomousDispatchTables(productionTables);
for (const item of tableEvidence.slice(3)) {
  const table = item.normalized_result, bytes = Buffer.from(table.bytes_hex, 'hex'), start = Number(table.address);
  assert.deepEqual(productionTables.subarray(start, start + bytes.length), bytes, 'production table matches retained bytes');
}
const sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8'));
sqrt.values.forEach((value, index) => machine.bytes.writeUInt16LE(value, 0x5eb290 + index * 2));
const BODY = 0x10000, OTHER = 0x14000, PACK = 0x20000, RESOURCE = 0x21000, GROUPS = 0x22000, ROWS = 0x23000, POINTS = 0x30000, SESSION = 0x40000, STACK = 0x9000;
let seed = 0x410220ab;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const signed = () => random(0xffffffff) | 0;
let instructionSteps = 0, callbackCalls = 0, scheduled = 0, commonPlans = 0, sharedQueries = 0, sharedDisables = 0, mode20Fire = 0, mode20GeometryPasses = 0, mode20Timeouts = 0, timerSelections = 0;
machine.onInstruction = address => {
  if (address === 0x491470) sharedQueries++;
  if (address === 0x43567f) sharedDisables++;
  if (address === 0x430d4d || address === 0x430d68) mode20Fire++;
  if (address === 0x430d3b) mode20GeometryPasses++;
  if (address === 0x430b2f) mode20Timeouts++;
};
const fixtures = 4900, entries = [0x410220, 0x430930, 0x430970, 0x41f130, 0x430ae0, 0x420020, 0x4355c0];
const entryCounts = {};
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const bytes = machine.bytes;
  initializeAutonomousDispatchTables(bytes); bytes.fill(0xa5, STACK - 1024, STACK + 32);
  bytes.fill(0x69, BODY, OTHER + 0x4000); bytes.fill(0x73, SESSION, SESSION + 0x600);
  bytes.fill(0x39, PACK, PACK + 0x100); bytes.fill(0x51, RESOURCE, RESOURCE + 0x120);
  bytes.fill(0x56, ROWS, ROWS + 64); bytes.fill(0x97, 0x909300, 0x909300 + 8 * 0x30c);
  bytes.writeUInt32LE(PACK, 0x90b98c); bytes.writeUInt32LE(RESOURCE, 0x90b990); bytes.writeUInt32LE(SESSION, 0x5ecb1c);
  bytes.writeUInt32LE(GROUPS, PACK + 0x60);
  for (let group = 0; group < 3; group++) {
    const p = GROUPS + group * 12, count = fixture % 19 === 0 ? 1 : 2 + random(5);
    bytes.writeUInt16LE(count, p); bytes[p + 2] = random(2); bytes[p + 4] = random(2); bytes[p + 5] = group;
    bytes.writeUInt32LE(POINTS + group * 0x1000, p + 8);
    for (let index = 0; index < count; index++) for (let axis = 0; axis < 3; axis++) {
      const value = fixture % 7 === 0 ? random(60000) - 30000 : axis ? 0 : index * 100;
      bytes.writeInt16LE(value, POINTS + group * 0x1000 + index * 16 + axis * 2);
    }
  }
  const group = random(3), rowCount = random(9), rows = [];
  bytes.writeUInt16LE(group, BODY + 0x6c0); bytes.writeUInt16LE(random(2), BODY + 0x6c2);
  bytes[RESOURCE + 0xf6] = rowCount; bytes.writeUInt32LE(ROWS, RESOURCE + 0xf8);
  for (let index = 0; index < rowCount; index++) {
    const p = ROWS + index * 8, selectedGroup = index % 2 ? group : random(3);
    bytes.writeUInt16LE(selectedGroup, p); bytes.writeUInt16LE(0, p + 2);
    bytes[p + 4] = [2, 4, 0, 2][index % 4]; bytes[p + 5] = index % 3 ? 1 : 0; rows.push(p);
  }
  // Clock90a548 aliases the first word after six0x30c vehicle records; keep
  // registered-body dereferences inside that successful six-record domain.
  const bodyIndex = random(6), active = random(7);
  bytes.writeUInt16LE(bodyIndex, BODY + 0x65e); bytes[SESSION + 0x54d] = active;
  for (let index = 0; index < 8; index++) {
    const record = 0x909300 + index * 0x30c, selectedBody = index % 2 ? BODY : OTHER;
    bytes.writeUInt32LE(selectedBody, record); bytes.writeUInt32LE(GROUPS + random(3) * 12, record + 0x54); bytes.writeUInt32LE(random(5), record + 0x58);
  }
  bytes[BODY + 0x718] = 10; bytes[OTHER + 0x718] = 10;
  const mode = [0, 1, 2, 0x20, 0x40, 0x80, 0x100, 0x200, 0x3ff][Math.floor(fixture / 7) % 9];
  bytes.writeUInt16LE((random(65536) & 0xfc00) | mode, BODY + 0x6c4);
  bytes.writeUInt16LE([0, 1, 19, 20, 21, 29, 30, 31, 119, 120, 121, 0x7fff, 0x8000, 0xffff][fixture % 14], BODY + 0x6c6);
  bytes[BODY + 0x6d9] = [0, 1, 4, 5, 6, 255][fixture % 6];
  bytes.writeInt32LE(signed(), BODY + 0x710); bytes.writeInt32LE(random(64), BODY + 0x6f4); bytes.writeInt32LE(random(8) << 6, BODY + 0x6f8);
  bytes[BODY + 0x68c] = fixture % 3 === 0 ? 4 : 1; bytes[BODY + 0x68d] = fixture % 3 === 1 ? 4 : 1; bytes[BODY + 0x70c] = fixture % 4 ? 0 : 12;
  for (let axis = 0; axis < 3; axis++) bytes.writeInt32LE(fixture % 7 === 0 ? signed() : axis ? 0 : 100 * 65536, BODY + 0x34 + axis * 4);
  bytes.writeInt16LE(4096, BODY + 0xc8); bytes.writeInt16LE(0, BODY + 0xce); bytes.writeInt16LE(0, BODY + 0xd4);
  const clock = [0, 16, 112, 120, 157, 158, 159, 160, 161, 228, 0xffffffff, 0x80000000][fixture % 12];
  bytes.writeUInt32LE(clock, 0x90a548); bytes.writeUInt32LE([clock, (clock - 1) >>> 0, 0xffffffff, 0][fixture % 4], 0x6e6510);
  bytes.writeInt32LE([-1, 0, 1, 2, 3][fixture % 5], 0x6e65a8); bytes.writeInt32LE([0, 1, -1, signed()][fixture % 4], 0x5ea4d4);
  bytes.writeInt32LE([0, 1, 2, 3, 4, 5, -1][fixture % 7], SESSION + 0x57c);
  const source = Buffer.from(bytes), sourceLog = [], nativeLog = [];
  const bodyStage = (memory, log, name, ecx, edx) => {
    log.push([name, ecx, name === 'call41f900' ? edx : null]);
    if (name === 'call41f900' && fixture % 11 === 0) memory.writeUInt32LE(clock ^ 0x7fffffff, 0x90a548);
    if (name === 'call47fc20') memory[ecx + 0x6d9] = fixture % 3 ? memory[ecx + 0x6d9] : 0;
    if (name === 'call41f0d0' && fixture % 17 === 0) memory.writeUInt16LE(0x8123, ecx + 0x6c4);
    if (name === 'call421430' && fixture % 2) memory[ecx + 0x6d9] = 2;
    if (name === 'call4103f0') memory.writeInt32LE(memory.readInt32LE(ecx + 0x710) | 0x200, ecx + 0x710);
    if (name === 'call4311e0') return fixture % 3;
    return 0;
  };
  const names = ['call41f900', 'call47ffb0', 'call4311e0', 'call47fc20', 'call47ff20', 'call41f0d0', 'call421430', 'call4103f0'];
  const handlers = Object.fromEntries(names.map(name => [name, ({memory, ecx, edx}) => bodyStage(memory, sourceLog, name, ecx, edx)]));
  for (const name of names) machine.externalCalls.set(Number(`0x${name.slice(4)}`), m => {
    m.r.EAX = bodyStage(bytes, nativeLog, name, m.r.ECX >>> 0, m.r.EDX); m.r.ECX = 0x7abc; m.r.EDX = 0x7def;
  });
  const entry = entries[fixture % 7], options = {memory: source, scratchBase: STACK, handlers};
  let expected;
  if (entry === 0x410220) runAutonomousDispatch(BODY, options);
  else if (entry === 0x430930) runAutonomousMode200(BODY, options);
  else if (entry === 0x430970) runAutonomousMode40(BODY, options);
  else if (entry === 0x430ae0) runAutonomousMode20(BODY, options);
  else if (entry === 0x41f130) expected = selectAutonomousStartTimer(BODY, options);
  else if (entry === 0x420020) expected = prepareAutonomousPickupUse(BODY, options);
  else updateAutonomousSharedFrame(BODY, options);
  machine.entry = entry; machine.r.ECX = BODY; machine.r.EDX = 0x7711; machine.r.ESP = STACK; bytes.writeUInt32LE(0xffffffff, STACK);
  instructionSteps += machine.run();
  try {
    if (entry === 0x41f130) {assert.equal(machine.r.EAX, expected, 'timer EAX'); timerSelections++;}
    if (entry === 0x420020) for (const [field, native] of [['eax', 'EAX'], ['ecx', 'ECX'], ['edx', 'EDX']]) assert.equal(machine.r[native], expected[field], field);
    assert.deepEqual(nativeLog, sourceLog, 'reached callbacks and scratch');
    assert.deepEqual(bytes.subarray(BODY, OTHER + 0x4000), source.subarray(BODY, OTHER + 0x4000), 'both complete bodies');
    assert.deepEqual(bytes.subarray(ROWS, ROWS + 64), source.subarray(ROWS, ROWS + 64), 'event rows');
    assert.deepEqual(bytes.subarray(GROUPS, GROUPS + 36), source.subarray(GROUPS, GROUPS + 36), 'route groups');
    assert.deepEqual(bytes.subarray(POINTS, POINTS + 0x3000), source.subarray(POINTS, POINTS + 0x3000), 'route points');
    assert.deepEqual(bytes.subarray(SESSION, SESSION + 0x600), source.subarray(SESSION, SESSION + 0x600), 'session');
    assert.deepEqual(bytes.subarray(0x909300, 0x909300 + 8 * 0x30c), source.subarray(0x909300, 0x909300 + 8 * 0x30c), 'eight vehicle records');
    for (const p of [0x5ea4d4, 0x6e65a8, 0x90a548, 0x6e6510, 0x5ecb1c, 0x90b990, 0x90b98c]) assert.equal(bytes.readInt32LE(p), source.readInt32LE(p), `global ${p.toString(16)}`);
  } catch (error) {console.error(JSON.stringify({fixture, entry: entry.toString(16), mode, group, clock, rowCount, bodyIndex, active, nativeLog, sourceLog})); throw error;}
  entryCounts[entry.toString(16)] = (entryCounts[entry.toString(16)] ?? 0) + 1;
  callbackCalls += nativeLog.length; scheduled += nativeLog.filter(item => item[0] === 'call41f900').length;
  commonPlans += nativeLog.filter(item => item[0] === 'call47fc20').length;
}
// A deliberately aliased record catches capture-before-seed-write ordering.
machine.reset();
{
  const bytes = machine.bytes, aliasBody = 0x5ea4d4 - 0x6f8;
  bytes.fill(0, aliasBody, aliasBody + 0x800); initializeAutonomousDispatchTables(bytes);
  bytes.writeInt32LE(1, 0x5ea4d4); bytes[aliasBody + 0x68c] = 1;
  const source = Buffer.from(bytes), expected = prepareAutonomousPickupUse(aliasBody, {memory: source});
  machine.entry = 0x420020; machine.r.ECX = aliasBody; machine.r.ESP = STACK; bytes.writeUInt32LE(0xffffffff, STACK);
  instructionSteps += machine.run();
  for (const [field, native] of [['eax', 'EAX'], ['ecx', 'ECX'], ['edx', 'EDX']]) assert.equal(machine.r[native], expected[field]);
  assert.deepEqual(bytes.subarray(aliasBody, aliasBody + 0x800), source.subarray(aliasBody, aliasBody + 0x800));
}
const report = {method: 'Full410220 dispatcher plus430930/430970/430ae0 specialized modes,41f130 RNG start timer,420020 stochastic pickup-use prepass and4355c0 shared event-row scan. Actual491470 five-point advance,491d80/491390/491400 and fixed normalizers/dot/root arithmetic execute. Unported41f900/47ffb0/4311e0/47fc20/47ff20/41f0d0/421430/4103f0 are named, state-mutating boundary fixtures. Compares complete two16384-byte bodies, eight780-byte storage neighborhood with active counts0..6, event/route/point/session regions, globals and callback arguments/order;41f130 EAX and420020 volatile registers. Includes explicit profile/seed-memory alias. No original process, complete autonomous trajectory or full AI claim.',
  evidence: [...evidence, ...tableEvidence].map(item => item.evidence_id), instructions: instructions.length, fixtures, aliasFixtures: 1, entryCounts, callbackCalls, scheduled, commonPlans, sharedQueries, sharedDisables, mode20Fire, mode20GeometryPasses, mode20Timeouts, timerSelections, instructionSteps, matched: true};
await writeFile('analysis/autonomous-dispatch-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

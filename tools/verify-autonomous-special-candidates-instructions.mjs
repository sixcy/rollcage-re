import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {appendPickupSpecialCandidates, appendObjectSpecialCandidates, appendMarkerSpecialCandidates,
  scoreAutonomousSpecialCandidate, specialCandidateRouteCost} from '../src/autonomous-special-candidates.mjs';

const own = await readInstructionEvidence(['356-autonomous-candidate-modifier-a-assembly.json', '362-autonomous-candidate-modifier-b-assembly.json', '366-autonomous-candidate-modifier-d-assembly.json', '541-special-candidate-score-assembly.json', '543-special-candidate-route-cost-assembly.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['220-wheel-drive-dot-assembly.json', '133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json']);
const costs = await readInstructionEvidence(['374-autonomous-candidate-position-cost-assembly.json', '521-candidate-obstacle-cost-assembly.json', '523-candidate-distance-geometry-assembly.json', '525-candidate-obstacle-geometry-assembly.json'], {directory: 'analysis/native-simulation/results'});
const instructions = [...own.instructions, ...math.instructions], boundaryMachine = new BoundedX86(instructions), fullMachine = new BoundedX86([...instructions, ...costs.instructions]), memory = Buffer.alloc(0xa00000), BODY = 0x10000, FREE = 0x20000, PACK = 0x30000, RESOURCE = 0x31000, GROUPS = 0x32000, POINTS = 0x33000, LIST = 0x40000, OBJECTS = 0x41000, OBJECTROWS = 0x43000, MARKERS = 0x44000, META = 0x45000, FRAMES = 0x46000, DESCRIPTOR = 0x47000, STACK = 0x9000;
const sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8'));
let seed = 0x434f80ab, instructionSteps = 0, positionCosts = 0, obstacleCosts = 0, insertions = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const signed = () => random(0xffffffff) | 0;
const entries = [0x434f80, 0x434c60, 0x434550, 0x420a10, 0x435240], fixtures = 10000, entryCounts = {};
let actualPositionCosts = 0, actualObstacleCosts = 0;
const observe = address => {if ([0x4351ce, 0x434f00, 0x43479e].includes(address)) insertions++;};
boundaryMachine.onInstruction = observe;
fullMachine.onInstruction = address => {observe(address); if (address === 0x411fa0) actualPositionCosts++; if (address === 0x4126d0) actualObstacleCosts++;};
const yaw = JSON.parse(await readFile('src/yaw-table.json', 'utf8'));
for (let fixture = 0; fixture < fixtures; fixture++) {
  const full = fixture >= 5000, machine = full ? fullMachine : boundaryMachine;
  memory.fill(0); machine.reset(); const entry = entries[fixture % entries.length], free = [0, 1, 16, 17, 18, 19, -1][Math.floor(fixture / 5) % 7], targetIndex = [0, 1, 17, 18, 19, 20][Math.floor(fixture / 35) % 6];
  entryCounts[entry.toString(16)] = (entryCounts[entry.toString(16)] ?? 0) + 1;
  memory.fill(0xa5, BODY, BODY + 0x4000); memory.fill(0x93, 0x91f1c0, 0x91f6a0); memory.fill(0x6a, STACK - 512, STACK + 12);
  memory.writeUInt32LE(PACK, 0x90b98c); memory.writeUInt32LE(RESOURCE, 0x90b990); memory.writeUInt32LE(GROUPS, PACK + 0x60); memory.writeUInt32LE(RESOURCE, PACK + 8);
  memory.writeUInt32LE(POINTS, GROUPS + 20); memory.writeUInt16LE(1, GROUPS + 12); memory.writeUInt32LE(0x700, POINTS + 8);
  memory.writeUInt32LE(OBJECTROWS, RESOURCE + 0xec); memory.writeUInt32LE(MARKERS, RESOURCE + 0xe4);
  const sourceCount = fixture % 13 === 0 ? 0 : 1 + random(3); memory[RESOURCE + 0xf5] = sourceCount; memory.writeUInt32LE(sourceCount, 0x82e904); memory.writeUInt32LE(LIST, 0x902020); memory.writeInt32LE(sourceCount, 0x902024);
  memory.writeInt32LE(free, FREE); memory[0x6e650f] = targetIndex; memory.writeUInt32LE(fixture % 17 ? 0x80c : 0, BODY + 0x6ec); memory[BODY + 0x68c] = fixture % 19 ? 255 : 0; memory[BODY + 0x68d] = 0;
  memory.writeUInt32LE(DESCRIPTOR, BODY + 0x10); memory.writeUInt16LE(32, DESCRIPTOR + 0x32); memory.writeInt16LE(100, BODY + 0x668);
  for (const offset of [0x34, 0x38, 0x3c]) memory.writeInt32LE(0, BODY + offset);
  for (let index = 0; index < 20; index++) {
    const row = 0x91f1e0 + index * 52; memory.writeUInt16LE(index > free ? 1 : 0, row); memory[row + 2] = 0; memory[row + 38] = fixture % 23 === 0 ? 1 : 0;
    for (const offset of [16, 20, 24]) memory.writeInt32LE(offset === 16 ? 65536 : 0, row + offset);
    for (const offset of [44, 48]) memory.writeInt32LE(signed(), row + offset);
  }
  for (let index = 0; index < 3; index++) {
    const object = OBJECTS + index * 0x300, row = OBJECTROWS + index * 20, marker = MARKERS + index * 20, x = [299, 300, 500, 1000, 1001, 1400, 1500, 1501][random(8)], y = fixture % 7 === 0 ? 100 : 0;
    memory.writeUInt32LE(object, LIST + index * 4); memory.writeUInt16LE(fixture % 11 === 0 ? 0 : 0x81, object + 0x182); memory.writeUInt16LE(1, object + 0x18c); memory.writeUInt16LE(0, object + 0x18e);
    memory.writeInt32LE(x << 16, object + 0x34); memory.writeInt32LE(y << 16, object + 0x38); memory.writeInt32LE(0, object + 0x3c);
    memory.writeUInt32LE(object, row); memory.writeUInt32LE(META, row + 4); memory.writeInt16LE(x, row + 8); memory.writeInt16LE(y, row + 10); memory.writeInt16LE(0, row + 12); memory.writeUInt16LE(0, row + 16); memory[row + 18] = 1;
    memory.writeUInt32LE(0, object + 12); memory.writeUInt32LE(FRAMES, META + 0x194); memory[META + 0x192] = 0x5a; memory[FRAMES + 3] = fixture % 29 === 0 ? 5 : 0;
    memory.writeInt16LE(x, marker); memory.writeInt16LE(y, marker + 2); memory.writeInt16LE(0, marker + 4); memory.writeUInt16LE(0, marker + 16); memory[marker + 18] = 1;
  }
  if (full) {
    memory.writeUInt32LE(memory.readUInt32LE(BODY + 0x6ec) | 32, BODY + 0x6ec); memory[0x6e650e] = fixture % 3 ? 1 : 0;
    memory.writeUInt32LE(0x48000, 0x849a5c); memory.writeUInt32LE(0x50000, 0x48000); memory[0x48006] = 2;
    memory.writeUInt32LE(DESCRIPTOR, 0x50010); memory.writeInt32LE(250 << 16, 0x50034); memory.writeInt32LE(16 << 16, 0x5003c); memory.writeInt32LE(100000, 0x920ec0); memory[0x920f60] = 0;
    memory.writeUInt32LE(fixture % 7 ? 1 : 0, 0x6e651c); memory[0x920e80] = 0; memory.writeUInt32LE(0x54000, 0x920b40); memory.writeUInt32LE(1, 0x920b44); memory.writeUInt32LE(0x55000, 0x920b48); memory.writeInt32LE(100000, 0x920da0);
    memory.writeUInt32LE(DESCRIPTOR, 0x54010); memory.writeUInt32LE(0x58000, 0x5402c); memory.writeUInt32LE(0x55010, 0x55000); memory.writeUInt32LE(0, 0x55020); memory.writeUInt32LE(0x57000, DESCRIPTOR + 0x40);
    yaw.values.forEach((value, index) => memory.writeInt16LE(value, 0x5ed030 + index * 2));
  }
  const ranges = [[BODY, 0x4000], [FREE, 4], [PACK, 0x4000], [LIST, 0x20000], [0x91f1c0, 0x4e0], [0x6e650e, 2], [0x6e651c, 4], [0x849a5c, 4], [0x920b40, 0x500], [0x902020, 8], [0x82e904, 4], [0x90b98c, 8], [0x91d45c, 8], [0x5ed030, yaw.values.length * 2]];
  for (const [address, length] of ranges) memory.copy(machine.bytes, address, address, address + length);
  for (let index = 0; index < sqrt.values.length; index++) machine.bytes.writeUInt16LE(sqrt.values[index], 0x5eb290 + index * 2);
  const sourceLog = [], nativeLog = [];
  function cost(target, name, ecx, edx, args, log) {
    log.push([name, ecx, edx, args, Buffer.from(target.subarray(args[0], args[0] + 6))]);
    const callIndex = log.length;
    if (fixture % 31 === 0) target.writeInt32LE(target.readInt32LE(BODY + 0x34) + 65536, BODY + 0x34);
    if (name === 'position' && callIndex === 1) {
      if (fixture % 37 === 0 && target.readInt32LE(FREE) > 0) target.writeInt32LE(target.readInt32LE(FREE) - 1, FREE);
      if (fixture % 41 === 0 && target[0x6e650f] < 18) target[0x6e650f]++;
      if (fixture % 43 === 0 && edx < STACK) target.writeInt32LE(0, edx + 20);
    }
    return ((name === 'position' ? 13 : -7) + callIndex * 3) | 0;
  }
  const handlers = {call411fa0: request => cost(memory, 'position', request.ecx, request.edx, request.args, sourceLog), call4126d0: request => cost(memory, 'obstacle', request.ecx, request.edx, request.args, sourceLog)};
  const context = {memory, scratchBase: STACK, handlers: full ? {} : handlers}; let returned;
  if (entry === 0x434f80) appendPickupSpecialCandidates(BODY, FREE, context);
  else if (entry === 0x434c60) appendObjectSpecialCandidates(BODY, FREE, context);
  else if (entry === 0x434550) appendMarkerSpecialCandidates(BODY, FREE, context);
  else if (entry === 0x420a10) returned = scoreAutonomousSpecialCandidate(BODY, 19, fixture & 1, context);
  else returned = specialCandidateRouteCost(0x91f600, 250000, 19, BODY, context);
  machine.externalCalls.set(0x411fa0, m => {const args = [0, 4, 8, 12].map(offset => m.bytes.readInt32LE(m.r.ESP + offset)); m.r.EAX = cost(m.bytes, 'position', m.r.ECX, m.r.EDX, args, nativeLog);});
  machine.externalCalls.set(0x4126d0, m => {const args = [0, 4, 8].map(offset => m.bytes.readInt32LE(m.r.ESP + offset)); m.r.EAX = cost(m.bytes, 'obstacle', m.r.ECX, m.r.EDX, args, nativeLog);});
  machine.entry = entry; machine.r.ESP = STACK; machine.bytes.writeUInt32LE(0xffffffff, STACK); machine.r.ECX = entry === 0x435240 ? 0x91f600 : BODY; machine.r.EDX = entry === 0x420a10 ? 19 : entry === 0x435240 ? 250000 : FREE;
  machine.bytes.writeInt32LE(entry === 0x435240 ? 19 : 19 * 52, STACK + 4); machine.bytes.writeInt32LE(entry === 0x435240 ? BODY : fixture & 1, STACK + 8);
  instructionSteps += machine.run(); assert.deepEqual(nativeLog, sourceLog, `calls ${fixture}`);
  if (returned !== undefined) assert.equal(machine.r.EAX | 0, returned | 0, `return ${fixture}`);
  for (const [address, length] of ranges) assert.deepEqual(machine.bytes.subarray(address, address + length), memory.subarray(address, address + length), `fixture ${fixture}/${address.toString(16)}`);
  positionCosts += sourceLog.filter(item => item[0] === 'position').length; obstacleCosts += sourceLog.filter(item => item[0] === 'obstacle').length;
}
const report = {method: 'Three special candidate modifiers and420a10/435240 wrappers.5000 fixtures execute actual411fa0/412070/4126d0/412870, root/dot arithmetic and supplied coherent body-distance/obstacle tables; no mocked calls.5000 parent-boundary fixtures use lower-cost hooks mutating body position, lowest-free index, target index and caller obstacle flag. Whole bodies, candidate/target tables, source/cost tables, registry, root globals, scalar returns and cost arguments/order compared. Full cost fixtures use a valid zero-plane obstacle acceptance record. No original process execution.', evidence: [...own.evidence, ...math.evidence, ...costs.evidence].map(item => item.evidence_id), instructions: instructions.length + costs.instructions.length, fixtures, actualCostFixtures: 5000, boundaryFixtures: 5000, entryCounts, positionCosts, obstacleCosts, actualPositionCosts, actualObstacleCosts, insertions, instructionSteps, matched: true};
await writeFile('analysis/autonomous-special-candidates-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

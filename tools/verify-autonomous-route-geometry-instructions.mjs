import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {stepRoutePoint, stepRoutePoints, writeRouteDirection, isRoutePointPassed, findAutonomousRoutePoint, writeAutonomousProgressDirection} from '../src/autonomous-route-geometry.mjs';

const own = await readInstructionEvidence(['211-autonomous-next-point-assembly.json', '229-autonomous-previous-point-assembly.json', '218-autonomous-route-direction-assembly.json', '226-autonomous-point-passed-assembly.json', '220-autonomous-route-nearest-assembly.json', '216-autonomous-speed-geometry-assembly.json', '223-autonomous-vector-normalize-small-assembly.json', '224-autonomous-vector-normalize-large-assembly.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['220-wheel-drive-dot-assembly.json', '217-wheel-capacity-curve-assembly.json', '133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json']);
const multiple = await readInstructionEvidence(['301-autonomous-typed-point-assembly.json'], {directory: 'analysis/native-simulation/results'});
own.evidence.push(...multiple.evidence); own.instructions.push(...multiple.instructions);
const evidence = [...own.evidence, ...math.evidence], instructions = [...own.instructions, ...math.instructions];
const machine = new BoundedX86(instructions);
const sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8'));
sqrt.values.forEach((value, index) => machine.bytes.writeUInt16LE(value, 0x5eb290 + index * 2));
const BODY = 0x10000, PACK = 0x20000, GROUPS = 0x21000, POINTS = 0x30000, POSITION = 0x50000, OUTPUT = 0x50100, INDEX = 0x50200, RECORD = 0x51000, STACK = 0x9000;
let seed = 0x491ce0ab, steps = 0, checks = 0, passed = 0, walkMoves = 0, exhausted = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const put = (memory, address, values) => values.forEach((value, axis) => memory.writeInt32LE(value | 0, address + axis * 4));
const fixtures = 3200;
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const bytes = machine.bytes;
  bytes.fill(0xa5, STACK - 1024, STACK + 32);
  bytes.writeUInt32LE(PACK, 0x90b98c); bytes.writeUInt32LE(GROUPS, PACK + 0x60);
  bytes.writeUInt32LE(BODY, RECORD);
  const counts = [];
  for (let group = 0; group < 3; group++) {
    const count = fixture % 23 === 0 ? 1 : fixture % 19 === 0 ? 64 : 2 + random(14); counts.push(count);
    bytes.writeUInt16LE(count, GROUPS + group * 12);
    bytes[GROUPS + group * 12 + 2] = random(2); bytes[GROUPS + group * 12 + 4] = random(2); bytes[GROUPS + group * 12 + 5] = group;
    bytes.writeUInt32LE(POINTS + group * 0x2000, GROUPS + group * 12 + 8);
    for (let index = 0; index < count; index++) for (let axis = 0; axis < 3; axis++) {
      const value = fixture % 19 === 0 ? axis === 0 ? index : 0 : fixture % 7 === 0 ? random(60000) - 30000 : index * 30 + random(30) - 15;
      bytes.writeInt16LE(value, POINTS + group * 0x2000 + index * 16 + axis * 2);
    }
  }
  const groupIndex = random(3), group = GROUPS + groupIndex * 12, index = random(counts[groupIndex]);
  const position = fixture % 19 === 0 ? [0, 0, 0] : [0, 1, 2].map(() => random(0x6000000) - 0x3000000);
  put(bytes, POSITION, position); put(bytes, BODY + 0x34, position);
  bytes.writeUInt16LE(groupIndex, BODY + 0x6c0); bytes.writeUInt16LE(index, BODY + 0x6c2);
  const progressGroup = random(3); bytes.writeUInt32LE(GROUPS + progressGroup * 12, RECORD + 0x54); bytes.writeUInt32LE(random(counts[progressGroup]), RECORD + 0x58);
  const entry = [0x491390, 0x491400, 0x491d80, 0x4915e0, 0x491740, 0x491ce0, 0x491470][fixture % 7];
  bytes.fill(0x69, OUTPUT, OUTPUT + 16); bytes.writeUInt32LE((index | 0xa5a50000) >>> 0, INDEX);
  const source = Buffer.from(bytes), options = {memory: source, scratchBase: STACK};
  let expected, ecx, edx, args;
  if (entry === 0x491390 || entry === 0x491400) {expected = stepRoutePoint(group, index, OUTPUT, options, entry === 0x491400); ecx = index; edx = group; args = [OUTPUT];}
  else if (entry === 0x491470) {const count = [0, 1, 5, 49, 255, 256, -1][Math.floor(fixture / 7) % 7]; expected = stepRoutePoints(group, index, count, OUTPUT, options); ecx = index; edx = group; args = [count >>> 0, OUTPUT];}
  else if (entry === 0x491d80) {writeRouteDirection(OUTPUT, groupIndex, index, options); ecx = OUTPUT; edx = groupIndex; args = [index];}
  else if (entry === 0x4915e0) {expected = isRoutePointPassed(group, index, POSITION, options); ecx = index; edx = group; args = [POSITION]; passed += expected;}
  else if (entry === 0x491740) {findAutonomousRoutePoint(group, INDEX, OUTPUT, POSITION, options); ecx = group; edx = INDEX; args = [OUTPUT, POSITION]; if (source.readUInt16LE(INDEX) !== index) walkMoves++; if (fixture % 19 === 0) exhausted++;}
  else {writeAutonomousProgressDirection(OUTPUT, RECORD, options); ecx = OUTPUT; edx = RECORD; args = [];}
  machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = STACK;
  bytes.writeUInt32LE(0xffffffff, STACK); args.forEach((value, arg) => bytes.writeUInt32LE(value, STACK + 4 + arg * 4));
  steps += machine.run(); checks++;
  try {
    if (expected !== undefined) assert.equal(machine.r.EAX, expected, `return ${fixture}`);
    assert.deepEqual(bytes.subarray(OUTPUT, OUTPUT + 16), source.subarray(OUTPUT, OUTPUT + 16), `output ${fixture}`);
    assert.deepEqual(bytes.subarray(INDEX, INDEX + 4), source.subarray(INDEX, INDEX + 4), `index ${fixture}`);
    assert.deepEqual(bytes.subarray(BODY, BODY + 0x800), source.subarray(BODY, BODY + 0x800), `body ${fixture}`);
    assert.deepEqual(bytes.subarray(GROUPS, GROUPS + 36), source.subarray(GROUPS, GROUPS + 36), `groups ${fixture}`);
    assert.deepEqual(bytes.subarray(POINTS, POINTS + 0x6000), source.subarray(POINTS, POINTS + 0x6000), `points ${fixture}`);
  } catch (error) {console.error({fixture, entry: entry.toString(16), groupIndex, index, counts, position}); throw error;}
}
const report = {method: 'Complete491390/491400 directional step,491470 atomic unsigned-byte multi-step,491d80 route direction,4915e0 plane test,491740 bounded bidirectional walk and491ce0 progression direction, with actual dot/divide/root/normalizers and no mocked calls. Synthetic mapped routes include reverse/cyclic/open/singleton groups, retained singleton stack direction, large coordinate differences, endpoint preservation, low-word stores,49-candidate limit and route/progression direction disagreement. Compares complete body/route/point records, output and index neighborhoods; return for scalar entries. No original process execution. Scratch prologues are not a general exported state contract.', evidence: evidence.map(item => item.evidence_id), instructions: instructions.length, fixtures, checks, passed, walkMoves, limitScenarios: exhausted, instructionSteps: steps, matched: true};
await writeFile('analysis/autonomous-route-geometry-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

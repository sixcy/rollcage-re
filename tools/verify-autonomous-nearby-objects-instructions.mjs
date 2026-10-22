import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {populateAutonomousNearbyBodies, populateAutonomousNearbyObstacles} from '../src/autonomous-nearby-objects.mjs';

const own = await readInstructionEvidence(['370-autonomous-candidate-populate-a-assembly.json', '372-autonomous-candidate-populate-b-assembly.json'], {directory: 'analysis/native-simulation/results'});
const geometry = await readInstructionEvidence(['211-autonomous-next-point-assembly.json', '229-autonomous-previous-point-assembly.json', '218-autonomous-route-direction-assembly.json', '226-autonomous-point-passed-assembly.json', '220-autonomous-route-nearest-assembly.json', '216-autonomous-speed-geometry-assembly.json', '223-autonomous-vector-normalize-small-assembly.json', '224-autonomous-vector-normalize-large-assembly.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['220-wheel-drive-dot-assembly.json', '217-wheel-capacity-curve-assembly.json', '133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json']);
const evidence = [...own.evidence, ...geometry.evidence, ...math.evidence], instructions = [...own.instructions, ...geometry.instructions, ...math.instructions], machine = new BoundedX86(instructions), memory = Buffer.alloc(0xa00000);
const BODY = 0x10000, REGISTERED = 0x14000, PACK = 0x20000, GROUPS = 0x21000, POINTS = 0x30000, REGISTRY = 0x38000, OBJECTS = 0x40000, STACK = 0x9000;
const sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8')); sqrt.values.forEach((value, index) => machine.bytes.writeUInt16LE(value, 0x5eb290 + index * 2));
let seed = 0x411e70ab, instructionSteps = 0, walks = 0, bodyDistanceWrites = 0, obstacleDistanceWrites = 0, bodySelections = 0, obstacleSelections = 0, negativeSelections = 0, differentRegisteredBodies = 0, originAliases = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const short = value => (value << 16) >> 16;
machine.onInstruction = address => {if (address === 0x491740) walks++; if (address === 0x411f36) bodyDistanceWrites++; if (address === 0x412699) obstacleDistanceWrites++;};
const fixtures = 4000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); machine.reset(); const obstacles = fixture % 2 !== 0, currentGroup = random(3), progressGroup = random(3), recordIndex = random(6);
  memory.fill(0xa5, STACK - 1024, STACK + 8); memory.fill(0x69, BODY, REGISTERED + 0x4000); memory.fill(0x93, 0x920b40, 0x921000);
  memory.writeUInt32LE(PACK, 0x90b98c); memory.writeUInt32LE(GROUPS, PACK + 0x60); memory.writeUInt32LE(REGISTRY, 0x849a5c);
  const counts = [];
  for (let groupIndex = 0; groupIndex < 3; groupIndex++) {
    const group = GROUPS + groupIndex * 12, count = fixture % 29 === 0 ? 1 : fixture % 31 === 0 ? 64 : 2 + random(6); counts.push(count);
    memory.writeUInt16LE(count, group); memory[group + 2] = random(2); memory[group + 4] = random(2); memory[group + 5] = groupIndex; memory.writeUInt32LE(POINTS + groupIndex * 0x2000, group + 8);
    for (let index = 0; index < count; index++) for (let axis = 0; axis < 3; axis++) memory.writeInt16LE(axis === groupIndex ? index * (fixture % 31 === 0 ? 1 : 40) : 0, POINTS + groupIndex * 0x2000 + index * 16 + axis * 2);
  }
  const queriedBody = fixture % 97 === 0 ? STACK - 0x42 : BODY;
  const origin = Array.from({length: 3}, () => random(401) - 200), registered = fixture % 7 === 0 || queriedBody !== BODY ? REGISTERED : BODY;
  if (registered !== BODY) differentRegisteredBodies++;
  memory.writeUInt16LE(recordIndex, BODY + 0x65e);
  for (const body of [BODY, REGISTERED]) {
    for (let axis = 0; axis < 3; axis++) memory.writeInt32LE((origin[axis] << 16) + (fixture % 3 ? random(65536) : 0), body + 0x34 + axis * 4);
    memory.writeUInt16LE(currentGroup, body + 0x6c0); memory.writeUInt16LE(random(counts[currentGroup]), body + 0x6c2);
  }
  const record = 0x909300 + recordIndex * 0x30c; memory.writeUInt32LE(registered, record); memory.writeUInt32LE(GROUPS + progressGroup * 12, record + 0x54); memory.writeUInt32LE(random(counts[progressGroup]), record + 0x58);
  if (queriedBody !== BODY) {
    originAliases++; memory.writeUInt16LE(recordIndex, queriedBody + 0x65e);
    for (let axis = 0; axis < 3; axis++) memory.writeInt32LE(origin[axis] << 16, queriedBody + 0x34 + axis * 4);
  }
  const objectCount = [0, 1, 2, 8, 24, 36, 48][Math.floor(fixture / 2) % 7]; memory.writeUInt32LE(objectCount, 0x6e6514); memory.writeUInt32LE(0xdeadbeef, 0x6e651c); memory[0x6e650e] = 0xfe;
  for (let index = 0; index < 255; index++) {
    const object = OBJECTS + index * 0x200, position = [[1000, 0, 0], [1001, 0, 0], [2500, 0, 0], [2501, 0, 0], [-1, 0, 0], [0, 0, 0], [32767, 32767, 0], [-32768, -32768, 0], [-32768, -32768, -32768], [0, 2500, 0], [random(8001) - 4000, random(8001) - 4000, random(8001) - 4000]][index % 11];
    for (let axis = 0; axis < 3; axis++) memory.writeInt32LE(short(origin[axis] + position[axis]) << 16, object + 0x34 + axis * 4);
    memory[object + 0x19a] = [0, 1, 4, 5, 255][(index + fixture) % 5]; if (index < 48) memory.writeUInt32LE(object, 0x920b40 + index * 12);
    if (index < 36) {const registry = REGISTRY + index * 8; const flag = [0, 1, 2, 0x80, 255][(index + fixture) % 5]; memory.writeUInt32LE(flag ? object : 0xffffffff, registry); memory[registry + 4] = flag;}
  }
  const ranges = [[BODY, 0x8000], [PACK, 0x2000], [POINTS, 0x6000], [REGISTRY, 36 * 8], [OBJECTS, 255 * 0x200], [0x909300, 6 * 0x30c], [0x920b40, 0x1000], [0x6e650e, 1], [0x6e6514, 12], [0x849a5c, 4], [0x90b98c, 4], [STACK - 12, 12]];
  for (const [address, length] of ranges) memory.copy(machine.bytes, address, address, address + length);
  // Both sides receive the same retained singleton/walk scratch, independently
  // of body/route/table byte comparisons. Saved register stack bytes are private.
  memory.copy(machine.bytes, STACK - 1024, STACK - 1024, STACK + 8);
  if (queriedBody !== BODY) memory.copy(machine.bytes, queriedBody + 0x65e, queriedBody + 0x65e, queriedBody + 0x660);
  const context = {memory, scratchBase: STACK};
  if (obstacles) populateAutonomousNearbyObstacles(queriedBody, context); else populateAutonomousNearbyBodies(queriedBody, context);
  machine.entry = obstacles ? 0x4125a0 : 0x411e70; machine.r.ECX = queriedBody; machine.r.ESP = STACK; machine.bytes.writeUInt32LE(0xffffffff, STACK); instructionSteps += machine.run();
  try {for (const [address, length] of ranges) assert.deepEqual(machine.bytes.subarray(address, address + length), memory.subarray(address, address + length), `fixture ${fixture}/${address.toString(16)}`);}
  catch (error) {console.error({fixture, obstacles, currentGroup, progressGroup, counts, origin, recordIndex, registered, objectCount}); throw error;}
  const count = obstacles ? memory.readUInt32LE(0x6e651c) : memory[0x6e650e];
  if (obstacles) obstacleSelections += count; else bodySelections += count;
  for (let index = 0; index < count; index++) {const selected = memory[(obstacles ? 0x920e80 : 0x920f60) + index]; if (memory.readInt32LE((obstacles ? 0x920da0 : 0x920ec0) + selected * 4) < 0) negativeSelections++;}
}
const report = {method: 'Complete411e70/4125a0 with actual491ce0 progression direction, route traversal491740/491390/491400/4915e0/491d80, both normalizers and retained dot/divide/root arithmetic; no mocked calls. Populated36-entry flagged body registry and0..48 obstacles, differing progression/current groups and reverse/cyclic/open/singleton geometry, separate registered body, origin/direction-output aliases, exact range cutoffs, short wrapping and signed negative squared-distance overflow. Full bodies, route/point/source/registry tables, distance/index arrays, counters and consumed direction output compare; skipped distance/list tails remain stale. Private saved-register/dead geometry scratch and root scratch globals are not comparison outputs. No original process execution.', evidence: evidence.map(item => item.evidence_id), instructions: instructions.length, fixtures, bodyFixtures: 2000, obstacleFixtures: 2000, walks, differentRegisteredBodies, originAliases, bodyDistanceWrites, obstacleDistanceWrites, bodySelections, obstacleSelections, negativeSelections, instructionSteps, matched: true};
await writeFile('analysis/autonomous-nearby-objects-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

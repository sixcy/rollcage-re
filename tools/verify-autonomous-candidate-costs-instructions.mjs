import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {evaluateAutonomousPositionCost, evaluateAutonomousBodyDistanceCost, evaluateAutonomousObstacleCost, intersectsAutonomousObstacle, evaluateAutonomousRouteCost} from '../src/autonomous-candidate-costs.mjs';
const own = await readInstructionEvidence(['374-autonomous-candidate-position-cost-assembly.json', '523-candidate-distance-geometry-assembly.json', '521-candidate-obstacle-cost-assembly.json', '525-candidate-obstacle-geometry-assembly.json', '376-autonomous-candidate-route-cost-assembly.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json']);
const instructions = [...own.instructions, ...math.instructions], machine = new BoundedX86(instructions);
const sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8')), yaw = JSON.parse(await readFile('src/yaw-table.json', 'utf8'));
sqrt.values.forEach((value, index) => machine.bytes.writeUInt16LE(value, 0x5eb290 + index * 2)); yaw.values.forEach((value, index) => machine.bytes.writeInt16LE(value, 0x5ed030 + index * 2));
const BODY = 0x10000, FROM = 0x20000, TO = 0x20010, ORIGIN = 0x20020, LENGTH = 0x20030, INVERSE = 0x20034, DELTA = 0x20040, BODYLIST = 0xc0000, GROUPS = 0xb0000, POINTS = 0xb1000, STACK = 0x9000;
const entries = [0x411fa0, 0x412070, 0x4126d0, 0x412870, 0x412270], nonzero = Array(5).fill(0), negative = Array(5).fill(0), positive = Array(5).fill(0);
let seed = 0x412870ad, steps = 0; const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const short = value => (value << 16) >> 16, put = (memory, address, values) => values.forEach((value, axis) => memory.writeInt16LE(value, address + axis * 2));
const fixtures = 20000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const memory = machine.bytes, profile = Math.floor(fixture / 5) % 4;
  memory.fill(0, STACK - 1024, STACK + 64); memory.writeUInt32LE(BODYLIST, 0x849a5c); memory.writeUInt32LE(GROUPS, 0x9092a0);
  const from = profile === 0 ? Array.from({length: 3}, () => random(2001) - 1000) : [0, 0, 0], to = profile === 0 ? Array.from({length: 3}, () => random(2001) - 1000) : profile === 1 ? [100, 0, 0] : profile === 2 ? [0, 0, 1000] : [32760, 0, 0];
  if (profile === 3) from[0] = -32760;
  put(memory, FROM, from); put(memory, TO, to); put(memory, ORIGIN, profile === 3 ? [-32760, 0, 0] : [0, 0, 0]);
  const delta = to.map((value, axis) => short(value - from[axis])), segmentSq = delta.reduce((sum, value) => (sum + Math.imul(value, value)) | 0, 0);
  put(memory, DELTA, delta); memory.writeInt32LE(-1, LENGTH); memory.writeInt32LE(0, INVERSE);
  memory[BODY + 0x6ec] = random(5) ? 32 : 0;
  const nearby = random(9), obstacles = random(9); memory[0x6e650e] = nearby; memory.writeUInt32LE(obstacles, 0x6e651c);
  const radius = [0, 1, 10, 20, 50, 100][random(6)], speed = [0, 99, 100, 101, 150, 250, 400][random(7)], distanceSq = profile === 0 ? random(3000000) : profile === 1 ? 0 : profile === 2 ? [0, 1000, 10000][random(3)] : 0;
  for (let index = 0; index < 8; index++) {
    const object = 0x30000 + index * 0x1000, model = 0x50000 + index * 0x1000, polygonPointers = 0x70000 + index * 0x1000, packedPlanes = 0x90000 + index * 0x1000, vertices = 0xa0000 + index * 0x1000;
    memory.fill(0, object, object + 0x200); memory.fill(0, model, model + 0x300); memory.writeUInt32LE(object, BODYLIST + index * 8); memory[BODYLIST + index * 8 + 6] = random(5);
    memory.writeUInt32LE(object, 0x920b40 + index * 12); memory.writeUInt32LE(polygonPointers, 0x920b48 + index * 12); memory.writeUInt32LE(model, object + 0x10); memory.writeUInt32LE(packedPlanes, object + 0x2c);
    const bodyRadius = [2, 10, 20, 50, 100, 1000][random(6)]; memory.writeUInt16LE(bodyRadius, model + 0x32); memory.writeUInt16LE(0x100, model + 0x38); memory.writeUInt32LE(vertices + 8, model + 0x40);
    memory[object + 0x199] = profile === 0 ? random(256) : 0; memory[object + 0x19a] = random(7);
    const objectPosition = profile === 0 ? Array.from({length: 3}, () => random(2001) - 1000) : profile === 1 ? [20 + index * 10, index % 3 ? 0 : 100, 0] : profile === 2 ? [0, 0, 100 + index * 100] : [-32768 + index, 0, 0];
    objectPosition.forEach((value, axis) => memory.writeInt32LE(value * 65536, object + 0x34 + axis * 4));
    const range = profile === 0 ? random(4000000) : profile === 1 ? objectPosition[0] ** 2 : profile === 2 ? objectPosition[2] ** 2 : 100;
    memory.writeInt32LE(range, 0x920ec0 + index * 4); memory.writeInt32LE(range, 0x920da0 + index * 4); memory[0x920f60 + index] = index; memory[0x920e80 + index] = index;
    const polygonCount = random(4); memory.writeUInt32LE(polygonCount, 0x920b44 + index * 12);
    for (let polygon = 0; polygon < 3; polygon++) {
      const pointer = polygonPointers + 0x100 + polygon * 32, planeCount = random(5), planeIndex = polygon * 4;
      memory.writeUInt32LE(profile === 0 && random(7) === 0 ? 0 : pointer, polygonPointers + polygon * 4); memory.writeUInt32LE((planeCount << 16) | planeIndex, pointer + 0x10);
      for (let plane = 0; plane < 4; plane++) memory[model + 0x108 + (planeIndex + plane) * 9] = planeIndex + plane;
    }
    for (let plane = 0; plane < 12; plane++) {
      const normal = profile === 0 ? Array.from({length: 3}, () => random(1024) - 512) : [[256, 0, 0], [-256, 0, 0], [0, 0, 256], [0, 0, -256]][plane % 4];
      const packed = (((normal[0] & 1023) << 20) | ((normal[1] & 1023) << 10) | (normal[2] & 1023)) >>> 0;
      memory[packedPlanes + plane * 8] = plane; memory.writeUInt32LE(packed, packedPlanes + plane * 8 + 4);
      put(memory, vertices + plane * 8, profile === 0 ? Array.from({length: 3}, () => random(201) - 100) : [plane % 2 ? -20 : 20, 0, plane % 2 ? -20 : 20]);
    }
  }
  for (let group = 0; group < 2; group++) {
    const address = GROUPS + group * 12, count = 1 + random(12); memory.writeUInt16LE(count, address); memory[address + 2] = random(2); memory[address + 4] = random(2); memory.writeUInt32LE(POINTS + group * 0x1000, address + 8);
    for (let point = 0; point < count; point++) put(memory, POINTS + group * 0x1000 + point * 16, group ? [point * 100, 0, 0] : [0, 0, point * 100]);
  }
  const entryIndex = fixture % 5, entry = entries[entryIndex], target = random(8), group = random(2), point = random(memory.readUInt16LE(GROUPS + group * 12)), source = Buffer.from(memory), options = {memory: source, scratchBase: STACK};
  let expected, args, ecx, edx;
  if (entryIndex === 0) {expected = evaluateAutonomousPositionCost(BODY, FROM, TO, radius, speed, distanceSq, options); ecx = BODY; edx = FROM; args = [TO, radius, speed, distanceSq];}
  else if (entryIndex === 1) {if (segmentSq < 4) continue; expected = evaluateAutonomousBodyDistanceCost(FROM, DELTA, target, radius, speed, distanceSq, segmentSq, LENGTH, INVERSE, options); ecx = FROM; edx = DELTA; args = [target, radius, speed, distanceSq, segmentSq, LENGTH, INVERSE];}
  else if (entryIndex === 2) {expected = evaluateAutonomousObstacleCost(FROM, TO, radius, speed, distanceSq, options); ecx = FROM; edx = TO; args = [radius, speed, distanceSq];}
  else if (entryIndex === 3) {expected = intersectsAutonomousObstacle(FROM, TO, 0x30000 + target * 0x1000, radius, target, options); ecx = FROM; edx = TO; args = [0x30000 + target * 0x1000, radius, target];}
  else {expected = evaluateAutonomousRouteCost(BODY, group, point, ORIGIN, radius, speed, options); ecx = BODY; edx = group; args = [point, ORIGIN, radius, speed];}
  machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = STACK; memory.writeUInt32LE(0xffffffff, STACK); args.forEach((value, index) => memory.writeInt32LE(value | 0, STACK + 4 + index * 4)); steps += machine.run();
  try {
    assert.equal(machine.r.EAX, expected, `return ${fixture}/${entry.toString(16)}`);
    for (const [address, length] of [[BODY, 0x1000], [FROM, 0x100], [0x30000, 0x8000], [0x50000, 0x8000], [0x70000, 0x8000], [0x90000, 0x8000], [0xa0000, 0x8000], [GROUPS, 0x3000], [0x920b40, 0x450], [0x91d45c, 8]]) assert.deepEqual(memory.subarray(address, address + length), source.subarray(address, address + length), `memory ${fixture}/${address.toString(16)}`);
    if (entryIndex === 0) assert.deepEqual(memory.subarray(STACK - 20, STACK - 6), source.subarray(STACK - 20, STACK - 6), `cache/delta ${fixture}`);
  } catch (error) {console.error({fixture, entry: entry.toString(16), profile, from, to, target, radius, speed, distanceSq, expected, actual: machine.r.EAX}); throw error;}
  if (expected) nonzero[entryIndex]++; if (expected < 0) negative[entryIndex]++; if (expected > 0) positive[entryIndex]++;
}
const report = {method: 'Complete411fa0/412070 body-distance scoring,4126d0/412870 obstacle scoring/yaw/packed-plane traversal and412270 route-segment wrapper with actual retained lookup sqrt. Synthetic explicit native nearby-object/model/plane/route input storage; no mocked game calls or original process execution. Compares return EAX, caller memory and meaningful411fa0 cached-root/reciprocal/delta locals.', evidence: [...own.evidence, ...math.evidence].map(item => item.evidence_id), instructions: instructions.length, fixtures, perEntryFixtures: fixtures / 5, entries: entries.map((entry, index) => ({entry: `0x${entry.toString(16)}`, nonzero: nonzero[index], negative: negative[index], positive: positive[index]})), instructionSteps: steps, matched: true};
await writeFile('analysis/autonomous-candidate-costs-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));



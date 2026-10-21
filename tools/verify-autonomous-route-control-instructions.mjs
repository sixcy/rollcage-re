import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {prepareAutonomousTarget, updateAutonomousRouteControl} from '../src/autonomous-route-control.mjs';
import {updateAutonomousSpeed, limitAutonomousPacing} from '../src/autonomous-speed.mjs';
import {updateAutonomousSteering} from '../src/autonomous-steering.mjs';

const own = await readInstructionEvidence(['203-autonomous-control-assembly.json', '209-autonomous-target-setup-assembly.json', '210-autonomous-speed-choice-assembly.json', '211-autonomous-next-point-assembly.json', '215-autonomous-surface-index-assembly.json', '216-autonomous-speed-geometry-assembly.json', '218-autonomous-route-direction-assembly.json', '220-autonomous-route-nearest-assembly.json', '221-autonomous-control-tail-assembly.json', '222-autonomous-vector-divide-assembly.json', '223-autonomous-vector-normalize-small-assembly.json', '224-autonomous-vector-normalize-large-assembly.json', '226-autonomous-point-passed-assembly.json', '227-autonomous-vector-length-assembly.json', '229-autonomous-previous-point-assembly.json', '230-autonomous-steering-assembly.json', '232-steering-dot-assembly.json', '236-steering-axis-angle-assembly.json', '238-steering-velocity-axis-assembly.json', '239-steering-triple-cross-assembly.json', '241-steering-correction-gain-assembly.json'], {directory: 'analysis/native-simulation/results'});
const steeringRatio = await readInstructionEvidence(['234-steering-length-assembly.json'], {directory: 'analysis/native-simulation/results'});
own.evidence.push(...steeringRatio.evidence); own.instructions.push(...steeringRatio.instructions);
const math = await readInstructionEvidence(['217-wheel-capacity-curve-assembly.json', '133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json', '221-fixed-sqrt-assembly.json']);
const evidence = [...own.evidence, ...math.evidence], instructions = [...own.instructions, ...math.instructions], machine = new BoundedX86(instructions);
const sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8')); sqrt.values.forEach((value, index) => machine.bytes.writeUInt16LE(value, 0x5eb290 + index * 2));
const BODY = 0x10000, PACK = 0x20000, GROUPS = 0x21000, POINTS = 0x30000, SESSION = 0x60000, TARGET = 0x61000, METADATA = 0x62000, RECORDS = 0x909300, STACK = 0x9000;
let seed = 0x431750ab, instructionSteps = 0, active = 0, special = 0, targetChanges = 0, throttle = 0, brake = 0, steering = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const signed = () => random(0xffffffff) | 0;
const fixtures = 4000, entries = [0x431750, 0x431380, 0x430fc0, 0x420390];
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const bytes = machine.bytes;
  bytes.fill(0xa5, BODY, BODY + 0x4000); bytes.fill(0x36, STACK - 0x1000, STACK + 0x40);
  bytes.writeUInt32LE(PACK, 0x90b98c); bytes.writeUInt32LE(GROUPS, PACK + 0x60); bytes.writeUInt32LE(SESSION, 0x5ecb1c);
  bytes[SESSION + 0x551] = fixture % 5 ? 0 : 4; bytes[SESSION + 0x553] = random(2); bytes[SESSION + 0x54d] = 8; bytes[SESSION + 0x586] = 3;
  const counts = [1 + random(10), 1 + random(10), 1 + random(10)];
  //Each group has at least two points in connected calls. Direct geometry's
  //singleton retained-stack cases are verified by the dedicated geometry tool.
  for (let group = 0; group < 3; group++) {
    const count = Math.max(2, counts[group]); counts[group] = count;
    bytes.writeUInt16LE(count, GROUPS + group * 12); bytes[GROUPS + group * 12 + 2] = random(2); bytes[GROUPS + group * 12 + 4] = random(2); bytes[GROUPS + group * 12 + 5] = group; bytes.writeUInt32LE(POINTS + group * 0x1000, GROUPS + group * 12 + 8);
    for (let point = 0; point < count; point++) {
      for (let axis = 0; axis < 3; axis++) bytes.writeInt16LE(random(2001) - 1000, POINTS + group * 0x1000 + point * 16 + axis * 2);
      bytes[POINTS + group * 0x1000 + point * 16 + 7] = [0, 1, 125, 250, 255][random(5)];
    }
  }
  const group = random(3), index = random(counts[group]);
  bytes.writeUInt16LE(group, BODY + 0x6c0); bytes.writeUInt16LE(index, BODY + 0x6c2); bytes.writeUInt16LE(fixture % 9 ? 0x4000 | random(2) * 0x8000 : 0x8000, BODY + 0x6c4);
  bytes[BODY + 0x6c9] = [0, 0, 0, 1, 5, 5, 255][random(7)]; bytes.writeUInt32LE(random(2) * 0x200, BODY + 0x6ec); bytes.writeUInt16LE(0, BODY + 0x65e);
  bytes.writeInt16LE([-32768, -1, 0, 39, 40, 99, 100, 199, 200, 300, 301, 510, 32767][random(13)], BODY + 0x668); bytes[BODY + 0x6f1] = random(5); bytes.writeInt8([-1, 0, 1, 2, 3][random(5)], BODY + 0x6f3); bytes[BODY + 0x6db] = random(256); bytes.writeInt32LE(random(0x100000), BODY + 0x6a8);
  bytes[BODY + 0x64f] = random(2); bytes.writeInt32LE(signed(), BODY + 0x644); bytes.writeInt32LE([0, 2000000, 3000000, 4000000, 4000001, -4000001, signed()][random(7)], BODY + 0x50); bytes.writeInt32LE([-5001, -5000, 999, 1000, signed()][random(5)], BODY + 0x3cf8); bytes.writeInt32LE(signed(), BODY + 0x710);
  [4096, 0, 0, 0, 4096, 0, 0, 0, 4096].forEach((value, component) => bytes.writeInt16LE(value, BODY + 0xc4 + component * 2));
  for (let axis = 0; axis < 3; axis++) {
    const position = fixture % 7 === 0 ? 0 : random(1000 * 65536) - 500 * 65536;
    bytes.writeInt32LE(position, BODY + 0x34 + axis * 4);
    bytes.writeInt32LE((position + (random(500 * 65536) - 250 * 65536)) | 0, BODY + 0x6cc + axis * 4);
    bytes.writeInt32LE(random(32 * 65536) - 16 * 65536, BODY + 0x68 + axis * 4);
    bytes.writeInt32LE(random(500 * 65536) - 250 * 65536, TARGET + axis * 4);
  }
  if (fixture % 28 === 0) {
    bytes[BODY + 0x6c9] = 5;
    const difference = fixture % 56 === 0 ? [-2147483648, -2147483648, 0] : [200 * 65536, 0, 0];
    for (let axis = 0; axis < 3; axis++) {bytes.writeInt32LE(0, BODY + 0x34 + axis * 4); bytes.writeInt32LE(difference[axis], BODY + 0x6cc + axis * 4);}
  }
  for (let wheel = 0; wheel < 4; wheel++) {bytes[BODY + 0x324 + wheel * 200] = random(4); bytes.writeUInt32LE(fixture % 11 ? METADATA + wheel * 32 : 0, BODY + 0x198 + wheel * 28); bytes.writeUInt32LE(random(32) << 8, METADATA + wheel * 32 + 12);}
  for (let record = 0; record < 8; record++) {
    const address = RECORDS + record * 0x30c, progressGroup = random(3), otherBody = record === 0 ? BODY : 0x70000 + record * 0x1000;
    bytes.writeUInt32LE(otherBody, address); if (record) bytes.writeInt16LE(random(700) - 100, otherBody + 0x668);
    bytes[address + 0x1c] = fixture % 3 ? random(5) : 0; bytes.writeInt32LE([-16001, -16000, -8001, -8000, -3001, -3000, -1501, -1500, -801, -800, -799, 0][random(12)], address + 0x24);
    bytes.writeUInt32LE(GROUPS + progressGroup * 12, address + 0x54); bytes.writeUInt32LE(random(counts[progressGroup]), address + 0x58);
  }
  const entry = entries[fixture % entries.length], speed = [0, 80, 250, 510, 65535][random(5)], source = Buffer.from(bytes), options = {memory: source, scratchBase: STACK};
  let ecx = BODY, edx = 0, args = [];
  const beforeIndex = source.readUInt16LE(BODY + 0x6c2);
  let expectedTarget;
  if (entry === 0x431750) {if (source.readUInt16LE(BODY + 0x6c4) & 0x4000) active++; if (source[BODY + 0x6c9]) special++; updateAutonomousRouteControl(BODY, {...options, handlers: {steering: (body, target, first, reverse, runtime) => {expectedTarget = Buffer.from(source.subarray(target, target + 12)); updateAutonomousSteering(body, target, first, reverse, runtime);}}});}
  else if (entry === 0x431380) {prepareAutonomousTarget(BODY, TARGET, group, index, options); edx = TARGET; args = [group, index];}
  else if (entry === 0x430fc0) {updateAutonomousSpeed(BODY, speed, options); edx = speed;}
  else limitAutonomousPacing(BODY, options);
  machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = STACK; bytes.writeUInt32LE(0xffffffff, STACK); args.forEach((value, argument) => bytes.writeUInt32LE(value, STACK + 4 + argument * 4));
  let observedTarget = false;
  machine.onInstruction = address => {if (entry === 0x431750 && address === 0x431520) {assert.deepEqual(bytes.subarray(machine.r.EDX, machine.r.EDX + 12), expectedTarget, `live target before steering ${fixture}`); observedTarget = true;}};
  instructionSteps += machine.run();
  try {
    for (const [address, length] of [[BODY, 0x4000], [TARGET, 12], [GROUPS, 36], [POINTS, 0x3000], [METADATA, 128], [RECORDS, 8 * 0x30c], [SESSION, 0x600]]) assert.deepEqual(bytes.subarray(address, address + length), source.subarray(address, address + length), `state ${fixture}/0x${address.toString(16)}`);
    if (entry === 0x431750) assert.equal(observedTarget, expectedTarget !== undefined, `steering reached ${fixture}`);
  } catch (error) {console.error({fixture, entry: entry.toString(16), group, index, counts, speed, special: source[BODY + 0x6c9]}); throw error;}
  if (source.readUInt16LE(BODY + 0x6c2) !== beforeIndex) targetChanges++;
  const bits = source.readUInt32LE(BODY + 0x710); if (bits & 0x40) throttle++; if (bits & 0x80) brake++; if (bits & 0xa000) steering++;
}
const report = {method: 'Complete connected431750 route-control pass,431380 target preparation,430fc0 speed policy and420390 opponent pacing with actual431520 steering and full numeric/route helper closure. No mocked game calls, no original process execution. Synthetic mapped native records include all point-direction combinations, open/cyclic endpoints, special target cancellation, signed squared-distance overflow paths, high-speed skip, mode4 override, first-wheel metadata, signed speed boundaries, opponent-mask selection, exact pacing thresholds, preexisting controls and steering suppression. Compares full body, target, group/point, wheel metadata, progression and session records plus the parent live target vector. Constructor/AI strategic policy and outer dispatcher remain separate requirements.', evidence: evidence.map(item => item.evidence_id), instructions: instructions.length, fixtures, perEntryFixtures: fixtures / entries.length, active, special, targetChanges, throttle, brake, steering, instructionSteps, matched: true};
await writeFile('analysis/autonomous-route-control-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));


import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {planAutonomousRoute} from '../src/autonomous-route-planner.mjs';
const own = await readInstructionEvidence(['345-autonomous-candidate-plan-assembly.json', '348-autonomous-candidate-reset-assembly.json', '382-profile-434960-assembly.json', '352-autonomous-candidate-selection-pass-assembly.json', '378-autonomous-candidate-route-cost-alt-assembly.json', '220-autonomous-route-nearest-assembly.json', '226-autonomous-point-passed-assembly.json', '211-autonomous-next-point-assembly.json', '229-autonomous-previous-point-assembly.json', '223-autonomous-vector-normalize-small-assembly.json', '224-autonomous-vector-normalize-large-assembly.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['220-wheel-drive-dot-assembly.json', '217-wheel-capacity-curve-assembly.json', '133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json']);
const evidence = [...own.evidence, ...math.evidence], instructions = [...own.instructions, ...math.instructions], machine = new BoundedX86(instructions);
const reply = JSON.parse(await readFile('analysis/native-simulation/results/520-candidate-bias-switch.json', 'utf8')), table = reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);
Buffer.from(table.normalized_result.bytes_hex, 'hex').copy(machine.bytes, Number(table.normalized_result.address));
const root = JSON.parse(await readFile('src/sqrt-table.json', 'utf8')); root.values.forEach((value, index) => machine.bytes.writeUInt16LE(value, 0x5eb290 + index * 2));
const BODY = 0x10000, OTHER = 0x14000, SHAPE = 0x18000, PACK = 0x20000, GROUPS = 0x21000, POINTS = 0x30000, SESSION = 0x40000, STACK = 0x9000, ROWS = 0x91f1e0;
const word = (bytes, address, value) => bytes.writeUInt16LE(value & 65535, address), put = (bytes, address, value) => bytes.writeInt32LE(value | 0, address);
const putVector = (bytes, address, values) => values.forEach((value, axis) => put(bytes, address + axis * 4, value));
let seed = 0x421430ab, instructionSteps = 0, calls = 0, specialTargets = 0, ordinaryTargets = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const names = ['4210b0', '420ba0', '420de0', '411e70', '4125a0', '492d80', '412270', '411fa0', '4126d0', '434f80', '434c60', '434800', '434550', '4352f0'];
const counts = [1, 2, 0, 0, 0, 0, 5, 4, 3, 0, 0, 0, 0, 0];
const fixtures = 1800;
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const bytes = machine.bytes;
  bytes.fill(0xa5, BODY, BODY + 0x800); bytes.fill(0x36, STACK - 0x1000, STACK + 64); bytes.fill(0x69, ROWS, ROWS + 1040); bytes.fill(0x7b, 0x6fb3a0, 0x6fb440);
  bytes.writeUInt32LE(PACK, 0x90b98c); bytes.writeUInt32LE(GROUPS, PACK + 0x60); bytes.writeUInt32LE(SESSION, 0x5ecb1c);
  bytes[SESSION + 0x54d] = 2; bytes[SESSION + 0x586] = fixture % 3; bytes[SESSION + 0x553] = fixture % 2;
  for (let group = 0; group < 4; group++) {
    const g = GROUPS + group * 12; word(bytes, g, 4); bytes[g + 2] = random(2); bytes[g + 4] = random(2); bytes[g + 5] = group; bytes.writeInt8(random(21) - 10, g + 6); bytes.writeUInt32LE(POINTS + group * 0x1000, g + 8);
    for (let index = 0; index < 4; index++) {const p = POINTS + group * 0x1000 + index * 16; for (let axis = 0; axis < 3; axis++) bytes.writeInt16LE(random(1001) - 500, p + axis * 2); bytes[p + 6] = [0, 20, 100, 255][random(4)]; bytes[p + 8] = random(256); bytes.writeUInt32LE((random(4) | random(4) << 5 | random(4) << 14 | random(4) << 19) >>> 0, p + 12);}
  }
  const group = 1 + random(3), pointIndex = random(4), lowest = [-1, 0, 15, 18, 19][fixture % 5];
  word(bytes, BODY + 0x65e, 0); word(bytes, BODY + 0x6c0, group); word(bytes, BODY + 0x6c2, pointIndex); word(bytes, BODY + 0x668, [0, 100, 101, 199, 200, 500, -1][fixture % 7]);
  bytes[BODY + 0x6f1] = fixture % 5; put(bytes, BODY + 0x6ec, random(0x1000)); put(bytes, BODY + 0x6f8, random(0x200000)); bytes[BODY + 0x6ca] = [0, 1, 31, 255][fixture % 4]; bytes[BODY + 0x6cb] = fixture % 5;
  bytes.writeUInt32LE(SHAPE, BODY + 0x10); word(bytes, SHAPE + 0x32, 16); put(bytes, BODY + 0x664, fixture % 4 ? 4 * 65536 : 0);
  putVector(bytes, BODY + 0x34, Array.from({length: 3}, () => random(200 * 65536) - 100 * 65536)); putVector(bytes, BODY + 0x68, Array.from({length: 3}, () => random(8 * 65536) - 4 * 65536));
  for (let index = 0; index < 2; index++) {const record = 0x909300 + index * 0x30c; bytes.writeUInt32LE(index ? OTHER : BODY, record); bytes[record + 0x1c] = index; put(bytes, record + 0x24, index * -100);}
  bytes.writeUInt32LE([0, 349, 350, 351, 0xffffffff][fixture % 5], 0x90a548);
  for (let index = 0; index < 20; index++) {for (let axis = 0; axis < 3; axis++) bytes.writeInt16LE(random(1000) - 500, 0x91f600 + index * 8 + axis * 2); bytes[0x91f1c0 + index] = random(32);}
  const source = Buffer.from(bytes), sourceLog = [], nativeLog = [];
  const invoke = (memory, log, id, ecx, edx, args, entry) => {
    const vectors = [];
    if (id === '420ba0') vectors.push(memory.subarray(edx, edx + 12).toString('hex'), memory.subarray(args[0], args[0] + 12).toString('hex'));
    if (id === '411fa0') vectors.push(memory.subarray(edx, edx + 6).toString('hex'), memory.subarray(args[0], args[0] + 6).toString('hex'));
    if (id === '4126d0') vectors.push(memory.subarray(ecx, ecx + 6).toString('hex'), memory.subarray(edx, edx + 6).toString('hex'));
    const meaningfulEdx = ['4210b0', '420ba0', '420de0', '492d80', '412270', '411fa0', '4126d0', '434f80', '434c60', '434800', '434550', '4352f0'].includes(id) ? edx : null;
    log.push([id, ecx, meaningfulEdx, args, entry, vectors]);
    if (id === '4210b0') {
      for (let index = 0; index < 20; index++) {
        const row = ROWS + index * 52; word(memory, row, index > lowest ? 1 + (index + fixture) % 3 : 0); memory[row + 2] = (index + fixture) % 4;
        memory[row + 37] = index > lowest && (index + fixture) % 7 === 0 ? 1 + index % 5 : 0; if (memory[row + 37]) word(memory, row, 0);
        memory[row + 38] = (fixture + index) % 13 === 0 ? 1 : 0; memory[row + 39] = (index + fixture) % 2; memory[row + 36] = index % 2;
        put(memory, row + 28, (index + fixture) % 3 ? 59999 : 60000); put(memory, row + 44, (index * 17 + fixture) % 101 - 50); put(memory, row + 48, 0); word(memory, row + 42, index % 3 ? 0 : 0x80);
      }
      return lowest;
    }
    if (id === '492d80' && fixture % 11 === 0 && memory.readInt32LE(edx) >= 0) {
      const slot = memory.readInt32LE(edx), row = ROWS + slot * 52; word(memory, row, 0); memory[row + 2] = slot; memory[row + 37] = 2; memory[row + 38] = 0; put(memory, row + 44, 400); put(memory, edx, slot - 1);
    }
    if (['434f80', '434c60', '434550'].includes(id) && fixture % 17 === 0 && memory.readInt32LE(edx) >= 0) {
      const slot = memory.readInt32LE(edx), row = ROWS + slot * 52; word(memory, row, 0); memory[row + 2] = slot; memory[row + 37] = id === '434550' ? 5 : id === '434c60' ? 4 : 3; memory[row + 38] = 0; put(memory, row + 44, 500); put(memory, edx, slot - 1);
    }
    if (id === '420ba0') {const row = ROWS + ecx * 52; put(memory, row + 44, (memory.readInt32LE(row + 44) + ecx - 10) | 0);}
    if (id === '411fa0' || id === '4126d0' || id === '412270') return ((fixture + (id === '411fa0' ? memory.readInt16LE(args[0]) : id === '4126d0' ? memory.readInt16LE(edx) : args[0]) * 7) % 57) - 28;
    return 0;
  };
  const handlers = Object.fromEntries(names.map((id, index) => [`call${id}`, request => invoke(source, sourceLog, id, request.ecx, request.edx, request.args, request.scratchBase)]));
  for (let index = 0; index < names.length; index++) machine.externalCalls.set(Number(`0x${names[index]}`), m => {const args = Array.from({length: counts[index]}, (_, i) => bytes.readInt32LE(m.r.ESP + i * 4)); m.r.EAX = invoke(bytes, nativeLog, names[index], m.r.ECX >>> 0, m.r.EDX, args, m.r.ESP - 4);});
  planAutonomousRoute(BODY, {memory: source, scratchBase: STACK, handlers});
  machine.entry = 0x421430; machine.r.ECX = BODY; machine.r.ESP = STACK; bytes.writeUInt32LE(0xffffffff, STACK); instructionSteps += machine.run(); calls += nativeLog.length;
  try {
    assert.deepEqual(nativeLog, sourceLog, `contracts ${fixture}`);
    for (const [address, length] of [[BODY, 0x800], [OTHER, 0x800], [ROWS, 1040], [GROUPS, 48], [POINTS, 0x4000], [0x91f600, 160], [0x6fb3a0, 160], [SESSION, 0x600]]) assert.deepEqual(bytes.subarray(address, address + length), source.subarray(address, address + length), `state ${fixture}/${address.toString(16)}`);
  } catch (error) {console.error({fixture, lowest, group, pointIndex}); throw error;}
  if (source[BODY + 0x6c9]) specialTargets++; else ordinaryTargets++;
}
const report = {method: 'Complete693-instruction421430 parent with actual4209d0 reset,434960 nearest competitor,491740 route walk,420a90 linked extra-score,420f90 entry bias and normalization math. Fourteen named game-owned candidate/cost/modifier handlers are state-mutating boundary fixtures; these remain feature gaps until bound to their separately recovered algorithms. Checks argument/entry-stack contracts and live short/Q16 vectors, entire bodies/candidate/route/session/forecast/target storage, wrapped scoring, flags, prediction caches and final special/ordinary target writes. No original process execution.', evidence: [...evidence, table].map(item => item.evidence_id), instructions: instructions.length, fixtures, calls, specialTargets, ordinaryTargets, instructionSteps, matched: true};
await writeFile('analysis/autonomous-route-planner-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {canReachAutonomousRoute, enqueueAutonomousRoute, updateAutonomousRouteConsistency} from '../src/autonomous-route-connectivity.mjs';
const {evidence, instructions} = await readInstructionEvidence(['341-autonomous-route-consistency-assembly.json', '342-autonomous-common-plan-a-assembly.json', '343-autonomous-route-queue-assembly.json'], {directory: 'analysis/native-simulation/results'});
const machine = new BoundedX86(instructions); machine.externalCalls.set(0x568162, () => {});
const BODY = 0x10000, OTHER = 0x14000, PACK = 0x20000, GROUPS = 0x21000, POINTS = 0x30000, STACK = 0x9000, RECORD = 0x909300;
let seed = 0x47fc90ab, instructionSteps = 0, reached = 0, failed = 0, resets = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const fixtures = 6000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const bytes = machine.bytes;
  bytes.fill(0xa5, STACK - 512, STACK + 32); bytes.fill(0x69, BODY, BODY + 0x800); bytes.fill(0x7b, OTHER, OTHER + 0x800);
  bytes.fill(0x36, 0x80df20, 0x80df88); bytes.writeUInt16LE(random(20), 0x6e6cc0); bytes.writeUInt16LE(random(20), 0x6e6cc4);
  bytes.writeUInt32LE(PACK, 0x90b98c); bytes.writeUInt32LE(GROUPS, PACK + 0x60);
  for (let group = 0; group < 32; group++) {
    bytes.writeUInt16LE(4, GROUPS + group * 12); bytes[GROUPS + group * 12 + 5] = group; bytes.writeUInt32LE(POINTS + group * 64, GROUPS + group * 12 + 8);
    for (let point = 0; point < 4; point++) {
      const first = fixture % 5 === 0 ? group < 30 ? group + 1 : 0 : random(32), second = fixture % 5 === 0 ? 0 : random(32);
      const links = first | random(4) << 5 | second << 14 | random(4) << 19;
      bytes.writeUInt32LE(links >>> 0, POINTS + group * 64 + point * 16 + 12);
    }
  }
  const target = random(32), sourceGroup = random(32), index = random(4), entry = [0x47fc90, 0x47fc20, 0x491330][fixture % 3];
  bytes.writeUInt16LE(0, BODY + 0x65e); bytes.writeUInt16LE(target, BODY + 0x6c0); bytes[BODY + 0x6d8] = [0, 59, 60, 61, 254, 255][random(6)];
  bytes.writeUInt32LE(fixture % 2 ? BODY : OTHER, RECORD); bytes.writeUInt32LE(GROUPS + sourceGroup * 12, RECORD + 0x54); bytes.writeUInt32LE(index, RECORD + 0x58);
  const memory = Buffer.from(bytes), options = {memory, scratchBase: STACK}; let expected, ecx, edx, args;
  if (entry === 0x47fc90) {expected = canReachAutonomousRoute(target, sourceGroup, index, options); ecx = target; edx = sourceGroup; args = [index]; if (expected) reached++; else failed++;}
  else if (entry === 0x47fc20) {updateAutonomousRouteConsistency(BODY, options); ecx = BODY; edx = 0; args = []; if (memory.readUInt16LE(OTHER + 0x6c0) !== bytes.readUInt16LE(OTHER + 0x6c0) || memory.readUInt16LE(BODY + 0x6c0) !== target) resets++;}
  else {enqueueAutonomousRoute(target, index, options); ecx = target; edx = index; args = [];}
  machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = STACK; bytes.writeUInt32LE(0xffffffff, STACK); args.forEach((value, index) => bytes.writeUInt32LE(value, STACK + 4 + index * 4));
  instructionSteps += machine.run();
  try {
    if (expected !== undefined) assert.equal(machine.r.EAX, expected, `return ${fixture}`);
    for (const [address, length] of [[BODY, 0x800], [OTHER, 0x800], [GROUPS, 384], [POINTS, 2048], [RECORD, 0x30c], [0x80df20, 104], [0x6e6cc0, 8]]) assert.deepEqual(bytes.subarray(address, address + length), memory.subarray(address, address + length), `state ${fixture}/0x${address.toString(16)}`);
    const graphStack = entry === 0x47fc90 ? STACK : STACK - 16;
    if (entry !== 0x491330) {
      //Only compare initialized visited storage when the native routine reached
      //its initialization; early direct links legitimately leave it untouched.
      const links = memory.readUInt32LE(POINTS + sourceGroup * 64 + index * 16 + 12);
      if (target !== sourceGroup && target !== (links & 31) && target !== ((links >>> 14) & 31)) assert.deepEqual(bytes.subarray(graphStack - 132, graphStack - 4), memory.subarray(graphStack - 132, graphStack - 4), `visited ${fixture}`);
    }
  } catch (error) {console.error({fixture, entry: entry.toString(16), target, sourceGroup, index}); throw error;}
}
const report = {method: 'Complete47fc90 packed-link reachability,491330 twenty-slot queue and47fc20 route-consistency fallback. Actual game-owned callees execute, only compiler cookie validation is inert. Synthetic32-group/4-point graphs include cycles, chains, disconnected and duplicate links, queue wrap/full/stale contents, direct early returns, exact60-failure byte thresholds, byte wrap and distinct input/registered bodies. Full body/group/point/record/ring/global bytes and initialized visited scratch agree. No original process execution or optimal branch selection claim.', evidence: evidence.map(item => item.evidence_id), instructions: instructions.length, fixtures, reached, failed, resets, instructionSteps, matched: true};
await writeFile('analysis/autonomous-route-connectivity-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

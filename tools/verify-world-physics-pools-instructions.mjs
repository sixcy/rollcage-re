import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeRawBodyArena, initializeRawCollisionPool, initializeRawShapePools} from '../src/world-physics-pools.mjs';
const {instructions, evidence} = await readInstructionEvidence(['797-world-shape-pool-initialize-assembly.json', '800-world-collision-initialize-assembly.json', '802-world-body-arena-initialize-assembly.json'], {directory: 'analysis/native-simulation/results'});
const constants = JSON.parse(await readFile('analysis/native-simulation/results/803-world-collision-index-constants.json', 'utf8')).structuredContent;
const machine = new BoundedX86(instructions), memory = Buffer.alloc(0xa00000), MALLOC = 0x5a000;
let instructionSteps = 0, mallocCalls = 0, memsetCalls = 0, arenaFailures = 0;
const sizes = [0x28a0, 0x194, 0x190, 0x4800, 0x300, 0x8000, 0x180, 0x2108], entryCounts = {}, fixtures = 3000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); machine.reset(); memory.fill(0x93, 0x902ba0, 0x902ef0); memory.fill(0x69, 0x100000, 0x700000); memory.fill(0x36, 0x8000, 0x9100); memory.writeUInt32LE(MALLOC, 0x56e258);
  Buffer.from(constants.normalized_result.bytes_hex, 'hex').copy(memory, 0x5dcc60);
  if (fixture % 7 === 0) [-2, 5, -8, 13].forEach((value, index) => memory.writeInt32LE(value, 0x5dcc60 + index * 4));
  const mode = fixture % 3, entry = [0x474160, 0x440410, 0x428100][mode], extra = [0, 1, 2, 32767, -1, -139999, -140000][Math.floor(fixture / 3) % 7], failed = mode === 0 && fixture % 11 === 0;
  memory.writeInt32LE(extra, 0x709808); entryCounts[entry.toString(16)] = (entryCounts[entry.toString(16)] ?? 0) + 1;
  memory.copy(machine.bytes);
  const makeAllocator = log => {let index = 0; return size => {const expected = mode === 0 ? ((extra + 140000) << 5) >>> 0 : sizes[index]; assert.equal(size, expected); log.push(size); const address = mode === 0 ? failed ? 0 : 0x100000 + fixture % 128 : 0x100000 + index * 0x10000 + fixture % 16; index++; return address;};};
  const sourceLog = [], nativeLog = [], allocate = makeAllocator(sourceLog), context = {memory, allocate};
  if (mode === 0) {initializeRawBodyArena(context); arenaFailures += failed;} else if (mode === 1) initializeRawCollisionPool(context); else initializeRawShapePools(context);
  const nativeAllocate = makeAllocator(nativeLog);
  machine.externalCalls.set(MALLOC, m => {m.r.EAX = nativeAllocate(m.bytes.readUInt32LE(m.r.ESP)); mallocCalls++;});
  machine.externalCalls.set(0x568a50, m => {const destination = m.bytes.readUInt32LE(m.r.ESP), value = m.bytes.readUInt32LE(m.r.ESP + 4), size = m.bytes.readUInt32LE(m.r.ESP + 8); assert.equal(value, 0); assert.ok(size <= 0x600000); m.bytes.fill(0, destination, destination + size); m.r.EAX = destination; memsetCalls++;});
  machine.entry = entry; machine.r.ESP = 0x9000; machine.bytes.writeUInt32LE(0xffffffff, 0x9000); instructionSteps += machine.run();
  assert.deepEqual(nativeLog, sourceLog);
  for (const [address, length] of [[0x100000, 0x600000], [0x902ba0, 0x350], [0x6e6b40, 4], [0x91e780, 32]]) if (!machine.bytes.subarray(address, address + length).equals(memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, index) => value !== memory[address + index]); assert.fail(`fixture${fixture}/entry${entry.toString(16)}/0x${(address + offset).toString(16)} native${machine.bytes[address + offset]} JS${memory[address + offset]}`);}
}
const report = {method: 'Complete474160 body arena allocation/alignment,440410 collision event pool and428100 complete shape/free-active-reverse/physical-list/group initialization with actual440410 child. Ordinary CRTmalloc/memset services only. Synthetic successful mapped pool allocations; arena failure and zero-size allocation branches; live integer-vector constant variations. Full allocation bytes/global fields and exact service size/order compared. No original process execution.', evidence: evidence.map(item => item.evidence_id).concat(constants.evidence_id), instructions: instructions.length, fixtures, entryCounts, instructionSteps, mallocCalls, memsetCalls, arenaFailures, matched: true};
await writeFile('analysis/world-physics-pools-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

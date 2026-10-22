import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createDynamicLightFixture, lightAddresses} from './verify-dynamic-light-state-instructions.mjs';
import {updateTrackDeformation, spatialBucketContainsSector} from '../src/track-deformation.mjs';

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
export function createTrackDeformationFixture(fixture) {
  const runtime = createDynamicLightFixture(fixture), {memory} = runtime, a = lightAddresses;
  const records = 0x30000, handle = 0x32000, session = 0x34000;
  put(memory, 0x5ecb1c, session); memory[session + 0x54d] = fixture % 7;
  put(memory, 0x80df00, [-1, 0, 1, 3][fixture % 4]); put(memory, 0x80df04, records);
  memory[0x91ce90] = fixture % 3 === 0 ? 2 : 0;
  for (let index = 0; index < 6; index++) put(memory, 0x909318 + index * 0x30c, fixture % 13 === 0 ? 0x12345678 : handle);
  put(memory, handle, 0x35000); put(memory, 0x35034, (fixture % 5 - 2) << 24); put(memory, 0x35038, 0); put(memory, 0x3503c, (fixture % 7 - 3) << 24);
  //Three variable-size range records. Matching the last record must still
  //precede its terminating-bit test; arbitrary Redux packed-link masks do not
  //describe this table.
  word(memory, a.buckets + 4, 16);
  const range = a.ranges + 32;
  word(memory, range, 4 << 11); word(memory, range + 2, 1 << 1);
  word(memory, range + 8, 7 << 11); word(memory, range + 10, 2 << 1);
  word(memory, range + 18, 0); word(memory, range + 20, (3 << 1) | 1);
  for (let index = 0; index < 3; index++) {
    const record = records + index * 28, width = [0, 1, 2, 5, 9][(fixture + index) % 5], height = [0, 1, 2, 3, 5][(fixture + index * 3) % 5];
    word(memory, record, [1, 2, 3, 7, 128][(fixture + index) % 5]); word(memory, record + 2, [0, 63, 64, 255, 511, 2046, 2047, 2048, 65535][(fixture + index) % 9]);
    word(memory, record + 4, width); word(memory, record + 6, height); word(memory, record + 10, fixture % 4);
    put(memory, record + 12, 0x10000 + index * 0x3000); put(memory, record + 16, 0x20000 + index * 0x3000);
    word(memory, record + 20, [0, 1, -1, 512, -32768, 32767][(fixture + index) % 6]); word(memory, record + 24, [0, 65535, 8192, 32767][(fixture + index) % 4]);
    for (let lane = 0; lane < 0x2000; lane += 2) {word(memory, 0x10000 + index * 0x3000 + lane, fixture * 19 + lane * 31); word(memory, 0x20000 + index * 0x3000 + lane, fixture * 23 - lane * 17);}
  }
  const alias = fixture % 17;
  if (alias === 0) put(memory, records + 16, memory.readUInt32LE(records + 12));
  if (alias === 1) {put(memory, records + 12, records - 4); word(memory, records + 4, 1); word(memory, records + 6, 1);}
  if (alias === 2) put(memory, records + 12, 0x5ed02c);
  if (alias === 3) put(memory, records + 16, 0x80f41c);
  const dirtyCount = [0, 1, 63, 64, 65][fixture % 5]; put(memory, 0x80f210, dirtyCount);
  if (dirtyCount) put(memory, 0x80f41c + dirtyCount * 4, ((memory.readUInt16LE(records + 6) & 2047) << 18) | 0x40000000 | (memory.readUInt16LE(records) & 127));
  return {...runtime, records, position: 0x35034};
}

export async function verifyTrackDeformation({fixtures = 5000, output = 'analysis/track-deformation-instruction-check.json'} = {}) {
  const {instructions, evidence} = await readInstructionEvidence(['1321-race-track-animation-assembly.json', '1324-track-animation-nearby-assembly.json', '665-retirement-4286e0-assembly.json', '669-retirement-4746f0-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const machine = new BoundedX86(instructions), visits = new Map(), watched = new Set([0x494f60, 0x4176b0, 0x4286e0, 0x4746f0]);
  machine.onInstruction = address => {if (watched.has(address)) visits.set(address, (visits.get(address) ?? 0) + 1);};
  let steps = 0, calls = 0, changedPhases = 0, aliasFixtures = 0;
  const ranges = [[0x10000, 0x30000], [0x80df00, 8], [0x80f210, 4], [0x80f420, 260], [0x5ed02c, 646], [0x909300, 6 * 0x30c]];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const runtime = createTrackDeformationFixture(fixture), before = runtime.memory.readUInt16LE(runtime.records + 2);
    machine.reset(); runtime.memory.copy(machine.bytes);
    for (let tick = 0; tick < 3; tick++) {
      updateTrackDeformation(runtime); machine.entry = 0x494f60; machine.r.ESP = runtime.scratchBase; put(machine.bytes, runtime.scratchBase, -1);
      try {steps += machine.run(1_000_000); for (const [address, length] of ranges) if (!machine.bytes.subarray(address, address + length).equals(runtime.memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, i) => value !== runtime.memory[address + i]); assert.fail(`fixture${fixture}/tick${tick} byte0x${(address + offset).toString(16)} native${machine.bytes[address + offset]} source${runtime.memory[address + offset]}`);}} catch (error) {console.error({fixture, tick}); throw error;}
      calls++;
    }
    if (runtime.memory.readUInt16LE(runtime.records + 2) !== before) changedPhases++;
    if (fixture % 17 < 4) aliasFixtures++;
    //Independent direct helper call checks both true and false sector IDs,
    //including a hit on the terminating range record.
    const sector = [1, 2, 3, 7, 128][fixture % 5], expected = spatialBucketContainsSector(sector, runtime.position, runtime);
    machine.entry = 0x4176b0; machine.r.ECX = sector; machine.r.EDX = runtime.position; machine.r.ESP = runtime.scratchBase; put(machine.bytes, runtime.scratchBase, -1); steps += machine.run(); assert.equal(machine.r.EAX, expected); calls++;
  }
  const report = {method: 'Complete494f60 terrain-deformation parent plus actual4176b0 sector eligibility and4286e0/4746f0 spatial lookup. Three persistent parent updates plus one direct helper per fixture; no game/library mocks. Full native vertex/border/record/phase/dirty/yaw/participant storage compared, including first-participant handle reuse, phase boundaries, zero dimensions, signed amplitudes, variable terrain-chain skips, last-record matches, dirty capacity/duplicate policy and declared vertex/border/record/table aliases. Native private saved-register stack bytes and upstream construction remain outside these synthetic memory inputs; no original-process or rendered result claim.', evidence: evidence.map(item => item.evidence_id), instructions: instructions.length, fixtures, calls, changedPhases, aliasFixtures, instructionSteps: steps, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyTrackDeformation()));

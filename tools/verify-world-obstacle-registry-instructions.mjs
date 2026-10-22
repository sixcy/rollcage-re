import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {buildAutonomousObstaclePolygons, appendLoadedWorldObstacle} from '../src/world-obstacle-registry.mjs';

const evidence = await readInstructionEvidence(['730-world-obstacle-update-assembly.json'], {directory: 'analysis/native-simulation/results'}), machine = new BoundedX86(evidence.instructions), memory = Buffer.alloc(0xa00000);
let seed = 0x4123a0ab, instructionSteps = 0, selectedPolygons = 0, cappedFixtures = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const fixtures = 4000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); machine.reset(); memory.fill(0x93, 0x6f95a0, 0x6f96a0); memory.fill(0x69, 0x920b40, 0x920b40 + 8 * 12);
  const count = fixture % 9; memory.writeUInt32LE(count, 0x6e6514); memory.writeUInt32LE(0xdeadbeef, 0x6e6520);
  for (let index = 0; index < 8; index++) {
    const model = 0x20000 + index * 0x1000, vertices = 0x30000 + index * 0x1000, faces = 0x40000 + index * 0x1000, object = 0x50000 + index * 0x1000, metadata = 0x60000 + index * 0x1000;
    memory.writeUInt32LE(object, 0x920b40 + index * 12); memory.writeUInt32LE(model, object + 0x10); memory.writeUInt32LE(vertices, object + 0x24); memory.writeUInt32LE(faces, object + 0x28); memory.writeUInt32LE(metadata, object + 0x194);
    const vertexCount = fixture % 17 === 0 ? 0 : 1 + random(8), polygonCount = fixture % 23 === 0 ? 20 : random(21);
    memory[object + 0x10d] = vertexCount; memory[model + 0x27] = polygonCount; memory.writeUInt16LE(0x100, model + 0x34);
    for (let vertex = 0; vertex < 8; vertex++) memory.writeInt16LE(fixture % 23 === 0 ? 100 : [-128, -25, -1, 0, 1, 24, 25, 50, 100][random(9)], vertices + vertex * 8 + 2);
    for (let polygon = 0; polygon < polygonCount; polygon++) {
      const descriptor = model + 0x100 + polygon * 20, start = fixture % 23 === 0 ? 0 : random(9), end = fixture % 23 === 0 ? 1 : random(9);
      memory[descriptor + 8] = start; memory[descriptor + 9] = end; memory[metadata + polygon * 4 + 3] = fixture % 23 === 0 ? 0 : random(16);
    }
    for (let face = 0; face < 8; face++) {
      const packed = fixture % 23 === 0 ? 0x01010101 : ((random(vertexCount + 1) | random(vertexCount + 1) << 8 | random(vertexCount + 1) << 16 | random(vertexCount + 1) << 24) >>> 0);
      memory.writeUInt32LE(packed, faces + face * 8);
    }
  }
  const ranges = [[0x20000, 0x48000], [0x6e6514, 16], [0x6f95a0, 0x100], [0x920b40, 8 * 12]];
  for (const [address, length] of ranges) memory.copy(machine.bytes, address, address, address + length);
  buildAutonomousObstaclePolygons({memory}); machine.entry = 0x4123a0; machine.r.ESP = 0x9000; machine.bytes.writeUInt32LE(0xffffffff, 0x9000); instructionSteps += machine.run();
  for (const [address, length] of ranges) assert.deepEqual(machine.bytes.subarray(address, address + length), memory.subarray(address, address + length), `fixture ${fixture}/${address.toString(16)}`);
  const selected = memory.readUInt32LE(0x6e6520); assert(selected <= 60); selectedPolygons += selected; if (selected === 60) cappedFixtures++;
}
const loader = await readInstructionEvidence(['732-world-resource-loader-assembly.json'], {directory: 'analysis/native-simulation/results'});
const appendInstructions = loader.instructions.filter(item => item.address >= 0x44cf99 && item.address <= 0x44cfbd), appendMachine = new BoundedX86([...appendInstructions, loader.instructions.find(item => item.address === 0x44d0b3)], {entry: 0x44cf99});
let appendSteps = 0, appended = 0;
const appendFixtures = 2000;
appendMachine.onInstruction = address => {if (address === 0x44d0b3) throw Error('Reached retained append segment exit.'); appendSteps++;};
for (let fixture = 0; fixture < appendFixtures; fixture++) {
  appendMachine.reset();
  memory.fill(0x69, 0x920b40, 0x920b40 + 512 * 12); memory.writeUInt32LE(fixture % 512, 0x6e6514); memory[0x10000 + 0x19a] = fixture % 4;
  for (const [address, length] of [[0x10000, 512], [0x6e6514, 4], [0x920b40, 512 * 12]]) memory.copy(appendMachine.bytes, address, address, address + length);
  appendLoadedWorldObstacle(0x10000, {memory}); appended += fixture % 4 === 0;
  appendMachine.r.EBP = 0x10000; appendMachine.r.ESP = 0x9000; appendMachine.bytes.writeUInt32LE(0xffffffff, 0x9000);
  assert.throws(() => appendMachine.run(), /^Error: At 0x44d0b3: Reached retained append segment exit\.$/);
  assert.deepEqual(appendMachine.bytes.subarray(0x920b40, 0x920b40 + 512 * 12), memory.subarray(0x920b40, 0x920b40 + 512 * 12)); assert.equal(appendMachine.bytes.readUInt32LE(0x6e6514), memory.readUInt32LE(0x6e6514));
}
const report = {method: 'Complete4123a0 obstacle polygon subset producer, no calls or arithmetic stubs. Full models/vertices/packed faces/metadata/objects, input12-byte registry,60-entry output pointer pool plusstale tail and globals compared. Synthetic0..8 objects,0..20 polygons/0..8 vertices,negative/all-zero/positive maximum height,strict highest-minus24 test,classification4 skips,empty/inverted face ranges,multi-byte vertex IDs and global60-pointer cap. Separately compares actual44cf99..44cfbd loader append SEGMENT stopping at44d0b3:category byte19a0..3,count0..511,stale12-byte row tails;does not execute surrounding44c2b0 or48ab50. No original process execution.', evidence: [...evidence.evidence, ...loader.evidence].map(item => item.evidence_id), instructions: evidence.instructions.length, fixtures, selectedPolygons, cappedFixtures, instructionSteps, appendInstructions: appendInstructions.length, appendFixtures, appended, appendSteps, matched: true};
await writeFile('analysis/world-obstacle-registry-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

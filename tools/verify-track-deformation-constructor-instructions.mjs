import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createDynamicLightFixture} from './verify-dynamic-light-state-instructions.mjs';
import {initializeTrackDeformation, updateTrackDeformation} from '../src/track-deformation.mjs';

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
export function createTrackDeformationConstructorFixture(fixture) {
  const runtime = createDynamicLightFixture(fixture), {memory} = runtime, pack = 0x36000, sectors = 0x37000, colors = 0x400000;
  put(memory, 0x90b98c, pack); put(memory, pack, sectors); put(memory, pack + 16, fixture % 5);
  put(memory, 0x909240, sectors); put(memory, 0x909270, colors); memory[0x91ce90] = 2;
  memory.writeFloatLE(1, 0x5dc774); memory.writeFloatLE(4096, 0x5dca88);
  for (let index = 0; index < 4; index++) {
    const segment = 0x38000 + index * 0x100, columns = (fixture + index) % 8 + 1, rows = (fixture + index * 3) % 6, vertices = 0x10000 + index * 0x4000;
    put(memory, sectors + index * 4, segment); word(memory, segment + 6, ((fixture + index) % (columns + 1)) | (fixture % 2 ? 64 : 0));
    put(memory, segment + 8, columns); put(memory, segment + 12, rows); put(memory, segment + 32, vertices);
    for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
      const vertex = vertices + (row * (columns + 1) + column) * 8;
      word(memory, vertex, (column * (fixture % 7 - 3) * 500) - 1000); word(memory, vertex + 2, fixture * 7 + row * 60 + column * 400); word(memory, vertex + 4, row * 256 + column * (fixture % 9 - 4) * 300); word(memory, vertex + 6, fixture % 4 === 0 ? 0 : column * 64);
    }
  }
  for (let offset = 0; offset < 0x1000; offset++) memory[colors + offset] = (fixture + offset * 23) & 255;
  return {...runtime, roundingMode: ['nearest-even', 'toward-zero', 'down', 'up'][fixture % 4], pack, sectors, colors};
}

export async function verifyTrackDeformationConstructor({fixtures = 1200, output = 'analysis/track-deformation-constructor-instruction-check.json'} = {}) {
  const own = await readInstructionEvidence(['1329-track-animation-constructor-assembly.json', '1321-race-track-animation-assembly.json', '1324-track-animation-nearby-assembly.json', '665-retirement-4286e0-assembly.json', '669-retirement-4746f0-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const normalization = await readInstructionEvidence(['378-contact-normalize-assembly.json']);
  const constants = await Promise.all(['1184-final-feedback-one.json', '1333-track-normalization-scale.json'].map(async name => JSON.parse(await readFile(`analysis/native-simulation/results/${name}`, 'utf8')).structuredContent));
  for (const [index, value] of [1, 4096].entries()) assert.equal(Buffer.from(constants[index].normalized_result.bytes_hex, 'hex').readFloatLE(), value);
  const instructions = [...own.instructions, ...normalization.instructions], machine = new BoundedX86(instructions), visits = new Map();
  machine.onInstruction = address => {if ([0x494c80, 0x494f60, 0x422c70].includes(address)) visits.set(address, (visits.get(address) ?? 0) + 1);};
  let steps = 0, allocations = 0, constructed = 0, frames = 0, allocatorMutations = 0;
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const source = createTrackDeformationConstructorFixture(fixture), sourceLog = [], nativeLog = [], allocation = 0x30000;
    const allocate = (memory, log, size) => {
      log.push(['allocate', size]);
      if (fixture % 29 === 0) {put(memory, source.pack + 16, 0); put(memory, 0x80df00, 0);}
      return allocation;
    };
    const context = {...source, handlers: {allocate: size => allocate(source.memory, sourceLog, size)}};
    machine.reset(); source.memory.copy(machine.bytes); machine.fpuRounding = source.roundingMode;
    put(machine.bytes, 0x56e258, 0x720000);
    machine.externalCalls.set(0x720000, m => {m.r.EAX = allocate(m.bytes, nativeLog, m.bytes.readUInt32LE(m.r.ESP));});
    machine.externalCalls.set(0x568a50, m => {const address = m.bytes.readUInt32LE(m.r.ESP), value = m.bytes.readInt32LE(m.r.ESP + 4), size = m.bytes.readUInt32LE(m.r.ESP + 8); m.bytes.fill(value & 255, address, address + size); m.r.EAX = address;});
    initializeTrackDeformation(context); machine.entry = 0x494c80; machine.r.ESP = source.scratchBase; put(machine.bytes, source.scratchBase, -1);
    const ranges = [[0x10000, 0x28000], [0x80df00, 8], [0x80f210, 4], [0x80f420, 260], [source.colors, 0x1000], [0x5ed030, 642], [0x91d45c, 8]];
    const compare = stage => {assert.deepEqual(nativeLog, sourceLog); for (const [address, length] of ranges) if (!machine.bytes.subarray(address, address + length).equals(source.memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, i) => value !== source.memory[address + i]); assert.fail(`fixture${fixture}/${stage} byte0x${(address + offset).toString(16)} native${machine.bytes[address + offset]} source${source.memory[address + offset]}`);}};
    try {
      steps += machine.run(1_000_000); compare('constructor');
      const initialGeometry = fixture === 3 ? Buffer.from(source.memory.subarray(0x10000, 0x20000)) : null;
      for (let tick = 0; tick < (fixture === 3 ? 2056 : 8); tick++) {
        updateTrackDeformation(context); machine.entry = 0x494f60; machine.r.ESP = source.scratchBase; put(machine.bytes, source.scratchBase, -1); steps += machine.run(1_000_000); compare(`tick${tick}`); frames++;
        if (tick === 2047) {
          for (let row = 0; row < source.memory.readUInt32LE(0x80df00); row++) assert.equal(source.memory.readUInt16LE(allocation + row * 28 + 2), 0);
          for (let offset = 0; offset < initialGeometry.length; offset += 8) assert.deepEqual(source.memory.subarray(0x10000 + offset, 0x10006 + offset), initialGeometry.subarray(offset, offset + 6), `full-cycle XYZ${offset}`);
        }
      }
    } catch (error) {console.error({fixture, sourceLog, nativeLog, roundingMode: source.roundingMode}); throw error;}
    allocations += sourceLog.length; constructed += source.memory.readUInt32LE(0x80df00); if (fixture % 29 === 0 && sourceLog.length) allocatorMutations++;
  }
  const report = {method: 'Actual494c80 native track-deformation constructor, malloc/memset explicit library services, actual422c70 normalization and494f60 update plus spatial/terrain helpers. Eight persistent updates follow every constructed segment set; one2056-frame scenario additionally checks a complete2048-phase cycle and exact return of XYZ to constructed values before continuing. Explicit allocator mutation cases preserve captured count/base on the post-allocation empty-sector jump; this is a service contract fixture, not observedCRT behavior. No game mocks or fixture-filled runtime deformation rows. Full geometry/runtime rows/palette/phase/dirty/yaw/reduction globals compare under all four declared x87 conversion modes. Original normalization constants independently asserted against exact retained byte reads. Authored primary-segment/runtime-pack publication remains a supplied producer input; original scene loader47ea40 and rendered results remain open.', evidence: [...own.evidence, ...normalization.evidence, ...constants].map(item => item.evidence_id), instructions: instructions.length, fixtures, allocations, allocatorMutations, constructedRecords: constructed, frames, fullCycleScenarios: fixtures > 3 ? 1 : 0, instructionSteps: steps, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyTrackDeformationConstructor()));

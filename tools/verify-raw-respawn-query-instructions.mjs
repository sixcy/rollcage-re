import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createSimulationRuntimeFixture} from './lib/simulation-runtime-fixtures.mjs';
import {queryRawRespawnPlacement} from '../src/raw-respawn-query.mjs';

export async function verifyRawRespawnQuery({fixtures = 192, output = 'analysis/raw-respawn-query-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), calls = new Map();
  let instructionSteps = 0, accepted = 0, over64Fixtures = 0, cloneArenaAliasFixtures = 0, queries = 0;
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX >>> 0, m.bytes.readUInt32LE(0x5e8890)));
  machine.onInstruction = address => {reached.add(address); if ([0x47d040, 0x47d710, 0x47d9c0, 0x429360, 0x429600, 0x4292a0, 0x422230, 0x422680, 0x424ff0, 0x423ab0, 0x429820, 0x492720, 0x4286e0].includes(address)) calls.set(address, (calls.get(address) ?? 0) + 1);};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const f = createSimulationRuntimeFixture(program, fixture + 1, {models: fixture % 3 !== 0, count: 1 + (fixture % 5 === 0 ? 1 : 0), extraBodyStorage: [{address: 0x70f130, length: 0x3e78}]}), {memory, views} = f, body = f.bodies[0].address;
    const STACK = 0x9000, position = 0x74000, quaternion = fixture % 3 ? 0 : 0x74020, rotation = body + 0xc4, outputAddress = 0x74040;
    let mode = [0, 1, 2, 3][fixture % 4];
    if (f.grid.sectors[0].columns === 12) for (const region of f.grid.regions) {
      region.rows = 6;
      memory.writeUInt16LE(region.columns << 12 | region.rows << 8 | region.padding, f.addresses.regions + region.index * 6 + 4);
    }
    if (fixture % 31 === 1) for (const region of f.grid.regions) {
      region.rows = 0;
      memory.writeUInt16LE(region.columns << 12 | region.padding, f.addresses.regions + region.index * 6 + 4);
    }
    memory.writeInt32LE(0x1800 | [3, 4, 7, 12, 17, 22, 21, 33][fixture % 8] | (fixture % 23 === 0 ? 0x200 : 0), body);
    const shapeCount = fixture % 17 === 1 ? 0 : 1 + Math.floor(fixture / 8) % 4, oldAggregate = memory[body + 0x141];
    if (!shapeCount && !mode) mode = 1;
    for (let index = 2; index <= shapeCount; index++) {
      const allocated = views.shapePool.allocate(); memory[body + 0x140 + index] = allocated.id;
      memory.copy(allocated.record, 0, memory.readUInt32LE(0x91e79c) + oldAggregate * 72, memory.readUInt32LE(0x91e79c) + oldAggregate * 72 + 72);
      allocated.record.writeInt16LE(index * 8, 0); allocated.record.writeInt16LE(index * -5, 4);
    }
    memory[body + 0x10c] = shapeCount;
    memory.writeUInt32LE(f.addresses.regions, memory.readUInt32LE(0x90b98c) + 0x80);
    if (fixture % 7 === 0) for (const instance of f.models.instances.values()) {
      const {object} = f.candidateMapping.modelPointersFor({...instance, shape: instance.collision.shapes[0]});
      memory[object + 0x19a] = 5; memory[object + 0x199] = fixture & 255;
      memory.writeInt32LE((fixture % 30 - 15) * 65536, object + 0x34);
    }
    if (fixture % 11 === 0) for (const instance of f.models.instances.values()) {
      const {object} = f.candidateMapping.modelPointersFor({...instance, shape: instance.collision.shapes[0]});
      memory[object + 0x19a] = 0; memory[object + 0x199] = (fixture * 13 + 17) & 255;
      memory.writeInt32LE((fixture % 18 - 9) * 65536, object + 0x34);
      memory[memory.readUInt32LE(object + 0x194) + 7] = 5;
    }
    for (let axis = 0; axis < 3; axis++) memory.writeInt32LE([fixture % 13 === 0 ? 10000 : 2, [-6, 0, 6, 30][Math.floor(fixture / 4) % 4], 2][axis] * 65536, position + axis * 4);
    if (quaternion) [65536, 1234, -2345, 3456].forEach((value, index) => memory.writeInt32LE(value, quaternion + index * 4));
    const runtime = {memory, views, grid: f.context.nativeTerrain.grid, models: f.models, modelPointersFor: f.candidateMapping.modelPointersFor, scratchBase: STACK, roundingMode: 'nearest-even'};
    machine.reset(); memory.copy(machine.bytes); machine.fpuRounding = 'nearest-even';
    for (let repeat = 0; repeat < (fixture % 8 === 0 || fixture % 31 === 1 ? 4 : 1); repeat++) {
    let returned;
    try {returned = queryRawRespawnPlacement(body, position, quaternion, rotation, mode, outputAddress, runtime);} catch (error) {console.error({fixture, mode, terrainCount: memory.readUInt16LE(0x70f28c), terrainBase: memory.readUInt32LE(0x70f284), shapeCount: memory.readInt8(0x70f23c), flags: memory.readInt32LE(0x70f130)}); throw error;}
    machine.entry = 0x47d040; machine.r.ESP = STACK; machine.r.ECX = body; machine.r.EDX = position; machine.bytes.writeInt32LE(-1, STACK);
    [quaternion, rotation, mode, outputAddress].forEach((value, index) => machine.bytes.writeInt32LE(value, STACK + 4 + index * 4));
    instructionSteps += machine.run(2000000); assert.equal(machine.r.EAX, returned, `fixture${fixture} accepted`);
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
    if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`fixture${fixture}/${repeat} diff0x${(offset + 0x10000).toString(16)} native=${native[offset]} source=${source[offset]}`);}
    accepted += returned;
    queries++;
    if (memory.readUInt16LE(0x70f28c) > 64) {over64Fixtures++; if (memory.readInt32LE(0x70f130) !== memory.readInt32LE(body)) cloneArenaAliasFixtures++;}
    }
  }
  const report = {method: 'Actual47d040 rawclone/shapeallocation/cache/spatial/uncapped47d9c0/models/47d710terrain+modelgeometry/free chain. All mapped memory>=10000h compares, includingcopycursor globals, temporaryshape records/allocator, retained candidate bytes, plane/border/math globals and72candidate privatearena overlap into theclone. Persistentfour-query cases retain private/native scratch and pool history. Synthetic explicit native/parsedmapping runtime; only compiler cookie external, no gamecalls mocked and no original process execution.', targetSha256: program.sha256, fixtures, queries, accepted, over64Fixtures, cloneArenaAliasFixtures, instructionSteps, executedInstructions: reached.size, calls: Object.fromEntries([...calls].map(([address, count]) => ['0x' + address.toString(16), count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRawRespawnQuery()));

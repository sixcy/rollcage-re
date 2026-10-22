import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {initializeSoloTerrainRuntime} from '../src/solo-terrain-runtime.mjs';
import {initializeBodyRetirementEffectTables} from '../src/body-retirement-effects.mjs';
import {constructCameraController, initializeCameraConstructionConstants} from '../src/camera-construction.mjs';
import {createTrackDeformationConstructorFixture} from '../tools/verify-track-deformation-constructor-instructions.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const installation = 'C:/Program Files (x86)/Psygnosis/Rollcage';

test('terrain composition retains empty ownership and rejects invalid native geometry', () => {
  const empty = createTrackDeformationConstructorFixture(0);
  const runtime = initializeSoloTerrainRuntime(empty);
  assert.deepEqual(runtime.snapshot.rows, []); assert.deepEqual(runtime.snapshot.segments, []);
  assert.throws(() => runtime.terrainVerticesFor(0), /sector index/);
  const invalid = createTrackDeformationConstructorFixture(1);
  put(invalid.memory, invalid.pack + 16, 257);
  assert.throws(() => initializeSoloTerrainRuntime(invalid), /sector count/);
  put(invalid.memory, invalid.pack + 16, 1);
  const sector = invalid.memory.readUInt32LE(invalid.sectors);
  put(invalid.memory, sector + 32, invalid.memory.length - 1);
  assert.throws(() => initializeSoloTerrainRuntime(invalid), /span/);
});

test('actual camera constructor publishes the unconditional animation gate and real controller identity', () => {
  const f = createTrackDeformationConstructorFixture(3), {memory} = f;
  // Coherent synthetic camera/pool/spatial storage. The tested flag is never
  // enabled directly:416180 publishes it after its real constructor children.
  memory[0x91ce90] = 0;
  f.handlers = {allocate: () => 0x30000};
  const terrain = initializeSoloTerrainRuntime(f), initial = terrain.snapshot;
  const sectors = initial.segments.map(segment => {
    const header = memory.readUInt32LE(f.sectors + segment.index * 4), packets = 0x70000 + segment.index * 0x1000;
    put(memory, header + 0x50, packets);
    return {...segment, flags: 1, cells: Array.from({length: segment.rows * segment.columns}, (_, index) => ({index, covered: true,
      vertexFlags: 0, rawNormalIndex: 0, forms: [{type: 0, normal: 0, point: null}]}))};
  });
  const parsed = {available: true, sectors, normals: Array.from({length: 4}, (_, index) => ({packed: index, components: [0, 0, 0]}))};
  const animatedColumn = (memory.readUInt32LE(initial.rows[0].address + 12) - terrain.terrainVerticesFor(0)) / 8;
  const affectedCell = animatedColumn - 1;
  const liveGrid = terrain.bindCollisionGrid(parsed), firstCell = liveGrid.sectors[0].cells[affectedCell];
  assert.deepEqual(firstCell.forms.map(form => form.type), [0]);
  const registeredCellRef = (1 << 16) | (animatedColumn << 8);
  memory.writeUInt16LE(0, 0x90929c);
  assert.equal(terrain.surfaceModeFor({registeredCellRef}), 1);
  const session = 0x50000, configuration = 0x52000, starts = 0x53000, control = 0x909060;
  put(memory, 0x5ecb1c, session); put(memory, 0x5ecefc, configuration); put(memory, 0x909288, starts);
  memory[session + 0x54d] = 1;
  put(memory, 0x909318, 0x12345678);
  terrain.step(); assert.deepEqual(terrain.snapshot, initial, 'The sentinel gate is respected.');
  initializeCameraConstructionConstants(memory);
  put(memory, 0x902eec, 0x100000); put(memory, 0x70dcf4, 0x60000);
  put(memory, 0x909254, 0x60000); put(memory, 0x909278, 0x65000);
  for (let row = 0; row < 256; row++) {
    memory.writeUInt16LE(0xff00, 0x60000 + row * 16);
    memory.writeUInt16LE(255, 0x60002 + row * 16);
    put(memory, 0x6000c + row * 16, 0x63000);
  }
  put(memory, 0x91e79c, 0x180000); put(memory, 0x91e780, 0x190000);
  put(memory, 0x91e78c, 0x190100); put(memory, 0x91e790, 0x190200);
  put(memory, 0x91e794, 255); put(memory, 0x91e784, -1); put(memory, 0x91e798, 0);
  put(memory, 0x902bc0, 0x1a0000); memory.writeUInt16LE(0, 0x902bc4);
  for (let index = 0; index < 256; index++) memory[0x190000 + index] = index;
  //47f02e publishes the controller before47f031 calls416180.
  put(memory, 0x909318, control);
  constructCameraController(0, 0x210000, control, {...f, scratchBase: 0x9000});
  const body = memory.readUInt32LE(control);
  assert.equal(body, 0x160000); assert.equal(memory.readUInt32LE(body), 0x804);
  assert.equal(memory.readUInt32LE(control + 4), 0x210000);
  assert.equal(memory.readUInt16LE(0x902bc4), 1);
  assert.equal(terrain.snapshot.animationUnconditional, true);
  terrain.step();
  assert.ok(terrain.snapshot.rows.every(row => row.phase === 1));
  assert.notDeepEqual(terrain.snapshot.segments, initial.segments);
  assert.deepEqual(firstCell.forms.map(form => form.type), [2, 3], '494f60 changes live collision triangulation.');
  assert.deepEqual(parsed.sectors[0].cells[affectedCell].forms.map(form => form.type), [0], 'The old parsed topology remains unchanged.');
  assert.equal(terrain.surfaceModeFor({registeredCellRef}), 2, '41c6c0 uses the newly published animated-surface code.');
  assert.equal(terrain.surfaceModeFor({registeredCellRef: -1}), 0);
  assert.throws(() => terrain.surfaceModeFor({registeredCellRef: -65536}), /grid/);
  memory.writeUInt16LE(2, 0x70002 + affectedCell * 8);
  assert.equal(firstCell.rawNormalIndex, 2);
  assert.deepEqual(firstCell.forms.map(form => form.normal), [2, 3], 'Packet normal changes remain live too.');
  assert.ok(initial.rows.every(row => row.phase === 0));
});

test('installed animated variants retain phase-zero geometry and native sentinel gating with exact instruction comparisons',
  {skip: !existsSync(`${installation}/IDXData/Rollcage.idx`)}, async () => {
    const own = await readInstructionEvidence(['1329-track-animation-constructor-assembly.json', '1321-race-track-animation-assembly.json'], {directory: 'analysis/native-simulation/results'});
    const normalization = await readInstructionEvidence(['378-contact-normalize-assembly.json']);
    const machine = new BoundedX86([...own.instructions, ...normalization.instructions], {fpuPrecisionBits: 24});
    const archive = await RollcageArchive.open(installation);
    try {
      for (const [resource, expectedRows] of [[36, 1], [56, 2], [64, 1], [76, 1], [96, 2], [104, 1]]) {
        const {data} = await archive.readResource(resource), original = Buffer.from(data), grid = parseCollisionGrid(data);
        const memory = Buffer.alloc(0xa00000), base = 0x100000, pack = 0x80000, allocation = 0x81000, stack = 0x9000;
        assert.ok(base + data.length < 0x7f0000);
        data.copy(memory, base);
        const sectors = base + data.readUInt32LE(0x14), colors = base + data.readUInt32LE(0x4c);
        for (const segment of grid.scene.segments) {
          put(memory, sectors + segment.index * 4, base + segment.offset);
          put(memory, base + segment.offset + 32, base + segment.verticesOffset);
          put(memory, base + segment.offset + 0x50, base + segment.packetsOffset);
        }
        put(memory, 0x90b98c, pack); put(memory, pack, sectors); put(memory, pack + 16, grid.scene.segments.length);
        put(memory, 0x909240, sectors); put(memory, 0x909270, colors);
        initializeBodyRetirementEffectTables(memory);
        memory.writeFloatLE(1, 0x5dc774); memory.writeFloatLE(4096, 0x5dca88);
        put(memory, 0x5ecb1c, 0x84000); memory[0x8454d] = 6;
        for (let index = 0; index < 6; index++) {memory[0x84000 + index] = 8; put(memory, 0x909318 + index * 0x30c, 0x12345678);}
        const allocations = [];
        const runtime = {memory, scratchBase: stack, roundingMode: 'nearest-even', handlers: {allocate: size => {allocations.push(size); return allocation;}}};
        put(memory, 0x56e258, 0x720000);
        machine.reset(); memory.copy(machine.bytes);
        machine.externalCalls.set(0x720000, m => {assert.equal(m.bytes.readUInt32LE(m.r.ESP), expectedRows * 28); m.r.EAX = allocation;});
        machine.externalCalls.set(0x568a50, m => {
          const address = m.bytes.readUInt32LE(m.r.ESP), value = m.bytes.readInt32LE(m.r.ESP + 4), length = m.bytes.readUInt32LE(m.r.ESP + 8);
          m.bytes.fill(value & 255, address, address + length); m.r.EAX = address;
        });
        const terrain = initializeSoloTerrainRuntime(runtime);
        machine.entry = 0x494c80; machine.r.ESP = stack; put(machine.bytes, stack, -1); machine.run(5_000_000);
        assert.deepEqual(allocations, [expectedRows * 28]);
        assert.deepEqual(memory.subarray(0x10000), machine.bytes.subarray(0x10000), `resource${resource}/constructor`);
        const initial = terrain.snapshot;
        assert.equal(initial.rows.length, expectedRows); assert.equal(initial.animationUnconditional, false);
        assert.ok(Object.isFrozen(initial)); assert.ok(Object.isFrozen(initial.rows)); assert.ok(Object.isFrozen(initial.segments));
        const raw = terrain.bindCollisionGrid(grid);
        for (const segment of initial.segments) {
          assert.ok(segment.vertices.some((vertex, index) => vertex.slice(0, 3).some((value, axis) => value !== grid.scene.segments[segment.index].vertices[index][axis])), 'Constructor changes authored terrain even with no animation gate.');
          assert.ok(Object.isFrozen(segment.vertices[0]));
          assert.deepEqual(Array.from(raw.sectors[segment.index].vertices[0]), segment.vertices[0].map((value, lane) => lane === 3 ? value << 16 >> 16 : value));
        }
        for (let tick = 0; tick < 8; tick++) {
          terrain.step(); machine.entry = 0x494f60; machine.r.ESP = stack; put(machine.bytes, stack, -1); machine.run(100000);
          assert.deepEqual(memory.subarray(0x10000), machine.bytes.subarray(0x10000), `resource${resource}/sentinelTick${tick}`);
          assert.deepEqual(terrain.snapshot, initial);
        }
        const segment = initial.segments[0], vertexAddress = terrain.terrainVerticesFor(segment.index);
        memory.writeInt16LE((memory.readInt16LE(vertexAddress + 2) + 1) << 16 >> 16, vertexAddress + 2);
        assert.equal(terrain.snapshot.segments[0].vertices[0][1], memory.readInt16LE(vertexAddress + 2));
        assert.equal(raw.sectors[segment.index].vertices[0][1], memory.readInt16LE(vertexAddress + 2));
        assert.notEqual(initial.segments[0].vertices[0][1], terrain.snapshot.segments[0].vertices[0][1], 'Old snapshots retain no writable native vertex aliases.');
        assert.deepEqual(data, original);
      }
    } finally {await archive.close();}
  });

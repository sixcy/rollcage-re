import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from '../tools/lib/simulation-runtime-fixtures.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {createRawTerrainGrid} from '../src/raw-terrain-query.mjs';
import {BodySpatialRegistry,createBodySpatialSelector} from '../src/body-spatial.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';

const program = await loadRetainedNativeProgram();

// These are explicit constructed-fixture spans, not native allocation evidence.
// Gaps remain unmapped, and neither views nor physics can use .buffer on memory.
function sparseFrame(f, {omitAddress} = {}) {
  const a = f.addresses, x = f.extraAddresses;
  const spans = [
    [0x8000, 0x2000], ...a.bodies.map(address => [address, 0x4000]),
    [a.list, 8 * 4], [a.records, 256 * 72], [0x45000, 0x300],
    [x.events, 100 * 104], [x.heap, 101 * 4], [x.free, 100 * 4],
    [a.arena, 2048 * 16], [x.output, 0x200], [x.session, 0x600],
    [0x78000, 0x94], [a.sectors, 0xc100], [x.groupLists, 65 * 132],
    [0x5dc5f4, 4], [0x5dc774, 4], [0x5dca88, 4], [0x5eb290, 384],
    [0x5eb5e0, 4], [0x5ecb1c, 4], [0x811180, 16],
    [0x902ba0, 0x350], [0x909240, 0x84], [0x90a548, 4], [0x90b98c, 4],
    [0x911c00, 0x28], [0x9153d0, 4], [0x91cd80, 0x70],
    [0x91d360, 0x104], [0x91e780, 0xa20]
  ];
  const ranges = spans.filter(([address]) => address !== omitAddress).map(([address, length]) => ({address, bytes: f.memory.subarray(address, address + length)}));
  const {memory, span} = createCapturedMemory(ranges);
  const views = createPhysicsRuntimeViews({memory,
    bodyStorage: a.bodies.map(address => ({address, length: 0x4000})),
    bodyLists: [{address: a.list, capacity: 8}, ...Array.from({length: 65}, (_, i) => ({address: x.groupLists + i * 132, capacity: 33}))],
    bucketAt: f.bucketAt, candidateMapping: f.candidateMapping});
  const bodies = views.physicalGroup.bodies.slice(0, f.bodies.length);
  const buckets = f.grid.spatial.nodes.map((_, i) => views.bucketAt(a.nodes + i * 12));
  const registry = new BodySpatialRegistry(bodies.map(body => ({body, poolOffset: body.address - a.bodies[0]})), createBodySpatialSelector(f.grid.spatial, buckets));
  const grid = createRawTerrainGrid(f.grid, sector => f.candidateMapping.terrainVerticesFor(sector), {memory});
  const context = {...f.context,
    environment: {...f.context.environment, grid}, records: views.records,
    queue: views.queue, candidateArena: views.candidateArena,
    candidateGroups: views.candidateGroups, effectFlags: views.effectFlags,
    timeOptionsFor: views.timeOptionsFor,
    spatialStateFor: body => ({found: true, outside: body.spatialOutside, node: f.nodeForAddress(body.spatialBucket.address)}),
    staticScratch: {contact: views.contactAt(x.contact), tag: views.wordAt(x.contact + 72)}, queryOutput: views.outputAt(x.output),
    nativeTerrain: {memory, views, grid}, nativePhysicsStack: {memory, views, scratchBase: 0x9000}, handlers: registry.handlers()};
  return {memory, span, views, context, spans};
}

test('three complete constructed collision frames retain every declared byte through sparse native storage', () => {
  const dense = createSimulationRuntimeFixture(program, 2, {count: 2}), sparse = sparseFrame(dense);
  assert.throws(() => sparse.memory.buffer, /Unsupported/);
  let contacts = 0;
  for (let frame = 0; frame < 3; frame++) {
    const expected = stepSimulationFrame(dense.views.physicalGroup, [], dense.context);
    const actual = stepSimulationFrame(sparse.views.physicalGroup, [], sparse.context);
    contacts += actual.storedContacts;
    const counts = report => Object.fromEntries(Object.entries(report).filter(([, value]) => typeof value === 'number'));
    assert.deepEqual(counts(actual), counts(expected), `Frame ${frame} stage counts`);
    for (const [address, length] of sparse.spans) {
      assert.deepEqual(sparse.span(address, length), dense.memory.subarray(address, address + length), `Frame ${frame} native span 0x${address.toString(16)}`);
    }
  }
  assert.ok(contacts > 0, 'The comparison reaches contact generation and response.');
});

test('complete constructed frame rejects an uncaptured reached math span rather than substituting bytes', () => {
  const f = createSimulationRuntimeFixture(program, 2, {count: 2});
  const sparse = sparseFrame(f, {omitAddress: 0x91d360});
  assert.throws(() => stepSimulationFrame(sparse.views.physicalGroup, [], sparse.context), /Uncaptured native memory at 0x91d45c/);
});

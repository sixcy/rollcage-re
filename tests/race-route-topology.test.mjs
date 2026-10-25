import test from 'node:test';
import assert from 'node:assert/strict';
import {raceLayoutFixture} from './lib/race-layout-fixture.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
import {inspectRaceLayoutFallback} from '../src/race-layout-spatial.mjs';
import {RACE_ROUTE_LIMITS, createRaceRouteTopology, hydrateRaceRouteTopology, validateRaceRouteTopology,
  cloneRaceRouteGroup, insertRaceRoutePoint, connectRaceRoutePoints, compileRaceRouteTopology} from '../src/race-route-topology.mjs';

const fixture = () => {
  const data = raceLayoutFixture();
  // Both links point into the same group and exercise index remapping; empty
  // link point bits and the high nibble are meaningful opaque preservation.
  for (let i = 0; i < 3; i++) data.writeUInt32LE((0xa0000000 | 1 | 1 << 5 | (i === 0 ? (1 | 2 << 5) << 14 : 7 << 19)) >>> 0, 0x190c + i * 16);
  return data;
};

test('full topology and empty legacy hydration preserve no-edit bytes and high/unused link bits', () => {
  const data = fixture(), topology = createRaceRouteTopology(data), result = compileRaceRouteTopology(data, topology);
  assert.deepEqual(result.data, data); assert.equal(result.changed, false);
  assert.deepEqual(hydrateRaceRouteTopology(data), topology);
  assert.equal(topology.groups[1].points[0].linkFlags, 0xa0000000);
  assert.equal(topology.groups[1].points[1].emptyLinkPoints[1], 7);
  assert.deepEqual(result.remap.points['1:2'], {group: 1, point: 2});
});

test('legacy sparse route edits hydrate by source identity after insertion', () => {
  const data = fixture(), inserted = insertRaceRoutePoint(createRaceRouteTopology(data), 'g1', 'g1:p0');
  const topology = hydrateRaceRouteTopology(data, inserted.topology, [{group: 1, point: 1, position: [97, -20, -64], minSpeed: 12, targetSpeed: 200}]);
  const p = topology.groups[1].points.find(p => p.id === 'g1:p1');
  assert.equal(topology.groups[1].points.indexOf(p), 2); assert.deepEqual(p.position, [97, -20, -64]); assert.equal(p.targetSpeed, 200);
});

test('insertion before a point remaps both packed links and spatial fallback without changing model words', () => {
  const data = fixture(), spatial = parseSpatialIndex(data);
  // Add one synthetic model word to each shared fallback sequence.
  data.writeUInt16LE(2, 0x96); data.writeUInt32LE(1 * 65536 + 1, 0x1c00); data.writeUInt32LE(0x1234, 0x1c04);
  for (const node of spatial.nodes) data.writeUInt32LE((node.boundsWord | 1 << 19) >>> 0, node.offset);
  const original = Buffer.from(data), inserted = insertRaceRoutePoint(createRaceRouteTopology(data), 'g1', 'g1:p1', {side: 'before'});
  const result = compileRaceRouteTopology(data, inserted.topology), routes = parseRespawnRoutes(result.data), fallback = inspectRaceLayoutFallback(result.data, parseSpatialIndex(result.data), routes.groups);
  assert.equal(routes.groups[1].count, 4);
  const word = routes.groups[1].points[0].bytes.readUInt32LE(12);
  assert.equal(word & 31, 1); assert.equal(word >>> 5 & 511, 2); assert.equal(word >>> 14 & 31, 1); assert.equal(word >>> 19 & 511, 3); assert.equal(word >>> 28, 10);
  // The new midpoint can legitimately improve one cell's nearest fallback;
  // the other node retains the authored point through its shifted index.
  assert.ok(fallback.nodes.every(n => [1, 2].includes(n.point) && n.models[0] === 0x1234));
  assert.ok(fallback.nodes.some(n => n.point === 2));
  assert.deepEqual(result.remap.points['1:1'], {group: 1, point: 2}); assert.deepEqual(data, original);
});

test('clones deep remap self links, retain metadata and leave incoming links unchanged', () => {
  const data = fixture(), topology = createRaceRouteTopology(data), clone = cloneRaceRouteGroup(topology, 'g1'), group = clone.topology.groups[2];
  assert.equal(group.sourceGroup, null); assert.equal(group.header[5], 2);
  assert.deepEqual(clone.topology.groups[1], topology.groups[1]);
  assert.equal(group.points[0].links[0].groupId, clone.groupId);
  assert.equal(group.points[0].links[0].pointId, clone.pointIds['g1:p1']);
  assert.equal(group.points[0].flags, topology.groups[1].points[0].flags);
  assert.notEqual(group.points[0].id, topology.groups[1].points[0].id);
  assert.equal(topology.groups.length, 2);
});

test('unconnected additions save as drafts but strict compilation needs entry and exit', () => {
  const data = fixture(), cloned = cloneRaceRouteGroup(createRaceRouteTopology(data), 'g1');
  assert.equal(validateRaceRouteTopology(data, cloned.topology, {requireConnected: false}).valid, true);
  assert.equal(validateRaceRouteTopology(data, cloned.topology).valid, false);
  assert.throws(() => compileRaceRouteTopology(data, cloned.topology), /needs an entry/);
  assert.equal(compileRaceRouteTopology(data, cloned.topology, {requireConnected: false}).changed, true);
  let connected = connectRaceRoutePoints(cloned.topology, 'g1:p1', 1, cloned.pointIds['g1:p0']);
  assert.equal(validateRaceRouteTopology(data, connected).valid, false);
  connected = connectRaceRoutePoints(connected, cloned.pointIds['g1:p1'], 1, 'g1:p0');
  const result = compileRaceRouteTopology(data, connected), routes = parseRespawnRoutes(result.data);
  assert.equal(routes.groups[2].byte05, 2);
  assert.equal(routes.groups[1].points[1].bytes.readUInt32LE(12) >>> 14 & 31, 2);
  assert.equal(routes.groups[2].points[1].bytes.readUInt32LE(12) >>> 14 & 31, 1);
});

test('connection requires deliberate replacement of an occupied outgoing slot', () => {
  const topology = createRaceRouteTopology(fixture());
  assert.throws(() => connectRaceRoutePoints(topology, 'g1:p0', 0, 'g1:p2'), /occupied/);
  const connected = connectRaceRoutePoints(topology, 'g1:p0', 0, 'g1:p2', {replace: true});
  assert.equal(connected.groups[1].points[0].links[0].pointId, 'g1:p2');
  assert.deepEqual(connectRaceRoutePoints(connected, 'g1:p0', 0, 'g1:p2'), connected);
});

test('authored group IDs stay fixed for BTP blocker references and group zero stays reserved', () => {
  const data = fixture(), topology = createRaceRouteTopology(data);
  assert.throws(() => cloneRaceRouteGroup(topology, 'g0'), /usable/);
  topology.groups[0].header[3] = 1;
  assert.ok(validateRaceRouteTopology(data, topology).errors.some(e => /group 0/.test(e)));
  const clone = cloneRaceRouteGroup(createRaceRouteTopology(data), 'g1').topology;
  [clone.groups[1], clone.groups[2]] = [clone.groups[2], clone.groups[1]];
  assert.ok(validateRaceRouteTopology(data, clone).errors.some(e => /native order/.test(e)));
});

test('current compiler source blocker counters survive topology serialization', () => {
  const data = fixture(), topology = insertRaceRoutePoint(createRaceRouteTopology(data), 'g1', 'g1:p0').topology;
  data[0x180c + 3] = 2;
  const result = compileRaceRouteTopology(data, topology), routes = parseRespawnRoutes(result.data);
  assert.equal(routes.groups[1].bytes[3], 2);
  assert.throws(() => cloneRaceRouteGroup(createRaceRouteTopology(data), 'g1'), /scenery blockers/);
  const clonedBeforeBlockers = cloneRaceRouteGroup(createRaceRouteTopology(fixture()), 'g1').topology;
  assert.throws(() => compileRaceRouteTopology(data, clonedBeforeBlockers, {requireConnected: false}), /blocker ownership/);
});

test('point bound is 256 instead of the 512 encodable links; insertion refuses truncation', () => {
  assert.equal(RACE_ROUTE_LIMITS.pointsPerGroup, 256);
  const topology = createRaceRouteTopology(fixture()), group = topology.groups[1];
  while (group.points.length < 256) group.points.push({...structuredClone(group.points[0]), id: `test-${group.points.length}`, sourcePoint: null});
  assert.throws(() => insertRaceRoutePoint(topology, 'g1', 'g1:p0'), /256 points/);
  group.points.push({...structuredClone(group.points[0]), id: 'test-256', sourcePoint: null});
  assert.ok(validateRaceRouteTopology(fixture(), topology).errors.some(e => /256 points/.test(e)));
});

test('31 usable group limit, malformed links, deleted identities and unsupported positions fail explicitly', () => {
  const data = fixture(), topology = createRaceRouteTopology(data);
  while (topology.groups.length < 32) topology.groups.push({...structuredClone(topology.groups[1]), id: `extra-${topology.groups.length}`, sourceGroup: null});
  assert.throws(() => cloneRaceRouteGroup(topology, 'g1'), /31 usable/);
  const bad = createRaceRouteTopology(data); bad.groups[1].points[0].links[0].pointId = 'absent';
  assert.equal(validateRaceRouteTopology(data, bad).valid, false);
  bad.groups[1].points.pop(); assert.equal(validateRaceRouteTopology(data, bad).valid, false);
  const out = createRaceRouteTopology(data); out.groups[1].points[0].position = [32767, 32767, 32767];
  assert.ok(validateRaceRouteTopology(data, out).errors.some(e => /populated native spatial cell/.test(e)));
});

test('new coincident adjacent points reject while inherited insertion controls remain intact', () => {
  const data = fixture(), insertion = insertRaceRoutePoint(createRaceRouteTopology(data), 'g1', 'g1:p0');
  const point = insertion.topology.groups[1].points[1];
  assert.equal(point.flags, 0x12345678); assert.equal(point.minSpeed, 8); assert.equal(point.targetSpeed, 180); assert.deepEqual(point.links, [null, null]);
  point.position = [...insertion.topology.groups[1].points[2].position];
  assert.ok(validateRaceRouteTopology(data, insertion.topology).errors.some(e => /coincident adjacent/.test(e)));
});

test('project validation rejects unknown fields, oversized identities and raw opaque metadata edits', () => {
  const data = fixture();
  for (const mutate of [t => t.extra = true, t => t.groups[1].extra = true, t => t.groups[1].id = 'x'.repeat(97),
    t => t.groups[1].header[2] ^= 1, t => t.groups[1].header[3]++, t => t.groups[1].points[0].flags ^= 4,
    t => t.groups[1].points[0].links[0].extra = true, t => t.groups[1].points[0].extra = true,
    t => t.groups[1].header = null, t => t.groups[1].sourceGroup = '__proto__']) {
    const topology = createRaceRouteTopology(data); mutate(topology); assert.equal(validateRaceRouteTopology(data, topology).valid, false);
  }
});

test('cloned metadata and added-point controls require known provenance', () => {
  const data = fixture();
  for (const mutate of [t => delete t.groups[2].cloneOfGroupId, t => t.groups[2].header[6] ^= 1,
    t => t.groups[2].points[0].flags ^= 4, t => t.groups[2].points[0].anchorPointId = t.groups[2].points[0].id]) {
    const topology = cloneRaceRouteGroup(createRaceRouteTopology(data), 'g1').topology; mutate(topology);
    assert.equal(validateRaceRouteTopology(data, topology, {requireConnected: false}).valid, false);
  }
});

test('authored empty nonzero groups preserve native identity bytes and refuse cloning', () => {
  const data = fixture(); data[0x79] = 3;
  const topology = createRaceRouteTopology(data); assert.equal(topology.groups[2].points.length, 0);
  assert.deepEqual(compileRaceRouteTopology(data, topology).data, data);
  assert.throws(() => cloneRaceRouteGroup(topology, 'g2'), /empty route/);
});

test('cloning preserves outgoing references to another authored group', () => {
  const data = fixture(); data[0x79] = 3; data.writeUInt16LE(1, 0x1818); data[0x181d] = 2; data.writeUInt32LE(64, 0x1820);
  data.copy(data, 0x1940, 0x1900, 0x1910); data.writeUInt32LE(0, 0x194c); data.writeUInt32LE(2, 0x190c);
  const topology = createRaceRouteTopology(data), cloned = cloneRaceRouteGroup(topology, 'g1');
  assert.deepEqual(cloned.topology.groups[3].points[0].links[0], {groupId: 'g2', pointId: 'g2:p0'});
  assert.deepEqual(cloned.topology.groups[1], topology.groups[1]);
});

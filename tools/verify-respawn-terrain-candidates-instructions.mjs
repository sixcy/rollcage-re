import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {appendRespawnRegionCandidates} from '../src/respawn-terrain-candidates.mjs';
import {unpackCollisionNormal} from '../src/collision-grid.mjs';

const regionEvidence = await readInstructionEvidence(['108-respawn-terrain-fill-assembly.json'], {directory: 'analysis/native-simulation/results'});
const planeEvidence = await readInstructionEvidence(['205-candidate-plane-filter-assembly.json']);
const instructions = [...regionEvidence.instructions, ...planeEvidence.instructions];
const machine = new BoundedX86(instructions, {entry: 0x47d9c0});
const pack = normal => (((normal[0] & 1023) << 20) | ((normal[1] & 1023) << 10) | (normal[2] & 1023)) >>> 0;
let seed = 0x47d9c0ab;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
let instructionSteps = 0, appends = 0, borderAppends = 0, emptyRegions = 0, over64 = 0, duplicateFixtures = 0;
const fixtures = 4000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset();
  const bytes = machine.bytes, header = 0x1000, sectors = 0x2000, normals = 0x2500, regionPointer = 0x5000;
  const queryPointer = 0x6000, centerPointer = 0x7000, verticesPointer = 0x10000;
  const packetsPointer = 0x20000, bordersPointer = 0x22000, arena = 0x30000, capacity = 600;
  for (let p = 0x8000; p < 0x9000; p++) bytes[p] = random(256);
  const columns = 1 + random(15), rows = 1 + random(15), sectorIndex = random(4), step = 1 + random(64);
  const grid = {sectors: Array(sectorIndex + 1), normals: [
    [0, -256, 0], [0, -256, 0], [256, 0, 0], [-256, 0, 0],
    [32, -256, -32], [-32, -256, 32], [-1, -1, -1], [0, 0, 0],
  ].map(normal => ({packed: pack(normal), components: normal}))};
  const vertices = [];
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    vertices.push([column * step - columns * step / 2 | 0, fixture % 3 ? 0 : row * 2 - column, row * step - rows * step / 2 | 0, 0]);
  }
  const cells = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const top = row * (columns + 1) + column, shape = random(3), normal = random(grid.normals.length - 1);
    const vertexFlags = shape === 0 ? 0 : shape === 1 ? 2 : 6;
    vertices[top + columns + 2][3] = vertexFlags;
    const forms = shape === 0 ? [{type: 0, normal, point: null}]
      : shape === 1 ? [{type: 5, normal, point: top + 1}, {type: 4, normal: normal + 1, point: top + columns + 1}]
      : [{type: 2, normal, point: top}, {type: 3, normal: normal + 1, point: top + columns + 2}];
    cells.push({forms});
    bytes.writeUInt16LE(normal, packetsPointer + (row * columns + column) * 8 + 2);
  }
  const borders = Array.from({length: rows}, (_, row) => ({
    left: {type: 6, column: 0, normal: random(3) ? 2 : null},
    right: {type: 7, column: columns, normal: random(3) ? 3 : null},
  }));
  const sector = {index: sectorIndex, columns, rows, vertices, cells, borders, flags: fixture % 5 ? 0 : 1, left: 0, right: columns};
  grid.sectors[sectorIndex] = sector;
  const region = {sector: sectorIndex, row: random(rows), column: random(columns), rows: 0, columns: 0, padding: random(256)};
  region.rows = 1 + random(rows - region.row);
  region.columns = 1 + random(columns - region.column);
  if (fixture % 17 === 0) {region.row = 0; region.column = 0; region.rows = rows; region.columns = columns;}
  if (fixture % 29 === 0) region.rows = 0;
  if (fixture % 31 === 0) region.columns = 0;
  if (!region.rows || !region.columns) emptyRegions++;
  const center = [random(columns * step + 256) - 128 - (columns * step >> 1), random(512) - 256, random(rows * step + 256) - 128 - (rows * step >> 1)];
  if (fixture % 19 === 0) center[0] = 32767;
  const query = {originQ8: center.map(value => value * 256), deltaQ8: [random(65536) - 32768, random(65536) - 32768, random(65536) - 32768], radiusQ8: random(256 * 512)};
  if (fixture % 7 === 0) {query.radiusQ8 = 256 * 1024; query.originQ8[1] = 200 * 256;}
  const radiusSquared = fixture % 11 === 0 ? 0x7fffffff : random(1024 * 1024);
  bytes.writeUInt32LE(sectors, 0x909240); bytes.writeUInt32LE(normals, 0x90925c);
  bytes.writeUInt32LE(header, sectors + sectorIndex * 4);
  bytes.writeUInt32LE(sector.flags, header + 4); bytes.writeInt32LE(columns, header + 8);
  bytes.writeUInt32LE(verticesPointer, header + 0x20); bytes.writeUInt32LE(bordersPointer, header + 0x38); bytes.writeUInt32LE(packetsPointer, header + 0x50);
  grid.normals.forEach((normal, index) => bytes.writeUInt32LE(normal.packed, normals + index * 4));
  vertices.forEach((vertex, index) => vertex.forEach((value, axis) => bytes.writeInt16LE(value, verticesPointer + index * 8 + axis * 2)));
  borders.forEach((border, row) => {
    bytes.writeUInt16LE(border.left.normal ?? 65535, bordersPointer + row * 4);
    bytes.writeUInt16LE(border.right.normal ?? 65535, bordersPointer + row * 4 + 2);
  });
  bytes.writeUInt16LE((region.column << 10) | region.row, regionPointer);
  bytes.writeUInt16LE(region.sector, regionPointer + 2);
  bytes.writeUInt16LE((region.columns << 12) | (region.rows << 8) | region.padding, regionPointer + 4);
  query.originQ8.forEach((value, axis) => bytes.writeInt32LE(value, queryPointer + 8 + axis * 4));
  query.deltaQ8.forEach((value, axis) => bytes.writeInt32LE(value, queryPointer + 0x14 + axis * 4));
  bytes.writeInt32LE(query.radiusQ8, queryPointer + 0x40);
  center.forEach((value, axis) => bytes.writeInt16LE(value, centerPointer + axis * 2));
  bytes.writeUInt32LE(arena, 0x70f284);
  const count = fixture % 4 ? random(8) : 0;
  bytes.writeUInt16LE(count, 0x70f28c);
  for (let p = arena; p < arena + capacity * 16; p++) bytes[p] = random(256);
  const candidates = Array.from({length: capacity}, (_, index) => {
    const p = arena + index * 16;
    return {flagsByte0: bytes[p], byte2: bytes[p + 2], id: bytes.readUInt32LE(p + 4), packedNormal: bytes.readUInt32LE(p + 8)};
  });
  if (count && fixture % 2 === 0) {
    const first = candidates[0], form = cells[region.row * columns + region.column]?.forms[0];
    first.id = (sectorIndex | (region.column << 8) | (region.row << 16)) >>> 0;
    first.flagsByte0 = (first.flagsByte0 & 0xf0) | (form?.type ?? 0);
    bytes.writeUInt32LE(first.id, arena + 4); bytes[arena] = first.flagsByte0;
    duplicateFixtures++;
  }
  const initialId = random(0x7fffffff), initialDistance = fixture % 9 ? 0x7fffffff : random(10000);
  bytes.writeUInt32LE(initialId, 0x70f24c); bytes.writeInt32LE(initialDistance, 0x70f250);
  const state = {candidates, count, closestId: initialId, closestDistanceSquared: initialDistance,
    scratch: {nearestId: bytes.readUInt32LE(0x8fb0), metricNextPointer: bytes.readUInt32LE(0x8fb8)}};
  const expected = Buffer.from(bytes.subarray(arena, arena + capacity * 16));
  appendRespawnRegionCandidates(grid, region, query, center, radiusSquared, state);
  for (let index = count; index < state.count; index++) {
    const candidate = candidates[index], p = index * 16;
    expected[p] = candidate.flagsByte0; expected[p + 1] = candidate.pointOffset; expected[p + 2] = candidate.byte2; expected[p + 3] = candidate.columns;
    expected.writeUInt32LE(candidate.id, p + 4); expected.writeUInt32LE(candidate.packedNormal, p + 8);
    expected.writeUInt32LE(verticesPointer + candidate.vertexBase * 8, p + 12);
    appends++; if (candidate.type >= 6) borderAppends++;
  }
  if (state.count > 64) over64++;
  machine.r.ECX = queryPointer; machine.r.EDX = regionPointer; machine.r.ESP = 0x9000;
  bytes.writeUInt32LE(0xffffffff, 0x9000); bytes.writeUInt32LE(centerPointer, 0x900c); bytes.writeInt32LE(radiusSquared, 0x9010);
  instructionSteps += machine.run();
  try {
    assert.equal(bytes.readUInt16LE(0x70f28c), state.count, 'count');
    assert.equal(bytes.readUInt32LE(0x70f24c), state.closestId, 'nearest id');
    assert.equal(bytes.readInt32LE(0x70f250), state.closestDistanceSquared, 'nearest metric');
    assert.deepEqual(bytes.subarray(arena, arena + capacity * 16), expected, 'full retained arena');
  } catch (error) {
    console.error(JSON.stringify({fixture, columns, rows, region, center, query, radiusSquared, count, stateCount: state.count,
      nativeCount: bytes.readUInt16LE(0x70f28c), nativeClosest: bytes.readUInt32LE(0x70f24c), stateClosest: state.closestId,
      firstMismatch: Array.from(expected).findIndex((value, index) => value !== bytes[arena + index]),
      native: bytes.subarray(arena, arena + Math.min(600, state.count + 1) * 16).toString('hex'),
      expected: expected.subarray(0, Math.min(600, state.count + 1) * 16).toString('hex')}, null, 2));
    throw error;
  }
}
// A zero-column wall region reaches the u16 wrap without a 65535-entry face
// duplicate scan. Its full working cursor still addresses slots 65535/65536.
machine.reset();
{
  const bytes = machine.bytes, arena = 0x30000, tail = arena + 65535 * 16;
  const grid = {sectors: [{index: 0, columns: 0, rows: 1, flags: 0,
    vertices: [[0, 0, 0, 0], [0, 0, 0, 0]], cells: [],
    borders: [{left: {normal: 0}, right: {normal: 1}}]}],
  normals: [{packed: pack([256, 0, 0])}, {packed: pack([-256, 0, 0])}]};
  const region = {sector: 0, row: 0, column: 0, rows: 1, columns: 0, padding: 0};
  const query = {originQ8: [0, 0, 0], deltaQ8: [0, 0, 0], radiusQ8: 256};
  bytes.fill(0xa5, tail, tail + 32);
  bytes.writeUInt32LE(0x2000, 0x909240); bytes.writeUInt32LE(0x1000, 0x2000);
  bytes.writeUInt32LE(0x2500, 0x90925c);
  bytes.writeUInt32LE(grid.normals[0].packed, 0x2500); bytes.writeUInt32LE(grid.normals[1].packed, 0x2504);
  bytes.writeUInt32LE(0x10000, 0x1020); bytes.writeUInt32LE(0x22000, 0x1038); bytes.writeUInt32LE(0x20000, 0x1050);
  bytes.writeUInt16LE(0, 0x22000); bytes.writeUInt16LE(1, 0x22002);
  bytes.writeUInt16LE(0x100, 0x5004); bytes.writeInt32LE(256, 0x6040);
  bytes.writeUInt32LE(arena, 0x70f284); bytes.writeUInt16LE(65535, 0x70f28c);
  bytes.writeUInt32LE(0x12345678, 0x8fb0); bytes.writeInt32LE(0x7fffffff, 0x70f250);
  const candidates = Array(65537);
  candidates[65535] = {flagsByte0: 0xa5, byte2: 0xa5}; candidates[65536] = {flagsByte0: 0xa5, byte2: 0xa5};
  const state = {candidates, count: 65535, closestDistanceSquared: 0x7fffffff, scratch: {nearestId: 0x12345678}};
  appendRespawnRegionCandidates(grid, region, query, [0, 0, 0], 4096, state);
  machine.r.ECX = 0x6000; machine.r.EDX = 0x5000; machine.r.ESP = 0x9000;
  bytes.writeUInt32LE(0xffffffff, 0x9000); bytes.writeUInt32LE(0x7000, 0x900c); bytes.writeInt32LE(4096, 0x9010);
  instructionSteps += machine.run();
  assert.equal(bytes.readUInt16LE(0x70f28c), state.count); assert.equal(state.count, 1);
  assert.equal(bytes.readUInt32LE(0x70f24c), state.closestId); assert.equal(bytes.readInt32LE(0x70f250), -64);
  for (const index of [65535, 65536]) {
    const candidate = candidates[index], p = arena + index * 16, expected = Buffer.alloc(16, 0xa5);
    expected[0] = candidate.flagsByte0; expected[1] = 0; expected[3] = 0;
    expected.writeUInt32LE(candidate.id, 4); expected.writeUInt32LE(candidate.packedNormal, 8);
    expected.writeUInt32LE(0x10000 + candidate.vertexBase * 8, 12);
    assert.deepEqual(bytes.subarray(p, p + 16), expected);
  }
}
const report = {
  method: 'Bounded retained-x86 interpretation of respawn region fill47d9c0 and real plane screen4292a0. No external arithmetic callbacks or original-process execution. Compares all retained candidate bytes, count and closest globals on declared synthetic grids, split faces, wall borders, repeated normals, duplicate initial candidates and zero-dimensional regions with explicit seeded stack locals.',
  evidence: [...regionEvidence.evidence, ...planeEvidence.evidence].map(item => item.evidence_id),
  instructions: instructions.length, fixtures, countWrapFixtures: 1, appends, borderAppends, emptyRegions, over64, duplicateFixtures, instructionSteps, matched: true,
};
await writeFile('analysis/respawn-terrain-candidates-instruction-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

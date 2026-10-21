import test from 'node:test';
import assert from 'node:assert/strict';
import {appendRespawnRegionCandidates} from '../src/respawn-terrain-candidates.mjs';

const pack = (x, y, z) => (((x & 1023) << 20) | ((y & 1023) << 10) | (z & 1023)) >>> 0;
function fixture(columns = 2, rows = 1) {
  const vertices = [];
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) vertices.push([column * 8, 0, row * 8, 0]);
  const cells = Array.from({length: columns * rows}, () => ({forms: [{type: 0, normal: 0, point: null}]}));
  const borders = Array.from({length: rows}, () => ({left: {normal: 1}, right: {normal: 2}}));
  const sector = {index: 0, columns, rows, vertices, cells, borders, flags: 1, left: 0, right: columns};
  const region = {sector: 0, row: 0, column: 0, columns, rows, padding: 32};
  return {grid: {sectors: [sector], normals: [pack(0, -256, 0), pack(256, 0, 0), pack(-256, 0, 0)].map(packed => ({packed}))}, region};
}
const slot = () => ({flagsByte0: 0xad, byte2: 0x73, stale: 'retained'});
const state = () => ({candidates: [], count: 0, createSlot: slot, closestId: 0x12345678, closestDistanceSquared: 0x7fffffff});
const query = {originQ8: [4 * 256, 100 * 256, 4 * 256], deltaQ8: [0, 0, 0], radiusQ8: 64 * 256};

test('respawn accepts deeply overlapping planes and preserves untouched slot bytes and trailing entries', () => {
  const {grid, region} = fixture(), result = state();
  result.candidates = Array.from({length: 8}, slot);
  const trailing = structuredClone(result.candidates.slice(2));
  appendRespawnRegionCandidates(grid, region, query, [4, 0, 4], 4096, result);
  assert.equal(result.count, 2);
  assert.deepEqual(result.candidates.slice(0, 2).map(item => [item.flagsByte0, item.byte2, item.stale]), [[0xa0, 0x73, 'retained'], [0xa0, 0x73, 'retained']]);
  assert.deepEqual(result.candidates.slice(2), trailing);
  assert.equal(result.closestId, 0);
});

test('respawn retains all candidates beyond the ordinary 64-entry limit', () => {
  const {grid, region} = fixture(9, 9), result = state();
  appendRespawnRegionCandidates(grid, region, query, [36, 0, 36], 65536, result);
  assert.equal(result.count, 81);
  assert.equal(result.candidates[80].id, (8 << 16) | (8 << 8));
});

test('duplicates compare only pre-call entries and low type nibble; borders append again on later calls', () => {
  const {grid, region} = fixture(), result = state();
  grid.sectors[0].flags = 0;
  appendRespawnRegionCandidates(grid, region, query, [4, 0, 4], 4096, result);
  assert.deepEqual(result.candidates.slice(0, result.count).map(item => item.type), [0, 0, 6, 7]);
  appendRespawnRegionCandidates(grid, region, query, [4, 0, 4], 4096, result);
  assert.deepEqual(result.candidates.slice(0, result.count).map(item => item.type), [0, 0, 6, 7, 6, 7]);
  assert.deepEqual(result.candidates.slice(-2).map(item => item.packedNormal), grid.normals.slice(1).map(item => item.packed));
});

test('respawn walls use untrimmed sector edges and left-then-right ordering', () => {
  const {grid, region} = fixture(4, 1), result = state(), sector = grid.sectors[0];
  sector.flags = 0; sector.left = 1; sector.right = 3;
  appendRespawnRegionCandidates(grid, region, query, [16, 0, 4], 4096, result);
  assert.deepEqual(result.candidates.slice(4).map(item => [item.type, item.column, item.vertexBase]), [[6, 0, 5], [7, 4, 4]]);
});

test('nearest ties choose the first corner and prior closer distance survives', () => {
  const {grid, region} = fixture(), result = state();
  appendRespawnRegionCandidates(grid, region, query, [4, 0, 4], 4096, result);
  assert.equal(result.closestId, 0);
  const nearest = {id: result.closestId, distance: result.closestDistanceSquared};
  appendRespawnRegionCandidates(grid, region, query, [100, 20, 100], 4096, result);
  assert.deepEqual({id: result.closestId, distance: result.closestDistanceSquared}, nearest);
});

test('zero-sized region exposes the native uninitialized nearest result and wrapped -64 metric', () => {
  const {grid, region} = fixture(), result = state();
  region.rows = 0;
  assert.throws(() => appendRespawnRegionCandidates(grid, region, query, [0, 0, 0], 4096, result), /uninitialized nearestId/);
  result.scratch = {nearestId: 0x12345678};
  appendRespawnRegionCandidates(grid, region, query, [0, 0, 0], 4096, result);
  assert.equal(result.closestDistanceSquared, -64);
  assert.equal(result.closestId, 0x12345678);
  assert.equal(result.count, 0);
});

test('the working cursor crosses 65535 and only the stored count wraps', () => {
  const {grid, region} = fixture(0, 1), result = state();
  grid.sectors[0].flags = 0;
  result.count = 65535; result.candidates.length = 65535;
  result.scratch = {nearestId: 7};
  appendRespawnRegionCandidates(grid, region, query, [0, 0, 0], 4096, result);
  assert.equal(result.count, 1);
  assert.equal(result.candidates[65535].type, 6);
  assert.equal(result.candidates[65536].type, 7);
});

test('writing a new candidate requires caller-owned scratch slot contents', () => {
  const {grid, region} = fixture(), result = state();
  delete result.createSlot;
  assert.throws(() => appendRespawnRegionCandidates(grid, region, query, [4, 0, 4], 4096, result), /requires retained/);
});

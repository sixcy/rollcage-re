import test from 'node:test';
import assert from 'node:assert/strict';
import {createVehicleOverlayFixture, vehicleOverlayAddresses as a, verifyVehicleOverlayGrid} from '../tools/verify-vehicle-overlay-grid-instructions.mjs';
import {initializeVehicleOverlayGrids, updateVehicleOverlayGrids, updateVehicleOverlayGrid, updateVehicleOverlayAppearance} from '../src/vehicle-overlay-grid.mjs';
const put = (m, p, value) => m.writeInt32LE(value | 0, p), word = (m, p, value) => m.writeUInt16LE(value & 65535, p);
const blockAt = index => a.blocks + index * 0x4208;

test('disabled grid and appearance stages preserve every byte and consume no RNG', () => {
  const runtime = createVehicleOverlayFixture(0), {memory: m} = runtime, before = Buffer.from(m);
  updateVehicleOverlayGrids(runtime); updateVehicleOverlayAppearance(0, a.colors, runtime); assert.deepEqual(m, before);
});

test('constructor initializes six caches and actual phases while preserving primitive and geometry padding', () => {
  const runtime = createVehicleOverlayFixture(1), {memory: m} = runtime;
  initializeVehicleOverlayGrids(runtime);
  for (let index = 0; index < 6; index++) {assert.equal(m.readInt32LE(blockAt(index) + 0x4200), 1); assert.equal(m.readInt32LE(blockAt(index) + 0x4204), -1); assert.equal(m.readUInt32LE(blockAt(index) + 0x24), 0x69696969);}
  assert.deepEqual([0, 2, 4].map(offset => m.readInt16LE(a.geometry + offset)), [0, 0, 80]);
  assert.deepEqual([0, 2, 4].map(offset => m.readInt16LE(a.geometry + 8 * 8 + offset)), [0, 38, 44]);
  assert.deepEqual([0, 2, 4].map(offset => m.readInt16LE(a.geometry + 4 * 0x48 + 8 * 8 + offset)), [74, 0, 44]);
  assert.equal(m.readUInt16LE(a.geometry + 6), 0x6969);
});

test('UV traversal mirrors X after eight cells and preserves material flags only in the first two vertices', () => {
  const runtime = createVehicleOverlayFixture(2), {memory: m} = runtime; put(m, 0x90a548, 0); put(m, blockAt(0) + 0x4200, 0);
  const material = a.materials + (m.readUInt16LE(a.pack + 0x2e) + 0x86) * 16;
  put(m, material, 0x11220a14); put(m, material + 4, 0x33440a64); word(m, material + 8, 0x5a14); word(m, material + 10, 0x5a64);
  updateVehicleOverlayGrid(0, runtime);
  assert.deepEqual([0, 0x20, 0x40, 0x60].map(offset => m.readUInt32LE(a.blocks + 0x20 + offset)), [0x11220a14, 0x33440a1e, 0x1414, 0x141e]);
  assert.equal(m[a.blocks + 0x20 + 7 * 0x420], 90); assert.equal(m[a.blocks + 0x20 + 8 * 0x420], 100); assert.equal(m[a.blocks + 0x20 + 15 * 0x420], 30);
  assert.equal(m[a.blocks + 0x20 + 7 * 0x84 + 1], 80); assert.equal(m[a.blocks + 0x60 + 7 * 0x84 + 1], 90);
  assert.equal(m.readUInt32LE(a.blocks + 0x24), 0x69696969);
});

test('odd clocks advance once, phase eight wraps and even clocks retain out-of-cycle supplied phase', () => {
  const runtime = createVehicleOverlayFixture(2), {memory: m} = runtime, phase = a.blocks + 0x4200;
  put(m, phase, 8); put(m, 0x90a548, 1); updateVehicleOverlayGrid(0, runtime); assert.equal(m.readInt32LE(phase), 0);
  put(m, phase, 9); put(m, 0x90a548, 0); updateVehicleOverlayGrid(0, runtime); assert.equal(m.readInt32LE(phase), 9);
  put(m, phase, -2); put(m, 0x90a548, 1); updateVehicleOverlayGrid(0, runtime); assert.equal(m.readInt32LE(phase), -1);
});

test('rank threshold uses wrapped speed arithmetic and active controller bytes suppress leaf updates', () => {
  const runtime = createVehicleOverlayFixture(1), {memory: m} = runtime; m[a.session + 0x54d] = 4; put(m, 0x90a548, 1);
  for (let index = 0; index < 4; index++) {put(m, blockAt(index) + 0x4200, 0); put(m, a.bodies + index * 0x1000 + 0x6bc, -1);}
  put(m, a.bodies + 0x664, 0x3a0000 + 12799); put(m, a.bodies + 0x1000 + 0x664, 0x3a0000 + 12800); put(m, a.bodies + 0x2000 + 0x664, 0x3a0000 + 160 * 6400);
  put(m, a.bodies + 0x3000 + 0x6bc, a.controls); m[a.controls] = 1;
  updateVehicleOverlayGrids(runtime);
  assert.deepEqual(Array.from({length: 4}, (_, index) => m[0x909555 + index * 0x30c]), [255, 0, 1, 255]);
  assert.deepEqual(Array.from({length: 4}, (_, index) => m.readInt32LE(blockAt(index) + 0x4200)), [1, 1, 1, 0]);
});

test('sixth eligible participant is ranked but exits before its leaf; prepass still resets later ranks', () => {
  const runtime = createVehicleOverlayFixture(1), {memory: m} = runtime; m[a.session + 0x54d] = 8; put(m, 0x90a548, 1);
  for (let index = 0; index < 8; index++) {put(m, a.bodies + index * 0x1000 + 0x6bc, -1); put(m, a.bodies + index * 0x1000 + 0x664, 0x3a0000 + 160 * 6400); put(m, blockAt(index) + 0x4200, 0);}
  updateVehicleOverlayGrids(runtime);
  assert.deepEqual(Array.from({length: 8}, (_, index) => m[0x909555 + index * 0x30c]), [0, 1, 2, 3, 4, 5, 255, 255]);
  assert.deepEqual(Array.from({length: 8}, (_, index) => m.readInt32LE(blockAt(index) + 0x4200)), [1, 1, 1, 1, 1, 0, 0, 0]);
});

test('appearance produces native shared heights and packed colors using seventeen RNG advances', () => {
  const runtime = createVehicleOverlayFixture(1), {memory: m} = runtime;
  put(m, a.bodies + 0x664, 0x3a0000 + 160 * 6400); put(m, 0x5ec958, 1);
  updateVehicleOverlayAppearance(0, a.colors, runtime);
  assert.equal(m.readInt32LE(0x5ec958), 499227175);
  assert.deepEqual(Array.from({length: 9}, (_, index) => m.readUInt32LE(a.colors + index * 4)), [0x8e00629f, 0x8e006ea8, 0x8e005a98, 0x8e003e7e, 0x8e003979, 0x8e002461, 0x8e001d57, 0x8e00154a, 0x8e000b37]);
  assert.deepEqual(Array.from({length: 9}, (_, index) => m.readInt16LE(a.geometry + 4 + index * 8)), [70, 70, 68, 65, 61, 56, 50, 35, -14]);
  assert.equal(m.readUInt16LE(a.geometry), 0x6969); assert.equal(m.readUInt16LE(a.geometry + 6), 0x6969);
});

test('appearance keeps its RNG local until final publication even when color output aliases that global', () => {
  const runtime = createVehicleOverlayFixture(1), {memory: m} = runtime;
  put(m, a.bodies + 0x664, 0x3a0000 + 160 * 6400); put(m, 0x5ec958, 1);
  updateVehicleOverlayAppearance(0, 0x5ec958, runtime); assert.equal(m.readInt32LE(0x5ec958), 499227175); assert.equal(m.readUInt32LE(0x5ec95c), 0x8e006ea8);
});

test('all four entries and connected constructor/grid/appearance sequences match retained instructions', async () => {
  const report = await verifyVehicleOverlayGrid({fixtures: 120, sequences: 4, ticks: 3, output: null});
  assert.equal(report.matched, true); assert.equal(report.instructions, 386); assert.deepEqual(report.externalCalls, []); assert.ok(report.aliases > 0); assert.ok(report.rankedSix > 0);
  for (const entry of ['487410', '487540', '487620', '487790']) assert.ok(report.actualGameCalls[entry] > 0, entry);
});

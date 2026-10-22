import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRaceObjects, updateRaceObjectType20, updateRaceObjectType31, updateRaceObjectType32, initializeRaceObjectType20} from '../src/race-object-update.mjs';
import {createRaceObjectFixture, raceObjectAddresses as a, verifyRaceObjectUpdate} from '../tools/verify-race-object-update-instructions.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address), word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const nextSeed = seed => Math.imul(seed, 0x41a7) & 0x7fffffff;
function fixture() {const runtime = createRaceObjectFixture(33); runtime.memory[a.session + 0x551] = 0; return runtime;}

test('type31 signed age advances RNG and contracts negative matrix shorts with arithmetic rounding', () => {
  const runtime = fixture(), {memory} = runtime, body = a.objects + 0x1000;
  put(memory, body + 0x184, 2); word(memory, body + 0x188, -1); memory[0x5705ff] = 7;
  for (let index = 0; index < 9; index++) word(memory, body + 0xc4 + index * 2, [-32768, 32767, -1][index % 3]);
  const seed = memory.readInt32LE(0x5ec954); updateRaceObjectType31(body, runtime);
  assert.equal(memory.readUInt32LE(0x5ec954), nextSeed(seed)); assert.equal(memory.readInt16LE(body + 0x188), 0);
  assert.deepEqual([0, 2, 4].map(offset => memory.readInt16LE(body + 0xc4 + offset)), [-32384, 32383, -1]);
});

test('type31 transitions after age95 and removes spatial ownership on the subsequent state3 call', () => {
  const runtime = fixture(), {memory} = runtime, body = a.objects + 0x1000;
  put(memory, body + 0x184, 2); word(memory, body + 0x188, 96); const seed = memory.readInt32LE(0x5ec954);
  updateRaceObjectType31(body, runtime); assert.equal(memory.readInt32LE(body + 0x184), 3); assert.equal(memory.readInt32LE(0x5ec954), seed);
  word(memory, body + 4, 0); word(memory, body + 6, 0); word(memory, 0x45008, 123);
  updateRaceObjectType31(body, runtime); assert.equal(memory.readInt32LE(body + 0x184), 0); assert.equal(memory.readUInt16LE(0x45008), 0);
});

test('type20 writes wrapping UV bytes to both buffers using signed polygon IDs', () => {
  const runtime = fixture(), {memory} = runtime;
  put(memory, 0x91e744, 2); put(memory, 0x90a548, 1); word(memory, 0x91e74c, 1); memory[0x91e750] = 255;
  memory[0x91e754] = 250; [1, 2, 3, 4].forEach((value, index) => {memory[0x91e755 + index * 2] = value;});
  updateRaceObjectType20(a.objects, runtime);
  for (const base of [a.polygons, a.secondPolygons]) for (let vertex = 0; vertex < 4; vertex++) {
    assert.equal(memory[base - 132 + 0x20 + vertex * 32], vertex < 2 ? 58 : 73);
    assert.equal(memory[base - 132 + 0x21 + vertex * 32], vertex + 1);
  }
  assert.equal(memory.readInt32LE(0x91e744), 3);
});

test('type20 restoration uses each polygon saved UVs and resets the flicker counter', () => {
  const runtime = fixture(), {memory} = runtime;
  put(memory, 0x91e744, 6); put(memory, 0x91e740, 999); word(memory, 0x91e74c, 2); memory[0x91e750] = 0; memory[0x91e751] = 2;
  for (let index = 0; index < 16; index++) memory[0x91e754 + index] = index + 11;
  updateRaceObjectType20(a.objects, runtime);
  for (const base of [a.polygons, a.secondPolygons]) for (let polygon = 0; polygon < 2; polygon++) for (let vertex = 0; vertex < 4; vertex++) {
    assert.equal(memory[base + polygon * 264 + 0x20 + vertex * 32], 11 + polygon * 8 + vertex * 2);
    assert.equal(memory[base + polygon * 264 + 0x21 + vertex * 32], 12 + polygon * 8 + vertex * 2);
  }
  assert.equal(memory.readInt32LE(0x91e744), 7); assert.equal(memory.readInt32LE(0x91e740), 1); assert.equal(memory.readInt32LE(0x91e774), 0);
});

test('type20 phase arithmetic preserves signed overflow, fade completion and flicker RNG order', () => {
  const runtime = fixture(), {memory} = runtime;
  put(memory, 0x91e744, 4); put(memory, 0x91e740, 0x40000000); updateRaceObjectType20(a.objects, runtime); assert.equal(memory.readInt32LE(0x91e774), -2147483648);
  put(memory, 0x91e744, 5); put(memory, 0x91e740, 201); updateRaceObjectType20(a.objects, runtime); assert.equal(memory.readInt32LE(0x91e744), 6); assert.equal(memory.readInt32LE(0x91e774), 0);
  put(memory, 0x91e744, 7); put(memory, 0x91e740, 127); const seed = memory.readInt32LE(0x5ec958);
  updateRaceObjectType20(a.objects, runtime); assert.equal(memory.readInt32LE(0x91e774), 0x7f7f7f); assert.equal(memory.readInt32LE(0x5ec958), seed);
  updateRaceObjectType20(a.objects, runtime); assert.equal(memory.readInt32LE(0x5ec958), nextSeed(seed)); assert.ok([0x303030, 0x808080].includes(memory.readInt32LE(0x91e774)));
  put(memory, 0x91e740, 1024); updateRaceObjectType20(a.objects, runtime); assert.equal(memory.readInt32LE(0x91e740), 512);
});

test('type20 constructor captures authored widths and preserves the color high byte', () => {
  const runtime = fixture(), {memory} = runtime;
  for (const [offset, value] of [[0x122c, 10], [0x126c, 30], [0x12b0, 40], [0x12f0, 70], [0x1334, 80], [0x1374, 120]]) memory[a.polygons + offset] = value;
  for (let vertex = 0; vertex < 4; vertex++) memory[a.polygons + 0x122d + vertex * 32] = vertex + 1;
  put(memory, 0x91e774, 0xab112233); initializeRaceObjectType20(a.uvOwner, runtime);
  assert.deepEqual([...memory.subarray(0x91e750, 0x91e754)], [35, 36, 37, 255]);
  assert.deepEqual([0, 8, 16].map(offset => [...memory.subarray(0x91e754 + offset, 0x91e75c + offset)]), [[10, 1, 10, 2, 25, 3, 25, 4], [25, 1, 25, 2, 50, 3, 50, 4], [50, 1, 50, 2, 85, 3, 85, 4]]);
  assert.equal(memory.readUInt32LE(0x91e774), 0xab808080); assert.equal(memory.readUInt16LE(0x91e74c), 3); assert.equal(memory.readInt32LE(0x91e744), 1);
});

test('type32 advances every RNG pair even when its free pool is exhausted', () => {
  const runtime = fixture(), {memory} = runtime, body = a.objects + 0x2000;
  put(memory, body + 0x180, 1); word(memory, body + 0x184, 63); word(memory, body + 0x186, 4); put(memory, 0x902b8c, -1);
  let seed = memory.readInt32LE(0x5ec958); for (let index = 0; index < 11; index++) seed = nextSeed(seed);
  updateRaceObjectType32(body, runtime);
  assert.equal(memory.readInt32LE(body + 0x180), 2); assert.equal(memory.readUInt16LE(body + 0x186), 5); assert.ok([8, 24].includes(memory.readUInt16LE(body + 0x184)));
  assert.equal(memory.readInt32LE(0x5ec958), seed); assert.equal(memory.readInt32LE(0x902b8c), -1); assert.equal(memory.readInt32LE(0x902b88), 0);
});

test('type32 timer and emission-count transitions use independent wrapping shorts', () => {
  const runtime = fixture(), {memory} = runtime, body = a.objects + 0x2000;
  put(memory, body + 0x180, 2); word(memory, body + 0x184, 1); word(memory, body + 0x186, -1); const seed = memory.readInt32LE(0x5ec958);
  updateRaceObjectType32(body, runtime); assert.equal(memory.readInt32LE(body + 0x180), 3); assert.equal(memory.readInt32LE(0x5ec958), seed);
  word(memory, body + 0x184, 1); word(memory, body + 0x186, 1); updateRaceObjectType32(body, runtime);
  assert.equal(memory.readInt32LE(body + 0x180), 0); assert.equal(memory.readUInt16LE(body + 0x184), 0); assert.equal(memory.readUInt16LE(body + 0x186), 0);
});

test('type32 widened ushort65535 is allocated rather than treated as the native impossible -1 sentinel', () => {
  const runtime = fixture(), {memory} = runtime, body = a.objects + 0x2000;
  put(memory, body + 0x180, 2); word(memory, body + 0x184, 2); word(memory, body + 0x186, 1); put(memory, 0x902b8c, 0); word(memory, memory.readUInt32LE(0x902b7c), 65535);
  updateRaceObjectType32(body, runtime);
  const particle = memory.readUInt32LE(0x902b84) + 65535 * 128;
  assert.equal(memory.readUInt16LE(particle + 8), 43); assert.equal(memory[particle + 0x6c], 1); assert.equal(memory.readUInt32LE(particle + 0x14), 0xae000020);
  assert.equal(memory.readInt32LE(0x902b8c), -1); assert.equal(memory.readInt32LE(0x902b88), 1);
});

test('dispatcher mode3 resets phase and captures list length before aliased UV writes', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[a.session + 0x551] = 3; put(memory, 0x91e778, 1); put(memory, 0x91e744, 4); updateRaceObjects(runtime); assert.equal(memory.readInt32LE(0x91e744), 0);
  memory[a.session + 0x551] = 0; put(memory, 0x91e744, 2); word(memory, 0x91e74c, 1); memory[0x91e750] = 0; memory[0x91e754] = 0; memory[0x91e755] = 0;
  put(memory, a.uvOwner + 0x14, 0x91e758); put(memory, a.uvOwner + 0x18, 0x91e758);
  updateRaceObjects(runtime); assert.equal(memory.readInt32LE(0x91e778), 64); assert.equal(memory.readInt32LE(0x91e744), 3);
});

test('object dispatcher and actual effect/spatial descendants match retained instructions', async () => {
  const report = await verifyRaceObjectUpdate({fixtures: 120, output: null});
  assert.equal(report.matched, true); assert.equal(report.aliasFixtures, 120); assert.equal(report.constructorFixtures, 120);
  for (const entry of ['429f30', '429fa0', '42a1f0', '44ac80', '42a0e0', '474670']) assert.ok(report.actualGameCalls[entry] > 0, entry);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeRaceTextures, initializeTimeEffectGeometry} from '../src/race-textures.mjs';
import {updateTimeEffectTextureCoordinates} from '../src/race-time-effect.mjs';
import {initializeGameImageLibrary} from '../src/game-image-startup.mjs';
import {createGameImageAsyncFixtures} from '../tools/lib/game-image-async-fixtures.mjs';
import {createRaceTextureServices, prepareRaceTextureFixture} from '../tools/lib/race-texture-fixtures.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
const program = await loadRetainedNativeProgram();

function fixture(options = {}) {
  const memory = Buffer.alloc(0xa00000);
  program.initializeMemory(memory);
  prepareRaceTextureFixture(memory);
  const services = createRaceTextureServices(memory, options);
  const runtime = {memory, scratchBase: 0x9000, entryRegisters: {EBX: 0, EBP: 0, ESI: 0, EDI: 0}, services: {...services, ...createGameImageAsyncFixtures(memory)}};
  initializeGameImageLibrary(runtime);
  return {memory, runtime, services};
}

test('timewarp geometry closes each strip and feeds the actual UV consumer', () => {
  const memory = Buffer.alloc(0xa00000), runtime = {memory, scratchBase: 0x9000};
  memory.writeInt32LE(-1, 0x5ed024);
  initializeTimeEffectGeometry(runtime);
  for (let ring = 0; ring < 5; ring++) assert.equal(memory.readInt16LE(0x6f4ea0 + ring * 256 + 4), ring * 250 + 10);
  for (let ring = 0; ring < 4; ring++) {
    const first = 0x6f53a0 + ring * 32 * 132, last = first + 31 * 132;
    assert.equal(memory.readUInt16LE(first + 0x42), 0x83f);
    assert.equal(memory.readInt32LE(first + 4) & 0xffffff, memory.readInt32LE(last + 36) & 0xffffff);
    assert.equal(memory.readInt32LE(first + 68), memory.readInt32LE(last + 100));
  }
  updateTimeEffectTextureCoordinates(runtime);
  assert.equal(memory.readUInt16LE(0x6f53a0 + 0x60), 256);
  assert.equal(memory.readUInt16LE(0x6f53a0 + 0x80), 257);
});

test('a missing Timewarp image preserves its ID and still initializes procedural and ice textures', () => {
  const {memory, runtime, services} = fixture({failTime: true});
  memory.writeInt32LE(123, 0x5ed024);
  assert.equal(initializeRaceTextures(runtime), 1);
  assert.equal(memory.readInt32LE(0x5ed024), 123);
  assert.equal(memory.readInt32LE(0x5ed02c), 62);
  assert.equal(memory.readInt32LE(0x5ed028), 64);
  assert.equal(services.rendererCalls.filter(row => row[0] === 'upload').length, 2);
});

test('procedural upload failure publishes -1 and skips ice initialization', () => {
  const {memory, runtime, services} = fixture({failProcedural: true});
  assert.equal(initializeRaceTextures(runtime), 0);
  assert.equal(memory.readInt32LE(0x5ed02c), -1);
  assert.equal(memory.readInt32LE(0x5ed028), -99);
  assert.equal(services.rendererCalls.filter(row => row[0] === 'upload').length, 2);
});

test('ice tiling uploads the remaining column and zero-filled tile padding', () => {
  const {memory, runtime, services} = fixture({iceWidth: 257, iceHeight: 3});
  assert.equal(initializeRaceTextures(runtime), 1);
  assert.equal(memory.readInt32LE(0x6e6cb4), 257);
  const uploads = services.rendererCalls.filter(row => row[0] === 'upload'), tile = uploads.at(-1)[1][0];
  assert.deepEqual(tile.slice(0, 3), [256, 256, 32]);
  assert.notEqual(tile[3].readUInt32LE(0), 0);
  assert.equal(tile[3].readUInt32LE(4), 0);
  assert.equal(tile[3].readUInt32LE(3 * 256 * 4), 0);
  assert.equal(uploads.length, 4);
});

test('a rejected ice tile returns -1 while retaining its native staging allocations', () => {
  const {memory, runtime, services} = fixture({failTile: true});
  assert.equal(initializeRaceTextures(runtime), 1);
  assert.equal(memory.readInt32LE(0x5ed028), -1);
  const palette = services.allocations.findLast(([, bytes]) => bytes === 1024)[2];
  assert.equal(services.calls.some(([name, address]) => name === 'free' && address === palette), false);
  assert.equal(services.rendererCalls.filter(row => row[0] === 'upload').length, 3);
});

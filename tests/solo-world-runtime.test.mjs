import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSoloWorldRuntime, constructSoloWorldPlacements, initializeSoloWorldConstants} from '../src/solo-world-runtime.mjs';
import {breakClassTwoModel} from '../src/model-contact-effects.mjs';
import {createRawTrackFixtureFiles, createRawTrackServices} from '../tools/lib/track-runtime-fixtures.mjs';
import {createGameImageAsyncFixtures} from '../tools/lib/game-image-async-fixtures.mjs';
import {prepareRaceTextureFixture} from '../tools/lib/race-texture-fixtures.mjs';
import {initializeGameImageLibrary} from '../src/game-image-startup.mjs';
import {initializeTrackBackdropTables} from '../src/track-backdrop-construction.mjs';
import {initializeRaceObjectStartupTables} from '../src/race-object-startup.mjs';
import {initializeTrackRuntimeTables} from '../src/track-runtime-loading.mjs';
import {loadRuntimeRaceTrack} from '../src/track-runtime-loading.mjs';
import {RollcageArchive} from '../src/archive.mjs';
import {createModelCollisionContext} from '../src/model-candidates.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {relocateRaceTrackPointers} from '../src/track-relocation.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';

const BASE = 0x100000, MODEL = BASE + 0x2000, OBJECT = 0x200000;
function fixture() {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p);
  put(0x90b970, BASE); put(0x90b990, BASE); put(BASE + 0x18, BASE + 0x300); put(BASE + 0x300, MODEL);
  put(0x6e6b44, 1); put(0x70e200, OBJECT); put(OBJECT, 0x400); put(OBJECT + 0x10, MODEL); put(OBJECT + 0x194, BASE + 0x4000);
  memory.writeUInt16LE(0x100, MODEL + 0x34); memory[OBJECT + 0x19a] = 2;
  const shape = {index: 0, slot: 7, offset: 0x2100};
  const settings = {placementIndex: 0, modelIndex: 0, configurationBase: 0x4000, configurations: [{type: 4, flags: 0, raw: Buffer.alloc(4)}], position: [1, 2, 3], class: 2, yaw: 0};
  const modelContext = {instances: new Map([[0, {settings, collision: {shapes: [shape]}}]]), links: {nodes: []}};
  return {memory, put, shape, settings, modelContext};
}

test('world bindings preserve native placement/shape identity and expose live class and configuration', () => {
  const f = fixture(), world = bindSoloWorldRuntime(f), live = world.modelContext.instances.get(0);
  assert.equal(world.objectForPlacement(0), OBJECT);
  assert.equal(live.collision, f.modelContext.instances.get(0).collision);
  assert.deepEqual(world.candidateMapping.modelPointersFor({...live, shape: f.shape}), {object: OBJECT, shape: MODEL + 0x100});
  assert.equal(world.candidateMapping.modelForPointers(OBJECT, MODEL + 0x100).settings, live.settings);
  f.memory[OBJECT + 0x19a] = 5; f.memory[BASE + 0x4003] = 0xa5;
  assert.equal(live.settings.class, 5); assert.equal(live.settings.configurations[0].type, 5);
  assert.equal(live.settings.configurations[0].flags, 0xa5000000);
  assert.equal(f.settings.class, 2); assert.equal(f.settings.configurations[0].type, 4);
  f.put(OBJECT + 0x194, BASE + 0x5000); f.memory[BASE + 0x5003] = 1;
  assert.equal(live.settings.configurations[0].type, 1);
});

test('bindings expose exact raw position separately from native integer placement coordinates', () => {
  const f = fixture(), world = bindSoloWorldRuntime(f), settings = world.modelContext.instances.get(0).settings;
  f.put(OBJECT + 0x34, -65537); f.put(OBJECT + 0x38, 98304); f.put(OBJECT + 0x3c, 7);
  assert.deepEqual(settings.position, [-2, 1, 0]);
  assert.deepEqual(settings.positionQ16, [-65537, 98304, 7]);
  f.memory[OBJECT + 0x199] = 231; f.memory[OBJECT + 0x198] = 7;
  assert.equal(settings.yaw, 231); assert.equal(settings.stateByte198, 7);
  f.put(0x9207e4, 1); assert.equal(world.worldEffectState.records.byteOffset, f.memory.byteOffset + 0x920800);
});

test('authored object quaternion lookup installs the original cosine image bytes', () => {
  const memory = Buffer.alloc(0x600000);
  initializeSoloWorldConstants(memory);
  assert.equal(memory.readInt32LE(0x575228), 65536);
  assert.equal(memory.readInt32LE(0x57522c), 65534);
  assert.throws(() => initializeSoloWorldConstants(Buffer.alloc(16)), /native image storage/);
});

test('detached candidate, wrong model/configuration and missing registry identities fail explicitly', () => {
  const f = fixture(), world = bindSoloWorldRuntime(f);
  assert.throws(() => world.candidateMapping.modelPointersFor({settings: f.settings, shape: f.shape}), /detached/);
  assert.throws(() => world.candidateMapping.modelForPointers(OBJECT + 128, MODEL + 0x100), /outside/);
  f.put(OBJECT + 0x194, BASE + 0x4004); assert.throws(() => bindSoloWorldRuntime(f), /identity/);
  f.put(OBJECT + 0x194, BASE + 0x4000); f.put(0x6e6b44, 0); assert.throws(() => bindSoloWorldRuntime(f), /not constructed/);
  assert.throws(() => constructSoloWorldPlacements(f), /CRT loader services/);
});

test('actual full track loader produces class1/2/4 objects and class2 break updates the same live world', async () => {
  const program = await loadRetainedNativeProgram(), memory = Buffer.alloc(0x1000000), put = (p, v) => memory.writeInt32LE(v | 0, p);
  program.initializeMemory(memory);
  prepareRaceTextureFixture(memory, {bits: 32, mipmaps: false}); initializeTrackBackdropTables(memory); initializeRaceObjectStartupTables(memory); initializeTrackRuntimeTables(memory);
  put(0x6e6b40, 0x50000); put(0x5ecefc, 0x150000); put(0x5ecb1c, 0x151000); put(0x90b988, 0x160000);
  memory.write('level\0', 0x170000); memory[0x150033] = 0; memory[0x151579] = 0; put(0x5ec958, 1);
  const files = createRawTrackFixtureFiles(2), blp = files.get('level.blp'), btp = files.get('level.btp');
  btp.writeUInt32LE(3, 20); btp.copy(btp, 0x800 + 112, 0x800, 0x800 + 56);
  const instances = new Map();
  for (let index = 0; index < 3; index++) {
    const row = 0x800 + index * 56;
    btp[row + 31] = [1, 2, 4][index]; btp.fill(0, row + 0x2e, row + 56);
    const settings = {placementIndex: index, modelIndex: 0, configurationBase: 0x2200,
      configurations: [0, 1, 2].map(slot => ({index: slot, type: 4, flags: 0, raw: Buffer.alloc(4)})),
      position: [8, 10, 12].map(offset => btp.readInt16LE(row + offset)), class: btp[row + 31], yaw: 0};
    instances.set(index, {settings, collision: {shapes: [0, 1, 2].map(slot => ({index: slot, slot, offset: 0x4200 + slot * 20}))}});
  }
  const services = createRawTrackServices(memory, files), asynchronous = createGameImageAsyncFixtures(memory);
  const runtime = {memory, scratchBase: 0x9000, roundingMode: 'nearest-even', services: {...services, ...asynchronous}, modelContext: {instances, links: {nodes: []}}};
  initializeGameImageLibrary(runtime);
  assert.equal(loadRuntimeRaceTrack(0x170000, runtime), 1);
  const world = bindSoloWorldRuntime(runtime);
  assert.equal(world.modelContext.instances.size, 3);
  assert.deepEqual([...world.modelContext.instances.values()].map(value => value.settings.class), [1, 2, 4]);
  assert.equal(memory.readUInt32LE(0x9207e4), 1);
  const object = world.objectForPlacement(1), row = 0x920800 + memory[object + 0x19b] * 16;
  assert.equal(memory.readUInt32LE(row + 12), object);
  assert.equal(memory.readUInt16LE(object + 0x192), 1);
  assert.equal(memory.readUInt32LE(object + 0x194), world.geometryBase + 0x2200);
  assert.ok(memory.readUInt32LE(object + 12));
  breakClassTwoModel(object, runtime);
  assert.equal(world.modelContext.instances.get(1).settings.class, 5);
  assert.equal(world.modelContext.instances.get(1).settings.configurations[0].type, 5);
  assert.equal(memory[row + 9], 1);
  assert.equal(memory.readUInt32LE(0x6e6b44), world.constructedBodies.length);
  assert.equal(blp.toString('ascii', 0, 4), 'GFXM');
});

test('installed LOW/LEV1 placement phase needs only CRT memory services after relocation', async t => {
  let archive;
  try {archive = await RollcageArchive.open('C:/Program Files (x86)/Psygnosis/Rollcage');}
  catch (error) {if (error.code === 'ENOENT') {t.skip('Installed Rollcage data is unavailable.'); return;} throw error;}
  try {
    const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31), program = await loadRetainedNativeProgram();
    const memory = Buffer.alloc(64 * 1024 * 1024), put = (p, v) => memory.writeInt32LE(v | 0, p), base = 0xa00000, textureAddress = 0x1800000;
    program.initializeMemory(memory); initializeSoloWorldConstants(memory); data.copy(memory, base); textures.copy(memory, textureAddress);
    const grid = parseCollisionGrid(data), modelContext = createModelCollisionContext(data, textures, {spatial: grid.spatial});
    put(0x90b970, base); put(0x90b990, base);
    const relocated = relocateRaceTrackPointers(base, base, {memory, scratchBase: 0x9000});
    put(0x902eec, 0xe00000); put(0x70dcf4, 0); put(0x6e6b44, 0); put(0x9207e4, 0);
    put(0x909278, relocated.normals); put(0x909294, memory.readUInt32LE(base + 0x80)); put(0x909290, memory.readUInt32LE(base + 0x7c));
    put(0x9092bc, base + data.readUInt32LE(0xac)); put(0x90b988, base + data.readUInt32LE(0x110));
    for (const row of grid.spatial.rows) put(base + row.offset + 12, row.firstIndex ? base + row.mapPointer : 0);
    for (const node of grid.spatial.nodes) put(base + node.offset + 8, 0);
    let heap = 0x2000000; const calls = [];
    const runtime = {memory, scratchBase: 0x9000, textureAddress, geometry: relocated.geometry, configurationBase: relocated.auxiliary, modelContext, roundingMode: 'nearest-even', services: {libraryCall(name, args) {
      calls.push(name);
      if (name === 'allocate') {const address = heap; heap += (args[0] + 127) & ~127; return address;}
      if (name === 'memset') {memory.fill(args[1], args[0], args[0] + args[2]); return args[0];}
      if (name === 'free') return 0;
      throw Error(`Unexpected placement service ${name}.`);
    }}};
    const world = constructSoloWorldPlacements(runtime);
    assert.equal(world.modelContext.instances.size, 114);
    assert.equal(world.constructedBodies.length, 114);
    assert.equal(world.worldEffectState.count, 14);
    assert.equal(world.attachmentCount, 39);
    assert.equal(world.skippedPlacements.length, 10);
    assert.ok(calls.every(name => ['allocate', 'memset', 'free'].includes(name)));
    assert.equal(world.modelContext.instances.get(51).settings.class, 2);
    const object = world.objectForPlacement(51), row = 0x920800 + memory[object + 0x19b] * 16;
    assert.equal(memory.readUInt32LE(row + 12), object);
    assert.deepEqual(world.modelContext.instances.get(51).settings.positionQ16, [-1544 << 16, 180 << 16, 5572 << 16]);
    breakClassTwoModel(object, runtime);
    assert.equal(world.modelContext.instances.get(51).settings.class, 5);
    assert.equal(world.modelContext.instances.get(51).settings.configurations[0].type, 5);
    assert.equal(memory[row + 9], 1);
  } finally {await archive.close();}
});

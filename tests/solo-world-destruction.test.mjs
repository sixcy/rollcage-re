import test from 'node:test';
import assert from 'node:assert/strict';
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {createModelCollisionContext} from '../src/model-candidates.mjs';
import {relocateRaceTrackPointers} from '../src/track-relocation.mjs';
import {constructSoloWorldPlacements, initializeSoloWorldDestruction, initializeSoloWorldConstants} from '../src/solo-world-runtime.mjs';
import {initializeRawBodyArena, initializeRawShapePools} from '../src/world-physics-pools.mjs';
import {initializeRawParticlePools, initializeRawBodyDebrisPool} from '../src/particle-pools.mjs';
import {initializeDynamicLightStorage, initializeAuthoredDynamicLights} from '../src/dynamic-light-state.mjs';
import {breakClassOneModel, updateModelContactFragments} from '../src/model-contact-effects.mjs';
import {damagePlacedObject} from '../src/placed-object-damage.mjs';
import {updatePlacedObjectDestruction} from '../src/placed-object-destruction.mjs';
import {activateWorldFragment, maintainWorldFragments} from '../src/world-fragment-registry.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';

// Installed assets and retained image bytes exercise the recovered constructors;
// the original process is never launched. Impact magnitude is a controlled input.
async function installedFixture(t, level) {
  let archive;
  try {archive = await RollcageArchive.open('C:/Program Files (x86)/Psygnosis/Rollcage');}
  catch (error) {if (error.code === 'ENOENT') {t.skip('Installed game data is unavailable.'); return;} throw error;}
  let data, textures;
  try {({data} = await archive.readResource(30 + (level - 1) * 2)); ({data: textures} = await archive.readResource(31 + (level - 1) * 2));}
  finally {await archive.close();}
  const memory = Buffer.alloc(64 * 1024 * 1024), put = (p, v) => memory.writeInt32LE(v | 0, p), ptr = p => memory.readUInt32LE(p);
  (await loadRetainedNativeProgram()).initializeMemory(memory); initializeSoloWorldConstants(memory);
  let heap = 0xa00000;
  const allocate = size => {const address = heap; heap += (size + 127) & ~127; assert.ok(heap <= memory.length); return address;};
  const base = allocate(data.length), textureAddress = allocate(textures.length), config = allocate(0x1000), session = allocate(0x1000);
  data.copy(memory, base); textures.copy(memory, textureAddress);
  put(0x5ecefc, config); put(0x5ecb1c, session); memory.writeFloatLE(1, config + 0x68); put(0x5ec958, 1);
  put(0x90b970, base); put(0x90b990, base);
  const grid = parseCollisionGrid(data), models = createModelCollisionContext(data, textures, {spatial: grid.spatial});
  const runtime = {memory, scratchBase: 0x9000, allocate, handlers: {allocate}, roundingMode: 'nearest-even', x87PrecisionBits: 24};
  const relocated = relocateRaceTrackPointers(base, base, runtime), pack = ptr(0x90b98c);
  put(pack, ptr(base + 0x14)); put(pack + 0x18, ptr(base + 0x18)); put(pack + 0x58, base + data.readUInt32LE(0x84)); put(pack + 0x60, relocated.groups);
  put(0x909278, relocated.normals); put(0x909294, ptr(base + 0x80)); put(0x909290, ptr(base + 0x7c));
  put(0x9092bc, base + data.readUInt32LE(0xac)); put(0x9092c0, base + data.readUInt32LE(0x28)); put(0x90b988, base + data.readUInt32LE(0x110));
  for (const row of grid.spatial.rows) put(base + row.offset + 12, row.firstIndex ? base + row.mapPointer : 0);
  for (const node of grid.spatial.nodes) put(base + node.offset + 8, 0);
  put(0x709808, data.readInt16LE(0x11e)); put(0x6e6b44, 0); put(0x70dcf4, 0); put(0x9207e4, 0);
  initializeRawShapePools(runtime); initializeRawBodyArena(runtime); put(0x90b984, textures.readUInt32LE(0x10));
  initializeRawParticlePools(runtime); initializeRawBodyDebrisPool(runtime);
  const world = constructSoloWorldPlacements({...runtime, textureAddress, geometry: relocated.geometry, configurationBase: relocated.auxiliary, modelContext: models,
    services: {libraryCall(name, args) {
      if (name === 'allocate') return allocate(args[0]);
      if (name === 'memset') {memory.fill(args[1], args[0], args[0] + args[2]); return args[0];}
      if (name === 'free') return 0;
      throw Error(`Unexpected service ${name}.`);
    }}});
  initializeDynamicLightStorage(runtime); initializeAuthoredDynamicLights(runtime);
  const destruction = initializeSoloWorldDestruction(runtime);
  return {memory, put, ptr, runtime, world, destruction};
}

test('installed class1 contact executes its real fragment/particle/debris producers', async t => {
  const f = await installedFixture(t, 1); if (!f) return;
  const {memory, ptr, runtime, world, destruction} = f;
  assert.equal(destruction.bodyStorage.length, 36);
  const [index, instance] = [...world.modelContext.instances].find(([, value]) => value.settings.class === 1 && value.settings.configurations.some(value => value.type === 2));
  const object = world.objectForPlacement(index), fragmentBank = ptr(0x810924);
  const beforeArena = ptr(0x70dcf4);
  assert.equal(breakClassOneModel(object, runtime), 1);
  assert.equal(instance.settings.class, 5); assert.equal(ptr(object + 4), 0);
  assert.ok(memory.subarray(fragmentBank, fragmentBank + 64 * 384).some((value, offset) => offset % 384 === 0x2c && value === 255));
  assert.ok(ptr(0x6e65c0) > 0); assert.ok(ptr(0x902b88) > 0); assert.equal(ptr(0x70dcf4), beforeArena);
  updateModelContactFragments(runtime);
  assert.ok(memory.subarray(fragmentBank, fragmentBank + 64 * 384).some((value, offset) => offset % 384 === 0x2c && value === 254));
});

test('installed class4 shape damage reaches the real destruction queue and preparation stages', async t => {
  const f = await installedFixture(t, 13); if (!f) return;
  const {memory, put, ptr, runtime, world} = f;
  const [index, instance] = [...world.modelContext.instances].find(([, value]) => value.settings.class === 4 && value.settings.configurations.some(value => value.type === 4));
  const object = world.objectForPlacement(index), slot = instance.settings.configurations.findIndex(value => value.type === 4), impact = 0x78000, velocity = 0x79000;
  // A heavy native type17 impact clears every remaining type4 shape at the tail.
  put(impact, 17); put(impact + 0xa8, 65536); put(velocity, 8 * 65536);
  assert.equal(damagePlacedObject(object, impact, slot, velocity, runtime), 1);
  assert.equal(instance.settings.configurations[slot].type, 5);
  assert.ok(memory[0x9207e0] > 0); assert.ok(ptr(0x902b88) > 0); assert.ok(ptr(0x6e65c0) > 0);
  for (let i = 0; i < 4; i++) updatePlacedObjectDestruction(runtime);
  assert.equal(instance.settings.class, 5);
  const controllers = ptr(0x9205dc);
  assert.ok(Array.from({length: 4}, (_, i) => memory.readUInt16LE(controllers + i * 0xa8 + 2)).some(state => state === 4));
  let tick = 4;
  while (tick < 4096 && (memory[0x9207e0] || Array.from({length: 4}, (_, i) => memory.readUInt16LE(controllers + i * 0xa8 + 2)).some(Boolean))) {
    updatePlacedObjectDestruction(runtime); maintainWorldFragments(runtime); tick++; put(0x90a548, tick);
  }
  assert.ok(tick < 4096, 'Original LEV13 destruction chain completes in the bounded fixture.');
  assert.equal(ptr(object + 4), 0);
});

test('native fragment identities and4810b0 filter compose with physics views and retirement', async t => {
  const f = await installedFixture(t, 1); if (!f) return;
  const {memory, put, ptr, runtime, destruction} = f;
  const views = createPhysicsRuntimeViews({memory, bodyAt: destruction.bodyAt,
    bodyLists: [{address: ptr(0x902bc0), capacity: 96}, ...Array.from({length: 65}, (_, i) => ({address: ptr(0x902be0 + i * 12), capacity: 33}))],
    collisionFilters: destruction.collisionFilters});
  const position = 0x78000, momentum = 0x79000;
  [-1544, 180, 5572].forEach((value, i) => put(position + i * 4, value << 16)); put(momentum, 256);
  activateWorldFragment(position, momentum, 0, 51, runtime);
  assert.equal(views.physicalGroup.count, 1);
  const body = views.physicalGroup.bodies[0], address = body.address;
  assert.equal(body, views.bodyAt(address)); assert.equal(body.bytes, destruction.bodyAt(address).bytes); assert.equal(body.bytes.length, 0x180);
  assert.equal(destruction.bodyAt(0x1234), null);
  put(address + 0x68, 3 << 16); put(address + 0x6c, -4 << 16); put(address + 0x70, 0);
  const other = views.bodyAt(destruction.bodyStorage[0].address); put(other.address + 0x68, 0); put(other.address + 0x6c, 0); put(other.address + 0x70, 0);
  assert.equal(body.collisionFilter(body, other), 1); assert.equal(memory.readUInt16LE(address + 0x160), 25);
  memory[ptr(0x849a5c) + 4] = 1; put(0x90a548, 0);
  maintainWorldFragments(runtime);
  assert.equal(views.physicalGroup.count, 0); assert.equal(ptr(address + 4), 0);
});

test('world destruction rejects missing startup pools and CRT service', () => {
  assert.throws(() => initializeSoloWorldDestruction({memory: Buffer.alloc(0xa00000), scratchBase: 0x9000}), /CRT allocation/);
  assert.throws(() => initializeSoloWorldDestruction({memory: Buffer.alloc(0xa00000), scratchBase: 0x9000, allocate: () => 0}), /world pools/);
});

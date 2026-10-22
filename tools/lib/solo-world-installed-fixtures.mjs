import {RollcageArchive} from '../../src/archive.mjs';
import {parseCollisionGrid} from '../../src/collision-grid.mjs';
import {createModelCollisionContext} from '../../src/model-candidates.mjs';
import {relocateRaceTrackPointers} from '../../src/track-relocation.mjs';
import {constructSoloWorldPlacements, initializeSoloWorldDestruction, initializeSoloWorldConstants, initializeSoloAuthoredObjectList} from '../../src/solo-world-runtime.mjs';
import {initializeRawBodyArena, initializeRawShapePools} from '../../src/world-physics-pools.mjs';
import {initializeParticlePoolConstants, initializeRawParticlePools, initializeRawBodyDebrisPool} from '../../src/particle-pools.mjs';
import {initializeDynamicLightStorage, initializeAuthoredDynamicLights} from '../../src/dynamic-light-state.mjs';
import {initializeRaceObjectList} from '../../src/race-object-startup.mjs';
import {loadRetainedNativeProgram} from './retained-native-program.mjs';
let retained;

// Original installed assets through the bounded source startup bridge. Image
//constants come from retained evidence, not a running original game. Allocation
//order and omitted GPU/backdrop startup are declared fixture inputs.
export async function createInstalledSoloWorldFixture(level, {high = false, includeNonordinary = true, installation = 'C:/Program Files (x86)/Psygnosis/Rollcage'} = {}) {
  const archive = await RollcageArchive.open(installation); let data, textures;
  try {const index = (high ? 70 : 30) + (level - 1) * 2; ({data} = await archive.readResource(index)); ({data: textures} = await archive.readResource(index + 1));}
  finally {await archive.close();}
  const memory = Buffer.alloc(64 * 1024 * 1024), put = (p, v) => memory.writeInt32LE(v | 0, p), ptr = p => memory.readUInt32LE(p);
  (await (retained ??= loadRetainedNativeProgram())).initializeMemory(memory); initializeSoloWorldConstants(memory); initializeParticlePoolConstants(memory);
  let heap = 0xa00000;
  const allocate = size => {const address = heap; heap += (size + 127) & ~127; if (heap > memory.length) throw Error('Installed world fixture exhausted storage.'); return address;};
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
  put(0x9092b4, ptr(base + 0xa4));
  for (const row of grid.spatial.rows) put(base + row.offset + 12, row.firstIndex ? base + row.mapPointer : 0);
  for (const node of grid.spatial.nodes) put(base + node.offset + 8, 0);
  put(0x709808, data.readInt16LE(0x11e)); put(0x6e6b44, 0); put(0x70dcf4, 0); put(0x9207e4, 0);
  initializeRawShapePools(runtime); initializeRawBodyArena(runtime); put(0x90b984, textures.readUInt32LE(0x10));
  initializeRawParticlePools(runtime); initializeRawBodyDebrisPool(runtime);
  if (includeNonordinary) initializeSoloAuthoredObjectList(runtime);
  const world = constructSoloWorldPlacements({...runtime, textureAddress, geometry: relocated.geometry, configurationBase: relocated.auxiliary, modelContext: models, includeNonordinary,
    services: {libraryCall(name, args) {
      if (name === 'allocate') return allocate(args[0]);
      if (name === 'memset') {memory.fill(args[1], args[0], args[0] + args[2]); return args[0];}
      if (name === 'free') return 0;
      throw Error(`Unexpected service ${name}.`);
    }}});
  initializeDynamicLightStorage(runtime); initializeAuthoredDynamicLights(runtime);
  const destruction = initializeSoloWorldDestruction(runtime);
  if (includeNonordinary) initializeRaceObjectList(runtime);
  return {memory, put, ptr, runtime, world, destruction, data, textures, grid, base, relocated};
}

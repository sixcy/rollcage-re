import constants from './solo-runtime-constants.json' with {type: 'json'};
import skill from './finish-skill-tables.json' with {type: 'json'};
import sqrt from './sqrt-table.json' with {type: 'json'};
import {parseCollisionGrid} from './collision-grid.mjs';
import {createModelCollisionContext} from './model-candidates.mjs';
import {relocateRaceTrackPointers} from './track-relocation.mjs';
import {initializeWorldPhysicsConstants, initializeRawShapePools, initializeRawBodyArena} from './world-physics-pools.mjs';
import {initializeVehicleConstructionTables, constructVehicle} from './vehicle-construction.mjs';
import {initializeVehicleAutonomousState} from './vehicle-autonomous-init.mjs';
import {initializeVehicleContactProfileTables} from './vehicle-contact-profile.mjs';
import {initializeAutonomousDispatchTables, runAutonomousDispatch} from './autonomous-dispatch.mjs';
import {initializeAutonomousProfileTables} from './autonomous-profile-plan.mjs';
import {updateAutonomousRouteControl} from './autonomous-route-control.mjs';
import {updateVehicleInputBlock, updateVehicleControlState, updateVehicleMotionState, updateVehicleSurfaceDrive} from './vehicle-control-state.mjs';
import {createRespawnRuntime} from './respawn-runtime.mjs';
import {createPhysicsRuntimeViews} from './physics-runtime-views.mjs';
import {createVehicleRuntimeViews} from './vehicle-runtime-views.mjs';
import {createRawTerrainGrid} from './raw-terrain-query.mjs';
import {createVehicleCollisionFilter} from './vehicle-collision-filter.mjs';
import {registerRawBodySpatial} from './raw-body-construction.mjs';
import {removeBodySpatial} from './body-retirement.mjs';
import {stepSimulationFrame} from './simulation-frame.mjs';
import {runRaceProgressPass} from './race-progress-pass.mjs';
import {finishRaceProgress} from './race-completion.mjs';
import {populateRawVehicleTrackBasis} from './raw-track-basis.mjs';
import {updateRaceHandlingScale} from './race-handling-scale.mjs';
import {prepareVehicleWheelRender} from './wheel-render-state.mjs';
import {runRawPostFrameBodyStates} from './raw-respawn-state.mjs';
import {initializeParticlePoolConstants, initializeRawParticlePools, initializeRawBodyDebrisPool} from './particle-pools.mjs';
import {advanceRawEffectParticles, advanceRawBodyDebris} from './particle-lifetime.mjs';
import {initializeAutonomousCandidateModifierTables} from './autonomous-candidate-modifiers.mjs';
import {initializeAutonomousOpponentTables} from './autonomous-opponent-candidates.mjs';
import {initializeAutonomousWeaponTables} from './autonomous-weapon-policy.mjs';
import {initializeBodyRetirementEffectTables} from './body-retirement-effects.mjs';
import {buildSoloCarMesh} from './solo-car-mesh.mjs';
import {appendLoadedWorldObstacle} from './world-obstacle-registry.mjs';
import {quaternionMatrix} from './fixed-math.mjs';
import {updateBodyDerived} from './body-physics.mjs';

const RECORD = 0x909300, STACK = 0x9000, PACK = 0x909240;
export const SOLO_STEP_SECONDS = 1 / 60;

export function createSession(data, textureData) {
  const source = Buffer.from(data), textures = Buffer.from(textureData);
  if (source.length < 0x120 || source.toString('ascii', 0, 4) !== 'GFXM' || textures.length < 0x40 || textures.toString('ascii', 0, 4) !== 'BTP ') throw Error('Racing test requires GFXM geometry and BTP textures.');
  let session = createSoloRuntime(source, textures), disposed = false;
  const active = () => { if (disposed) throw Error('Solo session has been disposed.'); return session; };
  return Object.freeze({
    get assets() { return active().assets; },
    get snapshot() { return active().snapshot; },
    step() { active().step(); return session.snapshot; },
    reset() { const previous = active(), replacement = createSoloRuntime(source, textures); previous.dispose(); session = replacement; return session.snapshot; },
    dispose() { if (!disposed) {session.dispose(); disposed = true; session = null;} }
  });
}

// Browser/Node service adapter for a single installed-data practice session.
// Runtime pack publications follow 44c2b0; installed bytes are copied first.
function createSoloRuntime(data, textureData) {
  const memory = Buffer.alloc(64 * 1024 * 1024);
  const put = (p, v) => memory.writeInt32LE(v | 0, p);
  const word = (p, v) => memory.writeUInt16LE(v & 65535, p);
  const ptr = p => memory.readUInt32LE(p);
  let cursor = 0xa00000;
  const allocate = size => {
    if (!Number.isInteger(size) || size < 0 || cursor + size > memory.length) throw Error('Racing test exhausted its runtime storage.');
    const address = cursor; cursor += (size + 127) & ~127; return address;
  };
  for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address));
  initializeWorldPhysicsConstants(memory);
  initializeVehicleConstructionTables(memory);
  initializeVehicleContactProfileTables(memory);
  initializeAutonomousDispatchTables(memory);
  initializeAutonomousProfileTables(memory);
  initializeAutonomousCandidateModifierTables(memory);
  initializeAutonomousOpponentTables(memory);
  initializeAutonomousWeaponTables(memory);
  initializeBodyRetirementEffectTables(memory);
  initializeParticlePoolConstants(memory);
  Buffer.from(skill.hex, 'hex').copy(memory, 0x570680);
  sqrt.values.forEach((value, i) => word(0x5eb290 + i * 2, value));
  const base = allocate(data.length); data.copy(memory, base);
  const session = allocate(0x1000), config = allocate(0x1000);
  put(0x5ecb1c, session); put(0x5ecefc, config);
  memory.writeFloatLE(1, config + 0x68);
  memory[session] = 8; memory[session + 0x54d] = 1;
  memory[session + 0x551] = 1; // Native time-trial mode: practice keeps lap1.
  memory[session + 0x585] = 1; memory[session + 0x586] = 255;
  put(session + 0x57c, 4); put(session + 0x580, 1000); put(session + 0x618, 1);
  put(0x5ed008, 1); put(0x5ec958, 1);
  put(0x90b970, base); put(0x90b990, base);
  const relocated = relocateRaceTrackPointers(base, base, {memory, scratchBase: STACK});
  const grid = parseCollisionGrid(data), models = createModelCollisionContext(data, textureData, {spatial: grid.spatial});
  if (!grid.available) throw Error('Racing test requires a collision grid.');
  // Same 909240 pack fields as 44c2b0, without GPU primitive allocation.
  put(PACK, ptr(base + 0x14));
  for (const [to, from] of [[0x0c,32],[0x10,16],[0x18,24],[0x1c,52],[0x20,56],[0x24,64],[0x28,72],[0x4c,112],
    [0x2c,68],[0x48,116],[0x30,76],[0x50,124],[0x54,128],[0x58,132],[0x3c,108],[0x94,192],
    [0x68,144],[0x78,168],[0x6c,156],[0x74,164]]) put(PACK + to, ptr(base + from));
  for (const [to, from] of [[0x70,160],[0x90,188],[0x7c,172],[0x84,176],[0x8c,184],[0x98,204],[0x9c,216]]) put(PACK + to, base + data.readUInt32LE(from));
  put(PACK + 0x80, base + data.readUInt32LE(0x28));
  put(PACK + 0x60, relocated.groups);
  memory[PACK + 0x44] = data[0x95]; memory[PACK + 0x46] = data[0x79];
  memory[PACK + 0x47] = data[0x78];
  // Header+84 is relocated by a later loader section.
  put(PACK + 0x58, base + data.readUInt32LE(0x84));
  put(0x909254, base + data.readUInt32LE(0x24));
  put(0x909278, relocated.normals);
  put(0x90925c, base + data.readUInt32LE(0x34));
  put(0x9092c0, base + data.readUInt32LE(0x28));
  put(0x90b988, base + data.readUInt32LE(0x110));
  word(0x90929c, data.readUInt16LE(0x66));
  for (const row of grid.spatial.rows) put(base + row.offset + 12, row.firstIndex ? base + row.mapPointer : 0);
  for (const node of grid.spatial.nodes) put(base + node.offset + 8, 0);
  put(0x709808, data.readInt16LE(0x11e));
  initializeRawShapePools({memory, allocate}); initializeRawBodyArena({memory, allocate});
  put(0x90b984, textureData.readUInt32LE(0x10));
  initializeRawParticlePools({memory, allocate, roundingMode: 'nearest-even'});
  initializeRawBodyDebrisPool({memory, allocate});
  put(0x5eb5e0, 0x4000);
  const runtime = {memory, scratchBase: STACK, handlers: {allocate}};
  const address = constructVehicle(RECORD, 0, runtime);
  put(RECORD + 0x18, 0x12345678);
  memory[address + 0x718] = 8; memory[address + 0x708] = 128; memory[address + 0x720] = 16;
  const wheelAddresses = Array.from({length: 4}, (_, i) => ptr(address + 0x390 + i * 200));
  const renderAddresses = [address, ...wheelAddresses];
  const assets = buildSoloCarMesh(data, textureData, renderAddresses.map(value => ptr(value + 0x10) - base));
  // Runtime mappings for parsed collision objects use the same installed model
  // bytes as native body construction. Map static instances separately below.
  const mapping = {terrainVerticesFor: index => base + grid.scene.segments[index].verticesOffset};
  const objects = new Map(), candidates = new Map();
  for (const instance of models.instances.values()) {
    const {settings, collision} = instance, object = allocate(0x200);
    objects.set(settings, object);
    const model = ptr(ptr(PACK + 0x18) + settings.modelIndex * 4);
    put(object + 0x10, model); put(object + 0x24, ptr(model + 0x40));
    put(object + 0x28, ptr(model + 0xc)); put(object + 0x2c, base + (collision.faceBase ?? 0));
    put(object + 0x194, base + settings.configurationBase);
    memory[object + 0x199] = settings.yaw; memory[object + 0x19a] = settings.class;
    memory[object + 0x10d] = memory[model + 4];
    settings.position.forEach((value, i) => put(object + 0x34 + i * 4, value << 16));
    for (const shape of collision.shapes) candidates.set(`${object}:${base + shape.offset}`, {collision, shape, settings});
    appendLoadedWorldObstacle(object, {memory});
  }
  mapping.modelPointersFor = candidate => ({object: objects.get(candidate.settings), shape: base + candidate.shape.offset});
  mapping.modelForPointers = (object, shape) => candidates.get(`${object}:${shape}`);
  for (const [index, value] of models.links.entries.entries()) {
    if (value < 65536) {
      const instance = models.instances.get(value);
      put(base + models.links.table + index * 4, instance ? objects.get(instance.settings) : 0);
    }
  }
  const modelEffects = {onClass1Contact: () => false, onClass2Contact: () => {}, onClass4Break: () => {}, onObjectContact: () => false};
  const respawn = createRespawnRuntime({memory, recordCount: 1, bodyStorage: [{address, length: 0x3e78}, {address: 0x70f130, length: 0x3e78}], scratchBase: STACK});
  const filterRuntime = {memory, scratchBase: STACK - 52};
  const filter = createVehicleCollisionFilter(filterRuntime);
  const list = ptr(0x902bc0);
  const views = createPhysicsRuntimeViews({memory, bodyAt: respawn.bodyAt, bucketAt: respawn.bucketAt,
    bodyLists: [{address: list, capacity: 96}, ...Array.from({length: 65}, (_, i) => ({address: ptr(0x902be0 + i * 12), capacity: 33}))],
    candidateMapping: mapping, collisionFilters: new Map([[0x41e080, filter]])});
  const vehicleViews = createVehicleRuntimeViews({memory, bodyAt: views.bodyAt});
  const vehicle = vehicleViews.vehicleFor(address), body = vehicle.body;
  Object.defineProperty(vehicle, 'trackContext', {get: () => ({mode: memory[session + 0x579], progressStage: memory[RECORD + 0x20], routeIndex: memory[RECORD + 0x22]})});
  const rawGrid = createRawTerrainGrid(grid, mapping.terrainVerticesFor, {memory});
  const context = {
    environment: {data, grid: rawGrid, modelContext: models, wheelRuntime: {memory, views, grid: rawGrid, scratchBase: STACK - 56, handlers: {modelEffects}},
      effectRuntime: {views: vehicleViews, driveScratchBase: STACK - 56, forceScratchBase: STACK - 56}},
    records: views.records, queue: views.queue, candidateArena: views.candidateArena, candidateGroups: views.candidateGroups,
    effectFlags: views.effectFlags, gravityQ16: 0x4000, roundingMode: 'nearest-even', selectionCounter: 0,
    timeOptionsFor: views.timeOptionsFor, vehiclePreparationStateFor: vehicleViews.stateFor,
    spatialStateFor: value => ({found: true, outside: value.spatialOutside, node: grid.spatial.nodes[((value.spatialBucket.address - relocated.normals) / 12) | 0]}),
    staticScratch: {contact: views.contactAt(0x10000), tag: views.wordAt(0x10048)}, queryOutput: views.outputAt(0x10100),
    worldEffectState: {records: Buffer.alloc(0), count: 0, originS16: [0,0,0], strength: 0},
    nativeTerrain: {memory, views, grid: rawGrid}, nativePhysicsStack: {memory, views, scratchBase: STACK},
    handlers: {removeSpatial: value => removeBodySpatial(value.address, {memory}), insertSpatial: value => registerRawBodySpatial(value.address, {memory}),
      modelEffects, onSpecialEvent: () => {throw Error('Racing test reached an unsupported special vehicle event.');}}
  };
  initializeVehicleAutonomousState(RECORD, runtime);
  // 41dbb0 changes the spawn quaternion after its initial body-cache update.
  // Publish a coherent ready pose before the first viewer render/physics tick.
  body.rotation = quaternionMatrix(body.quaternion);
  updateBodyDerived(body);
  prepareVehicleWheelRender(address, runtime);
  let ticks = 0, disposed = false, laps = 0, lapStart = 0, bestLap = null, recoveries = 0, checkpointTransitions = 0;
  const stats = {events: 0, wheelContacts: 0, terrainHits: 0, modelHits: 0};
  const trackBasis = value => {
    populateRawVehicleTrackBasis(value.address, 0x10200, 0x10210, {memory});
    return [0,4,8].map(offset => memory.readInt32LE(0x10200 + offset));
  };
  const finishProgress = record => {
    if (record.bytes[0x1c]) { const elapsed = (ticks - lapStart) / 60; laps++; bestLap = bestLap === null ? elapsed : Math.min(bestLap, elapsed); }
    lapStart = ticks;
    finishRaceProgress(record.address, runtime);
  };
  const checkpointOptions = {trackBasis, finishProgress};
  return {
    assets,
    step() {
      if (disposed) throw Error('Solo session has been disposed.');
      put(address + 0x70c, ptr(address + 0x710));
      runAutonomousDispatch(address, runtime);
      updateAutonomousRouteControl(address, runtime);
      updateVehicleInputBlock(address, 0, runtime); updateVehicleControlState(address, runtime);
      const previousCheckpoint = memory[RECORD + 0x20];
      runRaceProgressPass({...runtime, progression: respawn, checkpointOptions});
      if (memory[RECORD + 0x20] !== previousCheckpoint) checkpointTransitions++;
      updateRaceHandlingScale(runtime);
      context.selectionCounter = ticks;
      const report = stepSimulationFrame(views.physicalGroup, [vehicle], context);
      stats.events += report.processedEvents; stats.wheelContacts += report.vehicles[0].contacts.hits;
      stats.terrainHits += report.terrainHits; stats.modelHits += report.modelHits;
      const recovery = runRawPostFrameBodyStates({memory, views, grid: rawGrid, models, progression: respawn,
        modelPointersFor: mapping.modelPointersFor, scratchBase: STACK, roundingMode: 'nearest-even', handlers: {modelEffects}});
      recoveries += recovery.respawnedBodies;
      updateVehicleMotionState(RECORD, runtime); updateVehicleSurfaceDrive(RECORD, runtime);
      prepareVehicleWheelRender(address, runtime);
      advanceRawBodyDebris({memory}); advanceRawEffectParticles({memory});
      ticks++; put(0x90a548, ticks);
      return report;
    },
    get snapshot() {
      const parts = renderAddresses.map(value => Object.freeze({
        position: Object.freeze([0,4,8].map(offset => memory.readInt32LE(value + 0x34 + offset) / 65536)),
        rotation: Object.freeze(Array.from({length: 9}, (_, i) => memory.readInt16LE(value + 0xc4 + i * 2) / 4096))
      }));
      return Object.freeze({ticks, position: parts[0].position, rotation: parts[0].rotation, parts: Object.freeze(parts),
        quaternion: Object.freeze(body.quaternion.map(value => value / 65536)), speed: memory.readInt16LE(address + 0x668),
        route: memory.readUInt16LE(address + 0x6c0), point: memory.readUInt16LE(address + 0x6c2),
        checkpoint: memory[RECORD + 0x20], checkpointCount: memory[PACK + 0x44], checkpointTransitions,
        laps, lapTime: (ticks - lapStart) * SOLO_STEP_SECONDS, bestLap, recoveries, stats: Object.freeze({...stats})});
    },
    dispose() { disposed = true; }
  };
}

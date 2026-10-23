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
import {initializeSoloTerrainRuntime} from './solo-terrain-runtime.mjs';
import {publishTerrainPointStartupSeed, initializeSoloTerrainPointRuntime} from './solo-terrain-point-runtime.mjs';
import {createSoloCameraRuntime, initializeSoloCameraConstants} from './solo-camera-runtime.mjs';
import {createVehicleCollisionFilter, applyRawActiveVehicleEffect} from './vehicle-collision-filter.mjs';
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
import {quaternionMatrix} from './fixed-math.mjs';
import {updateBodyDerived} from './body-physics.mjs';
import {REDUX_INITIAL_GRAVITY_Q16, REDUX_LOGICAL_TICKS_PER_SECOND, initializeRaceGravity} from './race-clock.mjs';
import {createPhysicsInteractionRuntime} from './physics-interaction-runtime.mjs';
import {constructSoloWorldPlacements, initializeSoloWorldConstants, initializeSoloWorldDestruction, initializeSoloAuthoredObjectList} from './solo-world-runtime.mjs';
import {updateModelContactFragments} from './model-contact-effects.mjs';
import {updatePlacedObjectDestruction} from './placed-object-destruction.mjs';
import {maintainWorldFragments} from './world-fragment-registry.mjs';
import {updateRawBodyAttachments} from './body-attachments.mjs';
import {updateRawPersistentEmitters, updateRawAttachmentEffects} from './attachment-effects.mjs';
import {initializeDynamicLightStorage, initializeAuthoredDynamicLights, updateDynamicLights} from './dynamic-light-state.mjs';
import {updatePlacedModelContactEffects} from './placed-model-effect-update.mjs';
import {initializeRaceObjectList} from './race-object-startup.mjs';
import {updateRaceObjects} from './race-object-update.mjs';
import {createRaceObjectCollisionFilters} from './race-object-collision-filters.mjs';
import {createRawAttachmentQueue} from './raw-attachment-queue.mjs';
import {initializeVehicleExecutionModes} from './race-startup-storage.mjs';
import {updateVehicleAnimationLights} from './vehicle-animation-lights.mjs';
import {updateVehicleWheelHistories} from './vehicle-wheel-histories.mjs';
import {initializeSoloWeaponConstants, initializeSoloWeaponRuntime} from './solo-weapon-runtime.mjs';
import {createSoloWeaponPresentation} from './solo-weapon-presentation.mjs';
import {createNativeFixedSqrtState} from './native-fixed-integer-state.mjs';

const RECORD = 0x909300, STACK = 0x9000, PACK = 0x909240;
export const SOLO_STEP_SECONDS = 1 / REDUX_LOGICAL_TICKS_PER_SECOND;

export function createSession(data, textureData, {onDebugFrame, onCollisionDispatch, vehicleType = 0, vehicleTypes, aiDifficulty = 1, weaponsEnabled = false} = {}) {
  if (onDebugFrame !== undefined && typeof onDebugFrame !== 'function') throw Error('onDebugFrame must be a function.');
  if (onCollisionDispatch !== undefined && typeof onCollisionDispatch !== 'function') throw Error('onCollisionDispatch must be a function.');
  if (!Number.isInteger(vehicleType) || vehicleType < 0 || vehicleType > 6) throw Error('vehicleType must be an integer from0 through6.');
  if (vehicleTypes !== undefined && (!Array.isArray(vehicleTypes) || vehicleTypes.length < 1 || vehicleTypes.length > 6 || [...vehicleTypes].some(value => !Number.isInteger(value) || value < 0 || value > 6))) throw Error('vehicleTypes must contain from1 through6 native vehicle types from0 through6.');
  if (!Number.isInteger(aiDifficulty) || aiDifficulty < 0 || aiDifficulty > 2) throw Error('aiDifficulty must be Easy0, Hard1 or Expert2.');
  if (typeof weaponsEnabled !== 'boolean') throw Error('weaponsEnabled must be a boolean.');
  const roster = Object.freeze(vehicleTypes === undefined ? [vehicleType] : [...vehicleTypes]);
  const source = Buffer.from(data), textures = Buffer.from(textureData);
  if (source.length < 0x120 || source.toString('ascii', 0, 4) !== 'GFXM' || textures.length < 0x40 || textures.toString('ascii', 0, 4) !== 'BTP ') throw Error('Racing test requires GFXM geometry and BTP textures.');
  const create = () => createSoloRuntime(source, textures, {onDebugFrame, onCollisionDispatch, vehicleTypes: roster, aiDifficulty, weaponsEnabled});
  let session = create(), disposed = false;
  const active = () => { if (disposed) throw Error('Solo session has been disposed.'); return session; };
  return Object.freeze({
    get assets() { return active().assets; },
    get snapshot() { return active().snapshot; },
    step() { active().step(); return session.snapshot; },
    requestRecovery(index = 0) { active().requestRecovery(index); },
    reset() { const previous = active(), replacement = create(); previous.dispose(); session = replacement; return session.snapshot; },
    dispose() { if (!disposed) {session.dispose(); disposed = true; session = null;} }
  });
}

// Browser/Node service adapter for an installed-data racing session.
// Runtime pack publications follow 44c2b0; installed bytes are copied first.
function createSoloRuntime(data, textureData, {onDebugFrame, onCollisionDispatch, vehicleTypes, aiDifficulty, weaponsEnabled}) {
  const memory = Buffer.alloc(64 * 1024 * 1024);
  const put = (p, v) => memory.writeInt32LE(v | 0, p);
  const word = (p, v) => memory.writeUInt16LE(v & 65535, p);
  const ptr = p => memory.readUInt32LE(p);
  let cursor = 0xa00000;
  const allocations = new Set();
  const allocate = size => {
    if (!Number.isInteger(size) || size < 0 || cursor + size > memory.length) throw Error('Racing test exhausted its runtime storage.');
    const address = cursor; cursor += (size + 127) & ~127; allocations.add(address); return address;
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
  initializeSoloWorldConstants(memory);
  initializeSoloCameraConstants(memory);
  initializeSoloWeaponConstants(memory);
  Buffer.from(skill.hex, 'hex').copy(memory, 0x570680);
  sqrt.values.forEach((value, i) => word(0x5eb290 + i * 2, value));
  const base = allocate(data.length); data.copy(memory, base);
  const session = allocate(0x1000), config = allocate(0x1000);
  put(0x5ecb1c, session); put(0x5ecefc, config);
  memory.writeFloatLE(1, config + 0x68);
  word(config + 0x42c, 640); word(config + 0x42e, 480);
  memory[session + 0x54d] = vehicleTypes.length;
  //41dbb0 selects body/animation/drive parameters from this native type byte;
  //41ebb0 later reads the same selection for the autonomous contact profile.
  for (let index = 0; index < vehicleTypes.length; index++) {
    memory[session + index] = 8;
    memory[session + 0x10 + index] = index; //41dbb0 consumes the authored grid slot.
    memory[session + 0x1c + index] = vehicleTypes[index];
  }
  //47b580 gates pickups on the native option;47b920 mode1 awards boost only.
  //Opt-in weapons therefore use race mode0. The default time trial is intact.
  memory[session + 0x551] = weaponsEnabled ? 0 : 1;
  if (weaponsEnabled) memory[session + 0xa86] = 1;
  //43da60/menu resource008: Easy0, Hard1, Expert2.410060 publishes5ea4d8.
  memory[session + 0x585] = aiDifficulty; memory[session + 0x586] = 255;
  put(session + 0x57c, 4); put(session + 0x580, 1000); put(session + 0x618, 1);
  put(0x5ed008, 1); put(0x5ec958, 1);
  put(0x90b970, base); put(0x90b990, base);
  const relocated = relocateRaceTrackPointers(base, base, {memory, scratchBase: STACK});
  const grid = parseCollisionGrid(data);
  let models = createModelCollisionContext(data, textureData, {spatial: grid.spatial});
  if (!grid.available) throw Error('Racing test requires a collision grid.');
  // Same 909240 pack fields as 44c2b0, without GPU primitive allocation.
  put(PACK, ptr(base + 0x14));
  for (const [to, from] of [[0x0c,32],[0x10,16],[0x18,24],[0x1c,52],[0x20,56],[0x24,64],[0x28,72],[0x4c,112],
    [0x2c,68],[0x48,116],[0x30,76],[0x50,124],[0x54,128],[0x58,132],[0x3c,108],[0x94,192],
    [0x68,144],[0x78,168],[0x6c,156],[0x74,164]]) put(PACK + to, ptr(base + from));
  for (const [to, from] of [[0x70,160],[0x90,188],[0x7c,172],[0x84,176],[0x8c,184],[0x98,204],[0x9c,216]]) put(PACK + to, base + data.readUInt32LE(from));
  put(PACK + 0x80, base + data.readUInt32LE(0x28));
  put(PACK + 0x60, relocated.groups);
  memory[PACK + 0x36] = data[0x94]; //44c2b0 authored pickup count publication.
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
  put(0x5eb5e0, REDUX_INITIAL_GRAVITY_Q16);
  const gravityQ16 = initializeRaceGravity({memory});
  // Original 4749e0 entry captured CW007f: nearest-even, 24-bit x87 PC.
  //The viewer supplies external CRT/libm and a single-thread host platform.
  //All reached game-owned renderer/Application constructors still execute.
  const criticalSections = new Map(), exitHandlers = [];
  const runtime = {memory, scratchBase: STACK, nativeState: createNativeFixedSqrtState({memory}), handlers: {allocate,
    free(address) {if (address && !allocations.delete(address)) throw Error('Racing runtime CRT free received an unowned pointer.');},
    registerExit(address) {exitHandlers.push(address); return 0;},
    dynamicCast(application, offset, sourceType, targetType, flags) {
      if (offset || flags || sourceType !== 0x6e213c || targetType !== 0x6e20a4 || application !== ptr(0x6efb38) || ptr(application) !== 0x570308) throw Error('Racing camera reached an unsupported CRT RTTI conversion.');
      return application;
    },
    formatCameraName(output, format, index) {
      if (memory.toString('ascii', format, format + 10) !== '%d Player\0') throw Error('Racing camera reached an unsupported CRT format.');
      memory.write(`${index} Player\0`, output);
    },
    projectionMath(operation, value) {if (!['atan', 'sin', 'cos'].includes(operation)) throw Error('Unsupported projection libm operation.'); return Math.fround(Math[operation](value));},
    projectionInteger(value) {return !Number.isFinite(value) || value < -(2 ** 63) || value >= 2 ** 63 ? -(1n << 63n) : BigInt(Math.trunc(value));}
  }, services: {
    rendererMath(operation, value, precision) {if (!['sqrt', 'atan', 'tan', 'sin', 'cos'].includes(operation)) throw Error('Unsupported renderer libm operation.'); const valueOut = Math[operation](value); return precision === 32 ? Math.fround(valueOut) : valueOut;},
    platformCall(name, args) {
      if (name === 'GetCurrentThreadId') return 1;
      const address = args[0];
      if (name === 'InitializeCriticalSectionAndSpinCount') {criticalSections.set(address, 0); return 1;}
      if (!criticalSections.has(address)) throw Error('Racing camera used an uninitialized host critical section.');
      if (name === 'EnterCriticalSection') {criticalSections.set(address, criticalSections.get(address) + 1); return 0;}
      if (name === 'LeaveCriticalSection' && criticalSections.get(address) > 0) {criticalSections.set(address, criticalSections.get(address) - 1); return 0;}
      throw Error(`Racing camera requires unsupported host service ${name}.`);
    }
  }, roundingMode: 'nearest-even', x87PrecisionBits: 24};
  publishTerrainPointStartupSeed(session, runtime);
  initializeSoloAuthoredObjectList(runtime);
  const camera = createSoloCameraRuntime(runtime);
  camera.initializeViewportRuntime(allocate(56));
  //47ebea constructs placements in44c2b0 before47ebfb selects views.
  //The separate48ef30 light storage follows both terrain constructors.
  const textureAddress = allocate(textureData.length); textureData.copy(memory, textureAddress);
  const world = constructSoloWorldPlacements({...runtime, textureAddress, geometry: relocated.geometry,
    configurationBase: relocated.auxiliary, modelContext: models, roundingMode: 'nearest-even', includeNonordinary: true,
    services: {libraryCall(name, args) {
      if (name === 'allocate') return allocate(args[0]);
      if (name === 'memset') {memory.fill(args[1], args[0], args[0] + args[2]); return args[0];}
      if (name === 'free') return 0;
      throw Error(`Racing world requires unsupported CRT service ${name}.`);
    }}});
  models = world.modelContext;
  const placedModels = [...models.instances];
  camera.initializeViewSelection();
  //47ec00..47ec05 captures point bases before phase-zero deformation.
  const terrainPoints = initializeSoloTerrainPointRuntime(runtime);
  const terrain = initializeSoloTerrainRuntime(runtime);
  const mapping = {...world.candidateMapping, terrainVerticesFor: terrain.terrainVerticesFor};
  initializeDynamicLightStorage(runtime); initializeAuthoredDynamicLights(runtime);
  const destruction = initializeSoloWorldDestruction(runtime);
  const weapons = initializeSoloWeaponRuntime(runtime);
  //47ea40 relative startup order: authored objects, lights, fragment banks,
  //debris, particles,429d60 physical/script activation, then vehicle creation.
  initializeRawBodyDebrisPool({memory, allocate});
  initializeRawParticlePools({memory, allocate, roundingMode: 'nearest-even'});
  initializeRaceObjectList(runtime);
  camera.initializeProjection();
  camera.beginParticipants();
  const cars = vehicleTypes.map((vehicleType, index) => {
    const record = RECORD + index * 0x30c, address = constructVehicle(record, index, runtime);
    camera.constructParticipant(index);
    //47f11f runs410060 immediately after this car's416180, before the next
    //participant constructor.42a670 publishes input modes after the loop.
    initializeVehicleAutonomousState(record, runtime);
    const renderAddresses = [address, ...Array.from({length: 4}, (_, i) => ptr(address + 0x390 + i * 200))];
    return {index, vehicleType, record, address, renderAddresses, laps: 0, lapStart: 0, bestLap: null, recoveries: 0, checkpointTransitions: 0, recoveryPending: false};
  });
  const carAssets = cars.map(car => Object.freeze({...buildSoloCarMesh(data, textureData, car.renderAddresses.map(value => ptr(value + 0x10) - base)), index: car.index, vehicleType: car.vehicleType}));
  const assets = {...carAssets[0], cars: Object.freeze(carAssets)};
  const weaponPresentation = createSoloWeaponPresentation({memory, data, textureData, base, enabled: weaponsEnabled});
  if (weaponsEnabled) assets.weapons = weaponPresentation.assets;
  const animatedSectors = new Set([...terrain.snapshot.segments, ...terrainPoints.snapshot.segments].map(row => row.index));
  assets.terrain = Object.freeze({segments: Object.freeze(grid.scene.segments.filter(row => animatedSectors.has(row.index)).map(row => Object.freeze({
    index: row.index, columns: row.columns, rows: row.rows,
    faces: Object.freeze(row.faces.map(face => Object.freeze({page: face.page, uv: Object.freeze(face.uv.map(pair => Object.freeze(pair.slice()))), gridIndices: Object.freeze(face.gridIndices.slice())})))
  })))});
  const worldRenderObjects = world.authoredObjects.filter(row => (ptr(row.bodyAddress) & 511) !== 32);
  const worldAssets = buildSoloCarMesh(data, textureData, worldRenderObjects.map(row => ptr(row.bodyAddress + 0x10) - base));
  assets.worldObjects = Object.freeze({...worldAssets, modelIndices: Object.freeze(worldAssets.modelIndices),
    placementIndices: Object.freeze(worldRenderObjects.map(row => row.placementIndex))});
  // Raw model queries use their actual48ec50/4142a0/421da0/44ef90 defaults.
  const modelEffects = {};
  const respawn = createRespawnRuntime({memory, recordCount: cars.length, bodyStorage: [...cars.map(({address}) => ({address, length: 0x3e78})), {address: 0x70f130, length: 0x3e78}], scratchBase: STACK});
  const filterRuntime = {memory, scratchBase: STACK - 52};
  const filter = createVehicleCollisionFilter(filterRuntime);
  const list = ptr(0x902bc0);
  const collisionFilters = new Map([[0x41e080, filter], ...destruction.collisionFilters, ...createRaceObjectCollisionFilters(filterRuntime)]);
  const views = createPhysicsRuntimeViews({memory, bodyAt: value => camera.bodyAt(value) ?? world.authoredBodyAt(value) ?? weapons.bodyAt(value) ?? destruction.bodyAt(value) ?? respawn.bodyAt(value), bucketAt: respawn.bucketAt,
    bodyLists: [{address: list, capacity: 96}, ...Array.from({length: 65}, (_, i) => ({address: ptr(0x902be0 + i * 12), capacity: 33}))],
    candidateMapping: mapping, collisionFilters});
  const vehicleViews = createVehicleRuntimeViews({memory, bodyAt: views.bodyAt});
  const interactions = createPhysicsInteractionRuntime({memory});
  const vehicles = cars.map(car => {
    const vehicle = vehicleViews.vehicleFor(car.address); car.body = vehicle.body;
    interactions.bindBody(vehicle.body);
    Object.defineProperty(vehicle, 'trackContext', {get: () => ({mode: memory[session + 0x579], progressStage: memory[car.record + 0x20], routeIndex: memory[car.record + 0x22]})});
    return vehicle;
  });
  const rawGrid = terrain.bindCollisionGrid(grid);
  for (const [address, callback] of weapons.createCollisionFilters({...filterRuntime, views, grid: rawGrid, models, modelPointersFor: mapping.modelPointersFor})) collisionFilters.set(address, callback);
  const context = {
    environment: {data, grid: rawGrid, modelContext: models, surfaceModeFor: terrain.surfaceModeFor, wheelRuntime: {memory, views, grid: rawGrid, scratchBase: STACK - 56, handlers: {modelEffects}},
      effectRuntime: {views: vehicleViews, driveScratchBase: STACK - 56, forceScratchBase: STACK - 56}},
    records: views.records, queue: views.queue, candidateArena: views.candidateArena, candidateGroups: views.candidateGroups, onCollisionDispatch,
    effectFlags: views.effectFlags, gravityQ16, roundingMode: 'nearest-even', selectionCounter: 0,
    timeOptionsFor: views.timeOptionsFor, vehiclePreparationStateFor: vehicleViews.stateFor,
    spatialStateFor: value => ({found: true, outside: value.spatialOutside, node: grid.spatial.nodes[((value.spatialBucket.address - relocated.normals) / 12) | 0]}),
    staticScratch: {contact: views.contactAt(0x10000), tag: views.wordAt(0x10048)}, queryOutput: views.outputAt(0x10100),
    bodyEffectImpulse: interactions.bodyEffectImpulse, bodyEffectDamping: interactions.bodyEffectDamping,
    worldEffectState: interactions.worldEffectState,
    nativeTerrain: {memory, views, grid: rawGrid}, nativeModels: {memory, views}, nativePhysicsStack: {memory, views, scratchBase: STACK},
    nativeScripted: {memory, views, scratchBase: STACK - 24},
    handlers: {removeSpatial: value => removeBodySpatial(value.address, {memory}), insertSpatial: value => registerRawBodySpatial(value.address, {memory}),
      ...(weaponsEnabled ? {onActiveVehicleEffect: ({body, directionQ8, effectCode}) => {
        if (views.bodyAt(body.address) !== body || (ptr(body.address) & 511) !== 3) throw Error('Racing active effect requires its shared vehicle body.');
        const owner = ptr(body.address + 0x6bc), lookup = ptr(0x713180);
        const ownerIndex = (owner - 0x8495e0) / 0x8c;
        if (!cars.some(car => car.address === body.address) || !Number.isInteger(ownerIndex) || ownerIndex < 0 || ownerIndex >= 6 || ptr(owner + 0x6c) !== body.address || !allocations.has(lookup) || lookup + 64 > memory.length) throw Error('Racing active effect requires its constructed controller and direction lookup.');
        //4749e0 ->47a8e0 ->47b020 retains the normalized direction at S-6ch
        //and enters482730 at S-9ch. Bind the numeric child to those workspaces;
        //its live controller/lookup and actual484bb0/40ea40 remain game code.
        const direction = STACK - 108;
        directionQ8.forEach((value, i) => put(direction + i * 4, value));
        return applyRawActiveVehicleEffect(body.address, direction, effectCode, {...runtime, scratchBase: STACK - 156});
      }} : {}),
      attachmentQueue: createRawAttachmentQueue({memory, bodyAt: views.bodyAt}),
      modelEffects, onSpecialEvent: () => {throw Error('Racing test reached an unsupported special vehicle event.');}}
  };
  //47ea40's final42a670 clears the complete32-byte708 block and initializes
  //the native steering counter/mode.42a870 supplies the first byte-valued
  //steering sample on the first update; ready state must not fabricate it.
  initializeVehicleExecutionModes(runtime);
  // 41dbb0 changes the spawn quaternion after its initial body-cache update.
  // Publish a coherent ready pose before the first viewer render/physics tick.
  for (const car of cars) {
    car.body.rotation = quaternionMatrix(car.body.quaternion);
    updateBodyDerived(car.body);
    prepareVehicleWheelRender(car.address, runtime);
  }
  let ticks = 0, disposed = false;
  const stats = {events: 0, wheelContacts: 0, terrainHits: 0, modelHits: 0};
  const lastPhysics = {collisionEvents: 0, terrainHits: 0, modelHits: 0};
  const trackBasis = value => {
    populateRawVehicleTrackBasis(value.address, 0x10200, 0x10210, {memory});
    return [0,4,8].map(offset => memory.readInt32LE(0x10200 + offset));
  };
  const finishProgress = record => {
    const car = cars[(record.address - RECORD) / 0x30c];
    if (record.bytes[0x1c]) { const elapsed = (ticks - car.lapStart) * SOLO_STEP_SECONDS; car.laps++; car.bestLap = car.bestLap === null ? elapsed : Math.min(car.bestLap, elapsed); }
    car.lapStart = ticks;
    finishRaceProgress(record.address, runtime);
  };
  const checkpointOptions = {trackBasis, finishProgress};
  // Read-only diagnostics preserve native integer representations and stages.
  // They expose no mutable memory and do not supply simulation decisions.
  const debugFrame = (stage, extra = {}) => {
    if (!onDebugFrame) return;
    const {address} = cars[0];
    //Before the first physics query,11c can still be the native -1 sentinel.
    //A diagnostic must not chase that byte as a real terrain-sector index.
    const sectorIndex = memory[address + 0x11c], sector = sectorIndex < grid.scene.segments.length ? ptr(ptr(PACK) + sectorIndex * 4) : null;
    onDebugFrame(Object.freeze({stage, tick: ticks + 1, bodyAddress: address, aiDifficulty5ea4d8: ptr(0x5ea4d8),
      nativeSqrtInputQ16: memory.readInt32LE(0x91d45c), nativeSqrtLeadingZeros: ptr(0x91d460),
      positionQ16: Object.freeze([0,4,8].map(offset => memory.readInt32LE(address + 0x34 + offset))),
      linearVelocityQ16: Object.freeze([0,4,8].map(offset => memory.readInt32LE(address + 0x68 + offset))),
      flags: ptr(address), collisionState128: ptr(address + 0x128), collisionFlags110: ptr(address + 0x110),
      speed668: memory.readInt16LE(address + 0x668), closestTerrain11c: ptr(address + 0x11c),
      selectedSectorHeight: sector === null ? null : memory.readInt16LE(sector + 0x14), recordCounter248: memory[RECORD + 0x248],
      wheelFlags: Object.freeze(Array.from({length: 4}, (_, index) => memory[address + 0x324 + index * 200])),
      route6c0: memory.readUInt16LE(address + 0x6c0), point6c2: memory.readUInt16LE(address + 0x6c2),
      checkpoint20: memory[RECORD + 0x20], input710: ptr(address + 0x710), aiRecovery6c4: ptr(address + 0x6c4),
      cars: Object.freeze(cars.map(car => Object.freeze({index: car.index, bodyAddress: car.address, recordAddress: car.record,
        positionQ16: Object.freeze([0,4,8].map(offset => memory.readInt32LE(car.address + 0x34 + offset))),
        linearVelocityQ16: Object.freeze([0,4,8].map(offset => memory.readInt32LE(car.address + 0x68 + offset))),
        input710: ptr(car.address + 0x710), aiMode6c4: ptr(car.address + 0x6c4), profileTier6f1: memory[car.address + 0x6f1],
        profileWords6f4: Object.freeze([ptr(car.address + 0x6f4), ptr(car.address + 0x6f8)])}))), ...extra}));
  };
  return {
    assets,
    //A viewer test input, consumed at the same boundary as native state32.
    //Route selection, obstruction queries and the resulting pose stay owned
    //by47ccc0. Repeated requests before a tick coalesce into one recovery.
    requestRecovery(index) {
      if (disposed) throw Error('Solo session has been disposed.');
      if (!Number.isInteger(index) || index < 0 || index >= cars.length) throw Error('Recovery car index is outside this roster.');
      cars[index].recoveryPending = true;
    },
    step() {
      if (disposed) throw Error('Solo session has been disposed.');
      //450e50 runs each stage over the full roster before the next stage.
      for (const car of cars) put(car.address + 0x70c, ptr(car.address + 0x710));
      for (const car of cars) runAutonomousDispatch(car.address, runtime);
      for (const car of cars) updateAutonomousRouteControl(car.address, runtime);
      for (const car of cars) {updateVehicleInputBlock(car.address, car.index, runtime); updateVehicleControlState(car.address, runtime);}
      debugFrame('after-controls');
      terrain.step();
      updateRaceObjects(runtime);
      //450fc3..451006 restores only XYZ. The late point palette/material
      //flags remain live for the following physical surface queries.
      terrainPoints.restoreForPhysics();
      const previousCheckpoints = cars.map(car => memory[car.record + 0x20]);
      runRaceProgressPass({...runtime, progression: respawn, checkpointOptions});
      for (const car of cars) if (memory[car.record + 0x20] !== previousCheckpoints[car.index]) car.checkpointTransitions++;
      updateRaceHandlingScale(runtime);
      context.selectionCounter = ticks;
      const report = stepSimulationFrame(views.physicalGroup, vehicles, context);
      lastPhysics.collisionEvents = report.processedEvents;
      lastPhysics.terrainHits = report.terrainHits;
      lastPhysics.modelHits = report.modelHits;
      stats.events += report.processedEvents; stats.wheelContacts += report.vehicles.reduce((sum, vehicle) => sum + vehicle.contacts.hits, 0);
      stats.terrainHits += report.terrainHits; stats.modelHits += report.modelHits;
      debugFrame('after-physics', {processedEvents: report.processedEvents, terrainHits: report.terrainHits, modelHits: report.modelHits});
      updateRawBodyAttachments(runtime);
      for (const car of cars) if (car.recoveryPending) {put(car.address + 0x128, 32); car.recoveryPending = false;}
      const recovery = runRawPostFrameBodyStates({memory, views, grid: rawGrid, models, progression: respawn,
        modelPointersFor: mapping.modelPointersFor, scratchBase: STACK, roundingMode: 'nearest-even', handlers: {modelEffects},
        onRecoveryApply: value => {const car = cars.find(car => car.address === value.bodyAddress); if (car) car.recoveries++;}});
      debugFrame('after-postframe', {respawnedBodies: recovery.respawnedBodies, retiredBodies: recovery.retiredBodies});
      for (const car of cars) {updateVehicleMotionState(car.record, runtime); updateVehicleSurfaceDrive(car.record, runtime);}
      //451092/48d7c0 follows the completed motion pass. Its incoming EDI is
      //that pass's iteration count, and it owns real surface-drive decay/caps.
      if (weaponsEnabled) debugFrame('before-weapons');
      weapons.step({scratchBase: STACK, entryRegisters: {EDI: cars.length}, views, grid: rawGrid, models, modelPointersFor: mapping.modelPointersFor});
      for (const car of cars) {prepareVehicleWheelRender(car.address, runtime); camera.updateParticipant(car.index);}
      updateVehicleAnimationLights(runtime);
      //450e50 relative stage order: debris, placed contacts, particles, model
      //fragments, queued destruction, physical fragments, persistent emitters.
      advanceRawBodyDebris({memory});
      camera.step({views, grid: rawGrid, models, modelPointersFor: mapping.modelPointersFor});
      updatePlacedModelContactEffects({...runtime, roundingMode: 'nearest-even'});
      advanceRawEffectParticles({memory});
      updateModelContactFragments(runtime);
      //494140 advances each participant's real rear-wheel histories and the
      //shared5ec958 stream before44a7a0 consumes it for point emissions.
      updateVehicleWheelHistories(runtime);
      //44a7a0 supplies late display coordinates and genuine particle/debris
      //emissions. Those displaced coordinates are restored before physics.
      terrainPoints.step();
      updatePlacedObjectDestruction(runtime); maintainWorldFragments(runtime);
      updateRawPersistentEmitters(runtime); updateRawAttachmentEffects(runtime);
      //One session step is one450e50 outer update with one physics substep.
      //Its final44d960(0) owns dirty-range aging, queued light allocation and
      //authored/attached light motion. Do not replace it with a queue clear.
      updateDynamicLights(0, runtime);
      ticks++; put(0x90a548, ticks);
      return report;
    },
    get snapshot() {
      const collapsing = new Set(), controllers = ptr(0x9205dc);
      for (let index = 0; index < 4; index++) if (memory.readUInt16LE(controllers + index * 0xa8 + 2)) collapsing.add(ptr(controllers + index * 0xa8 + 4));
      const snapshots = Object.freeze(cars.map(car => {
        const {address, record} = car;
        const parts = Object.freeze(car.renderAddresses.map(value => Object.freeze({
          position: Object.freeze([0,4,8].map(offset => memory.readInt32LE(value + 0x34 + offset) / 65536)),
          rotation: Object.freeze(Array.from({length: 9}, (_, i) => memory.readInt16LE(value + 0xc4 + i * 2) / 4096))
        })));
        return Object.freeze({index: car.index, vehicleType: car.vehicleType, position: parts[0].position, rotation: parts[0].rotation, parts,
          ...(weaponsEnabled ? {inventory: Object.freeze([memory[address + 0x68c], memory[address + 0x68d]])} : {}),
          quaternion: Object.freeze(car.body.quaternion.map(value => value / 65536)), speed: memory.readInt16LE(address + 0x668),
          route: memory.readUInt16LE(address + 0x6c0), point: memory.readUInt16LE(address + 0x6c2),
          //449640 maintains the actual one-based race rank at participant+1d.
          racePosition: memory[record + 0x1d],
          checkpoint: memory[record + 0x20], checkpointCount: memory[PACK + 0x44], checkpointTransitions: car.checkpointTransitions,
          laps: car.laps, lapTime: (ticks - car.lapStart) * SOLO_STEP_SECONDS, bestLap: car.bestLap, recoveries: car.recoveries,
          physics: Object.freeze({...lastPhysics, recoveryPending: car.recoveryPending,
            driveQ16: memory.readInt32LE(address + 0x6a8), baseDriveQ16: memory.readInt32LE(address + 0x6ac),
            wheelContacts: Object.freeze(Array.from({length: 4}, (_, index) => Boolean(memory[address + 0x324 + index * 200] & 1)))})});
      }));
      const worldObjects = worldRenderObjects.map((row, index) => {
        const value = row.bodyAddress, bodyType = ptr(value) & 511;
        const visible = bodyType === 31 ? ptr(value + 0x184) !== 0 : [25, 29, 35].includes(bodyType) ? !(ptr(value) & 0x8000) : true;
        return Object.freeze({placementIndex: row.placementIndex, modelIndex: worldAssets.modelIndices[index], bodyType, visible,
          position: Object.freeze([0,4,8].map(offset => memory.readInt32LE(value + 0x34 + offset) / 65536)),
          rotation: Object.freeze(Array.from({length: 9}, (_, i) => memory.readInt16LE(value + 0xc4 + i * 2) / 4096))});
      });
      const terrainState = terrain.snapshot, {segments: pointSegments, ...pointState} = terrainPoints.snapshot;
      const segments = Object.freeze([...new Map([...terrainState.segments, ...pointSegments].map(row => [row.index, row])).values()].sort((a,b) => a.index-b.index));
      const palette = segments.length ? Object.freeze(Array.from({length: 1024}, (_, index) => {
        const offset = ptr(0x909270) + index * 4;
        return Object.freeze([memory[offset], memory[offset + 1], memory[offset + 2], memory[offset + 3]]);
      })) : Object.freeze([]);
      const cameraState = Object.freeze({...camera.snapshot, bodies: Object.freeze(camera.controllers.map(row => Object.freeze({...row,
        flags: ptr(row.bodyAddress), controllerBacklink: ptr(row.bodyAddress + 0x164),
        positionQ16: Object.freeze([0,4,8].map(offset => memory.readInt32LE(row.bodyAddress + 0x34 + offset)))
      }))), physicalBodyCount: views.physicalGroup.count});
      return Object.freeze({...snapshots[0], ticks, cars: snapshots, aiDifficulty, camera: cameraState,
        weapons: Object.freeze({mode: memory[session + 0x551], pickupOption: memory[session + 0xa86], authoredPickupCount: memory[PACK + 0x36], pickupCount: ptr(0x902024), poolBodyCount: weapons.bodyStorage.length, contactVertexCount: ptr(0x7130f8),
          ...(weaponsEnabled ? {enabled: true, ...weaponPresentation.snapshot(), effects: Object.freeze({impulsePending: ptr(0x91cd90) === 1, dampingPending: ptr(0x9153d0) === 1, terrainWaveActive: ptr(0x90cb80) !== 0, timeScaleQ16: ptr(0x81118c)})} : {})}),
        terrain: Object.freeze({...terrainState, segments, points: Object.freeze(pointState), palette}),
        lighting: Object.freeze({highWaterCount: ptr(0x80f20c), dirtyRangeCount: ptr(0x80f210), queuedAllocationCount: ptr(0x810920)}),
        worldObjects: Object.freeze(worldObjects),
        //Class5 also denotes an in-flight collapse. Its original authored mesh
        //remains visible until the controller removes the body at completion.
        brokenPlacements: Object.freeze(placedModels.filter(([index, instance]) => instance.settings.class === 5 && !collapsing.has(world.objectForPlacement(index))).map(([index]) => index)),
        stats: Object.freeze({...stats})});
    },
    dispose() { disposed = true; }
  };
}

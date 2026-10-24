import {createNativeFrameMemory as createCapturedMemory} from './native-frame-memory.mjs';
import {buildNativeFrameManifest} from './native-frame-manifest.mjs';
import {createNativeFrameGeometry} from './native-frame-geometry.mjs';
import {createNativeFrameVehicleBindings} from './native-frame-vehicles.mjs';
import {createNativeFrameSoundBindings, bindCapturedNativeThreadEnvironment, nativeFrameSoundAdditionalRegions} from './native-frame-sound.mjs';
import {createPhysicsRuntimeViews} from '../../src/physics-runtime-views.mjs';
import {createPhysicsInteractionRuntime} from '../../src/physics-interaction-runtime.mjs';
import {createRawAttachmentQueue} from '../../src/raw-attachment-queue.mjs';
import {createVehicleCollisionFilter} from '../../src/vehicle-collision-filter.mjs';
import {createRaceObjectCollisionFilters} from '../../src/race-object-collision-filters.mjs';
import {createPeriodicBodyCollisionFilter} from '../../src/periodic-body-spawn.mjs';
import {recordWorldFragmentImpact} from '../../src/world-fragment-registry.mjs';
import {removeBodySpatial} from '../../src/body-retirement.mjs';
import {registerRawBodySpatial} from '../../src/raw-body-construction.mjs';
import {stepSimulationFrame} from '../../src/simulation-frame.mjs';
import {decodePhysicsNumericalContext} from '../../src/race-clock.mjs';
import {nativeCodeAddress} from '../../src/native-memory-spans.mjs';
import sqrt from '../../src/sqrt-table.json' with {type: 'json'};

function numericalContextOf(snapshot) {
  const context = decodePhysicsNumericalContext({x87ControlWord: Number(snapshot.registers?.fpuControlWord), mxcsr: Number(snapshot.registers?.mxcsr)});
  if (context.x87.precisionBits !== 24 || context.x87.roundingMode !== 'nearest-even' || context.sse.roundingMode !== 'nearest-even' || context.sse.flushToZero || context.sse.denormalsAreZero || context.x87.exceptionMask !== 63 || context.sse.exceptionMask !== 63) throw Error('Native frame replay requires captured PC24/nearest-even with masked exceptions and FTZ/DAZ disabled.');
  return context;
}

function verifyNumericalInputs(memory) {
  for (const [address, value] of [[0x5dc5f4, 1 / 4096], [0x5dc774, 1], [0x5dca88, 4096]]) {
    if (memory.readFloatLE(address) !== value) throw Error(`Unsupported native numerical constant at 0x${address.toString(16)}.`);
  }
  const bytes = memory.subarray(0x5eb290, 0x5eb290 + sqrt.values.length * 2);
  for (let index = 0; index < sqrt.values.length; index++) if (bytes.readUInt16LE(index * 2) !== sqrt.values[index]) throw Error('Native frame square-root table differs from recovered arithmetic.');
}

// Geometry is discovered both while binding and through lazy collision reads.
// Compare its complete validated ledger after the frame, counting bytes already
// covered by semantic core regions only once. ABI scratch remains input-only
// unless geometry independently proves ownership of the same bytes.
function extendComparison(manifest, regions, kind, policies) {
  const covered = manifest.requiredRegions.filter(row => row.comparison !== 'abi-input')
    .map(row => [row.address, row.address + row.length]).sort((a, b) => a[0] - b[0]);
  const added = [];
  for (const region of regions) {
    if (!Number.isSafeInteger(region.address) || !Number.isSafeInteger(region.length) || region.address < 0 || region.length < 1 || region.address + region.length > 0x100000000 || !policies.includes(region.comparison)) throw Error(`Invalid validated native ${kind} comparison span.`);
    let cursor = region.address;
    const end = cursor + region.length;
    for (const [start, stop] of covered) {
      if (stop <= cursor) continue;
      if (start >= end) break;
      if (start > cursor) added.push({...region, id: `${region.id}-${cursor.toString(16)}`, address: cursor, length: start - cursor});
      cursor = Math.max(cursor, stop);
      if (cursor >= end) break;
    }
    if (cursor < end) added.push({...region, id: `${region.id}-${cursor.toString(16)}`, address: cursor, length: end - cursor});
    covered.push([region.address, end]);
    covered.sort((a, b) => a[0] - b[0]);
  }
  manifest.requiredRegions.push(...added);
  manifest[`${kind}Comparison`] = {validatedRegions: regions.length, addedRegions: added.length, addedBytes: added.reduce((sum, row) => sum + row.length, 0)};
  return manifest;
}

export function extendNativeFrameGeometryComparison(manifest, regions) {
  return extendComparison(manifest, regions, 'geometry', ['mutable']);
}

export function extendNativeFrameSoundComparison(manifest, regions) {
  return extendComparison(manifest, regions, 'sound', ['mutable', 'read-only']);
}

// Bind existing state only. In particular no constructor, pool initializer,
// contact reset, coefficient installer, authored parser or pointer rewrite runs.
export function createNativeFrameContext({memory, manifest, geometry, numericalContext, sound, onBodyEffectImpulse}) {
  const entryEsp = manifest.observed.entryEsp, moduleBaseAddress = manifest.moduleBaseAddress;
  const runtime = {memory, moduleBaseAddress, roundingMode: numericalContext.x87.roundingMode};
  const collisionFilters = new Map(), storage = new Map(manifest.bodyStorage.map(row => [row.address, row.length]));
  const arena = manifest.requiredRegions.find(row => row.id === 'body-arena-allocation-bytes');
  if (!arena) throw Error('Native frame context requires the verified full body arena.');
  const arenaBase = manifest.observed.arenaBaseAddress, arenaUsedEnd = arenaBase + manifest.observed.arenaUsedBytes;
  const bodyAt = address => {
    if (!Number.isInteger(address) || address < arenaBase || (address - arenaBase) % 128 || address + 0x180 > arenaUsedEnd) throw Error(`Native frame body 0x${Number(address).toString(16)} is outside the captured used arena.`);
    // Additional raw linked bodies use the proven common header. Reached raw
    // descendants still require every extended byte in the captured arena.
    //41dbb0's type3 body has the complete vehicle layout even if it first
    //becomes reachable through a reloaded participant slot during this frame.
    const length = Math.max(storage.get(address) ?? 0x180, (memory.readUInt32LE(address) & 511) === 3 ? 0x3e78 : 0x180);
    if (address + length > arenaUsedEnd || address + length > arena.address + arena.length) throw Error('Native frame body extent exceeds the verified arena.');
    return {address, bytes: memory.subarray(address, address + length)};
  };
  const views = createPhysicsRuntimeViews({memory, bodyAt, bodyLists: manifest.bodyLists, collisionFilters, candidateMapping: geometry.candidateMapping});
  const bindings = createNativeFrameVehicleBindings({memory, physicsViews: views, geometry, grid: geometry.grid, modelContext: geometry.modelContext, entryEsp, numericalContext, moduleBaseAddress});
  const interactions = createPhysicsInteractionRuntime({memory});
  for (const vehicle of bindings.vehicles) interactions.bindBody(vehicle.body);
  const filterRuntime = {...runtime, scratchBase: entryEsp - 52};
  const addFilter = (address, filter) => collisionFilters.set(nativeCodeAddress(address, runtime), filter);
  addFilter(0x41e080, createVehicleCollisionFilter(filterRuntime));
  for (const [address, filter] of createRaceObjectCollisionFilters(filterRuntime)) addFilter(address, filter);
  addFilter(0x46a2c0, createPeriodicBodyCollisionFilter(filterRuntime));
  addFilter(0x4810b0, (body, other) => recordWorldFragmentImpact(body.address, other?.address ?? 0, runtime));
  const handlers = {
    ...bindings.handlers,
    insertSpatial: body => registerRawBodySpatial(body.address, runtime),
    removeSpatial: body => removeBodySpatial(body.address, runtime),
    attachmentQueue: createRawAttachmentQueue({memory, bodyAt: views.bodyAt}),
  };
  const environment = {...bindings.environment};
  if (environment.wheelRuntime) environment.wheelRuntime = {...environment.wheelRuntime, ...runtime, handlers};
  const context = {
    environment, records: views.records, queue: views.queue,
    candidateArena: views.candidateArena, candidateGroups: views.candidateGroups, effectFlags: views.effectFlags,
    timeOptionsFor: views.timeOptionsFor, roundingMode: numericalContext.x87.roundingMode,
    vehiclePreparationStateFor: bindings.vehiclePreparationStateFor,
    bodyEffectImpulse: interactions.bodyEffectImpulse, bodyEffectDamping: interactions.bodyEffectDamping, worldEffectState: interactions.worldEffectState,
    //4749e0 ->47a8e0 ->47b020: five parent saves/CALL,38h locals,
    //three child saves/CALL put the producer entry at S-96. ESI is the
    //outer loop's remaining count, captured before any scripted mutation.
    bodyEffectNativeStackFor: (body, index) => {
      const entryRegisters = {};
      for (const name of ['ebx', 'ebp']) {
        const value = Number(manifest.entryRegisters[name]);
        if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw Error(`Native body effect requires captured frame entry ${name}.`);
        entryRegisters[name] = value;
      }
      if (!Number.isInteger(index) || index < 0 || index >= manifest.observed.physicalCount) throw Error('Native body effect requires its original physical-loop index.');
      Object.assign(entryRegisters, {esi: manifest.observed.physicalCount - index, edi: body.address});
      return {...runtime, scratchBase: entryEsp - 96, entryRegisters,
        ...(onBodyEffectImpulse ? {onEnter: onBodyEffectImpulse} : {}),
        ...(sound ? {soundRuntime: sound.soundRuntime, dispatch40ea40: sound.dispatch40ea40} : {})};
    },
    spatialStateFor: body => {
      const bucket = body.spatialBucket;
      const node = bucket && geometry.nodeForAddress(bucket.address);
      if (!node) throw Error('Native frame prior spatial registration has no captured node identity.');
      return {found: true, outside: body.spatialOutside, node};
    },
    nativeTerrain: {...runtime, views, grid: geometry.grid}, nativeModels: {...runtime, views},
    nativePhysicsStack: {...runtime, views, scratchBase: entryEsp, entryRegisters: manifest.entryRegisters},
    nativeScripted: {...runtime, views, scratchBase: entryEsp - 24},
    handlers,
  };
  Object.defineProperties(context, {
    gravityQ16: {enumerable: true, get: () => views.gravityQ16},
    selectionCounter: {enumerable: true, get: () => views.selectionCounter},
  });
  return {views, bindings, context, geometry};
}

export function replayNativeFrame(snapshot, options = {}) {
  let stage = 'numerical-context';
  try {
    const numericalContext = numericalContextOf(snapshot);
    stage = 'core-coverage';
    const rows = snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot.ranges;
    const additionalRegions = [...(options.additionalRegions ?? [])];
    const lookup = rows.find(row => row.id === 'active-effect-lookup-bytes');
    if (lookup) {
      if (lookup.bytes.length !== 64) throw Error('Captured active-effect lookup must contain its actual64-byte table.');
      additionalRegions.push({id: 'active-effect-lookup-bytes', address: Number(lookup.address), length: 64, comparison: 'read-only', evidence: '4820f0 initializes64 lookup bytes;482730 reads the table through713180.'});
    }
    //This optional module literal is admitted only when the new capture has
    //actually observed its bytes. Legacy captures retain their narrower input.
    if (rows.some(row => row.id === 'active-sound-cookie') && !additionalRegions.some(row => row.preferredAddress === 0x5e8890)) {
      additionalRegions.push(...nativeFrameSoundAdditionalRegions({moduleBaseAddress: Number(snapshot.moduleBaseAddress ?? rows.find(row => row.moduleBaseAddress !== undefined)?.moduleBaseAddress)}));
    }
    const manifest = buildNativeFrameManifest(snapshot, {...options, additionalRegions});
    const captured = createCapturedMemory(rows, {aliases: manifest.aliases});
    if (lookup && Number(lookup.address) !== captured.memory.readUInt32LE(0x713180)) throw Error('Captured active-effect lookup differs from its live root.');
    const cookie = rows.find(row => row.id === 'active-sound-cookie');
    if (cookie && (Number(cookie.address) !== manifest.moduleBaseAddress + 0x1e8890 || cookie.bytes.length !== 4)) throw Error('Captured sound cookie differs from its module literal.');
    stage = 'numerical-inputs'; verifyNumericalInputs(captured.memory);
    stage = 'geometry-binding';
    const geometry = createNativeFrameGeometry({...options.geometryOptions, memory: captured.memory});
    stage = 'frame-binding';
    const threadEnvironment = bindCapturedNativeThreadEnvironment(snapshot, {memory: captured.memory});
    const sound = createNativeFrameSoundBindings({memory: captured.memory, moduleBaseAddress: manifest.moduleBaseAddress, numericalContext, nativeTls: threadEnvironment.nativeTls});
    if (options.onBodyEffectImpulse !== undefined && typeof options.onBodyEffectImpulse !== 'function') throw Error('Native body effect observer must be a function.');
    const bound = createNativeFrameContext({memory: captured.memory, manifest, geometry, numericalContext, sound, onBodyEffectImpulse: options.onBodyEffectImpulse});
    if (options.onCollisionDispatch !== undefined) {
      if (typeof options.onCollisionDispatch !== 'function') throw Error('Native frame dispatch observer must be a function.');
      bound.context.onCollisionDispatch = options.onCollisionDispatch;
    }
    stage = 'physics-frame';
    const report = stepSimulationFrame(bound.views.physicalGroup, bound.bindings.vehicles, bound.context);
    stage = 'geometry-comparison-coverage';
    extendNativeFrameGeometryComparison(manifest, geometry.comparisonRegions);
    extendNativeFrameSoundComparison(manifest, [...sound.comparisonRegions, ...threadEnvironment.comparisonRegions]);
    return {...captured, ...bound, sound, threadEnvironment, manifest, report, numericalContext};
  } catch (error) {
    error.replayStage = stage;
    throw error;
  }
}

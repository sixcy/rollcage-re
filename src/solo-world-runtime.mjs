import {nativeGlobalAddress} from './native-global-address.mjs';
import {constructTrackPlacedObject} from './track-placed-object-construction.mjs';
import {constructTrackNonordinaryObject} from './track-nonordinary-object-construction.mjs';
import trackRuntimeTables from './track-runtime-tables.json' with {type: 'json'};
import {initializeRaceObjectStartupTables} from './race-object-startup.mjs';
import {initializeRaceObjectTables} from './race-object-update.mjs';
import {createPhysicsInteractionRuntime} from './physics-interaction-runtime.mjs';
import trig from './trig-table.json' with {type: 'json'};
import {initializeModelContactFragments} from './model-contact-effects.mjs';
import {initializePlacedObjectDestructionState} from './placed-object-destruction.mjs';
import {initializeWorldFragmentTemplates, initializeWorldFragments, recordWorldFragmentImpact} from './world-fragment-registry.mjs';

//47eb38's authored-object list producer. Static restoration installs original
//dispatch/body/shape/update tables; the actual429d60 activation stays separate
//until the rest of race effect/fragment startup has completed.
export function initializeSoloAuthoredObjectList(runtime) {
  const {memory} = runtime, allocate = runtime.allocate ?? runtime.handlers?.allocate;
  if (!Buffer.isBuffer(memory) || memory.length < 0x920b20 || typeof allocate !== 'function') throw Error('Solo authored objects require native storage and CRT allocation.');
  if (memory.readUInt32LE(0x91e77c) || memory.readUInt32LE(0x91e778)) throw Error('Solo authored object initialization requires a fresh race image.');
  for (const table of trackRuntimeTables) Buffer.from(table.bytesHex, 'hex').copy(memory, Number(table.address));
  initializeRaceObjectStartupTables(memory); initializeRaceObjectTables(memory);
  const list = allocate(64) >>> 0;
  if (!list || list + 64 > memory.length) throw Error('Solo authored object list allocation exceeds native storage.');
  memory.writeUInt32LE(list, 0x91e77c); memory.writeUInt32LE(0, 0x91e778); memory.writeUInt32LE(0, 0x91e744);
  memory.writeUInt32LE(0, nativeGlobalAddress(memory, 0x82e904)); memory.writeUInt32LE(0, nativeGlobalAddress(memory, 0x82e900));
  return list;
}

// The destruction subset of47ea40:480760 precedes48e800. Existing relocated
// pack, material table, spatial map, body arena and physical shape pools remain
// caller-owned. Call once on a fresh race image, after ordinary placements.
// Particle/debris and dynamic-light constructors are separate prerequisites for
// the eventual damage/contact producers, not replacements in this initializer.
export function initializeSoloWorldDestruction(runtime) {
  const {memory, scratchBase} = runtime;
  const allocate = runtime.allocate ?? runtime.handlers?.allocate;
  if (!Buffer.isBuffer(memory) || memory.length < 0x920b20 || !Number.isInteger(scratchBase) || scratchBase < 0x200 || typeof allocate !== 'function') throw Error('Solo world destruction requires native storage, entry ESP and CRT allocation.');
  const ptr = address => memory.readUInt32LE(address);
  for (const address of [nativeGlobalAddress(memory, 0x902eec), 0x90b98c, 0x90b988, 0x909254, 0x909278, 0x91e79c]) {
    const value = ptr(address);
    if (!value || value + 0x120 > memory.length) throw Error('Solo world destruction requires initialized native world pools.');
  }
  initializeWorldFragmentTemplates(memory);
  initializePlacedObjectDestructionState(memory);
  initializeWorldFragments({...runtime, allocate});
  initializeModelContactFragments(runtime);
  const bodies = new Map(), bodyStorage = [];
  for (let index = 0; index < 36; index++) {
    const address = ptr(0x849980 + index * 4), length = 0x180;
    if (!address || address + length > memory.length || bodies.has(address)) throw Error('Native world fragment registry has invalid body storage.');
    bodies.set(address, {address, bytes: memory.subarray(address, address + length)});
    bodyStorage.push(Object.freeze({address, length}));
  }
  const collisionFilter = (body, other) => recordWorldFragmentImpact(body.address, other?.address ?? 0, {memory});
  return {bodyStorage: Object.freeze(bodyStorage), collisionFilters: new Map([[0x4810b0, collisionFilter]]),
    // This composes with the vehicle factory without making fragment bodies
    // pretend to have the3e78-byte vehicle/controller layout.
    bodyAt: address => bodies.get(address) ?? null};
}

// Original image lookup, not a runtime approximation. Call once when creating
// a fresh image; authored object quaternions use492b50/492c00 through this table.
export function initializeSoloWorldConstants(memory) {
  const address = Number(trig.address);
  if (!Buffer.isBuffer(memory) || memory.length < address + trig.values.length * 4) throw Error('Solo world constants require native image storage.');
  trig.values.forEach((value, index) => memory.writeInt32LE(value, address + index * 4));
  return memory;
}

// Browser composition of the exact placement phases of44c2b0. The
// caller supplies the already-relocated pack, original BTP copy, body arena,
// spatial map and image constants. Only allocate/memset/free CRT services are
// needed: no texture upload, image decoding, device or graphics startup.
//includeNonordinary requires the original authored-object list producer and
//keeps all branches interleaved in authored order, including attachment IDs.
export function constructSoloWorldPlacements(runtime) {
  const {memory: m, scratchBase: S, textureAddress, geometry, configurationBase, modelContext, entryRegisters = {}, includeNonordinary = false} = runtime;
  if (!Buffer.isBuffer(m) || m.length < 0x920b20 || !Number.isInteger(S) || S < 1024 || S + 128 > m.length ||
      typeof runtime.services?.libraryCall !== 'function') throw Error('Solo placements require native storage, entry ESP and explicit CRT loader services.');
  validateModels(modelContext);
  const ptr = p => m.readUInt32LE(p), get = p => m.readInt32LE(p), put = (p, v) => m.writeInt32LE(v | 0, p);
  for (const address of [textureAddress, geometry, configurationBase]) if (!Number.isInteger(address) || address <= 0 || address + 0x40 > m.length) throw Error('Solo placement input pointer is outside native storage.');
  if (m.toString('ascii', textureAddress, textureAddress + 4) !== 'BTP ') throw Error('Solo placements require an original BTP header.');
  const count = ptr(textureAddress + 20), authoredBase = textureAddress + ptr(textureAddress + 40), firstBodyIndex = ptr(0x6e6b44);
  if (authoredBase < textureAddress || authoredBase + count * 56 > m.length || firstBodyIndex > 512) throw Error('Solo placement records exceed supplied storage.');
  if (ptr(0x9207e4) !== 0) throw Error('Solo placements require a fresh native pending-model registry.');
  let classTwoCount = 0;
  for (let index = 0; index < count; index++) if ((m.readUInt16LE(authoredBase + index * 56) & 1023) === 0) {
    if (!modelContext.instances.has(index)) throw Error('Ordinary placement has no parsed authored identity.');
    if (m[authoredBase + index * 56 + 31] === 2) classTwoCount++;
  }
  if (classTwoCount > 50) throw Error('Solo placements exceed the native fifty pending-model rows.');
  if (includeNonordinary && (!ptr(0x91e77c) || ptr(0x91e778))) throw Error('Nonordinary placements require a fresh initialized native authored-object list.');
  if (includeNonordinary) {
    let objectCount = 0;
    for (let index = 0; index < count; index++) if ((m.readUInt16LE(authoredBase + index * 56) & 1023) === 24) objectCount++;
    if (objectCount > 16) throw Error('Authored placements exceed the native sixteen-pointer object list.');
  }
  const F = S - 76;
  const library = (name, args, returned) => {
    for (let i = 0; i < args.length; i++) put(F - args.length * 4 + i * 4, args[i]);
    const entry = F - (args.length + 1) * 4; put(entry, returned);
    return runtime.services.libraryCall(name, args, {...runtime, scratchBase: entry});
  };
  put(F + 20, 0); put(F + 44, 0); put(F + 32, count); put(F + 64, authoredBase); put(F + 68, geometry); put(F + 72, configurationBase);
  // The pending-row status reset is the same 47eb38 startup producer.
  for (let offset = 0; offset < 800; offset += 16) m.writeUInt16LE(255, 0x920806 + offset);
  const objectMap = library('allocate', [(count << 2) >>> 0], 0x44cbf9) >>> 0;
  put(F + 28, objectMap); if (objectMap) library('memset', [objectMap, 0, (count << 2) >>> 0], 0x44cc15);
  put(F + 24, 0);
  let pack = ptr(0x90b990), index = 0, authored = authoredBase;
  const skippedPlacements = [], authoredObjects = [], renderParticles = [];
  while (index < get(F + 32)) {
    const type = m.readUInt16LE(authored) & 1023;
    if (type === 0) {
      const child = {...runtime, scratchBase: F - 4, entryRegisters: {...entryRegisters, EBX: pack, ESI: index, EDI: authored + 38, EBP: textureAddress}};
      ({index, pack} = constructTrackPlacedObject(authored, pack, F, runtime, child));
    } else if (includeNonordinary) {
      const target = type <= 24 ? ptr(0x44d1f8 + m[0x44d20c + type] * 4) : 0x44d0b9;
      if ([0x44cc53, 0x44cfc2, 0x44d043].includes(target)) {
        const placementIndex = index, child = {...runtime, scratchBase: F - 4, entryRegisters: {...entryRegisters, EBX: pack, ESI: index, EDI: authored + 38, EBP: textureAddress}};
        let body; ({body, index, pack} = constructTrackNonordinaryObject(authored, pack, index, F, target, runtime, child));
        (target === 0x44cc53 ? authoredObjects : renderParticles).push(Object.freeze({placementIndex, bodyAddress: body, type}));
      } else if (target !== 0x44d0b9) throw Error('Unsupported mutable nonordinary placement target.');
      else skippedPlacements.push(Object.freeze({index, type}));
    } else skippedPlacements.push(Object.freeze({index, type}));
    index++; authored += 56; put(F + 24, index);
  }
  let references = ptr(0x9092bc);
  for (let i = 0; i < m.readUInt16LE(pack + 150); i++) {
    const value = ptr(references + i * 4);
    if (value < 65536) {put(references + i * 4, get(ptr(F + 28) + value * 4)); references = ptr(0x9092bc);}
  }
  library('free', [ptr(F + 28)], 0x44d122);
  const authoredBodies = new Map(), authoredBodyStorage = authoredObjects.map(object => {
    const kind = get(object.bodyAddress) & 511, length = kind === 32 ? 0x188 : [20, 25, 31, 35].includes(kind) ? 0x18c : 0x180;
    authoredBodies.set(object.bodyAddress, {address: object.bodyAddress, bytes: m.subarray(object.bodyAddress, object.bodyAddress + length)});
    return Object.freeze({address: object.bodyAddress, length});
  });
  return {...bindSoloWorldRuntime({...runtime, firstBodyIndex}), attachmentCount: get(F + 20), skippedPlacements: Object.freeze(skippedPlacements),
    authoredObjects: Object.freeze(authoredObjects), renderParticles: Object.freeze(renderParticles), authoredBodyStorage: Object.freeze(authoredBodyStorage), authoredBodyAt: address => authoredBodies.get(address) ?? null};
}

function validateModels(context) {
  if (!(context?.instances instanceof Map) || !Array.isArray(context.links?.nodes)) throw Error('Solo world requires the original parsed model context.');
}

// Bind the output of an actual 44c2b0 call. Ordinary placements carry their
// authored ordinal at +192; createRawBody publishes their exact arena pointer
// in 70e200. This uses identities, never a scan for pointer-looking integers.
export function bindSoloWorldRuntime({memory, modelContext, firstBodyIndex = 0}) {
  if (!Buffer.isBuffer(memory) || memory.length < 0x920b20) throw Error('Solo world binding requires shared native global storage.');
  validateModels(modelContext);
  const ptr = address => memory.readUInt32LE(address), get = address => memory.readInt32LE(address);
  const count = ptr(0x6e6b44), geometryBase = ptr(0x90b970), header = ptr(0x90b990);
  if (!Number.isInteger(firstBodyIndex) || firstBodyIndex < 0 || firstBodyIndex > count || count > 512) throw Error('Solo world constructor registry is outside its declared range.');
  const range = (address, length) => {
    if (!Number.isInteger(address) || address <= 0 || address + length > memory.length) throw Error('Solo world pointer exceeds shared native storage.');
  };
  range(geometryBase, 0x120); range(header, 0x120);
  const objects = new Map(), constructedBodies = [];
  for (let index = firstBodyIndex; index < count; index++) {
    const body = ptr(0x70e200 + index * 4); range(body, 0x180); constructedBodies.push(body);
    // Authored ordinary placements have lower ten bits zero. Dynamic scenery,
    // fragments and vehicles keep distinct constructor identities and lists.
    if (get(body) & 1023) continue;
    range(body, 0x1b4);
    const placementIndex = memory.readUInt16LE(body + 0x192);
    if (!modelContext.instances.has(placementIndex)) throw Error('Native ordinary placement has no parsed authored identity.');
    if (objects.has(placementIndex)) throw Error('Native ordinary placement identity was constructed twice.');
    objects.set(placementIndex, body);
  }
  const instances = new Map(), pointers = new Map(), addresses = new Map();
  for (const [index, original] of modelContext.instances) {
    const object = objects.get(index), source = original.settings;
    if (!object) throw Error(`Native ordinary placement ${index} was not constructed.`);
    const expectedModel = ptr(ptr(header + 0x18) + source.modelIndex * 4);
    if (ptr(object + 0x10) !== expectedModel || ptr(object + 0x194) !== geometryBase + source.configurationBase) throw Error('Parsed model identity does not match native loader output.');
    const configurations = source.configurations.map((configuration, slot) => {
      const address = () => ptr(object + 0x194) + slot * 4;
      const live = {...configuration};
      Object.defineProperties(live, {
        type: {enumerable: true, get: () => memory[address() + 3] & 15},
        flags: {enumerable: true, get: () => ptr(address())},
        raw: {enumerable: true, get: () => memory.subarray(address(), address() + 4)}
      });
      return live;
    });
    const settings = {...source, configurations};
    Object.defineProperties(settings, {
      nativeAddress: {enumerable: true, value: object},
      class: {enumerable: true, get: () => memory[object + 0x19a]},
      yaw: {enumerable: true, get: () => memory[object + 0x199]},
      stateByte198: {enumerable: true, get: () => memory[object + 0x198]},
      position: {enumerable: true, get: () => [0, 4, 8].map(offset => get(object + 0x34 + offset) >> 16)},
      positionQ16: {enumerable: true, get: () => [0, 4, 8].map(offset => get(object + 0x34 + offset))}
    });
    const instance = {...original, settings}; instances.set(index, instance); addresses.set(settings, object);
    for (const shape of original.collision.shapes) {
      const shapeAddress = geometryBase + shape.offset;
      if (shapeAddress !== expectedModel + memory.readUInt16LE(expectedModel + 0x34) + shape.index * 20) throw Error('Parsed shape identity does not match native model storage.');
      pointers.set(`${object}:${shapeAddress}`, {...instance, shape});
    }
  }
  const context = {...modelContext, instances};
  const candidateMapping = {
    modelPointersFor(candidate) {
      const object = addresses.get(candidate.settings), shape = geometryBase + candidate.shape.offset;
      if (!pointers.has(`${object}:${shape}`)) throw Error('Model candidate is detached from its native world identity.');
      return {object, shape};
    },
    modelForPointers(object, shape) {
      const candidate = pointers.get(`${object}:${shape}`);
      if (!candidate) throw Error('Native candidate points outside the bound ordinary placements.');
      return candidate;
    }
  };
  const interactions = createPhysicsInteractionRuntime({memory});
  return {memory, geometryBase, modelContext: context, candidateMapping,
    constructedBodies: Object.freeze(constructedBodies), worldEffectState: interactions.worldEffectState,
    objectForPlacement(index) {
      const object = objects.get(index);
      if (!object) throw Error('Ordinary placement was not constructed by this loader call.');
      return object;
    }};
}

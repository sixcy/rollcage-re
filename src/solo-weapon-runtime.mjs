import {nativeGlobalAddress} from './native-global-address.mjs';
import {initializePickupWorldTables, initializeWorldPickups} from './pickup-world-construction.mjs';
import {initializePickupProbabilityTables} from './pickup-award.mjs';
import {initializeProjectileConstructionTables, initializeProjectilePools} from './projectile-construction.mjs';
import {initializeProjectileLaunchTables} from './projectile-launch.mjs';
import {initializeWormholeVisualTables} from './wormhole-visuals.mjs';
import {initializeWormholeStateTables, filterWormholeContact} from './wormhole-state.mjs';
import {initializeWeaponLaunchFeedbackTables} from './weapon-launch-feedback.mjs';
import {initializeVehicleContactColorTopology, initializeVehicleContactColorController} from './vehicle-contact-colors.mjs';
import {initializeRaceQuadStorage} from './race-startup-storage.mjs';
import {updateRaceWeaponStage} from './race-weapon-stage.mjs';
import {filterHomingProjectileCollision, filterGroundProjectileCollision, filterSatelliteMasterCollision} from './projectile-collisions.mjs';
import {nativeMemorySpan, sharesNativeMemorySpan} from './native-memory-spans.mjs';

// Original image constants only. Mutable pool/session state is constructed
// below; neither initializer chooses a game mode or enables pickups.
export function initializeSoloWeaponConstants(memory) {
  initializePickupWorldTables(memory);
  initializePickupProbabilityTables(memory);
  initializeProjectileConstructionTables(memory);
  initializeProjectileLaunchTables(memory);
  initializeWormholeVisualTables(memory);
  initializeWormholeStateTables(memory);
  initializeWeaponLaunchFeedbackTables(memory);
  return memory;
}

//47eccf..47eda2, owned by47ea40. scratchBase is the common direct-child
//entry ESP (47ea40 entry minus48), not the outer initializer's entry.
//Call after the real world-fragment constructors and before particle/debris,
//projection and participant constructors. All six482590 calls precede cars.
export function initializeSoloWeaponRuntime(runtime) {
  const {memory, scratchBase: entry} = runtime ?? {};
  if (!Buffer.isBuffer(memory) || !Number.isInteger(entry) || entry < 1024 || entry + 16 > memory.length) throw Error('Solo weapons require shared native memory and the startup child entry stack.');
  const ptr = p => nativeMemorySpan(memory, p, 4).readUInt32LE();
  const put = (p, value) => nativeMemorySpan(memory, p, 4).writeInt32LE(value | 0);
  const word = (p, value) => nativeMemorySpan(memory, p, 2).writeUInt16LE(value & 65535);
  for (const [root, size] of [[0x90b98c, 0x60], [0x90b990, 0x120], [0x90b988, 16], [nativeGlobalAddress(memory, 0x902eec), 0x180], [0x909254, 16], [0x909278, 12]]) {
    const address = ptr(root);
    if (!address) throw Error('Solo weapon construction requires initialized native resource, arena and spatial roots.');
    nativeMemorySpan(memory, address, size);
  }
  const allocator = runtime.allocate ?? runtime.handlers?.allocate;
  if (typeof allocator !== 'function') throw Error('Solo weapons require a real bounded CRT allocator.');
  const allocate = (size, context) => {
    const result = allocator(size, context), address = typeof result === 'number' ? result : result?.eax;
    if (!Number.isInteger(address) || address <= 0) throw Error('Solo weapons do not support native failed-allocation continuation.');
    nativeMemorySpan(memory, address, size);
    return address;
  };
  const context = {...runtime, allocate, handlers: {...runtime.handlers, allocate}};
  const first = ptr(0x6e6b44);
  if (first > 512) throw Error('Solo weapon construction requires a bounded native body registry.');
  for (const p of [nativeGlobalAddress(memory, 0x9020a0), nativeGlobalAddress(memory, 0x9020a4), nativeGlobalAddress(memory, 0x9020a8)]) put(p, 0);
  initializeRaceQuadStorage(context);
  initializeWorldPickups(context);
  initializeProjectilePools(context);

  //The malloc call has one pushed argument; the subsequent memset has three.
  //Retain the actual producer words, including the unconditional REP STOSD.
  put(entry, 0x800); put(0x90cb80, 0); put(entry - 4, 0x47ed05);
  const history = allocate(0x800, {...context, scratchBase: entry - 4});
  put(entry, 0x800); put(entry - 4, 0); put(entry - 8, history); put(entry - 12, 0x47ed1b);
  memory.fill(0, history, history + 0x800);
  const pack = ptr(0x90b98c); //47ed1e captures EDX before publishing the map.
  put(0x90cb60, history);
  for (let i = 0; i < 512; i++) put(history + i * 4, -1);
  put(nativeGlobalAddress(memory, 0x811180), 0); word(0x90d974, 0x3cf);
  put(nativeGlobalAddress(memory, 0x811184), 0); put(nativeGlobalAddress(memory, 0x811188), 0); put(nativeGlobalAddress(memory, 0x81118c), 0x10000); put(0x6e6704, 127);
  const metadata = ptr(pack + 0x58), modelIndex = nativeMemorySpan(memory, metadata + 14, 2).readInt16LE();
  put(0x713184, ptr(ptr(pack + 0x18) + modelIndex * 4));
  initializeVehicleContactColorTopology(context);
  for (let i = 0; i < 6; i++) initializeVehicleContactColorController(0x8495e0 + i * 0x8c, context);

  //Only bodies actually registered by those constructors are admitted. The
  //following arena cursor bounds each full allocation, including expanded
  //model storage; no generic fake vehicle layout stands in for these bodies.
  const count = ptr(0x6e6b44), arena = ptr(nativeGlobalAddress(memory, 0x902eec)), end = arena + ptr(0x70dcf4);
  if (count < first || count > 512) throw Error('Solo weapon construction overflowed the native body registry.');
  const addresses = Array.from({length: count - first}, (_, i) => ptr(0x70e200 + (first + i) * 4));
  const bodies = new Map();
  addresses.forEach((address, index) => {
    const limit = addresses[index + 1] ?? end;
    if (address < arena || limit - address < 0x180 || bodies.has(address)) throw Error('Solo weapon constructor published invalid native body storage.');
    bodies.set(address, {address, bytes: nativeMemorySpan(memory, address, limit - address)});
  });
  return Object.freeze({
    bodyAt: address => bodies.get(address) ?? null,
    bodyStorage: Object.freeze([...bodies.values()].map(body => Object.freeze({address: body.address, length: body.bytes.length}))),
    //48d7c0 must follow443d90/48d680 and precede41d2b0/416400. Its incoming
    //EDI is the number of completed iterations of that native motion pass.
    step(update) {
      if (!update || !Number.isInteger(update.scratchBase) || !Number.isInteger(update.entryRegisters?.EDI)) throw Error('Solo weapon update requires its actual stage entry and completed motion-pass EDI.');
      if (update.memory !== undefined && update.memory !== memory) throw Error('Solo weapon update cannot replace shared native memory.');
      updateRaceWeaponStage({...context, ...update, memory});
    },
    //474b20 cdecl callback entry is supplied by the real physics parent.
    //Scene, sound and other reached services pass through without answers.
    createCollisionFilters(callback) {
      if (!callback || !Number.isInteger(callback.scratchBase)) throw Error('Solo projectile filters require their actual callback entry.');
      if (callback.memory !== undefined && callback.memory !== memory) throw Error('Solo projectile filters cannot replace shared native memory.');
      const nested = {...context, ...callback, memory};
      const wrap = (implementation, wormhole = false) => (body, other, event) => {
        const shared = (value, size) => Number.isInteger(value?.address) && sharesNativeMemorySpan(memory, value.bytes, value.address, size);
        if (!shared(body, 0x180) || other && !shared(other, 0x180) || !shared(event, 0x68)) throw Error('Solo projectile collision requires real shared body/event views.');
        const S = nested.scratchBase;
        put(S + 4, body.address); put(S + 8, other?.address ?? 0); put(S + 12, event.address);
        return wormhole ? implementation(body.address, nested) : implementation(body.address, other?.address ?? 0, event.address, nested);
      };
      return new Map([[0x46b820, wrap(filterHomingProjectileCollision)], [0x44b6c0, wrap(filterGroundProjectileCollision)],
        [0x4302f0, wrap(filterSatelliteMasterCollision)], [0x49ab40, wrap(filterWormholeContact, true)]]);
    }
  });
}

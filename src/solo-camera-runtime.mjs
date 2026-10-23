import {constructCameraController, initializeCameraConstructionConstants} from './camera-construction.mjs';
import {initializeCameraCurveConstants} from './camera-curve.mjs';
import {initializeCameraPolicyConstants} from './camera-mode-policy.mjs';
import {initializeCameraProjectionConstants, updateCameraProjection, updateCameraProjectionRatios} from './camera-projection.mjs';
import {updateCamera} from './camera-update.mjs';
import {getRaceStageCount} from './race-stage-count.mjs';
import {readRendererViewportExtent} from './renderer-viewports.mjs';
import {constructRendererManager, initializeRendererSceneConstants} from './renderer-scene-nodes.mjs';
import {obtainViewportApplication} from './application-bootstrap.mjs';
import {nativeMemorySpan} from './native-memory-spans.mjs';
import {selectRaceViewportParticipants, layoutRaceViewports, initializeRaceViewportLayoutConstants} from './race-viewport-layout.mjs';
import {updateVehicleAuxiliaryAnimation} from './vehicle-auxiliary-animation.mjs';

// Original image data only. These are independent of session/controller state.
export function initializeSoloCameraConstants(memory) {
  initializeCameraConstructionConstants(memory); initializeCameraCurveConstants(memory);
  initializeCameraPolicyConstants(memory); initializeCameraProjectionConstants(memory);
  initializeRendererSceneConstants(memory);
  initializeRaceViewportLayoutConstants(memory);
  //4180a0's actual sprintf format, independently checked against retained bytes.
  Buffer.from('%d Player\0', 'ascii').copy(memory, 0x5d043c);
}

// Viewer-owned composition of actual game constructors and the full camera
// update. It supplies no replacement camera poses, flags, obstruction answers
// or CRT services. Existing scene/pool/session storage remains caller-owned.
export function createSoloCameraRuntime(runtime) {
  const {memory, scratchBase} = runtime ?? {};
  if (!Buffer.isBuffer(memory) || !Number.isInteger(scratchBase)) throw Error('Solo camera requires shared native memory and an explicit entry stack.');
  const ptr = address => nativeMemorySpan(memory, address, 4).readUInt32LE();
  const put = (address, value) => nativeMemorySpan(memory, address, 4).writeInt32LE(value | 0);
  let initialCount = null;
  const constructed = new Set(), bodies = new Map(), controllers = [];
  const child = depth => ({...runtime, scratchBase: scratchBase - depth});
  const requireRenderer = () => {
    const owner = ptr(0x6e6388);
    if (!owner) throw Error('Solo camera requires an actual renderer manager for native viewport lookup.');
    nativeMemorySpan(memory, owner, 56);
  };
  return Object.freeze({
    //The standalone viewer owns allocation/root publication. The object itself
    //is constructed by517720, including its real scene/target/viewport graph.
    //This does not claim to reconstruct the wider519df0 bootstrap.
    initializeViewportRuntime(rendererManager) {
      if (!Number.isInteger(rendererManager) || rendererManager <= 0) throw Error('Solo camera viewport construction requires an explicitly allocated renderer manager.');
      nativeMemorySpan(memory, rendererManager, 56);
      constructRendererManager(rendererManager, runtime);
      put(0x6e6388, rendererManager);
      return obtainViewportApplication(runtime);
    },
    //Owned47ef54..47efc7 startup phase, before participant construction. Keep
    //its original parent-local writes and real projection/viewport descendants.
    initializeProjection() {
      requireRenderer();
      const frame = scratchBase - 44, context = child(48), f32 = Math.fround;
      const height = readRendererViewportExtent(true, context);
      memory.writeFloatLE(f32(memory.readFloatLE(0x5dc774) / f32(height)), frame + 0x18);
      const width = readRendererViewportExtent(false, context);
      const aspect = f32(f32(width) * memory.readFloatLE(frame + 0x18)), limit = memory.readFloatLE(0x5dc7a0);
      let distance = 104;
      if (aspect > limit) {
        const value = f32(f32(limit / aspect) * memory.readFloatLE(0x5dca1c));
        distance = (Number.isFinite(value) && value >= -2147483648 && value < 2147483648 ? Math.trunc(value) : -2147483648) & 65535;
      }
      memory.writeUInt16LE(distance, 0x91d50a); put(frame + 0x18, 104); memory.writeFloatLE(104, 0x91ceb0);
      updateCameraProjection(distance << 16 >> 16, context);
      updateCameraProjectionRatios(distance, context);
    },
    //Actual471770/42ef80 prefix of450a90. It does not stand in for that
    //parent's later GPU-backed viewport texture/target construction.
    initializeViewSelection() {
      selectRaceViewportParticipants(child(112));
      layoutRaceViewports(ptr(0x5ec120), ptr(0x5ec124), ptr(0x5ec128), ptr(0x5ec12c), child(120));
    },
    //47efef captures eligibility after viewport/projection initialization and
    //before the first41dbb0. CRT services may have changed the live session.
    beginParticipants() {
      if (constructed.size) throw Error('Solo camera participant construction has already begun.');
      const count = nativeMemorySpan(memory, ptr(0x5ecb1c) + 0x54d, 1)[0];
      if (!count || count > 6) throw Error('Solo camera construction requires from1 through6 declared participants.');
      initialCount = count;
      return count;
    },
    //Call immediately after this participant's41dbb0 and before410060. The
    //native47ea40 eligibility count was captured before the participant loop.
    constructParticipant(index) {
      if (initialCount === null) throw Error('Solo camera requires beginParticipants before the vehicle-construction loop.');
      const liveCount = nativeMemorySpan(memory, ptr(0x5ecb1c) + 0x54d, 1)[0];
      if (!Number.isInteger(index) || index < 0 || index >= liveCount || index >= 6 || constructed.has(index)) throw Error('Solo camera participant index is absent or already constructed.');
      const record = 0x909300 + index * 0x30c;
      if (index >= initialCount) {put(record + 0x18, 0x12345678); constructed.add(index); return null;}
      const trackedBody = ptr(record), control = 0x909060 + index * 0x4c;
      if (!trackedBody) throw Error('Solo camera participant requires its actual constructed body.');
      nativeMemorySpan(memory, trackedBody, 0x180);
      put(record + 0x18, control);
      constructCameraController(index, trackedBody, control, child(52));
      const address = ptr(control), body = {address, bytes: nativeMemorySpan(memory, address, 384)};
      bodies.set(address, body); controllers.push(Object.freeze({index, recordAddress: record, controllerAddress: control, bodyAddress: address, trackedBodyAddress: trackedBody}));
      constructed.add(index);
      return controllers.at(-1);
    },
    bodyAt(address) {return bodies.get(address) ?? null;},
    get controllers() {return Object.freeze(controllers.slice());},
    //416400 produces forces for the physical camera body using actual wheel
    //contacts. Native450e50 invokes it immediately after this car's41d2b0;
    //the next4749e0 consumes those forces.4180a0 is a later separate stage.
    updateParticipant(index, context = {}) {
      const count = nativeMemorySpan(memory, ptr(0x5ecb1c) + 0x54d, 1)[0];
      if (!Number.isInteger(index) || index < 0 || index >= count || index >= 6 || !constructed.has(index)) throw Error('Solo camera auxiliary update requires its constructed participant.');
      if (context.memory !== undefined && context.memory !== memory) throw Error('Solo camera auxiliary update cannot replace shared memory.');
      if (ptr(0x909318 + index * 0x30c) === 0x12345678) throw Error('Solo camera auxiliary update reached the native sentinel controller.');
      updateVehicleAuxiliaryAnimation(0x909300 + index * 0x30c, {...runtime, ...context, memory, scratchBase: (context.scratchBase ?? scratchBase) - 20});
    },
    //450e50 calls41bef0 for every loop condition. Caller places this stage
    //after wheel rendering/auxiliary animation/lights/debris, before weather
    //and deferred placed-object effects. Terrain494f60 precedes429f30/physics.
    step(context = {}) {
      if (context.memory !== undefined && context.memory !== memory) throw Error('Solo camera update cannot replace its shared memory.');
      requireRenderer();
      const updateRuntime = {...runtime, ...context, memory, scratchBase: (context.scratchBase ?? scratchBase) - 20};
      let updated = 0;
      for (let index = 0; index < getRaceStageCount(updateRuntime); index++) {
        updateCamera(index, updateRuntime); updated++;
      }
      return updated;
    },
    get snapshot() {
      const viewCount = getRaceStageCount(runtime);
      return Object.freeze({viewCount, animationUnconditional: Boolean(nativeMemorySpan(memory, 0x91ce90, 1)[0] & 2),
        views: Object.freeze(Array.from({length: viewCount}, (_, index) => {
          const row = 0x91ff80 + index * 0x184;
          return Object.freeze({index, mode: nativeMemorySpan(memory, row, 4).readInt32LE(), participant: nativeMemorySpan(memory, row + 0x36, 2).readUInt16LE(),
            positionQ16: Object.freeze([0, 4, 8].map(offset => nativeMemorySpan(memory, row + 0x40 + offset, 4).readInt32LE()))});
        }))});
    }
  });
}

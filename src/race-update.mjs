import {runAutonomousDispatch} from './autonomous-dispatch.mjs';
import {updateAutonomousRouteControl} from './autonomous-route-control.mjs';
import {updateVehicleAudio} from './vehicle-audio.mjs';
import {updateVehicleInputBlock, copyLinkedVehicleControls, updateVehicleControlState, updateVehicleMotionState, updateVehicleSurfaceDrive} from './vehicle-control-state.mjs';
import {runRaceProgressPass} from './race-progress-pass.mjs';
import {updateRaceHandlingScale} from './race-handling-scale.mjs';
import {maintainWorldFragments} from './world-fragment-registry.mjs';
import {updateVehicleAuxiliaryInput} from './vehicle-auxiliary-input.mjs';
import {updateRawBodyAttachments} from './body-attachments.mjs';
import {advanceRawEffectParticles,advanceRawBodyDebris} from './particle-lifetime.mjs';
import {updateRacePhaseState} from './race-phase-state.mjs';
import {updateRaceAudioListeners} from './race-phase-audio.mjs';
import {setSoundManagerMasterLevel} from './sound-manager-level.mjs';
import {updateRawAttachmentEffects,updateRawPersistentEmitters} from './attachment-effects.mjs';
import {updateDynamicLights} from './dynamic-light-state.mjs';
import {updateVehicleSurfaceFeedback} from './vehicle-surface-feedback.mjs';
import {updateTrackDeformation} from './track-deformation.mjs';
import {updateRaceObjects} from './race-object-update.mjs';
import {prepareVehicleWheelRender} from './wheel-render-state.mjs';
import {getRaceStageCount} from './race-stage-count.mjs';
import {runRacePhysicsStage} from './race-physics-stage.mjs';
import {runRacePostFrameStage} from './raw-respawn-state.mjs';
import {updateVehicleWheelHistories} from './vehicle-wheel-histories.mjs';
import {updatePlacedModelContactEffects} from './placed-model-effect-update.mjs';
import {updateVehicleGroundProjection} from './vehicle-ground-projection.mjs';
import {updateVehicleOverlayGrids} from './vehicle-overlay-grid.mjs';
import {updateVehicleAnimationLights} from './vehicle-animation-lights.mjs';
import {updateModelContactFragments} from './model-contact-effects.mjs';
import {updateVehicleAuxiliaryAnimation} from './vehicle-auxiliary-animation.mjs';
import {updatePeriodicBody} from './periodic-body-spawn.mjs';
import {updatePlacedObjectDestruction} from './placed-object-destruction.mjs';
import {updateProceduralTexture} from './procedural-texture.mjs';
import {updateTerrainPointAnimation} from './terrain-point-animation.mjs';
import {updateWeather} from './weather-update.mjs';
import {updateWormholeState} from './wormhole-state.mjs';
import {updateCamera} from './camera-update.mjs';
import {updateRaceWeaponStage} from './race-weapon-stage.mjs';

//450e50: complete surrounding stage order and caller-owned state writes.
//All42 direct game entry points have actual defaults. Their transitive state
//and producer closure remain separately scoped; this alone does not close a tick.
//EDX supplies iteration; the total-iterations stack argument is read late/live.
export function runRaceUpdate(iteration, totalIterations, runtime) {
  const {memory, scratchBase, handlers = {}} = runtime;
  const pointer = address => memory.readUInt32LE(address), get = address => memory.readInt32LE(address);
  const put = (address, value) => memory.writeInt32LE(value | 0, address);
  const entry = scratchBase - 20, context = {...runtime, scratchBase: entry};
  let weaponStageEdi = 0;
  put(scratchBase + 4, totalIterations);
  const call = (id, ecx, edx) => {
    const name = `call${id}`, request = {memory, ecx, edx, args: [], scratchBase: entry};
    if (handlers[name]) return handlers[name](request);
    if (id === '410220') return runAutonomousDispatch(ecx, context);
    if (id === '431750') return updateAutonomousRouteControl(ecx, context);
    if (id === '485300') return updateVehicleAudio(ecx, edx, context);
    if (id === '42a6e0') return updateVehicleInputBlock(ecx, edx, context);
    if (id === '42be80') return updateVehicleAuxiliaryInput(ecx, context);
    if (id === '49bbc0') return copyLinkedVehicleControls(context);
    if (id === '42a9a0') return updateVehicleControlState(ecx, context);
    if (id === '449640') return runRaceProgressPass(context);
    if (id === '44f050') return updateRawBodyAttachments(context);
    if (id === '420500') return updateRaceHandlingScale(context);
    if (id === '443d90') return updateVehicleMotionState(ecx, context);
    if (id === '48d680') return updateVehicleSurfaceDrive(ecx, context);
    if (id === '480e90') return maintainWorldFragments({...context, soundRuntime: runtime.soundRuntime ?? context});
    if (id === '438550') return advanceRawEffectParticles(context);
    if (id === '475e50') return advanceRawBodyDebris(context);
    if (id === '47f370') return updateRacePhaseState(context);
    if (id === '484880') return updateRaceAudioListeners(context);
    if (id === '44f3a0') return updateRawAttachmentEffects(context);
    if (id === '44f990') return updateRawPersistentEmitters(context);
    if (id === '44d960') return updateDynamicLights(ecx, context);
    if (id === '42b530') return updateVehicleSurfaceFeedback(context);
    if (id === '494f60') return updateTrackDeformation(context);
    if (id === '429f30') return updateRaceObjects(context);
    if (id === '41d2b0') return prepareVehicleWheelRender(ecx, context);
    if (id === '41bef0') return getRaceStageCount(context);
    if (id === '4749e0') return runRacePhysicsStage(context);
    if (id === '47ccc0') return runRacePostFrameStage(context);
    if (id === '494140') return updateVehicleWheelHistories(context);
    if (id === '414060') return updatePlacedModelContactEffects(context);
    if (id === '481200') return updateVehicleGroundProjection({...context.physics?.context?.nativeTerrain, ...context});
    if (id === '487540') return updateVehicleOverlayGrids(context);
    if (id === '48e310') return updateVehicleAnimationLights(context);
    if (id === '416400') return updateVehicleAuxiliaryAnimation(ecx, context);
    if (id === '48edb0') return updateModelContactFragments(context);
    if (id === '469fd0') return updatePeriodicBody(context);
    if (id === '415230') return updatePlacedObjectDestruction(context);
    if (id === '499de0') return updateProceduralTexture(context);
    if (id === '44a7a0') return updateTerrainPointAnimation(context);
    if (id === '496700') return updateWeather(context);
    if (id === '49ac30') return updateWormholeState(context);
    if (id === '4180a0') return updateCamera(ecx, context);
    if (id === '48d7c0') return updateRaceWeaponStage({...context, entryRegisters: {...runtime.entryRegisters, EDI: weaponStageEdi}});
    throw Error(`Race update requires reached handler ${name}.`);
  };
  const number = id => {
    const returned = call(id), value = typeof returned === 'number' ? returned : returned?.eax;
    if (!Number.isInteger(value)) throw Error(`Race update requires EAX from call${id}.`);
    return value | 0;
  };
  let session = pointer(0x5ecb1c);
  for (let index = 0; index < memory[session + 0x54d]; index++) {
    const body = pointer(0x909300 + index * 0x30c);
    put(body + 0x70c, get(body + (get(body + 0x690) ? 0x694 : 0x710)));
  }
  for (const id of ['410220', '431750']) {
    for (let index = 0; index < memory[session + 0x54d]; index++) {
      const body = pointer(0x909300 + index * 0x30c);
      if (memory[body + 0x718] === 8) {call(id, body); session = pointer(0x5ecb1c);}
    }
  }
  for (let index = 0; index < memory[session + 0x54d]; index++) {
    call('485300', pointer(0x909300 + index * 0x30c), index); session = pointer(0x5ecb1c);
  }
  for (let index = 0; index < memory[session + 0x54d]; index++) {
    const record = 0x909300 + index * 0x30c;
    call('42a6e0', pointer(record), index); call('42be80', record); session = pointer(0x5ecb1c);
  }
  call('49bbc0');
  //ESI still references the last input pass's session, even if49bbc0 replaced
  //the global pointer. The handling conversion itself reads the live global.
  for (let index = 0; index < memory[session + 0x54d]; index++) call('42a9a0', pointer(0x909300 + index * 0x30c));
  call('494f60'); call('429f30');
  if (memory[pointer(0x90b990) + 0xfc]) {
    const count = get(0x90b998), rows = pointer(0x90b994);
    for (let index = 0; index < count; index++) {
      const row = rows + index * 24, target = pointer(row);
      //Read/store each word separately: source/destination may overlap.
      for (let axis = 0; axis < 3; axis++) memory.writeUInt16LE(memory.readUInt16LE(row + 4 + axis * 2), target + axis * 2);
    }
  }
  for (const id of ['449640', '420500', '4749e0', '44f050', '47ccc0']) call(id);
  session = pointer(0x5ecb1c);
  for (let index = 0; index < memory[session + 0x54d]; index++) {
    const record = 0x909300 + index * 0x30c; call('443d90', record); call('48d680', record); session = pointer(0x5ecb1c);
    //451026 clears EDI;451049 increments it after each live-count pass.
    //The intervening native callees preserve this register before48d7c0.
    weaponStageEdi = index + 1;
  }
  if (memory[pointer(0x5ecefc) + 0x28] && get(pointer(0x80b5e0) + 0x188)) call('499de0', 0x80b5e0);
  for (const id of ['49ac30', '48d7c0', '469fd0']) call(id);
  session = pointer(0x5ecb1c);
  if (get(session + 0x57c) < 4) put(0x712fbc, get(0x712fbc) + 1);
  for (let index = 0; index < memory[session + 0x54d]; index++) {
    const record = 0x909300 + index * 0x30c; call('41d2b0', pointer(record)); call('416400', record); session = pointer(0x5ecb1c);
  }
  call('48e310'); call('475e50');
  for (let index = 0; index < number('41bef0'); index++) call('4180a0', index);
  for (const id of ['496700', '414060', '438550']) call(id);
  const countdown = get(0x6fb9a4);
  if (countdown) {const next = (countdown + 1) | 0; put(0x6fb9a4, next > 32 ? 0 : next);}
  for (const id of ['481200', '48edb0', '494140', '487540', '44a7a0', '415230', '480e90', '44f990', '44f3a0']) call(id);
  if ((iteration | 0) === ((get(scratchBase + 4) - 1) | 0)) {call('44d960', 0); call('42b530');}
  else call('44d960', 1);
  const mirrored = memory[pointer(0x5ecb1c) + 0x58b] !== 0;
  put(0x5ecdb4, mirrored ? 0xb5800000 : 0x35800000); put(0x5ecdb0, mirrored ? 0xb7f00000 : 0x37f00000);
  put(0x6e6bd4, get(pointer(0x5ecefc) + 0x404)); call('484880');
  if (typeof handlers.audioManagerCall === 'function') handlers.audioManagerCall(pointer(0x714b08), 0x5c, [get(0x5ecdb8)], runtime);
  else {
    const manager = pointer(0x714b08), bits = get(0x5ecdb8), target = pointer(pointer(manager) + 0x5c);
    put(scratchBase - 20, bits); put(scratchBase - 24, 0x4511e3);
    if (target !== 0x4a90e0) throw Error(`Unclassified SoundManager master-level target0x${target.toString(16)}.`);
    setSoundManagerMasterLevel(manager, bits, {...runtime, scratchBase: scratchBase - 24});
  }
  if (number('47f370')) return 0;
  put(0x90a548, get(0x90a548) + 1); put(0x6e675c, get(0x6e675c) + 1); return 1;
}

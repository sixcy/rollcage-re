import {createPhysicsRuntimeViews} from '../../src/physics-runtime-views.mjs';
import {applyBodyForces, updateBodyDerived} from '../../src/body-physics.mjs';
import {prepareOrdinaryBody} from '../../src/body-preparation.mjs';
import {createVehicleRuntimeViews} from '../../src/vehicle-runtime-views.mjs';
import {prepareWheelDriveDirections} from '../../src/wheel-drive.mjs';
import {applyWheelSuspension} from '../../src/wheel-physics.mjs';
import {clampVehicleAtRest, dampAirborneSpin, assistAirborneOrientation} from '../../src/vehicle-assists.mjs';

const bodyOffset = 0x10000;
// The routines below consume body-relative numerical fields. Preserve every
// other body byte, including native pointers, without scanning or rebasing them.
export function replayNativeBody(stage, input, options = {}) {
  if (!Buffer.isBuffer(input) || input.length < 0x180) throw Error('Native replay requires the captured common body.');
  const memory = Buffer.alloc(0xa00000);
  input.copy(memory, bodyOffset);
  const views = createPhysicsRuntimeViews({memory, bodyStorage: [{address: bodyOffset, length: input.length}], bodyLists: []});
  const body = views.bodyAt(bodyOffset);
  let records = null;
  if (stage === 'forces') applyBodyForces(body);
  else if (stage === 'derivatives') updateBodyDerived(body);
  else if (stage === 'preparation') {
    if (input.length < 0x2f3c || !Buffer.isBuffer(options.records) || options.records.length !== 256 * 72) throw Error('Preparation requires full captured vehicle fields and the complete contact pool.');
    if (options.effectFlags?.first === 1 || options.effectFlags?.second === 1) throw Error('Active shared effects require their captured producers; this replay does not mock them.');
    records = Buffer.from(options.records);
    const state = {wheels: [0x324, 0x3ec, 0x4b4, 0x57c].map(offset => ({flags: memory[bodyOffset + offset]}))};
    for (const [name, offset] of [['reverseByte64f', 0x64f], ['rememberedSide654', 0x654], ['airCounter655', 0x655]]) Object.defineProperty(state, name, {get: () => memory[bodyOffset + offset], set: value => {memory[bodyOffset + offset] = value & 255;}});
    Object.defineProperty(state, 'speed664', {get: () => memory.readInt32LE(bodyOffset + 0x664)});
    prepareOrdinaryBody(body, {...options, records, specialVehicleState: state});
  } else if (['directions', 'suspension', 'rest', 'air-spin', 'orientation'].includes(stage)) {
    if (input.length < 0x3e70) throw Error('Vehicle stage requires captured extended body state.');
    const vehicleViews = createVehicleRuntimeViews({memory, bodyAt: () => body});
    const state = vehicleViews.stateFor(body), drive = vehicleViews.driveFor(body);
    if (stage === 'directions') prepareWheelDriveDirections(body, state.wheels, memory.readInt32LE(bodyOffset + 0x644), {reverseSteering: memory[bodyOffset + 0x64f] !== 0});
    else if (stage === 'suspension') applyWheelSuspension(body, state.wheels, state.contacts);
    else if (stage === 'rest') clampVehicleAtRest(body, state, drive);
    else if (stage === 'air-spin') dampAirborneSpin(body, state);
    else assistAirborneOrientation(body, state, options.timeOptions);
  } else throw Error('Unknown native body replay stage.');
  return {body: Buffer.from(memory.subarray(bodyOffset, bodyOffset + input.length)), records};
}

export function firstByteDivergence(expected, actual) {
  if (expected.length !== actual.length) throw Error('Replay comparison spans differ.');
  for (let offset = 0; offset < expected.length; offset++) if (expected[offset] !== actual[offset]) return {offset, offsetHex: `0x${offset.toString(16)}`, nativeByte: expected[offset], javascriptByte: actual[offset]};
  return null;
}

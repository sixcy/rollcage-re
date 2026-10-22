import {createCapturedMemory} from './captured-memory.mjs';
import {inspectNativeFrameIdentity,compareNativeFrameIdentity} from './native-frame-identity.mjs';

// Scenario evidence comes from native entry/exit bytes, independently of source
// stage counters. A zero queue at both boundaries cannot establish no dispatch.
export function inspectNativeFrameScenario(pair, manifest, memories = {}) {
  const participants = manifest.requiredRegions.find(row => row.id === 'participant-records');
  const clock = manifest.requiredRegions.find(row => row.id === 'clock');
  if (!participants || !clock) return {available: false, reason: 'Participant/clock comparison spans are not declared.'};
  const count = manifest.observed.participantCount;
  if (!Number.isInteger(count) || count < 0 || count > 6 || participants.length < count * 0x30c || clock.length !== 4) throw Error('Invalid native scenario participant/clock bounds.');
  const memoryFor = (name, snapshot) => memories[name] ?? createCapturedMemory(snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot.ranges);
  const before = memoryFor('before', pair.before), after = memoryFor('after', pair.after);
  const identity = compareNativeFrameIdentity(inspectNativeFrameIdentity(pair.before,manifest,{capturedMemory:before}),inspectNativeFrameIdentity(pair.after,manifest,{capturedMemory:after}));
  const vector = (memory, address) => {const bytes = memory.span(address, 12); return [0,4,8].map(offset => bytes.readInt32LE(offset));};
  const vehicles = Array.from({length: count}, (_, index) => {
    const record = participants.address + index * 0x30c;
    const beforeAddress = before.span(record, 4).readUInt32LE(), afterAddress = after.span(record, 4).readUInt32LE();
    if (!beforeAddress || !afterAddress) throw Error('Native scenario contains a null participant body.');
    const velocityBeforeQ16 = vector(before, beforeAddress + 0x68), velocityAfterQ16 = vector(after, afterAddress + 0x68);
    const positionBeforeQ16 = vector(before, beforeAddress + 0x34), positionAfterQ16 = vector(after, afterAddress + 0x34);
    return {index, beforeAddress, afterAddress, sameBody: beforeAddress === afterAddress,
      flagsBefore: before.span(beforeAddress, 4).readUInt32LE(), flagsAfter: after.span(afterAddress, 4).readUInt32LE(),
      velocityBeforeQ16, velocityAfterQ16, positionBeforeQ16, positionAfterQ16,
      positionDeltaQ16: beforeAddress === afterAddress ? positionAfterQ16.map((value, lane) => (value - positionBeforeQ16[lane]) | 0) : null};
  });
  return {available: true, logicalClockBefore: before.span(clock.address, 4).readUInt32LE(), logicalClockAfter: after.span(clock.address, 4).readUInt32LE(),
    movingVehiclesBefore: vehicles.filter(row => row.velocityBeforeQ16.some(value => value !== 0)).length,
    movingVehiclesAfter: vehicles.filter(row => row.velocityAfterQ16.some(value => value !== 0)).length,
    translatedVehicles: vehicles.filter(row => row.positionDeltaQ16?.some(value => value !== 0)).length,
    vehicles, identity, limits: ['Velocity/position observations do not classify wheel, wall or car-pair contacts.', 'Queue emptiness is not evidence that no events were dispatched within the frame.']};
}

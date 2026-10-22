import {createCapturedMemory} from './captured-memory.mjs';

// Redux target c0582271...:43b0e0 formats high\\lev%d iff config+31==1,
// otherwise low\\lev%d; the decimal value is session+579 (unsigned BYTE)+1.
// Retained037-session-track-select:ev_603df6d5b2e1f6f93ac382d4541a151e240aec77e4633b574e37d1429e34786e.
//41dbb0 captures each actual vehicle type from session+1c+participant index;
// chassis flags&type511==3 do NOT identify the selected vehicle model.
// Scene134:ev_16e1c6a62e466500605b98333c96f4863f748728e8f58cd1708448cd6dd17a25.
export function inspectNativeFrameIdentity(snapshot, manifest, {capturedMemory} = {}) {
  const session = manifest.requiredRegions?.find(row => row.id === 'session');
  const configuration = manifest.requiredRegions?.find(row => row.id === 'configuration');
  if (!session || !configuration) return {available: false, reason: 'Session/configuration identity spans are not declared.'};
  if (!Number.isSafeInteger(session.address) || !Number.isSafeInteger(configuration.address) || session.length < 0x58d || configuration.length < 0x32) throw Error('Invalid native identity session/configuration spans.');
  // Addresses are the manifest's actual native addresses. This reader neither
  // installs preferred-address aliases nor loads an authored resource/parser.
  const image = capturedMemory ?? createCapturedMemory(snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot.ranges);
  const bytes = image.span(session.address, 0x58d), config = image.span(configuration.address, 0x32);
  const participantCount = bytes[0x54d];
  // The entry manifest also describes exit bytes. A valid native count change
  // at exit is identity evidence, rather than a contradictory capture.
  if (participantCount > 6) throw Error('Native identity participant count exceeds six selectors.');
  const selectedTrackIndex = bytes[0x579], qualityByte = config[0x31], directory = qualityByte === 1 ? 'HIGH' : 'LOW';
  const selectedLevelNumber = selectedTrackIndex + 1, selectedTrackStem = `${directory}/LEV${selectedLevelNumber}`;
  const filename = manifest.requiredRegions.find(row => row.preferredAddress === 0x6e6660);
  let directlyCapturedTrackStem = {available: false, reason: 'Native track-name buffer6e6660 is not declared.'};
  if (filename) {
    if (!Number.isSafeInteger(filename.address) || !Number.isInteger(filename.length) || filename.length < 1 || filename.length > 4096) throw Error('Invalid native identity track-name observation.');
    const raw = image.span(filename.address, filename.length), end = raw.indexOf(0);
    if (end === -1) throw Error('Native identity track-name observation lacks a bounded terminator.');
    const value = raw.subarray(0, end).toString('latin1');
    directlyCapturedTrackStem = {available: true, address: filename.address, value, matchesSelectedStem: value.replaceAll('\\', '/').toUpperCase() === selectedTrackStem};
  }
  const sessionVehicleTypes = [...bytes.subarray(0x1c, 0x22)];
  return {available: true, sessionAddress: session.address, configurationAddress: configuration.address,
    selectedTrackIndex, selectedLevelNumber, qualityByte, selectedDirectory: directory, selectedTrackStem,
    selectedBlpResource: `${selectedTrackStem}.BLP`, selectedBtpResource: `${selectedTrackStem}.BTP`,
    selectionAuthority: 'Native43b0e0 filename producer applied to captured session+579/configuration+31; loaded-asset fingerprint is separate.',
    selectedTrackFamilyByte: bytes[0xe], selectedTrackLocalByte: bytes[0xf], participantCount, sessionVehicleTypes,
    activeVehicleTypes: sessionVehicleTypes.slice(0, participantCount), participantModeBytes: [...bytes.subarray(0, 6)],
    spawnIndexBytes: [...bytes.subarray(0x10, 0x16)], sessionModeByte: bytes[0x551], sessionAttractByte: bytes[0x58c], sessionPhase: bytes.readUInt32LE(0x57c),
    directlyCapturedTrackStem,
    limits: ['Vehicle IDs are native constructor selectors, not the common chassis body kind3.', 'Selected resource names do not establish a display track name or an immutable loaded-asset fingerprint.', 'No identity is inferred from capture filenames, elapsed frame counts or demo mode.']};
}

export function compareNativeFrameIdentity(before, after) {
  if (!before.available || !after.available) return {available: false, reason: before.reason ?? after.reason};
  const fields = ['sessionAddress', 'configurationAddress', 'selectedTrackIndex', 'qualityByte', 'selectedTrackFamilyByte', 'selectedTrackLocalByte', 'participantCount', 'sessionVehicleTypes', 'participantModeBytes', 'spawnIndexBytes', 'sessionModeByte', 'sessionAttractByte', 'sessionPhase', 'directlyCapturedTrackStem'];
  const changedFields = fields.filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(field => ({field, before: before[field], after: after[field]}));
  return {available: true, stable: changedFields.length === 0, changedFields, before, after};
}

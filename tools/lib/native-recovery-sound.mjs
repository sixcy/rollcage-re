//Read-only admission/planning for47cf69's actual sound43 call. This neither
//emits a sound nor initializes an owner/channel/source or fabricates nulls.
import {assertNativeMemorySpan} from '../../src/native-memory-spans.mjs';

export const nativeRecoverySoundBoundaries = Object.freeze({call: 0x47cf69, returnAddress: 0x47cf6e, emitter: 0x484bb0, selectedRoundRobinChannel: 0x40db80});
export const nativeRecoverySoundEvidence = Object.freeze({
  call: 'ev_b9ab8b14c0affb661a9411d957ed11316ec5017676e0587a0224e8440a223faa',
  ownerAllocation: 'ev_46bcabb10c7f22695d3aaf8697963cd496246d5cfed4b596a40f0b17737eb507',
  channelSelection: 'ev_e7b66afda8bc1259f35bae13abb5f5ad007af72d368288d98dca50fc8ee1e855',
  xAudioVtable: 'ev_a436655c8fc8cf31b16d14f2b20027401c4b3696e54dddf149a532e7c7c64200',
});

function bound(value) {
  if (!Number.isInteger(value) || value < 1 || value > 64 * 1024 * 1024) throw Error('Recovery sound requires an explicit region observation bound at most64MiB.');
}
export function nativeRecoverySoundCaptureRanges({maxRegionBytes = 64 * 1024 * 1024, includeChannelVector = false} = {}) {
  bound(maxRegionBytes);
  if (typeof includeChannelVector !== 'boolean') throw Error('Recovery sound channel-vector option must be Boolean.');
  const ranges = [
    {id: 'recovery-sound-bank-region', rva: '0x2f2414', dereferenceOffsets: ['0'], readableRegion: true, maxRegionBytes},
    {id: 'recovery-sound43-owner', rva: '0x2f2414', dereferenceOffsets: ['0', '0xac'], length: 0x490},
    {id: 'active-sound-cookie', rva: '0x1e8890', length: 4},
  ];
  if (includeChannelVector) ranges.push({id: 'recovery-sound43-channel-vector-region', rva: '0x2f2414', dereferenceOffsets: ['0', '0xac', '4'], readableRegion: true, maxRegionBytes});
  return ranges;
}

//Admit these register roots only at actual40db80, after40db7c TESTEDI/JZ.
//They identify the selected nonnull wrapper/source even when the native index
//changed earlier in the frame. The caller must prove this is sound43's call.
export function nativeSelectedSoundChannelCaptureRanges({maxRegionBytes = 64 * 1024 * 1024} = {}) {
  bound(maxRegionBytes);
  return [
    {id: 'selected-sound-channel', baseRegister: 'edi', length: 12},
    {id: 'selected-sound-source-region', baseRegister: 'edi', dereferenceOffsets: ['0'], readableRegion: true, maxRegionBytes},
    {id: 'selected-sound-source-vtable', baseRegister: 'edi', dereferenceOffsets: ['0', '0'], length: 0x60},
  ];
}

export function inspectNativeRecoverySound({memory, moduleBaseAddress, maxChannelPointers = 4096} = {}) {
  if (!Number.isSafeInteger(moduleBaseAddress) || moduleBaseAddress <= 0 || moduleBaseAddress + 0x1d3fc0 > 0x100000000 || !Number.isInteger(maxChannelPointers) || maxChannelPointers < 1 || maxChannelPointers > 65536) throw Error('Recovery sound inspection requires an observed module base and bounded channel observation window.');
  function requireSpan(label, address, length) {
    try {assertNativeMemorySpan(memory, address, length);} catch (cause) {
      const error = Error(`Recovery sound missing captured ${label} at0x${address.toString(16)} (${length}bytes).`, {cause}); error.soundDependency = label; throw error;
    }
  }
  requireSpan('bank-roots', 0x6f2414, 12);
  const begin = memory.readUInt32LE(0x6f2414), end = memory.readUInt32LE(0x6f2418), bankCount = ((end - begin) | 0) >> 2;
  const report = {code: 43, bankBegin: begin, bankEnd: end, bankCount, channelBound: {maximumObservedPointers: maxChannelPointers, nativeCapacityClaim: false}};
  if (43 >= bankCount) return {...report, status: 'native-out-of-range'};
  const slot = (begin + 43 * 4) >>> 0; requireSpan('sound43-bank-slot', slot, 4);
  const owner = memory.readUInt32LE(slot); Object.assign(report, {slotAddress: slot, ownerAddress: owner});
  if (!owner) return {...report, status: 'native-null-owner'};
  requireSpan('sound43-owner490', owner, 0x490);
  const vector = memory.readUInt32LE(owner + 4), vectorEnd = memory.readUInt32LE(owner + 8), capacityEnd = memory.readUInt32LE(owner + 12), maximum = memory.readInt32LE(owner + 0x488), index = memory.readInt32LE(owner + 0x48c);
  if (vector > vectorEnd || vectorEnd > capacityEnd || (vectorEnd - vector) % 4 || (capacityEnd - vector) % 4 || (capacityEnd - vector) / 4 > maxChannelPointers) throw Error('Recovery sound channel header exceeds its explicit observation bound or has invalid native vector identity.');
  const count = (vectorEnd - vector) / 4, capacity = (capacityEnd - vector) / 4;
  if (capacity) requireSpan('channel-vector-capacity-bytes', vector, capacity * 4);
  Object.assign(report, {channelVector: vector, channelCount: count, channelCapacity: capacity, roundRobinMaximum: maximum, roundRobinIndex: index});
  if (maximum <= 0) return {...report, status: 'adaptive-selection-required', nextDependency: 'actual-source-activity-or-channel-allocation'};
  if (index < 0 || index >= count) throw Error('Recovery sound round-robin index selects outside the captured logical vector.');
  const selectedSlot = vector + index * 4, channel = memory.readUInt32LE(selectedSlot); Object.assign(report, {selectedSlot, channelAddress: channel});
  if (!channel) return {...report, status: 'native-null-selected-channel'};
  requireSpan('selected-channel12', channel, 12);
  const source = memory.readUInt32LE(channel); Object.assign(report, {sourceAddress: source});
  if (!source) return {...report, status: 'unsupported-null-source', nextDependency: 'original-virtual-source-target'};
  requireSpan('selected-source-vtable-pointer', source, 4);
  const vtable = memory.readUInt32LE(source); requireSpan('selected-source-vtable60', vtable, 0x60);
  Object.assign(report, {sourceVtable: vtable, sourceMethods: Object.fromEntries([4, 0x14, 0x2c, 0x38, 0x3c, 0x48, 0x50, 0x54, 0x58].map(offset => [`0x${offset.toString(16)}`, memory.readUInt32LE(vtable + offset)]))});
  if (vtable !== moduleBaseAddress + 0x1d3f60) return {...report, status: 'unidentified-source-class', nextDependency: 'actual-concrete-source-implementation'};
  //4a7460's operatornew9a8 -> constructXAudioSample proves this class only.
  requireSpan('selected-xaudio-sample9a8', source, 0x9a8);
  requireSpan('reverb-gate', 0x6e6bd4, 4);
  const voice = memory.readUInt32LE(source + 0x97c);
  return {...report, status: 'identified-xaudio-sample', voiceAddress: voice, reverbEnabled: memory.readInt32LE(0x6e6bd4) !== 0,
    playbackBranch: voice ? 'deferred-manager-queue' : 'native-null-voice',
    nextDependency: 'complete-source-caller-stack-and-reached-reverb/play-request-services'};
}

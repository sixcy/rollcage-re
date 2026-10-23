import {createCapturedMemory} from './captured-memory.mjs';
import {nativeRecoverySoundPlaybackLayout} from './native-recovery-sound-bindings.mjs';

export const nativeRecoverySoundPlaybackCopySites = Object.freeze([
  Object.freeze(['recovery-sound-playback-copy-call', 0x4053d5]),
  Object.freeze(['recovery-sound-playback-copy-return', 0x4053da]),
]);
export const isNativeRecoveryPlaybackCopySite = id => nativeRecoverySoundPlaybackCopySites.some(([name]) => name === id);
export const nativeRecoveryPlaybackCopyCondition = () => ({range: {id: 'recovery-audio-playback-copy-prefix', baseRegister: 'esp', dereferenceOffsets: ['4'], length: 8}, equalsBytesHex: '506c6179696e6720'});

export function nativeRecoverySoundPlaybackCopyRanges(id) {
  if (!isNativeRecoveryPlaybackCopySite(id)) return [];
  return [
    {id: 'recovery-audio-playback-copy-phase', rva: '0x1ecb1c', dereferenceOffsets: ['0'], offset: '0x57c', length: 4},
    {id: 'recovery-audio-playback-copy-chain', baseRegister: 'esp', offset: -4, length: 4152},
    {id: 'recovery-audio-playback-copy-arguments', baseRegister: 'esp', length: 12},
    {id: 'recovery-audio-playback-copy-destination', baseRegister: 'esp', dereferenceOffsets: ['0'], length: 32},
    {id: 'recovery-audio-playback-copy-source', baseRegister: 'esp', dereferenceOffsets: ['4'], length: 21},
    {id: 'recovery-audio-playback-copy-string', baseRegister: 'esi', length: 28},
  ];
}

// The parent selector proves actual TID, clock, EIP, predicates and guarded
// activation first. This supports the real fresh len20/request32 branch only.
// No observed logger value supplies an earlier CRT return register.
export function selectNativeRecoverySoundPlaybackCopySnapshots(candidates, {dispatchEntry, sourceAddress, actual, bindingObservations}) {
  const layout = nativeRecoverySoundPlaybackLayout(dispatchEntry), esp = layout.assignmentEntry - 24;
  if (!bindingObservations?.verified || bindingObservations.sourceReplayComplete !== false || bindingObservations.allocation.requestedBytes !== 32 || bindingObservations.allocation.stringLength !== 20 || JSON.stringify(bindingObservations.layout) !== JSON.stringify(layout)) throw Error('Recovery playback copy requires its independently proved fresh allocation.');
  const reg = (row, key) => {
    const value = Number(row.registers[key]);
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw Error(`Recovery playback copy requires actual x86 ${key}.`);
    return value;
  };
  const order = row => {
    if (!Number.isSafeInteger(row.observedDebugEventOrdinal) || row.observedDebugEventOrdinal < 1) throw Error('Recovery playback copy requires actual observation order.');
    return row.observedDebugEventOrdinal;
  };
  const unique = (id, expectedEsp) => {
    const rows = candidates.filter(row => row.breakpointId === id && reg(row, 'esp') === expectedEsp);
    if (rows.length !== 1) throw Error(`Recovery playback copy requires one ${id} at its proved ESP.`);
    return rows[0];
  };
  const call = unique('recovery-sound-playback-copy-call', esp), returned = unique('recovery-sound-playback-copy-return', esp);
  const logger = unique('recovery-sound-playback-logger-entry', layout.loggerEntry);
  const allocation = candidates.filter(row => row.ordinal === bindingObservations.allocation.returnOrdinal && row.breakpointId === 'recovery-sound-playback-allocation-return');
  if (allocation.length !== 1 || logger.ordinal !== bindingObservations.logger.ordinal || !(order(allocation[0]) < order(call) && order(call) < order(returned) && order(returned) < order(logger))) throw Error('Recovery playback copy allocation/call/return/logger order differs.');
  const P = bindingObservations.allocation.address, M = layout.formattedBuffer;
  const rawRegisters = row => {
    if (!Buffer.isBuffer(row.context) || row.context.length !== 716) throw Error('Recovery playback copy requires its actual x86 context.');
    const result = {};
    for (const [name, offset] of [['eax', 176], ['ecx', 172], ['edx', 168]]) {
      const value = row.context.readUInt32LE(offset);
      if (reg(row, name) !== value) throw Error(`Recovery playback copy ${name} differs from its actual x86 context.`);
      result[name] = value;
    }
    return result;
  };
  const beforeRegisters = rawRegisters(call), returnedRegisters = rawRegisters(returned);
  if (!Buffer.isBuffer(logger.context) || logger.context.length !== 716 || logger.context.readUInt32LE(172) !== reg(logger, 'ecx') || reg(logger, 'ecx') !== returnedRegisters.ecx || bindingObservations.logger.incomingEcx !== returnedRegisters.ecx) throw Error('Recovery playback logger ECX differs from its observed memcpy return.');
  const span = (row, id, address, length) => {
    const part = row.ranges.get(id);
    if (!part || Number(part.address) !== address || part.bytes.length !== length) throw Error(`Recovery playback copy ${id} address/length differs.`);
    return part;
  };
  const destinations = [], sources = [], strings = [];
  for (const row of [call, returned]) {
    span(row, 'recovery-audio-playback-copy-chain', esp - 4, 4152);
    const args = span(row, 'recovery-audio-playback-copy-arguments', esp, 12);
    if (args.bytes.readUInt32LE() !== P || args.bytes.readUInt32LE(4) !== M || args.bytes.readUInt32LE(8) !== 20 || reg(row, 'esi') !== layout.stringAddress || reg(row, 'ebx') !== M || reg(row, 'edi') !== 20 || reg(row, 'ebp') !== layout.playbackEntry - 4) throw Error('Recovery playback copy private ABI differs.');
    const m = createCapturedMemory([...row.ranges.values()]).memory;
    for (const [address, value] of [[layout.assignmentEntry, actual(0x4a2b9b)], [layout.assignmentEntry + 4, M], [layout.assignmentEntry + 8, 20], [layout.formatterEntry, actual(0x4ada5a)], [layout.formatterEntry + 4, layout.stringAddress], [layout.formatterEntry + 8, actual(0x5d3f00)], [layout.formatterEntry + 12, sourceAddress + 4]]) {
      if (m.readUInt32LE(address) !== value) throw Error('Recovery playback copy assignment/formatter return chain differs.');
    }
    if (row === returned && m.readUInt32LE(esp - 4) !== actual(0x4053da)) throw Error('Recovery playback copy CRT return address differs.');
    const string = span(row, 'recovery-audio-playback-copy-string', layout.stringAddress, 28);
    if (string.bytes.readUInt32LE() !== P || string.bytes.readUInt32LE(16) !== 0 || string.bytes.readUInt32LE(20) !== 31) throw Error('Recovery playback copy string growth metadata differs.');
    strings.push(string.bytes);
    destinations.push(span(row, 'recovery-audio-playback-copy-destination', P, 32).bytes);
    sources.push(span(row, 'recovery-audio-playback-copy-source', M, 21).bytes);
  }
  const allocatedPreimage = Buffer.from(bindingObservations.allocation.inputHex, 'hex');
  const expectedSource = Buffer.from(bindingObservations.allocation.formattedBytesHex, 'hex');
  if (allocatedPreimage.length !== 32 || expectedSource.length !== 21 || expectedSource[20] !== 0 || !sources[0].equals(expectedSource) || !sources[1].equals(expectedSource) || !strings[0].equals(strings[1])) throw Error('Recovery playback copy source/metadata preservation differs.');
  //405999 writes the old-length terminator (old length0) after growth. No
  //retained-data memcpy/free is reached for the independently proved SSO input.
  const expectedBefore = Buffer.from(allocatedPreimage); expectedBefore[0] = 0;
  if (!destinations[0].equals(expectedBefore)) throw Error('Recovery playback copy allocation-to-growth preimage differs.');
  const expectedAfter = Buffer.from(expectedBefore); expectedSource.copy(expectedAfter, 0, 0, 20);
  if (!destinations[1].equals(expectedAfter)) throw Error('Recovery playback copy bytes/tail preservation differs.');
  if (beforeRegisters.eax !== P || returnedRegisters.eax !== P) throw Error('Recovery playback memcpy destination/return EAX differs.');
  return {verified: true, sourceReplayComplete: false, authority: 'observed-external-memcpy-return', callOrdinal: call.ordinal, returnOrdinal: returned.ordinal,
    esp, arguments: [P, M, 20], allocationReturnOrdinal: allocation[0].ordinal,
    beforeHex: destinations[0].toString('hex'), afterHex: destinations[1].toString('hex'), sourceHex: expectedSource.toString('hex'), preservedTailOffset: 20,
    beforeRegisters, returnedRegisters, returnContextSha256: returned.contextSha256 ?? null,
    logger: {ordinal: logger.ordinal, incomingEcx: reg(logger, 'ecx'), agreesWithObservedMemcpyReturn: true},
    limits: ['The no-ECX-writer game tail links this observed CRT return to logger entry; logger input never supplies an earlier service outcome.', 'The game writes its final NUL after this post-memcpy observation; full source playback replay remains separate.']};
}

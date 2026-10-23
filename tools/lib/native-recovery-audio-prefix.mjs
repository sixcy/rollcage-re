//Genuine47ccc0 execution up to its original sound CALL. Native child outputs
//never seed this replay. The unresolved adaptive sound branch remains fatal.
import {bindCapturedNativeRecovery} from './native-recovery-context.mjs';
import {selectNativeRecoverySoundSnapshots} from './native-recovery-sound-selection.mjs';
import {runRawPostFrameBodyStates} from '../../src/raw-respawn-state.mjs';
import {firstByteDivergence} from './native-body-replay.mjs';

export function compareNativeRecoveryAudioPrefix(capture, pair, configuration) {
  const proof = selectNativeRecoverySoundSnapshots(capture, pair, configuration);
  const selected = proof.selectedSnapshots.find(row => row.id === 'recovery-sound-call');
  const returned = proof.selectedSnapshots.find(row => row.id === 'recovery-sound-return');
  const call = capture.snapshots.find(row => row.observedDebugEventOrdinal === selected.observedDebugEventOrdinal);
  const nativeEsp = Number(call.registers.esp), stack = call.ranges.get('recovery-audio-stack');
  const offset = nativeEsp - Number(stack.address), expectedArguments = stack.bytes.subarray(offset, offset + 28);
  if (expectedArguments.length !== 28) throw Error('Recovery audio prefix requires all seven actual caller argument words.');
  const sourceCalls = [];
  const bound = bindCapturedNativeRecovery(pair.before, {...pair.options, moduleBaseAddress: pair.moduleBaseAddress, nativeAudio: true,
    onRecoveryAudioCall(record) {sourceCalls.push(record);}});
  let sourceComplete = false, sourceError;
  try {runRawPostFrameBodyStates(bound.runtime); sourceComplete = true;}
  catch (error) {sourceError = error.stack ?? String(error);}
  if (sourceCalls.length !== 1) return {matched: false, sourceComplete, sourceError, sourceCalls,
    firstDivergence: {kind: 'source-call-count', expected: 1, actual: sourceCalls.length}, fullParentOutputCompared: false};
  const source = sourceCalls[0], argumentDivergence = firstByteDivergence(expectedArguments, Buffer.from(source.argumentHex, 'hex'));
  const registers = ['ebx', 'ebp', 'esi', 'edi'].map(name => ({name, expected: Number(call.registers[name]) >>> 0, actual: source.entryRegisters[name] >>> 0}));
  registers.push({name: 'ecx', expected: Number(call.registers.ecx) >>> 0, actual: source.code},
    {name: 'edx', expected: Number(call.registers.edx) >>> 0, actual: source.registerEdx},
    {name: 'esp-before-CALL', expected: nativeEsp, actual: source.entryEsp + 4});
  const returnAddress = {expected: Number(returned.eip), actual: source.returnAddress};
  const firstDivergence = argumentDivergence ? {kind: 'argument-bytes', ...argumentDivergence}
    : registers.find(row => row.expected !== row.actual) ?? (returnAddress.expected !== returnAddress.actual ? {kind: 'return-address', ...returnAddress} : null);
  return {matched: !firstDivergence, comparedArgumentBytes: 28, registers, returnAddress,
    sourceCalls, sourceComplete, sourceError, firstDivergence, fullParentOutputCompared: false,
    nativeCallOrdinal: call.ordinal, nativeCallDebugEventOrdinal: call.observedDebugEventOrdinal,
    method: 'Original parent entry supplies routes, geometry, pools and numerical/TLS context. Real source nearest/query/apply/ring producers supply the live caller registers and all seven PUSH words. Compare the actual native pre-CALL arguments and registers, with the observed post-call EIP as the return-address check.',
    limits: ['This compares the reached sound-call boundary, not full parent output or the following adaptive channel/factory/playback execution.',
      'The native pre-CALL snapshot does not yet contain its CALL return word; that source word is checked against the separately observed native return EIP.',
      'No native ring ECX, selected point, distance, game-child answer or initialized source output is injected.']};
}

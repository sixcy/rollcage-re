//Selected443d90 producer between4749e0 calls. This does not stand in for the
//intervening44f050/47ccc0 stages or the remaining450e50/outer-loop producers.
import {updateVehicleMotionState} from '../../src/vehicle-control-state.mjs';
import {nativeCodeAddress, assertNativeMemorySpan} from '../../src/native-memory-spans.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';

export async function verifyNativeMotionStateContinuationEvidence() {
  const {evidence, instructions} = await readInstructionEvidence(['293-vehicle-state-443d90-assembly.json', '310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
  if (evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Motion continuation target SHA differs.');
  const listing = new Map(instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [
    [0x451012, 'CALL', ['0x004749e0']], [0x451017, 'CALL', ['0x0044f050']], [0x45101c, 'CALL', ['0x0047ccc0']],
    [0x451038, 'CALL', ['0x00443d90']], [0x45103f, 'CALL', ['0x0048d680']],
    [0x443da0, 'MOV', ['EDI', 'dword ptr [ESI]']], [0x443dcf, 'MOV', ['dword ptr [EDI + 0x664]', 'EAX']],
    [0x443df8, 'MOV', ['word ptr [EDI + 0x668]', 'AX']], [0x443e08, 'MOV', ['word ptr [EDI + 0x66a]', 'AX']],
    [0x443e37, 'MOV', ['dword ptr [ESI + 0x2c]', 'EAX']], [0x443e3f, 'MOV', ['dword ptr [ESI + 0x34]', 'EDX']],
    [0x443e2f, 'POP', ['EDI']], [0x443e44, 'POP', ['ESI']], [0x443e45, 'POP', ['EBX']], [0x443e46, 'JMP', ['0x004459f0']],
  ]) {
    const row = listing.get(address);
    if (row?.op !== op || JSON.stringify(row.args) !== JSON.stringify(args)) throw Error(`Motion continuation retained boundary differs at0x${address.toString(16)}.`);
  }
  return {targetSha256: REDUX_SHA256, evidenceIds: evidence.map(row => row.evidence_id)};
}

function participants(source, pair) {
  const {memory, manifest} = source, moduleBaseAddress = manifest?.moduleBaseAddress, entryEsp = Number(pair.after.registers.esp);
  if (!memory || !Number.isSafeInteger(moduleBaseAddress) || moduleBaseAddress <= 0 || !Number.isSafeInteger(entryEsp) || entryEsp !== Number(pair.before.registers.esp)) throw Error('Motion continuation requires coherent actual frame memory/module/entry ESP.');
  const actual = preferred => moduleBaseAddress + preferred - 0x400000;
  const session = memory.readUInt32LE(0x5ecb1c), count = memory[session + 0x54d];
  if (count !== manifest.observed?.participantCount || count < 1 || count > 6 || memory.readInt32LE(session + 0x57c) !== 4) throw Error('Motion continuation requires its captured active participant identity.');
  const rows = Array.from({length: count}, (_, index) => {
    const recordAddress = actual(0x909300 + index * 0x30c), bodyAddress = memory.readUInt32LE(recordAddress);
    assertNativeMemorySpan(memory, bodyAddress, 0x66c); assertNativeMemorySpan(memory, recordAddress, 0x54);
    return {index, recordAddress, bodyAddress};
  });
  if (new Set(rows.map(row => row.bodyAddress)).size !== count) throw Error('Motion continuation participant bodies alias.');
  return {memory, rows, entryEsp, moduleBaseAddress};
}

export function nativeMotionStateOwnedRegions({source, pair}) {
  return participants(source, pair).rows.flatMap(({index, recordAddress, bodyAddress}) => [
    {id: `motion-car${index}-speed`, address: bodyAddress + 0x664, length: 8},
    ...[[0x2c, 'lap'], [0x34, 'total'], [0x3c, 'lap-glyphs'], [0x44, 'total-glyphs']].map(([offset, name]) =>
      ({id: `motion-car${index}-${name}`, address: recordAddress + offset, length: 4})),
  ]);
}

export function executeNativeMotionStateContinuation({source, pair}) {
  const {memory, rows, entryEsp, moduleBaseAddress} = participants(source, pair);
  assertNativeMemorySpan(memory, entryEsp - 16, 20);
  const calls = [];
  for (const {index, recordAddress, bodyAddress} of rows) {
    //450e50's direct callees share entry ESP.443d90 restores its three saves
    //before tail-jumping4459f0, so its formatter also owns this same entry ESP.
    memory.writeUInt32LE(nativeCodeAddress(0x45103d, {moduleBaseAddress}), entryEsp);
    const speed = updateVehicleMotionState(recordAddress, {memory, scratchBase: entryEsp});
    calls.push({index, entryEsp, returnAddress: nativeCodeAddress(0x45103d, {moduleBaseAddress}), recordAddress, bodyAddress,
      velocityQ16: [0, 4, 8].map(offset => memory.readInt32LE(bodyAddress + 0x68 + offset)), speedQ16: speed});
  }
  return {entry: '0x443d90', caller: '0x451038', returnSite: '0x45103d', calls,
    limitations: ['This selected producer consumes carried physics state; preceding attachments/recovery and all other stages are not executed here.', 'Owned speed/timer/glyph outputs are compared before patches. Private callee stack/register equivalence is not claimed.']};
}

export async function createNativeMotionStateContinuation() {
  const evidence = await verifyNativeMotionStateContinuationEvidence();
  return Object.freeze({id: '443d90-vehicle-motion-and-timers', evidence,
    regionsFor: nativeMotionStateOwnedRegions, execute: executeNativeMotionStateContinuation});
}

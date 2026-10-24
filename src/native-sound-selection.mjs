//40db20 adaptive branch, retained153, Evidence
//ev_e7b66afda8bc1259f35bae13abb5f5ad007af72d368288d98dca50fc8ee1e855.
//Run on the selector's already-published SEH frame. Every wrapper, source,
//vtable and field is read from live memory; pointer bytes grant no storage.
import {assertNativeMemorySpan, nativeCodeAddress} from './native-memory-spans.mjs';
import {copyGameAudioSampleState, queryGameAudioSampleActivity, isGameAudioSamplePending} from './audio-sample-controls.mjs';
import {updateNativeSoundChannelPositionOnStack} from './native-sound-position.mjs';
import {replaceNativeSoundSampleCallbackOnStack} from './native-sound-callback.mjs';

const put = (m, p, value) => m.writeUInt32LE(value >>> 0, p);

export function selectAdaptiveNativeSoundChannelOnStack(input, runtime) {
  const {sound, frame: F, incoming, maximum} = input, {memory: m} = runtime;
  if (maximum > 0 || m.readInt32LE(sound + 0x488) !== maximum || input.entryEsp !== F + 44
    || runtime.nativeTls?.sehWord !== F + 32) throw Error('Native adaptive selector requires its live40db20 frame and branch.');
  const actual = value => nativeCodeAddress(value, runtime);
  const admit = (address, length, label, comparison = 'read-only') => {
    assertNativeMemorySpan(m, address, length);
    runtime.onSoundSourceRead?.({address, length, label, comparison});
  };
  let cursor = m.readUInt32LE(sound + 4), channel = 0;
  const sourceCall = (method, argument, returned) => {
    const S = F - (argument === undefined ? 4 : 8);
    if (argument !== undefined) put(m, F - 4, argument);
    admit(channel, 4, 'wrapper-source');
    const source = m.readUInt32LE(channel);
    admit(source, 4, 'source-vtable');
    const vtable = m.readUInt32LE(source);
    admit(vtable + method, 4, 'source-method');
    const target = m.readUInt32LE(vtable + method);
    //The native indirect CALL publishes its return after resolving the target.
    put(m, S, actual(returned));
    const child = {...runtime, scratchBase: S, entryRegisters: {ESI: cursor, EDI: channel}};
    const expected = {4: 0x4ad170, 0x38: 0x4ad580, 0x3c: 0x4ad570, 0x48: 0x4ad500}[method];
    if (target !== actual(expected)) throw Error(`Native adaptive source virtual${method.toString(16)} target0x${target.toString(16)} is not reconstructed.`);
    if (method === 4) {
      admit(argument, 0x460, 'descriptor');
      admit(source + 0x498, 0x460, 'sample-descriptor', 'mutable');
      return copyGameAudioSampleState(source, argument, child);
    }
    if (method === 0x38 || method === 0x3c) admit(source + 0x948, 4, 'sample-state');
    if (method === 0x38) {
      const state = m.readUInt32LE(source + 0x948);
      if (state !== 3 && state !== 1 && (argument & 255) === 1) admit(source + 0x94c, 4, 'sample-pending');
      return queryGameAudioSampleActivity(source, argument, child);
    }
    if (method === 0x3c) return isGameAudioSamplePending(source, child);
    //4ad500: MOV AL,[ECX+45c]; RET. Only AL is consumed by40dc1e.
    admit(source + 0x45c, 1, 'sample-loop-flag');
    return m.readUInt8(source + 0x45c);
  };
  while (cursor !== m.readUInt32LE(sound + 8)) {
    admit(cursor, 4, 'adaptive-slot');
    channel = m.readUInt32LE(cursor);
    let reusable = (sourceCall(0x38, 1, 0x40dbf5) & 255) === 0;
    if (!reusable && (sourceCall(0x38, 0, 0x40dc04) & 255) === 1
      && (sourceCall(0x3c, undefined, 0x40dc11) & 255) === 0
      && (sourceCall(0x48, undefined, 0x40dc1e) & 255) === 0) reusable = true;
    if (reusable) {
      sourceCall(4, sound + 0x10, 0x40dc37);
      //40dc37 compares the live end again, after the source method.
      if (cursor !== m.readUInt32LE(sound + 8)) break;
    } else {
      cursor = (cursor + 4) >>> 0;
      continue;
    }
  }
  if (cursor === m.readUInt32LE(sound + 8)) {
    //The native SAR result is compared UNSIGNED. The 16 limit applies only
    //after scanning the live vector, never to the number of inspected slots.
    const count = ((m.readUInt32LE(sound + 8) - m.readUInt32LE(sound + 4)) | 0) >> 2;
    if ((count >>> 0) >= 16) {
      runtime.nativeTls.sehWord = m.readUInt32LE(F + 32);
      return 0;
    }
    put(m, F - 4, 12);
    throw Error('Native adaptive selector reached operatorNew12 at40dc50; original allocator call/return and allocation preimage are required.');
  }
  //40dc34 and the common40db88 both copy the descriptor on a reused wrapper.
  if (channel) {
    sourceCall(4, sound + 0x10, 0x40db8b);
    const position = m.readUInt32LE(F + 48), velocity = m.readUInt32LE(F + 52);
    if (position || velocity) {
      admit(channel + 4, 8, 'wrapper-position', 'mutable');
      put(m, channel + 4, position); put(m, channel + 8, velocity);
      put(m, F - 4, actual(0x40dba8));
      updateNativeSoundChannelPositionOnStack(channel,{...runtime,scratchBase:F-4,entryRegisters:{EBP:incoming.ebp,ESI:cursor}});
      //40dba8 reloads the source after the live positional child. The by-value
      //function reserves24B, writing only its native initialized fields.
      admit(channel,4,'callback-wrapper-source');const source=m.readUInt32LE(channel),temporary=F-24;
      put(m,temporary,actual(0x5d0294));put(m,temporary+4,channel);put(m,temporary+16,temporary);put(m,F+40,-1);
      admit(source,4,'callback-source-vtable');const vtable=m.readUInt32LE(source);
      admit(vtable+0x5c,4,'callback-source-method');const target=m.readUInt32LE(vtable+0x5c);
      put(m,F-28,actual(0x40dbc8));
      if(target!==actual(0x4ad420))throw Error(`Native adaptive source virtual5c target0x${target.toString(16)} is not reconstructed.`);
      replaceNativeSoundSampleCallbackOnStack(source,{...runtime,scratchBase:F-28,entryRegisters:{ESI:cursor}});
    }
  }
  runtime.nativeTls.sehWord = m.readUInt32LE(F + 32);
  return channel;
}

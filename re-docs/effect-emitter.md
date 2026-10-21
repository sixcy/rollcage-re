# Effect-call adapter and sound dispatch

`src/effect-emitter.mjs` reconstructs `484bb0`, while
`src/sound-dispatch.mjs` reconstructs its game-owned sound-dispatch callees.
The post-respawn call with code43 reaches this sound path. The emitted code
does not by itself identify an authored sound: the populated sound bank and
audio-library objects remain caller-owned runtime state.

The fifth native stack argument is never read by `484bb0`. Earlier work
preserved the caller's observed leaked ECX value as that argument; this
establishes caller argument fidelity, without making the value a requirement
of the sound algorithm or assigning it gameplay meaning.

## Retained evidence

All replies below are under `analysis/native-simulation/results/`.

| Procedure | Assembly reply | Evidence |
| --- | --- | --- |
|484bb0 argument adapter|149-event-emitter-assembly.json|`ev_55774611163ec94ae80a1e26fed4474bf04f8c077f1fa53df8691843b5c8e3f8`|
|40ea40 sound dispatcher|151-effect-dispatch-assembly.json|`ev_276e723742684068016129e93a54f6b66c48ae2564c6cbdd1d58fc0dd8998ee6`|
|40db20 channel selection|153-sound-channel-selection-assembly.json|`ev_e7b66afda8bc1259f35bae13abb5f5ad007af72d368288d98dca50fc8ee1e855`|
|40e5e0 playback/reverb setup|155-sound-playback-setup-assembly.json|`ev_558e649cb658d47ff9fe70113d7e912d9baab5c99c9f3d922471aa9d0ea7f998`|
|40d6d0 positional updates|158-sound-channel-position-assembly.json|`ev_68fba529256ab88118f853edaded1d3d80b34bbf2f1de7a54480c1878785a3f8`|
|40ce20 reverb descriptor|160-sound-reverb-parameters-assembly.json|`ev_6790b3b6b4c0d1b28330071f7ac26804e888420106014d684836a8593582b6ce`|
|40eb10 callable-copy adapter|162-sound-descriptor-copy-assembly.json|`ev_45da8f1dd3adc1398294ba131336a38e35d7f19cfdc9f6b11297b91adc86a5bf`|

Corresponding pseudocode replies148/150/152/154/157/159/161 are retained too.
Read-byte replies156/163/164 preserve the static float constants at5dc5dc,
5dc8e0..5dc97f and5dc5b8..5dc5eb. These are static observations and interpreted
instruction comparisons; the original executable and an audio device were not
run.

## Argument conversion

`emitNativeEffect(code, registerEdx, args, {dispatch40ea40})` receives the exact
seven native stack arguments. It builds a mutable16-byte parameter block:

| Block field | Recovered value |
| --- | --- |
|+00|Signed third-argument product with32767, wrapped32 bits before signed division by16383|
|+04|Second argument clamped only above16383; sentinel-1 survives, otherwise its wrapped product with11025 is divided by1024 toward zero|
|+08|Fourth argument, overridden to10 for nonnegative codes0,1 and22|
|+0c|Seventh argument|

The sound dispatcher receives the original code and EDX, first and sixth stack
arguments, and a flag testing whether the **original** fourth argument equals9.
It never receives or reads the fifth argument. A dispatcher result-1 becomes127;
other results are returned unchanged. The adapter has no RNG or game-clock
access.

## Sound-bank and channel state

`dispatchNativeSound(request, runtime)` reads the pointer vector at
6f2414..6f2418. An invalid signed index or null entry returns-1. The selected
sound's byte fields+46c/+46a/+468/+46f receive the first-argument-nonzero,
EDX-nonzero, mode9, and sixth-argument-zero predicates; dword+464 receives the
effective mode from the parameter block.

`selectSoundChannel` implements40db20. A positive sound dword+488 selects a
channel round-robin through index+48c, wrapping the index after its increment.
Otherwise it walks the current channel vector and asks the source's virtual
methods+38,+3c and+48 whether a channel can be reused. The first+38 call receives
1; the second receives0 and must return byte1 before the additional tests run.
Method+04 receives sound+10 when a reusable candidate is found, and again in
the common selected-channel path. The duplicate call is preserved.

If no channel is reusable, a vector of at least16 pointers returns null. A
smaller vector allocates a12-byte channel, copies the live callable field from
sound+470, asks the captured device714b08 to create a source, initializes the
channel's source and two position/velocity pointers, and appends the channel.
An allocation failure still appends a null pointer. The device pointer is
captured before the callable-copy service, matching callback-visible ordering.

Nonzero position or velocity arguments become channel+04/+08 and trigger the
actual positional update, followed by virtual method+5c with the captured
callable descriptor `{vtable:0x5d0294, channelAddress}`. Invocation/lifetime of
that stored library callback remains outside this reconstruction.

## Float conversion and reverb

40d6d0 reads signed32 coordinate triples through channel+04/+08. Each integer
is rounded tofloat32 before its float32 scale multiplication. X uses live
globals5ecdb4 for position and5ecdb0 for velocity; Y/Z use the retained static
constants. A float32 squared velocity magnitude below the retained0.0001
threshold clears all components. Source virtual+08/+0c receive16-byte vectors
with a zero fourth field. Source and velocity pointers are reloaded after the
position callback, so mutations are visible to the next call.

40ea40 invokes virtual+14 with float32 volume, optionally+20 for a nonnegative
rate, then40e5e0 and virtual+2c with0. The16-byte block stays live between these
calls; for example, a volume callback can change whether the rate call occurs.

40e5e0 checks that the channel address is above256, its source pointer is
nonnull, and global6e6bd4 is enabled. Mode0 first requires virtual+50 to return
byte1. A subsequent byte0 response installs the recovered76-byte descriptor
named`Rollcage reverb` through virtual+54. Another byte1 response obtains
effect storage through+58. It writes a clamped amount0 or2.5 at effect+0c,
also at+08 when duration is0, and duration0 or3 at+10. The adapter's call always
requests duration0; the standalone helper's duration3 branch is also ported and
instruction-checked.

`initializeSoundReverb` preserves unused name-tail bytes while writing the
fixed descriptor words. `copySoundCallable` models40eb10's live pointer+10 and
distinguishes an inline callable from a separate allocation. The library's
virtual clone operation stays explicit.

## Runtime interface and service boundaries

```js
const runtime = {
  memory,                    // caller-owned Buffer; addresses index this memory
  reverbScratch,             // retained76-byte descriptor storage
  handlers: {
    sourceCall(sourceAddress, methodOffset, args, runtime) {},
    allocate(byteCount, runtime) {},
    appendChannel(vectorAddress, channelAddress, runtime) {},
    cloneCallable(callableAddress, inlineTarget, runtime) {},
    createSource(deviceAddress, nameAddress, callableAddress, runtime) {}
  }
};
const result = emitNativeEffect(code, edx, args, {
  dispatch40ea40: request => dispatchNativeSound(request, runtime)
});
```

Every reached service is mandatory. Virtual-source arguments preserve native
method offsets; float-vector/descriptor arguments are Buffers, and the stored
callable argument preserves its vtable and captured channel. These are libaudio
interfaces rather than a promise to drive a particular host audio API.

The sound-bank population, clip decoding/registration, device initialization,
listener producer, channel cleanup, native callable invocation, hardware
playback and exception paths remain unported. Standard C++ allocation/vector
growth, valid-domain CRT string/name construction and virtual callable cloning
are explicit service boundaries. Uninitializedstd::function padding and unused
name-tail bytes are not assigned meaning or compared as library inputs. Aliases
inside caller-owned runtime memory are preserved; aliases between that memory
and arbitrary native stack scratch are outside the interface.

## Validation

`node tools/verify-effect-emitter-instructions.mjs` passes3,000 fixtures against
all503 retained instructions of the seven listed procedures:2,400 complete
adapter/dispatcher fixtures and600 standalone playback/reverb fixtures. It
executes751,281 bounded instructions, with649 invalid-bank/index cases,
803 source creations,521 adaptive reuses,1,121 positional dispatches,
1,530 reverb installations,75 capacity rejections,35 allocation failures and
499 callable clones.

The comparison checks complete sound records, retained/new channels, channel
vectors and effect records; final return; restored exception chain; the mutable
parameter block; and all admitted service arguments/order, including exact
float32 vector/volume values. Game-owned arithmetic and selection helpers
execute their retained instructions. Libaudio/C++/CRT services and the cookie
check are declared fixtures. The report is
`analysis/effect-emitter-instruction-check.json`.

`node --test tests/effect-emitter.test.mjs tests/sound-dispatch.test.mjs` passes
16 focused tests. They cover mode/rate/volume boundaries, ignored argument5,
round-robin and adaptive selection, double binding, capacity and allocation
failure, capture-before-clone ordering, live positional pointer mutation,
velocity deadzone, fixed descriptor bytes, reverb guards/install/write order,
and parameter changes between source calls.

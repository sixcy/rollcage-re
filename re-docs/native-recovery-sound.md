# Recovery sound43 capture dependencies

This is a retained-instruction/read-only capture audit. It launches no process and does not replace sound services or mutate capture state. `tools/lib/native-recovery-sound.mjs` supplies explicit capture descriptors and a bounded read-only dependency inspector; it is not a complete playback implementation.

The separate `src/native-recovery-audio-call.mjs` adapter now validates and publishes the actual caller's seven PUSH words, observed preserved registers and relocated47cf6e return at parentESP−132, then uses the existing shared-stack emitter. It requires the caller to provide the surviving ring/apply ECX; it does not replace that word with zero or invent parent registers. Five focused tests cover twelve retained098 publication cases, four098/149/151 complete stack comparisons through emitter preRET, sparse ASLR, missing ABI rejection before writes and the actual populated adaptive owner's explicit service error. This is a validated call-boundary component, not full sound playback or a completed parent binding. The raw parent still uses its existing numeric adapter; integrating this boundary requires its actual producer registers and the unresolved source/allocation services below.

Original47ccc0 calls484bb0 at47cf69 with ECX43, EDX0, arguments `[0,-1,9000,6,leakedECX,0,0]` and return47cf6e. With U as47ccc0 entry, its SUB54h/four saved registers give working ESP U-100 and emitter entry U-132. The unused fifth argument still matters as a retained stack word. Type3's preceding47d900 ring returns the final particle producer ECX; `emitRawVehicleRespawnRing` already returns that value, but the current raw post-frame caller discards it and passes undefined to the numeric emitter. A native-stack caller must preserve the producer, not invent zero or reuse radial-effect offsets.

The actual converted parameter DWORDs are `[18000,-1,6,0]`. Both position and velocity arguments are zero, so40db20 skips40d6d0 and virtual5c callback installation. The negative rate skips dispatcher virtual20. Existing channel position/velocity pointers are preserved rather than cleared. Hash-verified6e6bd4 is zero in the saved recovery-parent after snapshot and selected-force-v2 after snapshot, which takes the original40e5e0 early exit before virtual50/54/58. These reductions apply to those observed states; another capture must retain its own gate.

## Exact next capture roots

The bank has begin/end/capacity at6f2414/18/1c. Sound43 occupies begin+ach. Native40dee8's490h allocation and40df02 constructor call prove a selected owner extent of490h. Channel wrappers separately allocate12 bytes at40dc4e; neither proves a fixed16-pointer vector allocation. The adaptive policy's16-count cap is distinct from the positive round-robin fields at owner+488/+48c.

`nativeRecoverySoundCaptureRanges()` returns bank readable-region root RVA2f2414/dereference0, sound43 owner root RVA2f2414/dereferences0,ach/length490h, and cookieRVA1e8890/length4. Channel-vector region dereferences0,ach,4 are opt-in: a null/empty vector is legitimate and must not be chased unconditionally. Cookie5e8890 also requires the explicit ASLR alias from `nativeFrameSoundAdditionalRegions`.

To capture an actual selected channel without predicting an index, observe40db80 after native TESTEDI/JZ. EDI is then the nonnull selected12-byte wrapper. `nativeSelectedSoundChannelCaptureRanges()` captures that record, the readable region containing `[EDI]`, and60h vtable bytes through `[[EDI]]`. The parent must separately prove this is the code43 invocation;40db80 is shared by other sounds. These register-root descriptors are inappropriate at a generic frame entry.

The closed recovery-parent capture's sound43 slot is405999356 and contains owner293448048; the selected-force-v2 slot is399412404 and contains owner286801032. Original slot blobs were hash-verified. Neither supplied row covers its490h owner, so the next missing dependency is concretely **sound43-owner490**. Those addresses are observations, not reusable roots for another process launch.

## Source/services after the owner

Read the actual vector header/count/index, selected wrapper and source vtable before choosing a concrete class. The original5d3f60 XA sample table maps virtual04 to4ad170,14 to4ad6a0,2c to4ad9e0,38 to4ad580,3c to4ad570 and48 to4ad500. The source factory allocates9a8h for this class; do not assign that extent to an unidentified source. The inspector preserves native pointers, checks actual logical/capacity spans under a declared observation bound, distinguishes natural invalid/null/adaptive paths and fails on missing bytes. It neither supplies an empty bank nor runs a callback.

Existing `audio-sample-controls.mjs` provides real source04 forward280-DWORD descriptor copy,14 gain, and activity controls. `audio-sample-playback-requests.mjs` provides actual4ad9e0: null source+97c voice returns after its SEH frame; a nonnull voice writes deferred state3 and queues under manager+83c/lock+874. This is a deferred request, not immediate XAudio2 Start. The latter path needs actual source, manager, queue/vector, debugger/string and explicit CRT/Win32 state. Original XAudio2 CreateSourceVoice is a separate4b1d30 path; it is not automatically reached when reusing an existing channel.

Numeric emitter/dispatcher calls alone do not publish the full caller stack. Shared-stack binding still needs original saved registers, actual U-132 call arguments/return, aligned484bb0 locals,40ea40/40db20 frames and observed FS:[0]/cookie. The existing null-channel native component covers one genuine gated branch. A populated nonnull channel needs real source-call frame publication; play-request SEH handler/return identities also require explicit ASLR handling. Unknown reverb targets4ae4a0/4ae420/4ae350 are not present as retained procedure assemblies in the searched native-simulation results and remain a separate reached dependency if6e6bd4 is enabled.

Evidence: caller098 `ev_b9ab8b14c0affb661a9411d957ed11316ec5017676e0587a0224e8440a223faa`; allocation9083 `ev_46bcabb10c7f22695d3aaf8697963cd496246d5cfed4b596a40f0b17737eb507`; channel153 `ev_e7b66afda8bc1259f35bae13abb5f5ad007af72d368288d98dca50fc8ee1e855`; vtable11714 `ev_a436655c8fc8cf31b16d14f2b20027401c4b3696e54dddf149a532e7c7c64200`; play request9295 `ev_22d993c1a30a2b1a2409c6af47535499a8359459e055ac53ec1ac9ed7b06f615`. All refer to Redux SHA256c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5.

## Controlled recovery observation,2026-10-22

`analysis/native-physics-local/startup-20261022/controlled-recovery-capture` supplies complete entry233/exit235, after an explicitly guarded first-car state32 intervention. Its authority is **controlled-native-recovery-input**, not a naturally triggered recovery. The parent report reaches a later audio-service error and therefore does not claim a complete parent match. The independent prefix report compares the pre-audio recovery/application state separately.

Both selected snapshots'105 ranges and raw contexts were SHA256-verified for this audit. Original module base is6e0000; only explicit sound-root/cookie/manager aliases were applied. FS:[0] metadata, its hashed four-byte span and context selector were validated; head12ff890 and cookie0a9d9e70 remain unchanged across the parent. Reports retain no new raw blobs: `analysis/native-controlled-recovery-sound-audit-20261022.json` and `analysis/native-controlled-recovery-sound-graph-audit-20261022.json`.

| Actual state | Entry | Exit |
| --- | --- | --- |
| sound43 owner |114cb460|114cb460|
| channel vector begin/end/capacity |0/0/0|17eb92a0/17eb92a4/17eb92a4|
| owner+488/+48c |0/0|0/0|
| owner+480 callable |0|0|
| owner+464 mode |5|6|
|6e6bd4 reverb gate|0|0|

Thus40db20's original empty adaptive loop reaches operatornew12 at40dc50. It performs no existing-source activity queries, and the actual empty callable avoids a clone call. Exit contains one12-byte wrapper17eb88b8, source17eb88e0 and zero position/velocity pointers. The source's full9a8 bytes are captured incidentally by the bank/debris/skid virtual regions. Its vtable pointer is8b3f60, current state+948 is0, pending state+94c is3, voice+97c is124fc2d8, waveform+964 is1151b850, callback+940 is0 and play flag+950 is0. This is a nonnull-voice deferred playback path. It does not justify a null source, null voice, inert source creation or preselected reusable channel.

The actual manager08eba430 is not captured: its vtable and virtual14 target, waveform cache+830, pending queue+83c and critical-section state+874 remain unavailable. Actual source-vtable bytes at8b3f60 and debugger category globals714b18/1c are also missing. Static source-vtable evidence identifies the expected class, but does not replace a captured manager target/service context.

The next original return boundaries are concrete: operatornew12 CALL40dc50/return40dc56 EAX; manager virtual14 CALL40dc8a/return40dc8d EAX; known4a7460's operatornew9a8 CALL4a7493/return4a7499 EAX (`11601-audio-sample-factory-4a7460.json`, Evidence`ev_04b59e84dba4c5d1e6dfdd491c1be2caf3717f5926355c0bd1dc024b29f18d12`); channel append CALL40dcb5/return40dcba. The final published pointers are allocation outcomes consistent with these producers, not independent observations of genuine CRT or XAudio2 return values. A future binding must run the real game-owned factory/constructor/append/play-request code with explicit observed external boundaries, not assign these final pointers as fabricated service results.

A later targeted capture can add manager readable-region root `{rva:"0x314b08",dereferenceOffsets:["0"]}` under an explicit region bound, and manager-vtable first18h bytes through dereferences0,0 to verify virtual14. Its+830/+83c vector headers and live capacity spans must then follow actual captured pointers. Source-table RVA1d3f60/length60h and category RVA314b18/length8 are explicit source-known globals requiring appropriate alias/comparison declarations. Further cache/backend/voice descendants depend on those observed records; they should not be chased from guessed offsets or addresses recycled from this closed process.

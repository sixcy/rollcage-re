# Native positional sound callback replacement

`src/native-sound-callback.mjs` implements4ad420's normal shared-stack path and its actual positional function-object clone/destruction children. This is retained-instruction reconstruction over constructed memory, not original-process positional-sound evidence. The successful V8 parent recording did not create a positional sound.

`replaceNativeSoundSampleCallbackOnStack(source,runtime)` requires actual entry ESP in `scratchBase`, incoming `entryRegisters.ESI`, and the live `nativeTls.sehWord`. It reads the24-byte by-value function atS+4 and stores ownership atsource+930, including its pointer atsource+940. It publishes the actual56a6d8 SEH handler, previous FS word and state0/−1, executes native old-function destruction and new-function cloning, destroys the incoming value, then restores FS from the live saved stack word. Storage equal toS+4 follows the native self-assignment branch. The routine supplies no CPU register return; its known final native convention isRET18.

Known method targets execute genuine children: clone40f240, derived destructor40f2a0 and base destructor40ee80. Clone writes actual5d0294, then rereads the captured wrapper before writing destination+4. It does not write the third DWORD. Destruction first calls the actual base with flag0, which writes actual5d02b4; the outer derived destructor tests its own whole flag byte before optional deletion. Virtual targets and image words use actual PE relocation; arbitrary heap pointers retain their original bits.

An inline clone requires no external service. A heap clone calls the actual56e220 import with12 bytes, and deletion calls56e210. These require explicit `runtime.services.libraryCall(name,args,childRuntime)`. The child runtime has real service-entry ESP and immutable `nativeSoundCallbackCall` metadata containing actual IAT address, live target and return word. No native allocator outcome or allocation preimage is invented. The zero-allocation path reaches56e200's allocation-failure boundary; an unexpectedly returning failure service remains unsupported. Unknown clone/base/destructor targets fail after the game has published the corresponding CALL argument/return words. A failure leaves source TLS at the actual in-progress SEH frame rather than pretending to unwind an unexecuted exception path.

`copyNativeSoundPositionCallbackOnStack(callback,runtime)` also exposes the real clone entry for focused checks. The optional `onSoundSourceRead` receives only reached original read/write spans, allowing the existing observer to declare semantic comparisons without granting an entire heap.

Evidence for target SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`:

| Routine | Retained reply | Evidence ID |
| --- | --- | --- |
|4ad420|9266-audio-retirement-children-procedure_assembly.json|ev_31d05f16d510c9f5c9a91cffb1da330fdb3c9802e5028afe3478f30ee629d5b2|
|40f240|20261024-callback-40f240-assembly.json|ev_df8ce73e8dee801a04ef740d072c1d11d47bdaddb7a8a8c4961db95374a4b91e|
|40f2a0|9143-audio-listener-child-40f2a0-procedure_assembly.json|ev_6bb338a8e6faef3db89acb251d1e02d8eb6e3c5f63253772f4b3a5a7272f1a2d|
|40ee80|12248-queued-audio-lambda-0x40ee80-procedure_assembly.json|ev_3dea2a969e07fc31126468219453239bdde58f0f53ca2b72039c750606ee0a53|

Fresh clone evidence is exported in `analysis/native-callback-clone-static-20261024-v2/callback-procedures.evidence.json`; no new target execution was used by this port.

`node --test tests/native-sound-callback.test.mjs` passes7 tests. They compare complete declared source objects, function objects, allocated12-byte buffers, stack, actual vtables/import cells and FS against the original retained instructions loaded with original-PE HIGHLOW relocations at400000 and320000. The64 full-setter cases cover four stack alignments, empty/inline/heap old values, null/inline/heap incoming values and exact self-storage. Eight direct clone alias cases prove ordered overlapping reads. Negative cases compare exact unknown-method and missing-service boundaries; allocation failure leaves NULL untouched. A separately labelled synthetic stack-allocation alias proves live FS restoration instead of a cached value. CRT outcomes in these constructed tests are explicit test inputs; they are not native runtime evidence.

Remaining scope: invoking callback40f270/40f280, other function-object classes, genuine heap allocator/deallocator/failure outcomes, exception unwinding, later channel selection/playback and original-process positional creation. Root separately owns integration into the generic adaptive selector. This module does not alter legacy `audio-source-retirement.mjs` or any capture policy.

The root-owned selector now dispatches its actual5c method to this setter. The updated `tests/native-adaptive-sound-selection.test.mjs` adds24 complete positional-selector cases: two relocated images, four stack alignments and position/velocity/both inputs. Actual40db20, descriptor/activity children,40d6d0, real vector setters and the callback routines execute through selector pre-RET. All declared source/wrapper/stack/function-object bytes and the returned wrapper match. TLS writes follow selector frame → setter frame → selector frame → original head. A genuine constructed empty prior callback is used; inline/heap prior values are covered independently by the setter tests.

Combined validation: `node --test tests/native-adaptive-sound-selection.test.mjs tests/native-sound-position.test.mjs tests/native-sound-callback.test.mjs` passes20 tests, zero failures/skips. This connected instruction comparison does not introduce new original-process positional evidence.

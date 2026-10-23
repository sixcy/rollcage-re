# Active controller effect in a native physics replay

This read-only audit identifies how to replace the explicit `482730` failure in `tools/lib/native-frame-replay.mjs`. It changes no source and launches no process. The numerical consumer already exists as both structured `applyActiveVehicleEffect` and pointer-based `applyRawActiveVehicleEffect`; neither existing leaf result alone proves the complete reached parent/shared-stack path.

## Native caller and stack

Let **S** be ESP at `4749e0` entry. Retained parent/preparation/impulse listings establish these addresses for the first global effect path:

| Boundary/storage | Native address | Proof |
| --- | --- | --- |
| `47a8e0` entry | `S-24` | Parent five DWORD pushes, then CALL at `474a11` |
| `47b020` entry | `S-96` | Preparation `SUB38h`, three pushes, CALL `47a90e` |
| Impulse working frame **F** | `S-148` | `47b020 SUB24h` and four pushes |
| Normalized direction DWORDs **D** | `F+28h = S-108` | `47b132..47b155`: store capped impulse, call `4343e0`, arithmetic shift each output right4 |
| `482730` entry **A** | `F-8 = S-156` | `47b15a PUSH70h`, `47b15c CALL482730` |
| Its working frame **T** | `A-38h = S-212` | `482730 SUB28h` and four pushes |
| `484bb0` entry **E**, when timer byte is zero | `A-58h = S-244` | Seven argument pushes and CALL `48278c`; raw adapter's `scratchBase-88` agrees |

At `482730` entry, ECX is the target body, EDX is D, `[A+4]` is code`70h`, and `[A]` is relocated return address`47b161`. The outer impulse path requires first effect flag`91cd90 == 1`, its preparation/type/one-shot gates, accepted distance/direction, body type3, non-`ffffffffh` body`+6bc`, and a nonzero byte at that state pointer. It returns immediately after this consumer, bypassing ordinary impulse force/torque/counter writes. Thus this gap is an active-controller branch of an existing force-effect producer, not evidence that all radial-force arithmetic is absent.

Other callers need distinct entry stacks. For `41e080` callback entry **K**, its frame is `K-40`, direction is `K-12`, and active-effect entry is `K-48`; emission entry is `K-136`. This caller requires an active controller and intensity at least48. The projectile impact port similarly uses its own frame; do not reuse the radial `S-156` offset for every call to `482730`.

## State, lookup and emission order

`482743` captures the actual pointer at body`+6bc` before emission. If state`+8` is zero, signed byte`+1` minus `code>>5` is lower-clamped at zero; `484bb0` executes **before** that status and timer10 are stored. Direction/matrix values and `[713180]` are consumed afterward, and the final code byte is re-read from the caller argument slot. The saved original state pointer is used for the final byte write even if an emission changes body`+6bc`.

The exact emission is code24 in ECX, body`+34` in EDX, seven arguments `[0,600h,3fffh,6,body,0,body[6b4]==1]`. This enters the recovered sound-dispatch adapter; the fifth argument is preserved caller ABI but unused by `484bb0`. It is not an inert visual-effect notification. `emitNativeEffect` performs the known numeric argument conversion; `dispatchNativeSound` then reads the actual sound vector and selected sound/channel state. A naturally absent/null sound24 can legitimately return-1, translated to127; a populated bank requires its real captured descendants and explicit services. Do not substitute an empty bank or suppress the call.

For an ABI-backed emission, `484bb0` also aligns its stack. With E as above, define `L=(E-4)&~15` and `H=L-32`. Its parameter block is `H+16`, the retained position pointer is at `H+12`, and `40ea40` entry is `H-20` after four pushes and CALL`484c58`. Its return address is relocated`484c5d`. The existing numeric emitter/sound APIs do not by themselves publish these original stack stores.

The topology producer `4820f0` allocates256 lookup bytes at `[713180]`; this consumer indexes only its first64. Capture those actual64 bytes and their pointer. Controller activation `482680` claims one of six `8ch`-stride owners beginning`8495e0`, and associates body`+6bc` with it. The normal owner records are already in the manifest. The consumer's actual state footprint is offsets1/8 and `9+lookup[index]`; validate the actual target address. The structured API's conservative265-byte Buffer requirement is not proof that each native `8ch` owner owns265 bytes. Reusing the raw pointer consumer avoids inventing a copied state allocation or rebasing the pointer.

## Shared-stack obligation

The earlier numeric-only raw consumer preserved state identity and live pointer/read ordering, but only explicitly published its code argument at `[A+4]`; its calculation locals remained JavaScript values. The optional original-stack implementation below now publishes the producer and consumer stores. Examples from the radial path:

| Native `482730` slot | Address relative to S | Later initial static-query output at `S-228` |
| --- | --- | --- |
| Saved incoming EBP, capped impulse Y | `T+8 = S-204` | Output scalar`+24` |
| Saved incoming EBX, capped impulse X | `T+12 = S-200` | Output flags`+28` |
| Saved direction pointer | `T+16 = S-196` | Output contactTime`+32` |

The full simulation intentionally retains stale output/stack inputs. These omitted stores can therefore affect a later query even though ABI scratch itself is excluded from semantic comparison. A zero-bound query, for example, can consume an existing scalar before overwriting it. Saved-register values here are known from the capped pre-normalization impulse, but the current structured callback exposes only normalized direction and code. A binding must preserve those producer values and original stores at their actual step, rather than reconstructing them from normalized outputs or tuned guesses.

The output address is independently recoverable from the retained call chain: initial scheduler `427870` enters at `S-24`, its `SUB0ch`/four pushes/CALL puts `427bd0` at `S-56`, the latter's `SUB6ch`/four pushes/PUSH/CALL puts `424e20` at `S-188`. That batch's `SUB48h`/four pushes puts its working ESP at `S-276`; after `PUSH EDX`, `424ecc LEA ECX,[ESP+34h]` selects `S-228` as the output passed at `424ed4/424ed7`.

The earlier active-effect instruction comparison mocks `484bb0`; the broader earlier vehicle-filter comparison runs the actual adapter/dispatcher against a declared empty bank and compares mapped bytes at/above`10000h`, with its private stack below that threshold. Those earlier results did not settle the overlapping full-parent scratch above. The later contact-color wave update remains a separate producer/consumer stage outside the `4749e0` boundary.

## Minimal closure

1. Preserve the capped impulse and native normalizer direction slots in the actual `47b020` producer path, and bind radial `onActiveVehicleEffect` to `applyRawActiveVehicleEffect` with A=`S-156`, D=`S-108`. Keep code`70h` and the original active/null/type gates. Do not reduce force or change controller status to avoid the branch.
2. Add the reached caller's saved-register/local/argument stores to its native-stack binding, including live post-emission reads. Use actual64-byte lookup and actual controller memory. Admit emission only through a real captured sound context, or a proven naturally gated bank path; otherwise retain the explicit failure.
3. Verify one connected retained `4749e0`/preparation/impulse/active/next-static-query sequence with shared stack and actual emitter descendants, including timer0/nonzero, accepted zero-strength normalization, and emission mutations to state pointer/direction/lookup/code. Then seek an original-process pair that naturally reaches this branch. Existing passive/first-moving-frame matches do not exercise it.

## Implemented emitter stack component

`src/native-effect-emitter.mjs` now provides opt-in `emitNativeEffectOnStack` and `dispatchNativeSoundOnStack`. The caller must publish its actual return and seven argument DWORDs and supply incoming EBX/EBP/ESI/EDI. The adapter verifies those words, preserves alignment padding, publishes saved registers, the retained position pointer, the shared16-byte parameter block, four dispatcher arguments, and relocated return484c5d. Its parameter span is the actual stack memory, so child parameter mutations remain visible. Integer484bb0 arithmetic and SSE zeroing do not themselves perform floating arithmetic or change numerical controls.

`tools/lib/native-frame-sound.mjs` binds these calls to captured sound-vector roots and actual selected-slot bytes, retaining the numerical context and original pointers. It does not construct a bank or replace its contents. Twenty-four connected retained-instruction cases compare every byte of the entire affected stack through484bb0 preRET, including the actual482791 caller word and complete40ea40 early-exit prologue, across four alignments and negative/out-of-range/null-entry cases. Separate sparse-ASLR tests require real descendant coverage and live shared parameters. These are static interpreted-instruction comparisons, not original-process execution of482730.

The populated path remains explicit:40ea40 descends into40db20 with an SEH/cookie frame, allocator/vector/callable services and virtual source methods. A complete caller-owned `dispatchPopulated40ea40` binding is required; existing numeric-only sound services are insufficient to claim shared-stack completeness. Missing records or unsupported services fail rather than suppressing the emission.

The saved selected-body-pair entry has a64-slot sound bank, and its hash-verified code24 slot contains a nonzero sound pointer. Its slot happens to lie in the captured debris-free virtual region, but no supplied row covers the full sound record through+48c. The saved selected-collision entry does not capture code24's vector slot at all. These states therefore do not authorize a naturally-null-bank assumption. Future reached timer0 evidence needs the actual vector slot, selected sound record, channel-vector records and reached service context. Timer gating can legitimately avoid the call only when the original owner timer is already nonzero.

## Populated sound capture and current incremental boundary

The selected sound owner is a proven490h-byte allocation: original40dee8 pushes490h,40deed calls operatornew at IAT56e220, and40df02 calls constructor40d7d0 (`9083-audio-sample-lookup-assembly.json`, Evidence`ev_46bcabb10c7f22695d3aaf8697963cd496246d5cfed4b596a40f0b17737eb507`). The constructor initializes its channel-vector header at+4/+8/+c, callable at+470/+480, and round-robin fields+488/+48c. The adaptive allocation at40dc4e separately requests a12-byte channel record with source/position/velocity pointers; it does not prove a fixed16-entry allocation for every vector. The adaptive policy caps its logical count at16, whereas positive round-robin count/index are separate native inputs.

`nativeFrameActiveSoundCaptureRanges` returns these explicit descriptors without launching anything:

| Id | Root and pointer chain | Extent |
| --- | --- | --- |
| active-sound-bank-region | RVA2f2414, dereference0 | One readable VirtualQueryEx region under the declared bound; preserves requested root |
| active-sound24-owner | RVA2f2414, dereference0 then60h |490h bytes, constructor-proven allocation |
| active-sound-cookie | RVA1e8890 |4 bytes; canonical5e8890 additionally needs its explicit ASLR alias |
| optional active-sound24-channel-vector-region | RVA2f2414, dereference0,60h,4 | One readable region under the declared bound; may fail legitimately on an empty/null vector |

Further descendants must follow actual captured vector entries, not guessed fixed-index channels. Each selected12-byte channel gives its source pointer at+0. That source's actual vtable determines the reached concrete class and method addresses. An XA sample constructor path allocates9a8h bytes (`instantiateGameAudioSample`,4a7460), but that is not permission to assign9a8h ownership to an unidentified source class. Capture its actual vtable/record before choosing a source port. A reused channel need not reach source creation or XAudio2 CreateSourceVoice.

The source now implements populated40ea40 through a naturally null positive-round-robin slot: actual owner flags/mode/index mutate, child return40eaba and all40db20 saved/local/cookie/SEH stack writes are preserved, and its TLS chain restores. Two connected retained-instruction cases check both normal index increment and wrap against every affected stack/owner byte. This branch requires an explicit `nativeTls.sehWord` representing captured FS:[0]. Neither the current context's FS selector nor stale stack bytes prove that TLS word; current captures have no such field. The cookie is original5e8890 XOR(entryESP-40), stored at entryESP-44; saved original FS:[0] is at entryESP-12, which becomes the temporary chain head. No guessed TLS value is installed.

Nonnull channels still require actual source callbacks and descendant coverage. Existing real ports include virtual04 state copy4ad170 (280DWORDs), position4ad730/velocity4ad700, activity4ad580 and related controls in `audio-sample-controls.mjs`. Play request4ad9e0 in `audio-sample-playback-requests.mjs` publishes deferred state3 and manager+83c queue under lock+874 when voice+97c is nonnull; it does not immediately call voiceStart. Its reached string/debugger/Win32 services remain explicit. The separate `createGameAudioChannel`4b1d30 port reaches actual XAudio2 COM20h for creation. Capture the selected class/state and reached manager/queue records before claiming either path, rather than replacing it with an inert playback callback.

## Implemented producer, active consumer, and surviving cache locals

`applyBodyEffectImpulse(body,{nativeStack,roundingMode,...})` now accepts an explicit original-stack binding. `nativeStack` supplies the actual `memory`, `scratchBase` (47b020 entry ESP), `entryRegisters:{ebx,ebp,esi,edi}`, optional relocation and sound bindings. Body bytes must share that memory. The optional frozen `onEnter` record copies the exact180h-byte header, live origin/strength, entry ESP, caller return, and four register values; it exposes no writable memory. When absent, its copying work is skipped. Existing structured callers retain their previous API.

`native-body-effect-impulse.mjs` reads the actual origin/strength globals, preserves saved registers, difference/direction locals, capped impulses, normalization locals, child return slots and ordinary cooldown/reduction/length/root/division stores. It enters `native-active-vehicle-effect.mjs` at the actual A with D left in the parent stack. The latter preserves482730 saves/locals, original owner identity, timer/status order, and live post-emission direction/matrix/lookup/code reads. The timer0 tests execute actual484bb0 and40ea40 against a declared naturally-null bank; they do not substitute an emission callback. Separate controlled post-emission mutation cases check replacement body+6bc, direction, matrix, lookup and late argument code while retaining the original owner. `41e080` supplies its own actual child registers, code argument and41e397 return; two connected callback tests compare the complete reached active-child stack and mapped memory for timer0/1.

`stepSimulationFrame` accepts `context.bodyEffectNativeStackFor(body,index)`, without hidden index state. It publishes47a913 and calls the optional path only for the default first-effect handler; an explicitly supplied handler keeps its existing meaning. The native replay caller must derive incoming values from the captured frame and physical-list iteration. No synthetic incoming-zero convention is introduced.

The connected check found an additional intervening producer:429820 overwrites S-204 with its delta at42983c and S-196 with its velocity scale at4299e9. These are the **last writes before the first initial terrain query** in the checked fixtures; earlier quaternion helpers also write the same area. `prepareBodyShapeCache(...,{nativeStack})` now publishes its proven surviving local region, and the initial/refresh static callers supply actual429820 entry ESP S-b8/S-b0, derived from427bd0's6ch local frame, four saves and CALL427c51. This narrowly covers surviving locals; it does not claim a complete429ab0 private-stack or arbitrary incoming-register reconstruction.

Validation is synthetic, retained-instruction evidence:

- Ten active combinations cover timer0/1 and strength0/4/32/100/-32. Fifty ordinary combinations cover types3/7/12/1/4, radius/tiny/accepted directions, cooldown gates, fallback, length/root/division and signed force/torque updates. These compare every byte of the10MiB interpreter memory, including the affected stack. Additional observer, mutation and zero-bound-query regressions preserve the same strict boundary.
- Six sparse-ASLR cases exercise ordinary normalization, fallback, halved impulse, active timer0/1 and zero strength with under4KiB of explicitly captured disjoint spans. Original heap/stack pointers remain unchanged, globals use explicit aliases, CALL returns relocate, and uncaptured access fails. Fallback copies use native-width read/write primitives; no generic facade copying or fictitious backing buffer is required.
- Twenty-four429820 cases compare all surviving local bytes across initial/refresh depths, one/five shapes, zero/positive delta and scale0/32768/65536.
- `node tools/verify-native-body-effect-stack.mjs analysis/native-body-effect-stack-20261022.json` retains eight complete4749e0 cases: common type3 physical-list bodies and actual registered wheel vehicles, timers0/1, strengths4/32. Each matches10,420,224 mapped bytes plus the reached initial-query scalar/contactTime stack words. The timer0 cases enter both actual emitter and dispatcher. A separate zero-bound query immediately after the active producer consumes its negative capped-Y scalar and preserves its direction-pointer contactTime exactly, demonstrating why those stale stores matter.

Finite arithmetic uses the exact PC24 nearest-even interpreter. Its finite-only x87 representation intentionally rejects NaN loads. The zero-strength regression therefore uses the existing masked-invalid Number oracle: its preceding FILD inputs are exactly zero, and the SSE NaN/FISTP integer-indefinite path is checked byte-for-byte. This distinction is retained rather than presented as a new hardware-PC24 observation. No new original-process active-effect proof is established by these tests; populated sound/service contexts and other whole-frame private stack lifetimes require their own reached evidence.

## Retained evidence

### Complete captured-frame integration (22 October 2026)

`tools/lib/native-frame-replay.mjs` now supplies the actual `47b020` entry
binding through `bodyEffectNativeStackFor`. The producer entry is the captured
`4749e0` ESP minus 96; incoming EBX/EBP are the captured parent values, ESI is
the original physical-loop count minus its current index, and EDI is the live
body address. Missing parent registers fail only when this branch is reached.
The source observer copies the exact entry header, origin, strength, registers
and return address. The old unsupported active-effect handler is removed from
this captured-frame path; missing descendants or services still fail explicitly.

The replay also appends the sound ledger without weakening existing semantic
comparison policies. It admits the security cookie's explicit module alias only
when the capture actually includes that range. A strict thread-environment
binding validates the hash-backed raw context, queried selector descriptor and
actual four-byte FS:[0] span. Its SEH accessor operates on that captured memory;
legacy captures without this evidence receive no invented TLS value.

`analysis/native-capture-thread-environment-verified-20261022/` verifies both
immediate and buffered host observations against a synthetic x86 program which
reads its own FS:[0] and selector. This is executed capture-tool evidence, with
no game code. It supplements the earlier captures, which lack this field.

The full-frame integration regression compares exact producer entry records
and all mapped semantic bytes against the retained native instructions with
ordinary forces enabled. The existing positive native car-pair frame also
still matches after integration:
`analysis/physics-native-selected-body-pair-force-binding-recheck-20261022/`.
That car-pair recheck does not establish a reached native radial force or active
emission path. The dedicated force observer must establish that separately.

The subsequent dedicated native report is
`analysis/physics-native-selected-force-v2-20261022/`: all 12 ordered `47b020`
entry inputs and all 4,951,966 declared semantic frame bytes/native return
match at clock 513 (HIGH/LEV5). Eight entries pass with nonzero capped input;
four return at the distance gate. Both type3 chassis and type4 physical camera bodies
occur. The frame includes the actual observed FS:[0], explicit cookie alias
and full64-byte lookup; none is synthesized. No sound dispatch is reached,
so this does not close the populated sound/active-emission obligation.
The entry-only stream does not isolate native force return writes or identify
the weapon/event producer. `tests/native-force-frame-retained.test.mjs`
independently replays the saved positive case and checks its full semantic
result as well as the ordered force inputs. The [2026-10-23 ownership audit](native-camera-body-identity.md)
proves each camera's participant/controller backlinks and distinguishes the
separate type11 wheel render bodies, correcting the earlier wheel label.

All replies are for Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

| Procedure | Reply | Evidence ID |
| --- | --- | --- |
| `4749e0` | `analysis/scene/results/278-physics-frame-assembly.json` | `ev_af519c4d443ad65b6ae8066d61eea98c1f5242aa2835d3fbe2e8fa35a296c87a` |
| `47a8e0` | native-simulation`050-ordinary-preparation-assembly.json` | `ev_eb342035831190185c71bdf4ee40fa6c1dcc4040d17d38ca8de4b6140d4e8e4d` |
| `47b020` | `076-first-body-effect-assembly.json` | `ev_9dda09a41ce2740a780530029cf8f1a17aca1dde7a32d67ad084ffa662a822f8` |
| `4343e0` | `041-edge-direction-assembly.json` | `ev_b2f6d5d8044177ac6413c44f7674e7d6e3020c10edc61d363729a14b384cd5ab` |
| `482730` | `091-active-vehicle-effect-assembly.json` | `ev_cb4a7096e8cf413384dfbafe3ff6ab502888a274e036da1ac16a21eb7c8a650c` |
| Initial scheduler `427870` | `010-initial-candidates-assembly.json` | `ev_33d039e598f7140d10f6bd75f4450ae44e7132a9d2a4bfd7e11b57af6b9c5b0e` |
| Static parent `427bd0` | `011-static-candidates-assembly.json` | `ev_a2807b94a5c25ff3213a36c54d8961c68c3b183409b103cb2158d10e17e83f56` |
| Terrain batch `424e20` | `024-terrain-batch-assembly.json` | `ev_5c52dce326045f1545c8066ef0498f08d33572e1431899744304cbdbd57bf443` |
| `484bb0` | `149-event-emitter-assembly.json` | `ev_55774611163ec94ae80a1e26fed4474bf04f8c077f1fa53df8691843b5c8e3f8` |
| `40ea40` | `151-effect-dispatch-assembly.json` | `ev_276e723742684068016129e93a54f6b66c48ae2564c6cbdd1d58fc0dd8998ee6` |
| Lookup producer `4820f0` | `095-active-effect-lookup-producer.json` (pseudocode), authoritative later assembly3255 | `ev_75e83e8fdd82505447790bfe5cc1b86e8637ed03e353760dbb3cc590e1bb4847`, `ev_8f1aa1e084c8d98e0de76441084c6167c3eb523f2c8eab571bced976473604c7` |
| Owner activation `482680` | assembly3257, cited in `vehicle-contact-colors.md` | `ev_5694c8ebae0e76ee886bc972ce8eff82aa0e2755efd058fb799642edc0df7f8e` |

Other numbered replies are under `analysis/native-simulation/results/`. The radial normalizer uses FILD/FSTP conversion plus SSE scalar arithmetic and FISTP; it requires the observed masked nearest-even x87/SSE context and original constants. This is not a request to alter FPU controls or native state.

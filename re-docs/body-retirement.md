# Physical unregister, type33 retirement, and effect producers

`src/body-retirement.mjs` provides raw-memory Redux references for `4284d0`, `474850`, `46a2d0`, the `435ba0` effect dispatcher, and `436410`. `src/body-retirement-effects.mjs` supplies the actual particle, debris, terrain, color, allocator, and spatial-query descendants reached by the retirement effect mask. These modules operate on explicit caller-owned native-addressed bytes; they do not create a game runtime or modify installed files.

The primary APIs are:

- `unregisterPhysicalBody(body,{memory})`: actual `4284d0`.
- `removeBodySpatial(body,{memory})`: actual `474850`.
- `retireType33Body(body,{memory,scratchBase,handlers,soundRuntime})`: actual `46a2d0`; `scratchBase` is native entry ESP.
- `emitBodyEffectBurst(positionAddress,velocityAddress,count,mask,code,{memory,scratchBase,handlers,soundRuntime})`: actual `435ba0` numerical dispatcher.
- `lookupRawSpatialBucket(x,y,z,{memory})`: actual `4286e0`, returning `{bucket,outside}` with the actual `4746f0` sparse-row fallback.
- `initializeBodyRetirementEffectTables(memory)`: install the retained321-word original yaw/alpha table at `5ed030`; other runtime pointers and storage remain caller supplied.

The raw physical unregister preserves an important distinction: signed byte `10c` is an inclusive final cache index. Zero releases one collision ID; negative bytes skip releases. It decrements global active count first, retains active/free cursor locals throughout the loop, performs packed byte swap-removal and inverse-map repair, then publishes both cursors. The body is removed from the global pointer array and optional physical-group array by swapping in the last entry, clearing that entry, decrementing its unsigned16 count, and finally setting body flag `8000`. Array membership is a native precondition; the routine does not invent an absent-body fallback.

Raw spatial removal follows previous/next unsigned16 IDs in128-byte pool units, strips the low tag from the bucket pointer, repairs both neighbors or the physical head word at bucket+8, and clears body links with one dword store. The separate particle variant `4748d0` repairs bucket+10. The corresponding raw `474670` particle/debris insertion and `4286e0` selector now execute actual byte-backed logic, preserving registration before later particle position jitter.

Type33 retirement captures controller identity and its old state, clears controller+4, performs actual spatial removal and unregister, and for old state>9 emits the original `count8/mask5126b/code11` burst. Position is body center plus40 units Y; velocity is negative64 units Y. The timestamp at `903520` is captured from the live clock after the burst. The saved controller's audio handle is reread afterward, guarded by the native `127`/`256`/null tests, stopped through its actual object's virtual method+34, and replaced with127. The `stopAudioVirtual34` handler is the remaining explicit audio virtual-service boundary and receives actual handle/object/vtable/method addresses.

The burst's reached numerical producers are complete:

- `435f20`: all five particle kinds, their quality-scaled counts, original random transition order, dimensions/lifetime, velocity/position jitter, spatial links, palette alpha, and overlapping color/frame writes.
- `435df0`: actual free-list allocation and active-list reuse, including eligible-entry scan and actual particle spatial removal.
- `475a10`: raw debris free/active index arrays, position/velocity/RNG fields, actual spatial insertion, and final counts.
- `4386b0`: original alpha-table color arithmetic and radial-kind extra random transition.
- `437aa0`: actual dirty-range queue and packed terrain vertex brightness mutation. Its packed XY subtraction carries an X borrow into Y; this is preserved.
- `44d230`: both packed range encodings, four-entry lists, midpoint expansion/contraction, original signed rounding, and sector-bound clamps.
- `436410`: bounded36-byte position-effect append, including the original source address and unsigned16 radius wrap/clamp.
- `436490`: alternate flash append with its distinct unsigned count-derived words.
- `436510` and `437670`: actual ten-slot trail and three-slot pulse record activation, preserving inactive/occupied state and untouched bytes.

`484bb0` defaults to the existing actual argument adapter and actual `40ea40` sound dispatcher. Sound allocation/library services remain declared in `soundRuntime` or its handlers. Optional named overrides support explicit boundary experiments. Every `435ba0` effect-mask branch has an actual default, including the variants unused by type33 retirement.

Evidence is retained under `analysis/native-simulation/results/643-*` through `675-*`, with existing particle allocator/registration/removal `115/117/118` and existing audio adapter/dispatcher `149/151`. Physical unregister assembly is `ev_d486358196849fc3d8d6c4b2198df00e55cab2f7e8ff27e4bce34497c7af378d`; type33 assembly is `ev_b6246a3c97309b466f6f75abf991f6785539a780dc1a6269816c42202bb7b394`. The original table's provenance is recorded in `src/yaw-table.json`.

Validation:

- `node --test tests/body-retirement.test.mjs tests/body-retirement-effects.test.mjs`:15 focused tests pass.
- `node tools/verify-body-retirement-instructions.mjs`:361 instructions and10,000 calls match across1,723,480 interpreted steps. This independently checks the five complete parents with explicitly state-mutating effect/audio boundaries and exact callback order, including57,750 inclusive collision releases and428 guarded audio stops.
- `node tools/verify-body-retirement-effects-instructions.mjs`:1,931 instructions and6,600 calls match across9,733,467 interpreted steps. The check includes5,400 helper calls,600 additional six-interval/sparse-row cases, and600 complete burst/retirement calls; burst cases cover both `5126b` and full `fffff` masks. Actual production defaults emit13,520 particles and8,240 debris objects, reuse10,470 particles, and perform40,102 terrain vertex writes.
- Connected effect/lifecycle fixtures use an explicitly absent sound bank/channel; actual `484bb0` and `40ea40` execute and reject the sound code. No game-owned callee is mocked in these connected cases; only the compiler security-cookie equality is admitted as an ABI boundary. Populated sound-bank/library behavior is covered by the existing sound-dispatch work, rather than claimed from these absent-channel fixtures.

Comparisons cover entire physical/particle/debris pools, global/group arrays, inverse maps, spatial buckets, effect queues, terrain vertices and scratch, RNG, source vectors, scalar returns, and lifecycle timestamps. They are synthetic mapped-memory fixtures and retained-instruction comparisons, not original-process runtime evidence. Upstream allocation/initialization of these pools and installed-world runtime pointer relocation remain explicit requirements for connected game reconstruction.

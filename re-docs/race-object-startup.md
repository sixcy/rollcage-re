# Authored object construction and startup (429c90 / 429d60)

`race-object-construction.mjs` recovers the actual authored-object list producer 429c90 and constructors 40feb0, 46e810, 429e00 and 44ac20. `race-object-startup.mjs` recovers the full subsequent 429d60 list initialization and 40ff90, 46e8c0 and 429eb0 branches. Existing game body allocation, initialization, orientation, spatial ownership, shape allocation and type20 UV initialization are actual defaults, without game callback substitutes.

## APIs

- `appendAuthoredRaceObject(authored,runtime)` (429c90), returning the native body address.
- `constructAnimatedRaceObject(authored,kind,runtime)` (40feb0), `constructFourShapeRaceObject` (46e810), `constructOptionalRouteRaceObject` (429e00), `constructEmptyRaceObject` (44ac20).
- `initializeRaceObjectList(runtime)` (429d60).
- `initializeAnimatedRaceObject(body,runtime)` (40ff90), `initializeFourShapeRaceObject` (46e8c0), `initializeOptionalRouteRaceObject` (429eb0).
- `initializeAuthoredObjectQuaternion(x,y,z,output,runtime)` (492ae0).
- `initializeRaceObjectStartupTables(memory)` restores the original dispatch tables, shape descriptors and three body templates. This is separate static initialization, not an implicit per-call reset.

Runtime is `{memory,scratchBase,entryRegisters?,services?}`. scratchBase is the native entry ESP. Supplied memory contains the real native model, spatial, body arena, free/active shape pool and script tables. Optional entryRegisters publish saved-register producers. The only service reached here is compiler-cookie validation; it defaults to an actual value check.

429c90 captures the list destination before constructing, increments live count 91e778 after the constructor and then writes the returned body to the captured destination. Authored byte +1f selects types 25/29/31/20/32/35 for values 3/5/8/9/10/11, otherwise type24. Except type32, constructors select the model by byte +3 from pack90b990+18; real4741c0 owns polygon storage and body allocation. Authored position shorts +8/+a/+c become Q16. Original body templates feed actual4798d0. Its initial spatial registration is removed and replaced after authored placement.

492ae0 writes independent axis quaternion components rather than composing rotations. X uses arithmetic half-angle directly; Y/Z use wrapping multiplication by6488h then SAR9. W uses the last nonzero axis angle. Actual raw mutable trig lookup is reused. Matrix is updated afterward, while derivatives/inertia generated during template initialization intentionally remain stale as native does.

429d60 captures list/count once and reads each current object pointer and dispatch bytes live. Type20 initializes the global UV controller before40ff90. Types25/31/35 use40ff90, type29 uses46e8c0, type32 clears180/184 and others use429eb0. Type20 appends physically without shapes; types25/31 allocate one original shape plus bound, type35 its distinct one plus bound, type29 four plus bound. Effect list82e880 rows are8bytes with count82e900. Physical list902bc0 uses a wrapping ushort count902bc4 and explicit trailing zero.

429eb0 captures the authored route index before physical append but reads the spawn field afterward;40ff90 reloads both after append. Aliased append writes therefore produce different real results. The zero optional-route index leaves the body unchanged. Route activation uses offset words from9092b4, sets flag2000h, stores134, clears138..13e and retains low spawn byte13f.

## Evidence and validation

Parent evidence9024/9025; children12054..61; original dispatcher/descriptors12063..66; producer xrefs12067..69/72..73;429c90 and its literal dispatch12074..76/85; constructors12077..84;492ae0/three original templates12086..90. Rejected unadvertised requests12062/70/71 remain preserved, with corrected successful requests separately retained. Target SHA256 c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5.

`node tools/verify-race-object-startup-instructions.mjs` passes2,400 cases (600 each parent/three direct children),2,335 actual428270 calls,492 native cookie checks and1,526,646 steps/399 reached instructions. It compares all mapped bytes≥10000h, plus120 additional UV aliases into saved-register/local/caller-return bytes and the complete36-byte42a0e0 parent frame. This includes captured-count/list mutation, duplicate objects, physical-array→route-index overlap, original and valid mutated dispatch, zero routes and shape/free-active-reverse ownership.

The optional saved-register/cookie support in existing initializeRaceObjectType20 was added at the actual instruction points. Its default numeric API stays compatible. The checker publishes the actual42a1e5 CALL return42a1ea before its opaque compiler service, rather than treating absent interpreter external-CALL stack writes as native behavior.

`node tools/verify-race-object-construction-instructions.mjs` passes1,200 persistent construction→activation fixtures,3,467 operations,1,200 each actual4741c0/4798d0/429d60 calls and1,067 actual476550 script consumers,4,357,297 steps/2,069 reached instructions. Every operation compares all mapped bytes≥10000h. It exercises all four constructors, original templates, real polygon storage, authored multi-axis orientation and registry index511 cutoff, followed by the real route consumer with velocity opcode0. Authored model/header/script contents and pool backing are explicitly synthetic inputs, not claimed loader provenance.

`node --test tests/race-object-startup.test.mjs tests/race-object-update.test.mjs tests/game-network-protocol.test.mjs` passes26 tests. Existing full object-update native regression also passes3,960 calls/891,605 steps, with report race-object-update-startup-regression.json. New reports: race-object-startup-instruction-check.json and race-object-construction-instruction-check.json.

## Producers, consumers and limits

47ea40 allocates the list and initializes count;44c2b0 calls429c90 at44cc56 and publishes script table9092b4 at44cb67. Full loader integration is a separate ongoing scope. This package provides the actual reusable child APIs for it.

Constructors publish collision callback addresses40fcb0/40fdb0/40fe30; those later consumers are not executed or reconstructed by this initializer package. Type29's46e4e0 scripted release is already actual elsewhere. Subsequent429f30 type20/31/32 updates are separately recovered; the connected constructor proof additionally consumes actual476550 opcode0. Other script opcodes retain their existing independent proof scope.

These are retained-instruction comparisons, not original-process runtime evidence. Private nested frames of reused helpers are excluded unless explicitly described above; arbitrary aliases into their unpublished saved-register/CRT frames are outside this proof. No copied body state or end-of-call synchronization is used. Installed files remain untouched.

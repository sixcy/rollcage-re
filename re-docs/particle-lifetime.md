# Native particle and debris advancement

`src/particle-lifetime.mjs` reconstructs two distinct450e50 stages and all their reached game-owned lifetime children. `advanceRawBodyDebris({memory})` is475e50; `advanceRawEffectParticles({memory})` is438550. Both operate on the existing shared raw-memory pools. Neither needs a gameplay callback. Native motion, color arithmetic, list reclamation and packed spatial teardown run through actual recovered implementations. These references do not execute the original process or submit rendering.

## Particle pool438550

The parent captures allocation-end pointer91900c and starts at9153c4, scanning256-byte records by address. It does **not** traverse the active linked list. A nonzero byte+94 admits a record. It captures kind word+a2 and sign-extends lifetime word+96 before dispatching on dword type+0. The captured lifetime governs color/size checks and final expiry even if motion changes other fields.

| Type | Child | Recovered update |
|---|---|---|
|8|4381c0|Translate signed16 velocity times256;7/8 velocity damping truncates towardzero; vertical velocity subtracts128 with16-bit wrap before damping; size byte+=4; alpha=min(unsigned(life*6),255).|
|23|4383d0|Two original RNG steps; retained yaw-tableXZ rotation, translation and vertical adjustment; signed lifetime<60 decrements alpha byte with wrapping.|
|27|438280(mode0)|Translate; velocity minus arithmetic velocity>>3; unsigned lifetime<16 saturates alpha downward by8; parent then subtracts128 from vertical velocity.|
|28|438280(mode1)|Same damping; unsigned lifetime<8 saturates alpha downward by16.|
|30|4384b0|Translate; vertical velocity+=180; signed lifetime<60 reduces eachRGB byte by4 with floorzero and clears alpha.|
|34|438330|Translate; size increments once below253 and again when the **particle address** has bit400; velocity increments13/-35/13; unsigned lifetime<64 fades alpha by4 with floorzero.|
|Other|438790 then4386b0|Kind-specific motion plus the existing recovered color function, followed by conditional size growth for kinds1/4.|

438790 has distinct paths: kind16 remains stationary, kind1 changes only vertical velocity by-56, and kind4000 moves by signed remaining lifetime times velocity*4 plus its vertical term. Other kinds translate by velocity*256, damp3/4 towardzero, and apply the kind4/8 vertical increments-96/-128. The existing4386b0 supplies actual color/RNG behavior, including4000's extra RNG step. Kind1/4 size thresholds use the captured sign-extended lifetime in unsigned comparisons, so high-bit16 lifetimes must retain that distinction.

After motion/color, captured lifetime1 calls `freeRawEffectParticle(particle,{memory})`, actual435ec0. It updates previous/next active-list links, head6e65c0 and tail6e65c8; prepends the record to free-head6e65b4 using+ac; clears+a8 and active byte94; then **always** tail-calls actual4748d0 packed spatial removal. It does not overwrite the old lifetime1. Other lifetimes store low16 of life-1, so0 wraps toffff. Allocation through existing435df0 can immediately reuse reclaimed records.

The motion helpers and free routine are separately exported using their source names and documented native anchors. `maxParticles` bounds reference-tool traversal but does not invent a native particle capacity. Callers must supply coherent mapped pool/list/spatial storage.

## Debris pool475e50

128-byte debris records are selected through active16-bit IDs at902b80, count902b88 and record base902b84. Free IDs use902b7c and signed last-free902b8c. The parent captures its iteration count and last-active cursor, publishes blend fraction500 as a16-bit store at91d404, copies5ec9b0 to91d3fc, and clears three32-bit target-color values91d3b4/b8/bc.

The incoming unsigned lifetime word+8 is decremented before its branch:

- Greater than3: advance signed32 position4c/50/54 by velocity58/5c/60 with wrapping; write short display coordinates64/66/68 from old position high words and velocity>>14, withY+1; add8000 to vertical velocity. With nonzero byte6c and incoming lifetime<=11, blend both packed colors14/30 through432a70.
- Exactly3: remove packed spatial membership through4748d0. It remains in the active ID array.
- 1 or2: no movement, spatial removal or free-list mutation.
- 0: the record's lifetime wraps toffff, itsID returns to the free list, count decrements, and the final activeID replaces it. The replacement is reprocessed immediately; stale tail IDs are retained.

Thus debris spatial teardown and ID reclamation occur on different calls. No motion path here reinserts moved particles or debris into a new spatial bucket; the reference preserves the observed stores and calls.

## Color blend432a70

`blendRawEffectColor({memory})` reads a signed16 fraction91d404, signed16 source components at91d408/40c/410, signed32 targets91d3b4/b8/bc and alpha byte91d3ff. Source and target values each shift left8 with32-bit wrapping. Their signed64 products use weights4096-fraction and fraction; each product shifts right12 **before** addition. That64-bit sum produces three independent outputs: unclamped signed32 scratch after another shift12 at91d448/44c/450, saturated signed16 component writes, and separately clampedRGB bytes. RGB is copied to three packed colors91d434/438/43c with the captured alpha. The reference usesBigInt to preserve the shifts; the oracle interprets actual CRT__allmul568f10, not an arithmetic replacement.

## Validation

`node --test tests/particle-lifetime.test.mjs` passes six focused tests covering final-update-before-free, allocator reuse, lifetime0 wrapping, kind1's stationary position,16-bit gravity wrap, address-bit size changes, distinct color saturation and debris swap-reprocessing/spatial detachment.

`node tools/verify-particle-lifetime-instructions.mjs` passes:

- 1,723 retained instructions,10,000 fixtures,2,336,543 isolated instruction steps;1,000 calls each to both parents, six motion children, free routine and color blend.
- 40 connected160-frame scenarios,13,360 native calls,12,155,834 additional instruction steps. Actual435f20 and475a10 emitters create particles/debris; actual allocation, exhaustion/reuse, movement, expiry and reclamation execute on both sides. Full persistent bytes compare after every operation. Before later emissions, assertions require both active particle endpoints, debris count and spatial head to be empty, with all32 debris IDs reclaimed.
- Across both phases:2,181 particle frees,4,264 spatial removals,1,659 debris frees,652 fading-debris sites,2,304 color blends and280 emissions of each family. The isolated phase also includes107 source-constructor/reuse precedents, declared separately from the fully native connected scenarios.

The oracle has no admitted external calls. Fixtures exercise0..32 scanned particles,0..16 initial debris, all dispatch classes/default kinds, signed/unsigned cutoffs and high-bit lifetimes, exact0/1/2/3/4 transitions, negative velocity and overflow, byte wrapping, head/middle/tail unlinking, empty pools and stale bytes. Active/free/list/spatial data are synthetic coherent mappings, not observed process state.

New retained evidence940..961 covers both parents, all newly recovered children, actual switch bytes and CRTmultiply. Existing663 color,115/117/118 particle allocation/register/remove,655/659 emission and665/669 raw spatial-selector evidence close the dependencies. Exact evidence IDs are in `analysis/particle-lifetime-instruction-check.json`.

The shared instruction interpreter gained narrowly proven XORPS-zero MOVLPD stores for432a70's negative clamps, plus integer ADC for its64-bit sums. Seven vector/string tests and three carry/overflow/operand-width tests pass. These changes retain flags, field widths and source provenance.

The actual4356a0 particle/effect pool constructor and all game-owned children, plus separate512-record debris constructor4758d0, are now documented in [particle pool construction](particle-pools.md), including connected constructor→emit→advance→free→reuse validation. Remaining scope includes binding the broader race/session order, other effect-record families and emitters, surface/terrain ownership, renderer submission and runtime evidence. Completed advancement/expiry does not establish a complete rendered effects system.

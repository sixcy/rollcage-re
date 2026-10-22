# Native particle and effect pool construction

`src/particle-pools.mjs` reconstructs complete game-owned4356a0 and its five constructor children:4357c0,435970,4375f0,4359f0 and437540. The last child reaches432ee0's actual table-root arithmetic and432e30 leading-zero helper. This supplies the real particle range/free-list producer consumed by [particle advancement and expiry](particle-lifetime.md), alongside additional fixed effect/render records used by existing emitters. It does not reconstruct renderer submission.

The main interface is:

```js
initializeParticlePoolConstants(memory);
initializeRawParticlePools({
  memory,
  allocate,               //Ordinary CRTmalloc service; mapped writable result.
  roundingMode,           //'nearest-even', 'toward-zero', 'down', or 'up'.
  convertFloatToInt64,    //Optional ordinary CRT568a60 result service.
});
```

The input memory must already contain the body arena902eec/current offset70dcf4, configuration pointer5ecefc, resource pointer90b990, texture table90b988/append index90b984, and palette pointer90b980. These are caller/earlier-constructor inputs. Original files remain read-only and no original process is executed.

## Allocation before quality clamping

4357c0 first loads configuration float+68, multiplies it by the retained float500 at5dca60 using float32 rounding, then calls CRT568a60 to truncate to signed64. The game uses **only low32 of that result** as particle count5eb504. It publishes start9153c4 and duplicate9153d4 from the previous arena offset rounded down to4; advances arena offset by count*256 rounded up to128; and publishes exclusive end91900c.

Only after all other construction and link initialization does parent4356a0 clamp the configuration value to1..10, multiply it by retained float40, and convert with x87FISTP using the supplied rounding mode. The resulting emission-quality value is5eb500. For example, quality0.5 reserves250 particles and subsequently changes to1/40; quality11 reserves5500 particles and subsequently changes to10/400. Clamping before allocation changes native behavior and is not done here.

`truncateParticleCountFloat(value)` implements finite signed64 CRT conversion. Nonfinite or out-of-range inputs require an explicit `convertFloatToInt64(value)` service returning a signed64BigInt. The native invalid fallback observed in retained1047 is signed64minimum, whose low32 is0; production source does not silently assume that exceptional service result. The oracle declares that CRT service explicitly, including its retained fallback. Floating exception reporting and the CRT implementation itself are outside this game-owned constructor.

`initializeParticlePoolConstants(memory)` installs four retainedfloat words at5dc774=1,5dc9bc=10,5dc9f0=40 and5dca60=500, with evidence in `src/particle-pool-constants.json`. The checker independently matches those bytes to retained1046/1050. Live caller changes are not overwritten by the constructor.

## Particle records and texture copies

Each allocated256-byte record gets dword type9, active byte94=0, lifetime word96=0, selected polygon flags13/17=0c/9a, packed spatial links4=0, word8=0 and bucket pointerc=0. Other record bytes retain previous arena content. Parent4356a0 later constructs the free chain: record+a8 points backward, +ac points to the next256-byte record, final+ac=0. Active head6e65c0 and tail6e65c8 clear; free head6e65b4 becomes the pool start. It also clears9153dc.

Native code does not special-case count0 before its final chain store: it writes zero at `start + count*256 -54`. The source preserves that before-start write in readable synthetic mappings rather than inventing recovery. Negative counts and invalid CRT results are not normal initialized gameplay states; the comparison includes mapped examples to check exact pointer arithmetic and field widths.

4357c0 also derives packed texture identifiers from resource word+2e, copies12 forward16-byte texture rows from index+2e to the append index, changes destination word+6 to low6 bits plus80, and ORs source word+6 with800. EachMOVDQU captures a full row before storing; overlapping ranges therefore observe native forward-copy/flag-write propagation, not a whole-range snapshot. Append index increases12; identifier and flag fields retain their exact16-bit widths.

## Other game-owned constructor children

| Export | Native | Recovered storage |
|---|---|---|
|`initializeRawLargeEffectRecords`|435970|One12db8-byte cleared allocation, ten1e2c-byte records; paired32-row flag sets, global919008. The provisional request filename calls this debris storage, but the native record layout is distinct from the128-byte debris pool.|
|`initializeRawSmallEffectRecords`|4375f0|One2d3c-byte cleared allocation, threef14-byte records; paired16-row flag sets, global9153c0.|
|`initializeRawEffectRecordBanks`|4359f0|Four fixed banks of64 records at120-byte stride, exact header/flag/float-bit writes; **16-bit** clear at91cd60 preserves its upper half.|
|`initializeRawTerrainEffectRecords`|437540|One3c00-byte allocation,128 fixed120-byte records; base6fb9a0 and second-half pointer6fb950; count6fb9a4=0;32 generatedshort values6fb960..99e.|
|`lookupRawEffectRoot`|432ee0|Table-basedQ6 root and actual input/clz scratch writes91d45c/460; used for the32 generated values.|

Parent4356a0 calls the first four children, writes16 grayscale palette entries with alpha60 beginning at palette+fc0, then calls437540 before initializing free links and clamping quality. Successful readable allocation mappings are the checked domain; the native subsequent field stores are not replaced by invented null-allocation recovery.

`initializeRawBodyDebrisPool({memory,allocate})` separately reconstructs complete4758d0. It reserves65536 bytes in the shared arena for512128-byte records, rounds the returned previous offset down to4 while advancing the original offset by65536, and writes the exact type5/header/render/color aliases without clearing other bytes. Packed colors14/50 becomeae404040 after flag-byte writes; dword6c starts40404040, which enables the lifetime color-fade branch for emitted debris. Two1024-byte allocations own the free and activeushort-ID arrays. Free IDs initialize0..511, free-last902b8c=511 and active-count902b88=0. This producer is distinct from4356a0 but is included in the connected construction/lifetime check.

## Validation

`node --test tests/particle-pools.test.mjs tests/particle-lifetime.test.mjs` passes13 tests. They cover allocation-before-clamp, high quality, forward overlapping texture copies and flag aliasing, zero-count before-start write,16-bit counter width, explicit x87 rounding, low32 selection from signed64 conversion, exceptional-service requirements,512-debris header/array ownership, and connected lifetime behavior.

`node tools/verify-particle-pools-instructions.mjs` passes2,176 retained instructions,2,400 isolated fixtures and22,875,153 instruction steps. Each of eight entries has300 calls. It also runs12 fully connected160-frame scenarios starting with actual4356a0 and4758d0 constructors, followed by actual435f20/475a10 emissions,438550/475e50 advancement,expiry/freeing and later reuse:4,032 calls and9,808,955 additional steps. Before later emissions, both active particle endpoints and the spatial head must be empty; debris active count iszero and all512 free IDs are reclaimed. Persistent raw arena/record/texture/list/palette/configuration/global bytes and allocator size/order compare after construction and every frame.

The only admitted services are ordinary CRTmalloc/memset and568a60 float-to-signed64 conversion. All game-owned children and the existing particle allocation/spatial/color/motion descendants are actual retained instructions. Fixtures cover all four x87 rounding modes, zero/negative counts in readable mappings, an explicitly supplied invalid CRT result, original constants, unaligned arena offsets and overlapping texture rows. They are synthetic runtime mappings, not original-process observations.

Primary retained evidence is964..969 and1040..1052 in `analysis/native-simulation/results`. Exact IDs, call counts and methods are in `analysis/particle-pools-instruction-check.json`. Request1047 is CRT evidence rather than interpreted game logic. The separate lifetime report covers full particle/debris creation→advancement→expiry→reuse with actual emissions.

Remaining scope is earlier arena/resource/configuration/palette construction and their wider race-init orchestration, other effect families, renderer submission and runtime validation. Particle and128-byte debris pool ownership is now explicit.

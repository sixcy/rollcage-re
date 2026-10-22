# Recovery query and application leaf boundaries

`tools/lib/native-recovery-leaf-replay.mjs` independently binds47d040 and47d440 through the existing captured recovery context. `tools/check-native-recovery-leaf-replay.mjs` pairs complete original-process leaf captures and compares their declared semantic state. No original-process leaf capture has yet been validated by these new tools. The selected-parent apply-entry observations are a different, lower-cost boundary; their input snapshots do not contain a complete child-entry/preRET memory pair.

The authoritative retained replies are native-simulation100 (`ev_17f2b2691024a81de4fec16bd0b415ed91dd7952e5ad9c550cf77bb7457c1487`) and102 (`ev_c329f2472b4fcb32cbb31106e54ad1db5a35f1ebfd0bf6b7df7d74fabfca2c76`), combined with parent098 and caller310. All target Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. The existing parent-boundary verifier checks both actual CALLs and all four RET instructions.

| Contract | Query47d040 | Apply47d440 |
| --- | --- | --- |
| ECX / EDX | Actual body / position pointer | Actual body / position pointer |
| Entry ESP+4 | Quaternion pointer, may be zero | Quaternion pointer |
| +8 | Rotation pointer, written when quaternion is supplied | Rotation pointer |
| +12 | Mode | Route pointer |
| +16 | Output-reference pointer | Route point index |
| +20 | — | Packed terrain reference |
| Parent CALL / return | 47cf11 /47cf16 | 47cf37 /47cf3c |
| Genuine preRETs | 47d42a,47d434 | 47d6ed,47d703 |
| Register result | EAX boolean placement acceptance | Void; volatile EAX is incidental |
| Preserved registers | EBX,EBP,ESI,EDI,ESP | EBX,EBP,ESI,EDI,ESP |

Query's first exit performs temporary-shape cleanup for nonnegative signed clone+10c. Its second exit handles a negative count. Apply's first exit inserts into an empty spatial bucket; its second updates a nonempty bucket's previous head. The leaf replay predicts the reached preRET from the actual resulting native state and compares it as well as semantic bytes and register contracts.

The query output is added as an explicit four-byte semantic comparison even when it falls inside the larger ABI stack observation. Pose/quaternion/rotation spans retain actual pointers and possible aliases. Apply coverage includes the actual route argument, reached controller byte39 and, when the native mode reaches44a2e0, checkpoint IDs and20-byte checkpoint records bounded by those IDs. Modes3/8 do not require otherwise-unreached checkpoint backing. Existing geometry comparison tracks reached native vertices, packets, model/configuration records and related spans. Missing captured bytes and reached completion/services remain explicit failures; no placement, route, progression or native-callee answers are supplied.

## Capture requirements

Independent leaf replay needs full captured state at **both child entry and its actual preRET**, not just the parent's entry or an180h-byte event header. Reuse the proven complete frame/core/geometry descriptor set and add the five `nativeRecoveryGlobalRegions`, preserving actual heap pointers and source-known module aliases. These cover the70eb00 temporaries, candidate/clone alias through712fa7, controller slots, retirement clock/color and24-position sound ring. The native clone and candidate storage deliberately overlap.

The `frame-stack` range must extend4096 bytes below ESP (or another explicitly proved bound) and include at least20 bytes above query ESP,24 above apply ESP, including the return DWORD. The standalone checker currently requires exactly those upper bounds. Additional pointed-to inputs need their own observed spans when they lie outside the core ranges:

```js
{id:'leaf-position', baseRegister:'edx', length:12}
{id:'leaf-quaternion', baseRegister:'esp', dereferenceOffsets:['4'], length:16}
{id:'leaf-rotation', baseRegister:'esp', dereferenceOffsets:['8'], length:18}
// Query only:
{id:'leaf-query-output', baseRegister:'esp', dereferenceOffsets:['0x10'], length:4}
// Apply's actual type3 route:
{id:'leaf-route', baseRegister:'esp', dereferenceOffsets:['0xc'], length:12}
```

These pointed descriptors apply at **entry**. Query47d040 overwrites its quaternion argument slot and replaces its output-pointer argument slot with the accepted result; apply47d440 overwrites its quaternion slot with the spatial outside flag. Reusing the entry dereferences at preRET would read small integers or address zero. Retained098 proves the caller preserves body inEDI and rotation pointer inESI, quaternion at parentS-24 and query output at parentS-44. Exit descriptors therefore use EDI for the common body, ESI for rotation, relocated70eb0c for position, ESP+96(query)/+100(apply) for quaternion and query ESP+76 for its output. Apply route ESP+12 remains a pointer. Actual interpreted parent snapshots verify these pointer identities at all four RET sites despite the overwritten argument words.

The quaternion descriptor applies to the nonnull quaternion supplied by47ccc0. A separately targeted null-quaternion call must not attempt to read address zero. Progression/controller backing must come from actual captured route/pack IDs and live participant controller pointers; an unconditional read through sentinel12345678 is invalid. A readable virtual region is coverage, not a claim about a logical allocation's size. Complete source binding still validates every accessed span.

Standalone breakpoint IDs are `native-recovery-query-before`, `native-recovery-query-after-a/b`, and corresponding `apply` names. They use exact RVAs and the same observer-only session phase4 predicate at entry and exit. Before has no stop bound; each alternative preRET has stopAfterHits1. Only the first matching call is admitted. Applying identical nonzero skip counts to two independent exit counters would not describe a shared call index and is rejected. This narrow policy does not capture a leaf which changes the session out of phase4; that requires a separately defined selection contract.

Run a complete leaf pair with:

```text
node tools/check-native-recovery-leaf-replay.mjs CAPTURE NEW_REPORT_DIRECTORY query
node tools/check-native-recovery-leaf-replay.mjs CAPTURE NEW_REPORT_DIRECTORY apply
```

`tools/prepare-native-recovery-leaf-capture.mjs` now produces these baseline configurations from the complete ordinary parent bootstrap, preserving all core, geometry, recovery dependency and startup isolation policies. Its `createNativeRecoveryLeafCaptureConfig(root,output,{stage})` returns a reviewable configuration for a separate caller to combine with explicitly authorized instrumentation. The baseline itself performs no rejected-state, route, pose, query-result or physics writes and does not launch anything. Its entry and two return descriptors have identical phase gates, zero skips and stop bounds0/1/1. `prepareNativeRecoveryLeafCapture` refuses existing output/configuration targets.

```text
node tools/prepare-native-recovery-leaf-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG query
node tools/prepare-native-recovery-leaf-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG apply
```

## Validation

`tests/native-recovery-leaf-replay.test.mjs` obtains native child-entry/preRET snapshots from the actual interpreted47ccc0 parent, without replacing its query, application, geometry or progression callees. Ten leaf calls cover both exits of both functions, including negative shape counts, empty/nonempty spatial buckets and actual44a2e0/449d40 checkpoint progression. Exact semantic spans, the query output and declared registers match. Further checks corrupt output, EAX, nonvolatile registers, ESP, caller, phase predicate and boundary configuration; each fails the intended boundary. Pairing also rejects ambiguous branch skips and missing alternate-exit descriptors. These are synthetic retained-instruction comparisons, not original-process runtime evidence.

`tests/native-recovery-leaf-capture.test.mjs` additionally verifies complete bootstrap preservation, fixed argument extents, all four original return-pointer identities, independent alternative-exit stop bounds, absence of new writes and refusal of existing artifacts. Preparation creates the configuration only, never its capture directory or a native process.

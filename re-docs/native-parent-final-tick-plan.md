# Finish the native parent tick

Historical plan: the subsequent [FinalV2 checkpoint](native-parent-final-tick-checkpoint.md)
now matches one selected parent through actual return and both clock increments.
The next outer producer interval and continuous races remain open. In the
conversion discussion below, `568c41` produces a 64-bit result whose low DWORD
is consumed by `441cd0`; the older double-to-u32 shorthand is not its full ABI.

The V8 joined replay matches through **451120**, immediately after the call to438550 at45111b. It has not matched a complete450e50 tick or its return. Weather consumes the authenticated same-process QPC result. No new sound creation occurs in that recording, so the new adaptive selector and positional child retain instruction-comparison evidence only.

The companion [plan JSON](../analysis/native-parent-final-tick-plan-20261024.json) pins the retained evidence and source files. The [pure source attempt](../analysis/native-parent-final-tick-source-attempt-20261024.json) and its [reproducer](../analysis/native-parent-final-tick-source-attempt-20261024.mjs) use original parent-entry memory and already authenticated CRT/QPC external outcomes. Native intermediate/final bytes never supply game state.

## Remaining native instructions

Retained310, evidence `ev_d15324804cfcb1308ec6f86f28c7350a908d9cee745a7616dd8619f94cd3053f`, belongs to target SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

| Native caller | Actual child / operation | Source status after V8 continuation |
| --- | --- | --- |
|451120..451132|Increment nonzero6fb9a4; signed values above32 become0|Executed; no final native comparison|
|451137 →45113c|481200 ground projection|Executed; no final native comparison|
|45113c →451141|48edb0 model fragments|Executed; no final native comparison|
|451141 →451146|494140 wheel histories|Executed; no final native comparison|
|451146 →45114b|487540 vehicle overlay grids|Executed; no final native comparison|
|45114b →451150|44a7a0 terrain-point animation|Executed; no final native comparison|
|451150 →451155|415230 placed-object destruction|Executed; no final native comparison|
|451155 →45115a|480e90 world fragments|Executed; no final native comparison|
|45115a →45115f|44f990 persistent emitters|Executed; no final native comparison|
|45115f →451164|44f3a0 attachment effects|Executed; no final native comparison|
|45116f →451174 or451180 →451185|44d960, ECX0 for final substep; ECX1 otherwise|Actual final-substep branch stops on missing terrain-light band bytes|
|451174 →451179|42b530 surface feedback, final substep only|Implemented; not yet reached by this attempt|
|451185..4511c8|Mirror-axis constants and current settings+404 reverb word|Implemented; not yet reached|
|4511cd →4511d2|484880 listener updates|Implemented; not yet reached|
|4511e0 →4511e3|Manager714b08 virtual5c, genuine4a90e0 master-level setter|Implemented with actual-target check; not yet reached|
|4511e3 →4511e8|47f370 phase/input gate|Implemented structure, explicit remaining game dependencies; not yet reached|
|4511e8..451208|Conditional clocks, preserved-register pops, RET|Source semantic clocks/result exist; CPU epilogue/RET is not performed by current helper|

`runRaceUpdate` has actual defaults for all42 direct game entries. This is a stage-order fact, not transitive input/producer/private-ABI closure. `executeNativeParentTail(...,{through:'parent-return'})` already attempts the entire semantic remainder. Its `parentReturned` metadata currently describes a computed pre-RET result: it does not execute the native POP/RET or450d60 caller. The ordinary checker chooses its terminal stage from authenticated captured checkpoints and currently stops at world effects.

## First concrete missing input

The source-only attempt executes the nine children following451120, then reaches44d960 →44df50 →44d8a0 →44d6a0. It fails on a four-byte read at **17148738**. No zero-filled terrain registry or substitute light result was supplied.

The original V8 parent entry, ordinal4, has baseEA0000, U=008ffc50, iterationEDX0, totalIterations1, clock90a548=288, sample counter6e675c=288. The final-substep condition is therefore source-derived. Its loaded pack has18 segments. Constructor48ef30, retained1252, allocates one contiguous band array:

`bytesForSector = ((segment.rowCount >>> 4) << 5) + 32`.

The observed root80f208 is17148358. All18 actual pointer-table differences at80f220 agree with the corresponding captured segment+12 row count. The sentinel is17148cb8, giving **2400 bytes**. Sector8 begins171486d8 and has96 rows, hence224 bytes. Vehicle light25 is kind8; its first packed range is03b03908. Removal uses `(packed >>> 12)&255` and `packed >>> 24`, so it reads band3, slot0 at root+96 =17148738. This cell is inside the proved logical allocation but outside original captured backing.

A future observer should capture that original-entry backing using the actual root and requested extent derived from all loaded segment dimensions, with a declared maximum, nonwrapping arithmetic, count/pointer-table/sentinel consistency and readability checks. Reject unsupported counts/oversize allocations. Preserve NULL/empty behavior from the actual constructor; a containing readable heap region is not an allocation-capacity proof. The current 18-sector/2400-byte observation is one recording, not a universal map size.

## Inputs to audit together before another final-tick run

The current late-input declarations already cover ground-query times7130c0, six4208h overlays82eda0, fragment flags/pointers/shapes849940/849980/849a20, destruction queue9205d8 and its guarded workspaces, terrain-animation root90b994 and guarded6000h consumer extent, emitter records6ff140, attachment counts6e6b1c and a declared observation window at902f00, and dynamic-light pool/queue/dirty state. New producer paths may require additional source-reached bodies, scripts, palettes or terrain descendants. An observation window must fail when exceeded; it must not become an invented native capacity.

For final44d960, admit the band backing above together with actual light slots/kinds, queued36-byte records, dirty ranges, any palette and scripted-body consumers, renderer scratch, authored transforms, and reached spatial/range metadata. Existing default476550 executes genuine scripted motion, so a reached script allocation/service remains a real boundary.

For42b530, inspect each live record's **signed** byte258. Only values above1 enter407380. Eligible paths require original device manager714b54, cache/map ownership6f2360, actual method targets, terrain/material fields, device-return outcomes, container mutations and any allocation/free preimages. Existing source deliberately requires explicit reached haptic/container services. Do not force record flags or device returns to zero. The V8 initial eligibility census is in the plan JSON; the source has not reached this branch yet.

For484880, capture active listener records849480 (four54h records), vector6f2408 begin/end/capacity and only its used pointer storage. Each reached nonnull listener destination needs its actual80-byte object; live position/velocity inputs need12 bytes and rotation18 bytes. The descriptor writes destination+4..79; preserve its vtable/other bytes. Null sources retain the preceding descriptor values. Dynamic mode changes which record fields supply pointers, so do not replace this with a blanket count/empty-vector assumption. Include scalar image bytes and axis words5ecdb0/5ecdb4.

For the master-level call, validate actual manager/vtable/5c target4a90e0 and admit manager+850 plus the original raw argument5ecdb8. For phase47f370, admit session57c/580/551/54d/58c/58e and relevant bodies/records, current phase mirror6e6ba4, original packet/history/local-input roots and pointed data consumed by42b330. V8 entry is phase4/counter60, playback58c=1, countdown1512, mode551=0, network6eafe0=0. This selects the **playback input path42b330**, rather than477310, if those fields retain these source values. Do not assume its aggregate digital result: bit800 may change the playback/phase outcome.

Other scenarios still require actual477310 pause/session progression;478fa0 completion UI;445b70 results;4702c0 network lifecycle;4a0420 mode1 transport;48b7d0 mode4 indicators; reached music/volume device methods and WriteFile outcomes. These are explicit dependencies, not Win32 answers or inert defaults. A recording which avoids them cannot close those scenarios.

## Exact return ABI and clock scopes

Let U be450e50 entry ESP. `[U]` is450e38 in the ordinary450d60 caller; `[U+4]` is the total-iteration argument. The parent saves EBX atU−4, EBP atU−8, ESI atU−12, EDI atU−16. Ordinary direct child entry is S=U−20. The master-level argument occupies S and its call return4511e3 occupies S−4. Do not reuse S as that virtual callee's ESP.

After47f370, nonzero EAX returns parent EAX0 via4511f2, without incrementing either clock. Zero EAX increments **90a548 and6e675c**, returns EAX1 via451208. Both arms restore the four incoming nonvolatile registers and execute a plain cdecl RET. At450e38, ESP is U+4, and `[ESP]` remains the total argument;450e3a adds4. A source semantic EAX/clock match alone does not prove these native stack/register effects.

A minimal next native endpoint is **450e38 after actual RET**, selected by the same owned parent/TID/U and original call identity. Compare all declared semantic output regions, source-derived EAX, the four restored incoming nonvolatiles, ESP U+4, original caller return and numerical/TLS context. Optional pre-RET endpoints451208/4511f2 localize the two arms; do not require both in one run. Keep the existing451120 checkpoint to isolate the newly covered remainder. Capture endpoints and required input graphs in the same original process; never refresh source memory at451120 or at return.

450d60 entry O=U+28: it reserves/saves20 bytes, pushes total atO−24 and calls450e50 atU=O−28. On450e38 it stores EAX in EBX, removes the argument, stops if zero, otherwise increments ESI and repeats while unsignedESI<EDI. Within one outer call, another substep reuses U but has source-incremented iteration; it is not automatically a new logical outer frame. Capture a sibling next450e50 entry only with this proven loop relation.

For V8 total1, success exits this substep loop. Proving the next outer tick also requires intervening original450d60/440930 producers.450d60's441c70 computes the next total from fresh489cd0 time and actual CRT conversion/scaling. It advances **delivered counter6e66f8**, a third counter distinct from90a548 and6e675c. Source `advanceRaceStepCount` implements only441cd0..441d66's integer scheduling tail; whole450d60,440930 and the clock's uint64/double/service chain are not connected source parents.

The initialized clock calls489cd0 at441cab (return441cb0), unsigned64-to-double568d6e (return441cc3), multiplies original binary64[5dc6e0], then double-to-u32 conversion568c41 (return441cd0). First initialization instead calls489cd0 at441c7d and stores origin6e66b0/6e66b4. Observe those distinct external boundaries if reached; the earlier weather QPC result cannot be reused. Offline still runs the timing/conversion chain before returning one step. Network bits1+80+(2|4), delivered6e66f8 and streak6e66e4 choose catch-up counts up to3.

The ordinary440930 race branch gates alternating6e66c4 using engine405010/+5c, updates global state counters, calls448880, optional441620, checks pause/focus globals, calls imported56e524 to determine foreground, then441dd0 input/network gate, then450d60 at440cd0 (return440cd5).450d60 also performs its two viewport wrapper/update paths and pause branch477730. None of these preceding operations may be replaced with an observed next-entry snapshot or guessed return. Rendering/scheduler441d70 is a separate pacing scope; an adjacent captured tick alone does not prove it executed in source.

The practical sequence is therefore: complete same-entry450e50 through450e38 first; then recover/execute the actual outer producer interval through a next authenticated450e50 entry with fresh typed timing/input services. A paired next entry is comparison-only. Original-process final output, private ABI, multi-tick producer closure, background audio concurrency and unobserved physics scenarios remain open.

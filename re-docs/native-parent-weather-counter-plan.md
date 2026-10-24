# Next weather performance-counter boundary (read-only plan)

Historical pre-implementation plan. The subsequent observer and original V5/V6
recordings are described in [the counter evidence](native-parent-weather-counter.md).
The original audit JSON and its pre-change claims remain retained unchanged.

No capture helper, profile or source implementation was changed for this audit. No game or native fixture was launched. The current mixed host remains frozen at SHA256 `37ff703795d77956b584226be0638d82a8142430da734298ca0869449dfd7707`. This plan proposes observing one real external service, not supplying a native game-function result. The accompanying [audit JSON](../analysis/native-parent-weather-counter-plan-20261024.json) records static PE/import bytes, selected closed-V3 input provenance and 14 pure arithmetic/alignment comparisons.

## Exact native call and import

Target: original Redux SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. Read-only inspection of the staged, hash-matching PE identifies `KERNEL32.dll!QueryPerformanceCounter` at preferred IAT56e0fc (RVA16e0fc), and `KERNEL32.dll!QueryPerformanceFrequency` at IAT56e114. These are static import identities; a future observation must retain the actual relocated IAT DWORD and require actual ESI to equal it before CALL. This audit has no new runtime QPC target/output observation.

| Original instruction | Bytes / meaning |
| --- | --- |
|498453 CALL489cd0|`e87818ffff`; timer's immediate game caller, return498458|
|489cd0 PUSH EBP; MOV EBP,ESP; AND ESP,-8; SUB ESP,10h|Actual aligned frame, followed by four saved registers|
|489ce3 MOV ESI,[56e0fc]|`8b35fce05600`; native QPC IAT target|
|489cfb CALL [56e114]|`ff1514e15600`; lazy-initialization QPF, excluded by the proposed initialized-path guard|
|489d0a CALL ESI|`ffd6`; lazy-initialization origin QPC, likewise excluded|
|489d0c LEA EAX,[ESP+18h]; 489d10 PUSH EAX|Actual stack-local output address and game-owned argument push|
|489d11 CALL ESI|`ffd6`; proposed before point RVA89d11|
|489d13 MOV EAX,[ESP+18h]|`8b442418`; proposed after point RVA89d13, before loading/computing any game timer result|

Retained instruction sources (under `analysis/native-simulation/results`): `3630-weather-489cd0-procedure_assembly.json`, Evidence `ev_ff29e60114cb96f219e316aff00030e0be8766dec59f42ce80cd1df1bc5b8288`; `3611-object-effect-498030-procedure_assembly.json`, Evidence `ev_63ead536e7f90d678a521be318a0a0941f4941f54d121c96773c7f2b6f8ce804`; `3601-object-effect-496700-procedure_assembly.json`, Evidence `ev_652dcaa3e71743210f3596591e2c2a16138e2cd65db911da285821bd97c2c72d`; and `3626-weather-40ab70-procedure_assembly.json`, Evidence `ev_1d9d0a3e9c2cee701e1742c0e45959754be60da702f7e6cbc9bd49a2901a59b1`. Their subject SHA matches the target. `3442-wormhole-network-489cd0-assembly.json` retains the same timer Evidence used by the existing protocol instruction check.

## Aligned stack and exact output extent

Let U be the selected450e50 entry ESP, S=U−20 the496700 entry, and F=U−360 the498030 frame after its allocation/saves. Both viewport queries have returned before498453. Define:

- Timer entry C=F−4=U−364, with `[C]=actual498458`.
- Native EBP=C−4=U−368, then A=alignDown(EBP,8).
- B=A−32: steady489cd0 ESP after16 local bytes and four DWORD saves.
- Before CALL489d11, K=B−4 and `[K]=P=B+24=K+28`.
- After the stdcall4 service returns at489d13, ESP=B=K+4. The output remains exactly eight bytes at P; it is not a pointer inferred from EAX.

The actual API entry would be K−4, with CPU return489d13 there and its one argument at K. The proposed two points are game instructions, so no API-entry hook or invented callee frame is needed. Additional same-parent return checks are `[U−44]=actual496822` and `[U−20]=actual451116`. EBP and its saved copy at B+8 independently retain U−368 at these points. U must be DWORD aligned; both U modulo8 cases0 and4 need the alignment formula, not an unconditional subtraction.

**Output preimage is meaningful stack storage.** On the known direct kind0 path with U modulo8=0, P=U−376 reuses the second40ab70 query's return word4980f5 and its yOut stack argument. There is no intervening call on the observed branch from4980f5 to498453. When U modulo8=4, P is four bytes lower and the preceding saved-name word participates instead. Capture the actual eight bytes before/after; never clear this local or seed it with a later value. Inside489cd0,489d42 overwrites P's low DWORD with the quotient, so a later parent-stack snapshot cannot recover the original QPC output. Source's argument producer or reused bytes must be reconstructed from actual source calls, not copied from a native middle/after stack.

## Closed V3 inputs establish the narrow next domain

The closed capture `analysis/native-parent-rtti-stock-capture-v3-20261024` has19 snapshots. Its selected parent snapshot4 genuinely observes clock288, initial DWORD6e6c8c=1, signed64 frequency10,000,000 and origin17,829,773,361,440. The audit verifies the SHA256 and length of those individual blobs and the context; it does not claim another whole-capture or171-file audit. Its U=`012ffa90` derives C=`012ff924`, EBP/A=`012ff920`, B=`012ff900`, before K=`012ff8fc`, after B=`012ff900`, and P=`012ff918`. These are diagnostic evaluations for that closed run, not fresh-capture addresses.

The actual main-thread context has x87 CW007f in both legacy FLOATING_SAVE_AREA offset28 and FXSAVE offset204, and MXCSR1fa5 at offset228, at parent entry/cameras/world. CW007f selects24-bit precision and nearest rounding. The MXCSR exception-status bits are observed, not a clean default to manufacture. Future before/after observations must retain complete716-byte raw context and actual owned FS/SEH evidence. The timer game's arithmetic is integer64, but this does not authorize replacing, clearing or globally assuming caller floating-point state.

For a purpose-specific two-snapshot profile, require initial selected-parent flag=1 and reobserve flag/frequency/origin at the timing points. Require their identities/bytes to match the actual source inputs; refuse a lazy-init or changed-input case rather than guess missing QPF/origin answers. If the initial flag is0,489cd0 may perform QPF and an extra QPC before the final QPC: those are separate outcomes requiring a larger separately reviewed observation design. Clock288 is a simulation input and is not a QPC sample or proof of a wall-clock cadence.

## Minimal future optional observer (not implemented)

A possible explicit policy is `parentRttiObservation.weatherCounterObservation:{callBreakpointId:'native-parent-weather-counter-call',returnBreakpointId:'native-parent-weather-counter-return',maxPairs:1,maxSnapshots:2}`, requiring mixed `weatherScreenQueries:true`. Add only the two declared game RVAs89d11/89d13; the existing15 sites, all13 baseline checkpoints, startup actions and camera/weather observations remain. There would be17 declared sites and still at most21 snapshots,90 seconds, one million events and the existing per-range transport bounds. This does not add a pending-frame buffer: current RTTI policy explicitly excludes pending-frame observers, whose separate128MiB limit is not an RTTI immediate-capture field. The known19-snapshot path leaves room for these two. Do not increase limits or discard old outputs: admission must reserve two snapshots against the **combined** bound and fail if an extra actual CRT pair already consumed that room.

The observer should be deferred, owned-main-thread and selected-parent scoped. It may admit one call only at stage9 after the actual second weather return, before world-effects, with no open CRT pair and the same U/clock/iteration. At admission validate EIP, actual EBP, derived K/B/P, the one argument, three original return words, initialized flag, unchanged frequency/origin and actual ESI/IAT identity. At return require the same thread/open call/derived pointers, ESP advanced4 and original caller lineage. Keep actual returned EAX/BOOL, ECX/EDX, flags and numerical context; never force success or skip the call. Other threads/outside-parent hits must remain neutral; an unproved selected caller, malformed span, unmatched return or missing pair aborts without automatic retry.

Useful exact, small rows at both points (names are proposals, not a frozen schema):

| Row | Actual extent |
| --- | --- |
|counter argument|K,4; after-return row is the actual preserved argument bytes, not an active argument claim|
|counter output|P,8 preimage/postimage|
|counter aligned frame|B,32; raw saved registers/locals, no private-stack injection|
|timer/screen/parent returns|C, U−44, U−20, each4|
|counter IAT|actual image base+16e0fc,4|
|initialized flag|actual image base+2e6c8c,4|
|frequency/origin|actual image base+3135a4,16|
|logical clock|actual image base+50a548,4|

These rows total84 data bytes per point, plus context/TLS and provenance. Keep complete before/post blobs and hashes, actual debug-event/parent/thread ordinals, argument/output addresses, expected relocated caller words, actual IAT pointer and before→return ordering in marker/snapshot annotations. Completion should authenticate one closed QPC pair and include its two observations in the combined total. Existing helpers currently reject this undeclared extension; review/implementation/pure tests and a fresh announced root-owned run are prerequisites.

## Source binding and arithmetic limits

`src/game-network-protocol.mjs:21` computes `frame=alignDown(scratchBase−4,8)−32` and calls `runtime.services.platformCall('QueryPerformanceCounter',[frame+24],runtime)`. `src/weather-screen.mjs` supplies timer scratchBase=F−4, so the source-derived pointer matches P without using native intermediate words. The real service can write exactly eight output bytes and return its genuine BOOL. The final QPC BOOL is not tested by489cd0:489d13 immediately reloads EAX from the output. Capture it for ABI evidence, without inventing successful writes on failure. A future typed service must verify source call/name/address and the complete source eight-byte preimage against the native before observation, apply only the observed external output, and consume each paired observation once. Do not bind `readGameMicroseconds` as a whole native-result service.

Game arithmetic is signed64: `delta=wrap64(counter−origin)`, signed quotient delta/frequency, remainder `wrap64(delta−wrap64(frequency*quotient))`, fraction `wrap64(remainder*1,000,000,000)/frequency`, whole `wrap64(quotient*1,000,000,000)`, then `wrap64(fraction+whole)/1000`, truncating signed divisions toward zero. Helpers569380 and568f10 are explicit CRT signed-division/multiplication boundaries; division by zero has no supported fallback. The caller498458..498461 then reinterprets the result unsigned64, divides by1000 with5689e0, and uses lowEAX as milliseconds. Preserve this unsigned conversion, not a floating-point or host-time replacement.

Existing `analysis/game-network-protocol-instruction-check.json` records3,600 pure cases,892 reached489cd0 calls,306,506 instruction steps and a match; its CRT/platform services are explicit synthetic boundaries. The focused ordinary clock test checks lazy frequency/origin initialization and actual service order. This audit additionally compares seven arithmetic cases at each of two ESP alignments (14 matches) with the actual retained489cd0 game instructions: positive/negative truncation, subtraction wrap, whole/fraction multiply wrap and signed-division edge cases. Negative frequencies are arithmetic-only cases, not legitimate QPF observations. CRT helpers use explicit BigInt64 semantics in the interpreter, so this is neither native CRT validation nor an observed QPC sample.

A paired counter observation closes only this external input on the known initialized kind0 path. Full timer/private ABI, arbitrary lazy initialization, other weather kinds/extent wrappers, later services/allocations, timing cadence and complete native parent interleaving remain separate claims. A future joined source run must execute the real timer arithmetic and downstream weather code, compare retained output spans, and stop honestly at its next genuine missing producer.

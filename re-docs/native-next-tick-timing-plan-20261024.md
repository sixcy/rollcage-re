# From one complete native tick to the next

Target: Redux1.3.8.0, SHA-256`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. This read-only audit uses retained static evidence and the closed FinalV2 capture. It launches no original process and changes no source algorithms. The independently hashed findings are in [the timing audit](../analysis/native-next-tick-timing-audit-20261024.json). The [completed parent checkpoint](native-parent-final-tick-checkpoint.md) supersedes the earlier incomplete-parent status in the [historical plan](native-parent-final-tick-plan.md).

## What the selected return actually permits

The latest comparison matches5,107,238 unique bytes through the real450e50 return at450e38. Original FinalV2 entry has base730000, U=0116fbe0, EDX0, ESI0, EDI1 and`[U+4]=1`. Its frame-stack blob independently contains actual450e38 at`[U]` and actual440cd5 at`[U+28]`; the latter proves the enclosing450d60 caller rather than inferring it from a function name. The parent returns EAX1, with clock90a548 and sample6e675c advancing288→289.

Let O=U+28 be450d60 entry ESP. At450e38 the stack is U+4;450e3a removes the total argument,450e41 increments ESI0→1, and the unsigned comparison against EDI1 exits.450e46..450e4d restores four registers, discards its ECX local and returns to440cd5 at ESP O+4. This suffix needs no fresh timer or game-child answer. It is the smallest next source ABI bridge. A second450e50 invocation within that same outer call is impossible for this observed total1. A synthetic/network total>1 can exercise the sibling-substep loop, but cannot stand in for a second ordinary tick.

At440cd5 the successful return skips the failure-state write. The original enclosing saved EBX is0, so440cf1..440cf5 reaches441010. Its retained pseudocode tests6e66b8 and unsigned6e66a8<6e66dc, invokes441ad0 while eligible and increments6e66a8.441ad0 optionally invokes the actual function pointer6e65ac, advances6e6644, updates fade5eb5a4 and, when6e6b4c is nonzero, advances9020a8. Thus rendering/callback writes cannot be removed just because physics has returned. The current capture does not contain these gate fields. After440d00 the state comparison may loop inside440930 or return at440d18; the subsequent outer event-pump/caller interval is not established by the selected capture.

Evidence: retained [001](../analysis/physics-clock-elevated-20261022/results/001-frame-parent.json),[015](../analysis/physics-clock-elevated-20261022/results/015-main-loop-assembly.json),[032](../analysis/physics-clock-elevated-20261022/results/032-render-gate-pseudo.json),[040](../analysis/physics-clock-elevated-20261022/results/040-render-timestamp-producer.json). Their exact evidence IDs, file hashes and target digests are pinned in the audit.

## The next outer entry has real producers

The active440930 path at440c26 increments6e66cc, toggles6e66c4, obtains actual405010 settings and overrides the alternating gate to1 when settings+5c is zero.402d10/404ce0 then publishes the presentation gate. Only the gate1 branch calls448880, optionally441620, checks6e66bc/6e6658, obtains the WindowsApplication through402aa0, calls imported GetForegroundWindow at440cbc, executes441dd0 and enters450d60 at440cd0. The foreground result becomes ECX0/1 by comparison with the actual application HWND. Unknown gate/input/render branches must fail explicitly rather than copy a future parent entry.

450d60 itself always performs two Application viewport paths before its clock: keys at570258 (`Cinematic Window`) and570244 (`Rear View Mirror`),402d10 returns450d9f/450de4, followed by406b80 returns450da6/450deb. Their enable arguments derive from91ce90, session bytes552/phase57c and config byte25. Source viewport algorithms exist, but the existing authenticated camera/weather CRT policy does not authenticate these new outer caller frames. When450d60 entry is O, each402d10 entry is O−32 and its actual CRT call entry is O−72. These are new lineage cases, not reusable captured EAX values.

The clock runs before450d60 reads6e6b4c or handles background/pause477730. The background path can add the scheduled count to sample6e675c while executing no450e50 physics. Hence the three counters remain distinct:

| Field | Actual producer/meaning |
| --- | --- |
|90a548|Successful450e50 logical physics/game tick; FinalV2 advances288→289.|
|6e675c|Successful parent tick **or**450d60 background sample advance.|
|6e66f8|441c70 delivered/scheduled count, including calls that later skip physics.|

441dd0 has an offline branch that repeatedly calls434070,471230,470830 and4713d0 and advances the64-slot sample/history ring6ea6a0/6ea6a4. Existing471250`pollInputPacket` consumes sampled records; it does not implement these upstream sampling producers. The exact device/notification/network descendants still need recovery/bindings if reached. Source helpers for405010,402aa0,406b80 and44f3a0 exist, but no connected450d60/440930/441dd0/441010 parent currently executes this interval.

## Complete441c70 conversion, without answer callbacks

The initialized path is441cab→489cd0 (return441cb0), wrapping64-bit subtraction of origin6e66b0/b4,568d6e (return441cc3), scalar-double multiplication by the original5dc6e0 bytes`681d554d1075ff3e`, then568c41 (return441cd0). The first-delivery path instead calls489cd0 at441c7d, returns441c82 and stores the origin, clears streak6e66e4 and sets delivery6e66f8=1. Offline flags still execute the initialized timer/conversion chain before the integer tail returns1. This is not a wall-clock-free offline branch.

568d6e consumes the elapsed uint64 in EDX:ECX. Its zero-high path converts signedECX to double then adds table56f6a0[ECX>>>31], namely0 or4294967296. The nonzero-high path reconstructs the binary64 bits using BSR, integer SSE shifts and rounding thresholds. It must preserve unsigned64 wrap and native rounding behavior rather than coercing the input to an imprecise JavaScript integer first.

**568c41 returns a signed64 conversion in EDX:EAX; the scheduler subsequently uses only EAX.** It selects conversion modeECX1, rejects non-finite/out-of-range values, strips sign, reconstructs an integer from the binary64 significand/exponent, restores sign and truncates fractional bits. Native bounds at56f6d0/d8 are−2^63/+2^63, not uint32 bounds. Shared code568bd8 calls in-image568bfd with EDX10 when discarded fractional bits are nonzero; invalid inputs call it with EDX8. This numerical-status/exception child must be recovered, not silently omitted. Historical names saying “double-to-u32” describe the later low-DWORD consumption too broadly.

Pinned original image constants:

| Preferred span | Exact bytes |
| --- | --- |
|56f6a0/16|`0000000000000000000000000000f041`|
|56f6b0/16|`ffffffffffff0f000000000000001000`|
|56f6d0/16|`000000000000e0c3000000000000e043`|
|56f710/16|`330400003f04000000080000ff170000`|
|5dc6e0/8|`681d554d1075ff3e`|

Evidence [010](../analysis/physics-clock-elevated-20261022/results/010-clock-source-assembly.json),[021](../analysis/physics-clock-elevated-20261022/results/021-platform-clock-assembly.json),[027](../analysis/physics-clock-elevated-20261022/results/027-clock-uint-to-double.json),[028](../analysis/physics-clock-elevated-20261022/results/028-clock-double-to-uint.json),[029](../analysis/physics-clock-elevated-20261022/results/029-double-conversion-body.json),[1047](../analysis/native-simulation/results/1047-world-particle-count-convert-assembly.json). [037](../analysis/physics-clock-elevated-20261022/results/037-crt-shared-conversion-info.json) identifies the missing568bfd..568c40 body as68 bytes; its assembly is not present in this initial audit. A constructed interpreter probe also stops at568c46 because BoundedX86 currently rejects MOVSD XMM5. That is an interpreter coverage gap, not a captured-memory failure.

## Fresh services and original input requirements

With C=O−24 as441c70 entry, initialized489cd0 entry is T=O−40=U−12. Let A=alignDown(T−4,8), F=A−32. Its actual QueryPerformanceCounter call at489d11 has argument`[F−4]=F+24`, external entry ESP F−8, return489d13 and exactly8 output bytes at F+24. A fresh ordered observation supplies only the real API EAX and those8 bytes. Current weather QPC outcomes have caller498458 and cannot be reused for caller441cb0/441c82. If initialized flag6e6c8c is zero, the genuine QueryPerformanceFrequency output7135a4 and optional origin QPC7135ac must also be observed; never substitute a nominal frequency.

FinalV2 actually captures6e6c8c=1, frequency10,000,000 and origin7135ac, plus network flags0. But it **physically lacks** delivery6e66f8, clock origin6e66b0/b4, streak6e66e4, background6e6b4c, all listed outer gates, settings singleton root6e64a4 and scale5dc6e0. The audit checks every native range covering each actual address and hashes all used blobs; these absences are not alias problems. Static constant recovery proves initialized image identity, not mutable origin/gate values in this run.

The next profile needs these exact scalar fields plus the actual reached settings/window/sampled-input/render callback roots and original stack/TLS/numerical context. Read source-known tables from original PE or capture them with fixed image identity; capture mutable roots from the original process. New external outcomes include only reached QPC/QPF, GetForegroundWindow, true CRT casts and actual platform/device boundaries. The in-image conversion algorithms, viewport updates, ring producers and render/game children must execute genuinely in source.

## Next implementation and proof

First recover the68-byte568bfd child and any reached native status service. Add a full441c70 source entry with actual shared-stack publication, genuine489cd0 arithmetic, source uint64→double conversion, captured-MXCSR scalar multiplication, source signed64 conversion and existing`advanceRaceStepCount` integer tail. `readGameMicroseconds` already implements signed64 quotient/remainder time arithmetic, but its exact native stack publication is presently specific to the weather caller; it is not a complete generic timer ABI adapter. No existing source function named`readNativeClock` supplies this missing parent.

Verify all initialization/offline/network paths, uint64 subtraction borrow/wrap, high DWORD conversion, exact and fractional doubles, low-DWORD wrap, signed64 limits, finite rejection/status effects, delivery wrap and three-step catch-up. Compare all owned output/scratch bytes and numerical state to actual retained instructions after narrowly extending the interpreter; conversion hooks returning fixture answers are excluded. Then connect450d60 and its actual outer viewport/pause/input children. Prove the450e38→440cd5 suffix before extending through440930 and its event-pump/render scope.

A future native next450e50 entry is comparison-only. Keep the prior complete source memory, execute every intervening producer and consume only authenticated external API outcomes; do not refresh source state from the next entry. Current evidence proves one complete tick, not uninterrupted continuous timing or a closed second-tick trajectory.

## Static follow-up: the68-byte status child is recovered

The initial audit above is preserved. A subsequent authorized static-only REA6.7.0/Ghidra12.1.4 session recovered568bfd..568c40, its call metadata and35 original initialized bytes at56f6ff. The owned session8550 closed the binary, exported evidence/snapshot and terminated with exit0. The original executable's pre/post hash remainsC058. No game was launched and no provider/client configuration was changed. See [the completed summary](../analysis/native-clock-conversion-static-20261024/completed-summary.json), [exact assembly](../analysis/native-simulation/results/20261024-clock-status-568bfd-assembly.json) Evidence`ev_bae6b5f11f816781dc21933ed4de136202db89d107763a559ca6506f68dd7373`, [callee analysis](../analysis/native-simulation/results/20261024-clock-status-568bfd-analysis.json) Evidence`ev_1d5893ed73e8f68e370c86726fa263a9b911aa3d2228e4d982c7a08c4a5f6ce7`, and [mask bytes](../analysis/native-simulation/results/20261024-clock-status-mask-bytes.json) Evidence`ev_b4178ba733e313e69f21f753f3b932e54f960030befe6fe6cf8f33d3436151da`.

The entire35-byte image span56f6ff..56f721 is:

`450810000000000001000000000000f020330400003f04000000080000ff1700003f13`

Let B be568bfd entry ESP. It subtracts32, writes only the WORD x87 control register at B−32, zero-extends that WORD into EAX, then tests EDX. EDX8 always enters the exception path. Otherwise `byte[56f6ff+EDX] & AL` nonzero returns immediately. Thus the **actual capturedCW007f and fractional-conversion EDX10** test byte56f70f=20, produce nonzero20 and return without an external call, numerical-control change or invented status update. The adjacent high WORD at B−30 is untouched. This masked path can be implemented genuinely from the recovered instructions; it is not an inert callback standing in for a native child.

On EDX8 or an unmasked status, the real branch loads x87 control133f from56f720, stages `{EDX,0,XMM0double,XMM0double,oldCW}` in32 bytes, calls the six-byte MSVCR120.DLL::except1 thunk5692fa at568c36 (return568c3b), then pops returned ST0. Its genuine CRT behavior remains unbound/unobserved here; reject that reached branch until supported or supplied through a narrowly authenticated external CRT boundary. Do not assume it shares the masked path's effects.

This closes the missing **static child evidence**, not the timing implementation or continuous-run proof. The retained-instruction oracle also needs more than XMM5 allowance: CVTSI2SD, register-destination MOVD, PSLLQ/PSRLQ, PUNPCKLDQ, PCMPGTD, PSUBQ/PADDQ, CMPEQSD and the reached integer bitwise SSE forms are currently absent; existing MOVSD/MOVDQA/COMISD forms have narrower register and lane-state contracts. In particular, scalar MOVSD must maintain the exact128-bit representation, including the upper-lane behavior of its actual operand form, required by later MOVDQA. These are explicit interpreter-form gaps. No handlers returning conversion answers were introduced. Full441c70 source work and its shared-stack/native timing observations remain the next implementation step.

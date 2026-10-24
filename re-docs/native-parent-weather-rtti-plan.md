# Parent weather RTTI observation plan

This is a read-only static/source plan following the closed V2 capture and
`analysis/native-parent-rtti-stock-first-replay-v2-20261024/report.json`.
The connected source parent matches through cameras, then496700 reaches a
different402d10 caller. Its refusal by the camera-only adapter is correct.
No weather CRT outcome has been observed or supplied, no code was changed for
this plan, and no new target process was launched.

The primary future observation must cover **auxiliary through world effects in
one process**. A camera-to-world weather-only window would prove a separate
leaf ABI but could not close the joined parent by reusing an old camera EAX.

## Actual reached caller chain

Addresses here are preferred addresses in the original Redux executable, SHA
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

| Instruction | Meaning |
| --- | --- |
|451111 CALL496700|Parent weather update; parent return451116|
|49681d CALL498030|Screen-particle update; return496822|
|49808d CALL40ab70|First viewport query; return498092|
|4980f0 CALL40ab70|Second viewport query; return4980f5|
|40abee CALL402d10|Both queries obtain the application; return40abf3|
|402d86 CALL56932a|The same external `__RTDynamicCast` import as the camera|
|402d8b ADD ESP,14h|First instruction after the external return|

The three per-frame invocations requiring joined external outcomes are the
camera's41a0c3 caller and the two weather queries at49808d/4980f0. The latter
share40abee; their outer40ab70 return word distinguishes them.

40ab70 uses native ECX=NAME and EDX=xOut, with yOut/widthOut/heightOut on
the stack. **There is no MODE parameter on this path.** The nonempty-name path
pushes hOut, widthOut, yOut at40abdf/40abe3/40abe7, then xOut at40abeb, NAME
at40abec, and ECX at40abed. The preceding native strlen loop leaves
ECX=NAME+1, so this final word is a saved/padding volatile word rather than a
mode. After402d10,40abf3 discards that one word;40abf8 calls407050 with the
five real output-query arguments, and407181 returns with RET14h.

The dormant extent wrappers40ac40 and40acc0 have different frames and call
40ab70 at40ac96/40ad15. They occur in other weather branches and must not
inherit the direct screen-query depth below. This plan does not admit them.

## Derived stack and pointer contract

Let U be450e50 entry ESP and S=U-20 the direct child entry used by the source
parent. These are instruction-derived depths, not native after-stack inputs.

| Frame/site | ESP/address |
| --- | --- |
|496700 entry|S = U-20|
|496700 after five PUSH instructions|S-20 = U-40|
|498030 entry|S-24 = U-44|
|498030 final frame F (SUB130h plus three saves)|S-340 = U-360|
|40ab70 entry T (three argument PUSHes plus CALL)|F-16 = U-376|
|402d10 entry R (40ab70 four saves, six PUSHes and CALL)|T-44 = U-420|
|CRT pre-CALL/post-CALL ESP Q (402d10 five saves, five arguments)|R-40 = U-460|
|Actual CRT entry ESP|Q-4 = U-464|
|Original screen-query name|F+28h = U-320 = Q+140|

402d10's five external arguments stay
`[sourceApplication,0,actual(6e213c),actual(6e20a4),0]` at Q..Q+19.

| Context offset | Meaning |
| --- | --- |
|Q+40 = R|actual40abf3 wrapper return|
|Q+44 = R+4|NAME+1 saved/padding ECX word|
|Q+48 = R+8|NAME = F+28h|
|Q+52 = R+12|xOut|
|Q+56 = R+16|yOut|
|Q+60 = R+20|widthOut|
|Q+64 = R+24|heightOut|
|Q+84 = T|actual498092 or actual4980f5 query return|
|Q+416|actual496822 screen-update return|
|Q+440 = S|actual451116 parent weather return|

The first query's output pointers are
`[x,y,width,height]=[F+18h,F+1ch,F+14h,F+20h]`; the second uses
`[F+10h,F+18h,F+1ch,F+20h]`. Both use NAME=F+28h.

For V2 only, U=`012ff938`, S=`012ff924`, R=`012ff794`, Q=`012ff76c`,
NAME=`012ff7f8`. These numbers are diagnostic evaluations of the formulas,
not addresses to hardcode into a new capture.

## Count and bounded future observation

498030's two direct queries precede the session552 gate. The original parent
entry observes `0 Player\0` at the immutable9-byte5d0254 name input, session552=0,
weather553=0, and6e6cdc=0. In the kind0 branch,4984c1/4984c8 therefore skip
the optional4979c0 particle spawn, which is the only further viewport-query
producer in that branch. Independently,91ce90=2 selects speed0 and the captured
5dca34 threshold is250. This gives a **static/source forecast of two weather
casts plus one camera cast**, not an observed weather count. Different fresh
inputs or other branches must remain unsupported until independently derived.

The primary proposed policy keeps the existing auxiliary activation and extends
the close point through the existing after-world-effects checkpoint451120.
After-camera451111 remains an intermediate checkpoint and must not close it
(45110d is the preceding getRaceStageCount return, not that checkpoint).
Retain two402d86/402d8b sites, the owned main TID, one parent stack/clock,
strict call/return pairing and family-specific caller guards:

- Camera family: Q=U-276, wrapper caller41a0c8, original NAME/MODE contract.
- Direct weather family: Q=U-460, wrapper caller40abf3, ordered outer callers
  498092 then4980f5, output pointers and parent returns above.

Use a68-byte context at Q for weather, rather than the old52 bytes, to include
the real heightOut word at R+24. Capture the distinct query return at Q+84,
screen return at Q+416, parent weather return at Q+440, and original logical
clock. A fixed9-byte NAME observation at Q+140 can validate this proven stock
name without guessing a capacity or following arbitrary pointers. Each CRT
return must have its own actual EAX and source-argument comparison. Never use
the earlier camera outcome as a weather result or assume identical APP/EAX.

Keep the existing maximum of four pairs/eight external snapshots and total21
snapshots,90-second and one-million-event bounds. Current-path forecast is
19 snapshots:13 base plus6 external snapshots. Unexpected callers, changed
stack depth, extra unproved weather queries or a missing pair must fail closed;
the bound is not permission to admit arbitrary additional callers.

## Source/private ABI still open

`queryWeatherViewport` currently forwards ordinary JavaScript arguments and
sets the402d10 scratch depth, but does not publish the native PUSHh/w/y,
PUSHx/PUSHname/PUSHsavedECX words or the40abee return on the shared source
stack. A future source binding must reconstruct only those exact game-owned
stores from its actual source arguments and retained instruction order.
It must not copy intermediate native stack words, assume that the camera
NAME/MODE stores exist here, or silently relax source stack validation.
402d10's own complete ECX/SEH/CRT private frame remains separately unproved.

After the two viewport queries, kind0 reaches489cd0 at498453, a real timer
routine with QueryPerformanceCounter/Frequency services. That is an independent
external dependency; weather RTTI observations alone do not establish complete
world-effects or parent-return execution.

## Retained evidence

All files below are under `analysis/native-simulation/results`; their structured
subject SHA was checked against the exact target above.

| File | Evidence ID |
| --- | --- |
|310-race-step-parent-assembly.json|ev_d15324804cfcb1308ec6f86f28c7350a908d9cee745a7616dd8619f94cd3053f|
|3601-object-effect-496700-procedure_assembly.json|ev_652dcaa3e71743210f3596591e2c2a16138e2cd65db911da285821bd97c2c72d|
|3611-object-effect-498030-procedure_assembly.json|ev_63ead536e7f90d678a521be318a0a0941f4941f54d121c96773c7f2b6f8ce804|
|3626-weather-40ab70-procedure_assembly.json|ev_1d9d0a3e9c2cee701e1742c0e45959754be60da702f7e6cbc9bd49a2901a59b1|
|3650-weather-402d10-procedure_assembly.json|ev_af9ae69ed9db78a714381999a949dba246f1bac8a65c92a3239c27f068b70358|
|3652-weather-407050-procedure_assembly.json|ev_dd36507642f659d1b453ed773460113777d3987d0523e8a3c3ac06ff5ccbcc0c|
|3648-weather-40ac40-procedure_assembly.json|ev_3cf13233f4a11acaf85bdd521022debf918198545cfb56c30d12f6850e2dc1e3|
|3628-weather-40acc0-procedure_assembly.json|ev_483b404d3ff056bf5b26b60060c80b81bf51ca959b35fbfd94c0ddec925a69db|
|3630-weather-489cd0-procedure_assembly.json|ev_ff29e60114cb96f219e316aff00030e0be8766dec59f42ce80cd1df1bc5b8288|

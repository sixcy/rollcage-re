# Outer race dispatch source, 24 October 2026

[`runNativeRaceDispatch`](../src/native-race-dispatch.mjs) now reconstructs
`450d60`, the enclosing dispatcher around the recovered clock and physics
update. It reads actual fixed module operands while preserving raw stack,
pointer and register values. It composes the real viewport, clock, attachment
and race-update algorithms by default. The reached `477730` policy remains an
explicit failure, rather than a guessed pause result. **This is not a complete
original-process outer update or continuous-race comparison.**

The parent comes from retained
[001](../analysis/physics-clock-elevated-20261022/results/001-frame-parent.json),
Evidence `ev_7b9bed3c32690505a0fc371b3be2907a87296a209fb2d9165e2ccc4962b64f87`,
for original target SHA C058. The original
[main loop](../analysis/physics-clock-elevated-20261022/results/015-main-loop-assembly.json)
sets its incoming ECX to one when the foreground HWND differs from the game's
HWND (`SETNZ BL`, then `MOV ECX,EBX`). The separate `6e6b4c` field is retained
as an actual mode word; its broader semantic meaning is not inferred here.

## Reconstructed behavior

The two viewport updates use the actual `Cinematic Window` and `Rear View
Mirror` keys. Their enable conditions preserve short-circuit reads, unsigned
session-byte tests and signed phase comparisons. After the first viewport,
flags, configuration and session are read again. `402d10` has a plain RET:
its two caller arguments remain for `406b80`, which reuses the same CALL slot
and returns with RET8. This distinction is checked against original PE bytes.

The dispatcher then executes `441c70`, carries its derived numerical context,
and reads `6e6b4c`. That word stays in ESI across attachment processing; a later
change to the global does not replace the latched register. Depending on this
word, incoming ECX and the genuine pause-policy result, the dispatcher either
advances only sample clock `6e675c`, or runs the scheduled `450e50` substeps.
It does not manufacture successful physics ticks from clock delivery alone.

Substeps pass total count on the real caller stack and iteration in EDX. The
[return bridge](native-race-dispatch-return.md) executes the actual argument
cleanup, failure test, unsigned INC/CMP loop, sibling PUSH/CALL and live outer
pops. EAX0 stops immediately. Saved values and the return target are read from
live source memory. Unknown volatile registers are not filled with zero or
native after-state values. Clock/dispatch observers supply no answers.

## Evidence and limits

The [parent-control instruction report](../analysis/native-race-dispatch-parent-control-instruction-check-20261024.json)
passes 450 constructed cases (150 scenarios at three PE-relocated image bases),
reaching all 87 parent instructions. It compares the projected fixture memory,
160 stack bytes, published child arguments and eight known final registers.
Its six in-image child outcomes are explicitly synthetic: it proves parent
control and call publication, not the children or native timing.

The [default-child tests](../tests/native-race-dispatch.test.mjs) separately
execute real application lookup, viewport strings/red-black map insertion,
clock arithmetic/conversions and attachment processing through a sample-only
route. Only CRT allocation/cast/free and QPC outcomes are synthetic; no
`runtime.calls` game outcomes are supplied. Both viewport records change,
delivery advances, sample count wraps, and logical physics clock stays put.
Missing CRT and pause behavior remain failures. This constructed preferred-base
test does not close the private child ABI or full-chain ASLR.

The independent suffix comparison covers
[504 retained-instruction states](../analysis/native-race-dispatch-return-instruction-check-20261024.json).
It also extends the genuine
[FinalV2 source carry](../analysis/native-race-dispatch-carried-return-20261024/report.json)
after all 5,107,238 parent bytes match, predicting return to `440cd5` without
loading native after-state into source. No native outer-return endpoint was
captured. The existing parent report remains byte-identical to its earlier
reviewed result. The separate original warm-clock recording is not joined to
this recording or presented as the following tick.

The full remaining slice needs original outer-entry input coverage, the two
new CRT/allocator caller lineages, complete viewport child stack/SEH and ASLR
publication, and recovered `477730` behavior. Existing semantic viewport
helpers do not claim all these private frame stores. Beyond `450d60`,
`440930` input sampling, viewport/render gates and event-loop producers still
need connected source execution before comparing a closed second parent tick.
The original physics goal also retains its broader collision, initialization,
recovery, weapon and scenery requirements.

Validation: 16 focused tests passed with zero failures/skips across the outer
dispatcher, both instruction comparisons, original source carry and the
existing complete-parent regression. No game ran for this work. The viewer
still uses its existing experimental simulation integration; this incomplete
outer producer interval is not advertised as a new faithful runtime mode.

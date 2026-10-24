# Recovered complete timing calculation

The new `runNativeRaceStepClock` source entry implements the complete `441c70`
timing calculation, its real `489cd0` counter arithmetic, both in-image numeric
conversions and the existing integer scheduling tail. The active physics goal
is unchanged. This checkpoint has constructed-input/retained-instruction
evidence; it has **not** matched a new original-process timing call or a second
continuous parent tick.

Sources are [the clock caller](../src/native-race-step-clock.mjs),
[conversion/status algorithms](../src/native-clock-conversion.mjs) and the
opt-in timer ABI in [game-network-protocol](../src/game-network-protocol.mjs).
The older weather timer path retains its separate caller contract.

## What now executes in source

- First delivery queries the timer, records its actual 64-bit origin, clears
  the streak and sets delivery to one. It does not read the conversion factor.
- Later deliveries perform a fresh timer query, wrapping 64-bit origin
  subtraction, genuine unsigned64-to-binary64 reconstruction, multiplication
  by the original `5dc6e0` binary64, signed64 truncation and low-DWORD scheduling.
  Offline still performs the timing/conversion chain before returning one.
- Native `568bfd` writes the exact two-byte control word, preserves adjacent
  storage and follows the actual exception-mask test. Known x87 status survives
  all caller/conversion stages. No status is invented when it is absent.
- The new timer path publishes all six arithmetic call frames, nonvolatile
  spills, conditional multiply spills and the division helper's in-place
  normalization of negative arguments. It derives the native output from
  actual counter/frequency bytes rather than supplying a timer answer.

`90a548` and `6e675c` remain unchanged by this calculation. Its delivered-step
counter is `6e66f8`; these are three distinct state producers.

The source explicitly requires a supported observed numerical context and the
actual original table/scale bytes. Legal PC24/PC53/PC64 control words are
preserved; current SSE support is masked nearest-even without DAZ/FTZ.
Invalid/unmasked conversions stage the genuine `MSVCR120::except1` boundary and
stop. Missing services, frequency/storage or numerical inputs never select a
default tick count.

## Original instructions and independent checks

Target SHA-256 remains
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
The additional [70-instruction signed division](../analysis/native-simulation/results/20261024-clock-signed64-division-assembly.json)
has evidence `ev_5e83da9e8584442f7ba5642a6d79e59a445150641dc7bd8ec0d970d9933c61c2`.
The [static recovery](../analysis/native-clock-integer-static-20261024/completed-summary.json)
closed its owned REA session and preserved the executable hash. No original
game ran for this work.

The [complete comparison tool](../tools/verify-native-race-step-clock-instructions.mjs)
executes the actual retained parent, timer, multiply, divide, both converters
and masked status child. Its only supplied outcomes are declared synthetic
Windows counter/frequency results. There are no timer, conversion, integer
arithmetic or game-child answer hooks.

The [latest 341-case report](../analysis/native-race-step-clock-status-preserved-instruction-check-20261024.json)
matches 105,689 instruction steps, reaches all 68 scheduler instructions and
checks both DWORD-aligned stack variants. It compares the whole fixture image,
including the 392-byte caller stack, exact ordered API entry ESP/return/pushed
pointer/nonvolatile registers/input preimages/output bytes, count and the known
source return subset. Whole-image equality preserves untouched bytes too; it
does not mean every image byte was dynamically consumed.

The [independent scheduling audit](../analysis/native-race-step-clock-independent-reviewed-audit-20261024.json)
reproduces the instruction counts and branch coverage. The subsequent
[status-preservation audit](../analysis/native-race-step-clock-independent-status-reviewed-audit-20261024.json)
pins the final source: an explicitly known x87 status word survives every
conversion stage, while absent status remains unknown. `CW005f/SW0` reaches
the genuine exception boundary at both tested image bases; it is not replaced
with a missing-input error or a supplied conversion result.

An independent review of the first 330 cases found the small-backlog arm was
missing. Eleven explicit counter-input scenarios now cover streaks 8/9/10,
signed/unsigned streak wrapping, two/three-step backlogs, reset and zero elapsed
time. These derive their target through the genuine timer/conversion chain;
expected target/count values are assertions only. The native factor's final
bit matters: 3,500,000 microseconds produces target104, not105.

Component instruction comparisons additionally cover relocated images,
778 unsigned conversions, 128 signed cases, 14 actual exception-entry frames
and all owned timer stack writes. The current full-chain matrix uses preferred
base `400000`; it does not establish full-chain ASLR. Numerical sticky-flag
metadata is source-derived and is not presented as an original-process or
complete interpreter exception-state match. Full private volatile CPU/SIMD
state and the real `except1` behavior remain outside this proof.

The earlier [complete recorded parent](native-parent-final-tick-checkpoint.md)
still passes its 5,107,238-byte native comparison. The older V8 weather/world
replay, timer/weather ABI checks and protocol regressions also pass after this
work. They do not provide the missing outer timing input fields in that capture.

## Next native observation

The proposal below was subsequently implemented with the stricter
[capture contract](native-race-clock-capture-plan.md): its stack span extends
through C+28 (540 bytes) to prove the outer caller. The resulting
[original-process checkpoint](native-race-clock-runtime-checkpoint.md) matches
the scalar result and declared game outputs, but retains a failed strict
comparison for private Windows QPC stack residues. The steps below preserve
the earlier proposal rather than describing an unperformed launch.

The next focused original-process validation should observe a warm `441c70`
call from `450d60`, before integrating the entire next-frame producer interval:

1. Select the owned main-thread `441c70` entry with original return `450df0`,
   nonzero delivery and initialized performance-counter state. Record actual
   entry ESP C, all four incoming nonvolatiles and raw numerical/TLS context.
2. Capture original `[C-512,C+8)` and the exact scalar spans: `6e66b0/8`,
   `6e66e4/4`, `6e66f8/4`, `6eafe0/4`, `6e6c8c/4`, `7135a4/16`,
   `56e0fc/4`, `56e114/4`, `5dc6e0/8`, conversion tables `56f6a0/82h`,
   plus `90a548/4` and `6e675c/4` as independent unchanged-counter checks.
   Resolve fixed image operands from the actual module, leaving stack and
   pointer values as actual addresses.
3. Observe the reached `489d11`/`489d13` QPC call/return. Timer entry is
   T=C-16; F=alignDown(T-4,8)-32. At the call site ESP=F-4 and the pushed
   output pointer is F+24; source publishes actual CALL return `489d13` at
   F-8. Authenticate exactly one real BOOL and eight-byte output, ordered on
   the selected thread/frame, with original preimage and unchanged controls.
4. Arm `450df0` only after the selected entry. Authenticate actual return ESP
   C+4, caller and nonvolatiles, compare the original-entry source execution's
   output count, all declared memory and supported numerical state. The native
   return snapshot is comparison-only.

A separate fixed purpose must preserve the proven launcher/graphics policies,
90-second/event bounds, worker quiescence and owned-process cleanup. Three
startup snapshots plus entry, QPC before/after and final return require seven
snapshots for the warm case. Cold QPF/origin-QPC branches need their own reviewed
observation policy; do not force flags or reuse weather's QPC outcome/caller.
The helper policy, deferred activation and raw-record validator need negative
tests before any launch. Use a fresh isolated stock installation and preserve
all failed evidence and current edited installation files.

Passing that focused runtime call would still leave `450d60` viewport/pause
logic, `440930` foreground/render gates, upstream sampled input and event-loop
producers to execute before a closed second parent tick. Long races, broader
collision/inverted-driving cases, initialization, recovery, moving/destructible
scenery and weapon-force scenarios remain in the full active objective.

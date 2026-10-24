# Original warm race-clock calculation, 24 October 2026

The original Redux 1.3.8.0 process now supplies one authenticated warm `441c70`
entry, its actual Windows performance-counter call/return, and its return to
`450df0`. JavaScript executes the timer arithmetic, conversions and scheduling
from the original entry. The scalar result, scheduled count, fixed storage,
known return registers and observed numerical state match. **The strict whole
stack comparison fails**, and complete clock storage/continuous-race parity
remains open.

See the [raw V2 trace](../analysis/native-race-clock-stock-capture-v2-20261024/trace.jsonl),
[source replay](../analysis/native-race-clock-stock-replay-v2-20261024/report.json),
[independent raw/source audit](../analysis/native-race-clock-stock-independent-audit-v2-20261024.json),
[capture contract](native-race-clock-capture-plan.md) and
[transport verifier](native-race-clock-capture-verifier.md). The earlier
[341-case instruction comparison](native-race-step-clock-checkpoint.md) is a
separate constructed proof, including network/backlog cases absent here.

## What matches

The actual image base is `005f0000`; selected main thread 25500 belongs to
owned process 24632. At logical clock 288, the initialized offline call uses
original entry ESP `00effb14`, frequency/origin, mutable clock fields, original
conversion tables and raw CW/SW/MXCSR. No compatibility aliases, guessed
initialization or future game-state refresh are used. The sole supplied
external outcome is the actual eight-byte QPC result and its actual BOOL.

The original pre-QPC frame matches all 738 compared bytes and seven known
registers. The only excluded bytes at this phase are the four-byte CPU CALL
return word: source has already published it, while the native snapshot is
before CALL. The actual `489d13` word is checked independently.

Source produces elapsed 9,968,887 microseconds and scalar
`299.06660999999997`. Its binary64 bytes `62b9a5d510b17240` match native final
XMM0 low64 exactly. The reached signed conversion/masked status tail preserves
XMM0; the checker requires extended context flags. Offline count1 alone would
not validate the floating-point computation. A rehashed XMM0 corruption test
fails even when the count and every compared memory byte still match.

At final return, count 1, all seven known registers, CW007f, SW587b and MXCSR1fa5
match. All 14 nonstack rows (202 bytes) match, including delivery288→289 and
unchanged logical/sample fields. This call does not execute a physics update.

## The retained failure

The real Windows QPC implementation changes 109 bytes below its entry stack
pointer, besides its CPU return word and eight-byte output. The typed external
binding supplies only the declared output/BOOL and leaves those private stack
residues untouched. Consequently the full742-byte comparison differs at109
bytes after QPC and105 at final return. No private bytes are copied from a later
snapshot, and no comparison is silently masked. The report deliberately keeps
`matched:false` and `sourceComplete:false`, while distinguishing the matching
numeric result with `clockResultMatched:true` and `scaledClockMatched:true`.
The independent audit verifies that every final difference is a surviving
unchanged byte from the actual private API changes; genuine source instructions
subsequently overwrite four of those bytes.

An [independent retained-instruction replay and access ledger](../analysis/native-race-clock-stock-independent-numeric-audit-v2-20261024.json)
also starts with only the original 742 entry bytes. It executes 281 instructions
(211 distinct) and supplies only the actual QPC output/BOOL and architectural
CALL return. API-clobbered ECX, EDX and XMM registers become unknown until real
instructions overwrite them. All 76 bytes written by game instructions match
at final return, and no game instruction reads a changed private API byte before
its own genuine store. This resolves the dependency for this observed call;
it does not establish that future callers never read those residues. Full
volatile CPU ABI and interpreter sticky-flag parity remain outside that proof.

The next step is to carry this explicit external boundary and the source
clock into its enclosing producer interval, retaining the failed full-span
comparison. The outer `450d60`/`440930` viewport, pause, input, rendering and
event-loop producers still need connected source execution before a closed
second parent tick. Natural cadence, cold initialization, broader collisions,
full recovery, scenery and active weapon-force scenarios remain required by
the unchanged physics goal.

## Capture and verification

V2 completes seven snapshots at 45,537ms and terminates the owned process at
45,591ms, within its 90-second cap. Three cold endpoints activate only after
the selected entry is published. No game/service intervention occurs inside
the selected clock interval. Original launcher/graphics and containment policies
are retained. The game is closed.

Both the 171-file stock installation/baseline and 173-file edited installation/
mirror remain identical after the run:
[stock audit](../analysis/native-race-clock-stock-installation-after-v2-20261024.json),
[edited installation audit](../analysis/native-race-clock-installed-edits-after-v2-20261024.json).
The independent audit rehashes all 179 raw/context/diagnostic blobs (50,338
bytes) and all 688 installation identities across the four source/copy roots.

V1 reached all endpoints and cleaned up but emitted an invalid JSON header:
the custom serializer received a CLR policy object. Its
[failed transport evidence](../analysis/native-race-clock-stock-transport-failure-v1-20261024.json)
is preserved without repair. V2 uses an explicit policy dictionary tested
through the actual production header/serializer. A subsequent offline verifier
correction requires null module metadata for register-rooted startup ranges
and an exact module base for RVA-rooted ranges, matching the host writer;
rehashed metadata/address negatives cover that distinction. This required no
third capture.

Focused source/host/protocol/scheduling checks pass 34 tests with zero failures
or skips; the separate complete FinalV2 parent regression also passes its
5,107,238-byte comparison. Rebuilt viewer camera/editor browser checks pass,
including zero idle DOM mutations after adding a pickup. The viewer remains
super experimental, with three cars by default.

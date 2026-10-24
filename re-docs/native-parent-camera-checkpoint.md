# Source-carried parent camera checkpoint, 24 October 2026

The resumed physics goal now has an original-process camera checkpoint beyond
the earlier V6 auxiliary boundary. The goal remains active: a whole parent tick,
weather continuation, continuous races and the broader scenario matrix are not
proved by this checkpoint.

## Native recording and replay

`analysis/native-parent-rtti-stock-capture-v2-20261024` retains a fresh stock
Redux 1.3.8.0 run, target SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
It completed in 47.407 seconds including cleanup, with 15 snapshots: the three
reviewed startup observations, ten parent checkpoints and one CRT call/return
pair. Three map graph observations add no snapshots. The run is bounded to
90 seconds, 21 snapshots, four CRT pairs, eight map nodes and 256 bytes per key.
It changes no car, collision, RNG, physics or CRT result.

Frozen observer:
`analysis/native-physics-local/parent-rtti-stock-resumed-v2-20261024/runner-v2/`;
C# SHA256 `989f72cb52c1228c59d644f2889d97c8b9085bd8b9c4302146d82491399b393f`.
Preparation and configuration hashes are in
`analysis/native-parent-rtti-stock-prepared-v2-20261024.json`.

`analysis/native-parent-rtti-stock-first-replay-v2-20261024/report.json`
authenticates the raw events before executing source. From one original parent
entry at logical clock 288, source AI, prephysics and physics match. The same
source memory then matches attachments, ordinary recovery, drive and auxiliary
checkpoints at **5,106,697 unique bytes each**, and cameras at **5,106,930 unique
bytes**, without an intermediate native state refresh.

The original wrapper caller pushes MODE1 then NAME before CALL. Thus wrapper
entry R has NAME at R+4 and MODE1 at R+8. For the common camera path, parent
entry U gives R=U−236 and CRT pre/post-call Q=U−276. Q+44 is NAME(U−60), Q+48
is MODE1. Both host and source guards previously had these words reversed;
the corrected tests reject that reversal, including when no CRT record exists.
The V6 missing-record test now proves it passes the real source caller guard.

The observed external CRT return equals the actual singleton for this run.
Only that EAX is supplied at the typed external boundary. Five actual CRT
arguments, raw context, thread/clock/caller identity, scoped activation and
return are independently verified. The static PE import identifies
MSVCR120!__RTDynamicCast; this does not separately identify the resolved runtime
DLL version or reconstruct the wrapper's private SEH/CRT scratch.

## Viewport tree and semantic comparison

The candidate application map is observed only after the owned-thread singleton
preflight, at parent entry, after cameras and after world effects. The optional
graph walks actual parent/child pointers, checks count/backlinks, head min/max,
key order, string capacity/length and NUL, and records 100-byte normal nodes
plus heap key length+1. It preserves default V1 behavior when absent.

`tools/lib/native-parent-viewport-map.mjs` compares only original-entry storage
actually traversed by the source lookup after its authenticated cast. This run's
source formatter uses `0 Player`; its lookup visits two of three nodes, one
with a 17-byte heap string span. The map header8B, sentinel16B, two nodes100B
each and key17B total241 declared bytes; eight were already covered, so the
semantic ledger grows by233 unique bytes. The other node and whole readable
heap transport are not added as comparison domains. Source-carried viewport
scale output matches, and changing its result byte makes comparison fail.
Those map bytes happen to be unchanged across this particular native update;
this is not evidence of a native scale change or every viewport mode. The
independent audit rehashes5,058 blobs/contexts and repeats fresh source execution:
`analysis/native-parent-rtti-stock-independent-audit-v2-20261024.json`.

## Camera collision-query correction

The actual camera path reaches 417d70→47d040. The parent adapter now uses the
existing explicit recovery clone view for this query: module clone70f130 is
not a physical arena registration. This changes no query result or source input.

That path exposed an eager vehicle-controller read in
`src/raw-model-sphere-query.mjs`. Original423ad3..423af8 performs it only when
the body's low nine type bits equal3. Nonvehicle camera bodies must not read
body+6bc or its controller. The source now follows that original type gate;
a genuinely reached vehicle NULL controller still fails. Sparse regression
removes both NULL storage and the extended controller DWORD, and48 retained
instruction cases compare complete non-stack memory. Evidence:
`analysis/scene/results/191-model-contact-query-assembly.json`,
`ev_47d50cd28b102f71ccb17669ffc0cc0319ce79b1a0a80e3c0a8231209495c589`.
The corrected source is included in the rebuilt Racing test bundle.

## Preserved limits and next boundary

The earlier V1 stock recording is retained. It proves the CRT pair, but its
root node's nil byte was not captured. Diagnostic replays retain the clone-view
failure, the subsequently exposed controller read and the genuine missing map
root input. V2 obtains that input from a new original entry, not an after-state
patch. No failed replay is reclassified as a full match.

After the V2 camera match, 496700→498030→40ab70 reaches a different CRT caller.
The camera-only adapter rejects it with the recovered-frame/type-token error.
Weather/world-effects remain unmatched, and `sourceComplete` and
`completeParentTickMatched` remain false. Further work must authenticate that
weather ABI and preserve all prior source-carried stages in the same recording.
The [weather RTTI plan](native-parent-weather-rtti-plan.md) derives its distinct
R=U−420/Q=U−460 caller, the missing source PUSH publications and a combined
same-process camera/weather observation window. Its forecast is not a native
weather result.

The stock171-file source/copy and the installed173-file state at resume are
unchanged in post-run hash checks. The installed state contains user-edited
pickup archives and backups; captures used the separately retained stock copy.
Reports: `analysis/native-parent-rtti-stock-installation-after-v2-20261024.json`
and `analysis/native-parent-rtti-installed-edits-after-v2-20261024.json`.

Validation: **112 focused tests pass with zero failures or skips** across17
files. The native camera regression verifies the exact positive checkpoint,
viewport corruption rejection and continued refusal of unobserved weather CRT
calls. This is focused coverage; no full-suite or complete-physics claim is made.
The rebuilt Edge viewer also passes camera-menu and edit-state regressions with
the retained stock archives. Initial runs against the now-edited installed
archives correctly could not identify a verified stock source; their failed
load reports are preserved separately.

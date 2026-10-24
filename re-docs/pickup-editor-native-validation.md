# Pickup editor: original-game export validation

Six isolated Rollcage Redux 1.3.8.0 runs pass on LEV1. Unchanged archives,
deleting every pickup, and a 16-pickup edit were each tested in LOW and HIGH
quality. The editor limit remains a conservative 16, not a recovered native
maximum. The other 16 supported levels have source/runtime and binary-format
coverage, not original-process captures.

| Export | Quality | Pickups | Snapshots | Completion | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Unchanged | LOW | 13 | 34 | 56.021 s | All 13 native placements |
| Unchanged | HIGH | 13 | 34 | 58.297 s | All 13 native placements |
| Edited | LOW | 16 | 44 | 76.309 s | All placements; index 15 collected and respawned |
| Edited | HIGH | 16 | 44 | 82.788 s | All placements; index 15 collected and respawned |
| Empty | LOW | 0 | 8 | 35.588 s | Zero authored/constructed pickups; original controllers initialized |
| Empty | HIGH | 0 | 8 | 35.567 s | Zero authored/constructed pickups; original controllers initialized |

Times include startup and debugger pauses; they do not measure native frame
rate. Every owned process was terminated and checked closed. No further native
capture is needed for this acceptance checkpoint.

## Evidence

The aggregate audit is
[`analysis/pickup-editor-native-acceptance-20261024.json`](../analysis/pickup-editor-native-acceptance-20261024.json),
reproduced by `node analysis/audit-pickup-editor-native-acceptance-20261024.mjs`
with a new output filename if rerun. It pins the six strict reports, trace
hashes, configuration hashes and immutable observer. The observer source is
retained in `analysis/pickup-editor-native-helper-20261024-v2/`:

- Target executable SHA256:
  `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
- Dedicated observer SHA256:
  `e7b78b3530684a4a11d5ca6f130ab0b776c7c2f2d5c928cc2b3f36da1cd5b448`.
- Immutable ancestor SHA256:
  `a77e6894a235316f0f65274b5b262370e921ea0211196bdf4804c1c98b0773e9`.
- Editor-generated fixture project SHA256:
  `72993e902384717274677235c81c1ef77fe17ea3d957ecaec6aafaaa2fa72172`.

`tools/prepare-native-pickup-editor-validation.mjs` creates exclusive isolated
installations from a verified pristine copy. The edited project keeps all 13
original templates, moves original 0 by one X unit, and appends three clones.
Added index 15 uses template 2 at original pickup 4's coordinate
`[2182, -3, 2326]`. Both qualities are compiled by the same editor/compiler and
archive writer used by the viewer export. All unknown template bytes survive.

The aggregate post-run audit checks 1,368 file contents and exact directory
censuses: 171 original installed files, 171 pristine copied files and 171 files
in each of six case installations. All match their declared hashes. Only the
two intended archive files differ in edited/empty installations. Original game
files and the pristine baseline remain unchanged.

An independent audit rehashes all 5,792 native blobs and contexts across 172
accepted snapshots, including the target pickup's actual before/after objects:
`analysis/pickup-editor-native-six-cases-independent-audit-20261024-v2.json`.
The final focused suite passes 67 tests with no failures or skips, covering the
compiler, archive writer, editor interactions, picking, ZIP, viewer integration,
capacity arithmetic and native validation guards.

## What the observations establish

The independent checker `tools/check-native-pickup-editor-validation.mjs`
checks actual owned main-thread events, full 716-byte contexts, stopped-thread
FS/SEH identity, blob hashes and exact caller/stack lineage. It verifies:

- The actual `44c2b0` loader argument requests the intended level and quality.
- A 40-byte stable GFXM header identity and exact authored `12 × count` bytes,
  with their live pointer resolving to the compiled relative table offset.
- `47b580` initialization and its controller tail return, original count,
  registry delta, all pickup/controller body types, allocation bounds and
  registry backlinks. The initialized 24-byte pending queue is retained.
- Every initial full `47caf0` placement through its `47cc17` pre-RET boundary:
  authored signed coordinates expanded to Q16, original metadata, spatial
  attachment and actual state `83000c`.
- For added index 15, the actual collector EBP/ESI objects and unchanged frame
  across `47b8d0`/`47b8da`, observing the original `820064` collection write;
  then the same pickup body's later complete native respawn.

LOW index 15 was placed at native clock 780, collected at 1006 and respawned at
1181. HIGH was placed at 751, collected at 1034 and respawned at 1372. No car
position, simulation timing, RNG, collection or respawn result was forced.
The collection boundary precedes weighted award execution, so these captures
do not independently establish every weapon award or combat effect.

The dedicated runner permits only the reviewed startup/graphics inputs and two
guarded frontend track/quality input bytes at `43e0c5`. Native mode, option,
scene construction and lifecycle outputs remain original. Personal folders and
temporary files are redirected; registry writes, child launches and the player
mailslot are denied. Each run has a 90-second bound and an 80-snapshot limit.
This pickup-only observer does not resume the paused physics reconstruction.

## Retained failures and boundaries

The first LOW baseline capture reached 90 seconds and remains rejected. The V1
observer incorrectly waited for race phase 4, missing the first six pickup
finalizer calls during the original countdown. V2 removes that observation
filter; a fresh recording proves all placements from native clock 0 onward.
The failed capture was neither overwritten nor reclassified as a pass.

The first zero-LOW checker report also remains rejected. Its generic queue
check incorrectly required inactive queue bytes to be initialized before the
constructor executed. Raw entry bytes are BSS zero; the actual return and first
tick have all 24 bytes `FF` and pending count zero. The corrected checker
distinguishes entry from initialized snapshots and passes the same unchanged
native recording. Regression tests retain both valid and invalid cases.

Loaded identity is not a whole-resource hash: original loading relocates
pointers and mutates resource fields. The exported resource file hash is
verified separately; the in-process proof covers the stable identity, exact
authored table, native bodies and lifecycle. Full physics, long-race parity and
native runs of every editable level remain outside this export checkpoint.

# Captured surface and weapon drive feedback

`tools/lib/native-frame-drive-continuation.mjs` executes the existing source
ports in recovered450e50 order: each participant443d90 motion/timer producer
followed by48d680 surface drive; the original499de0 procedural gate; genuine
49ac30 wormhole update; the **complete**48d7c0 weapon coordinator; then genuine
469fd0 periodic update. It does not extract or substitute decay arithmetic.
The direct callees share the observed native entry ESP. Caller return words
are published with the observed module base; weapon-stage incomingEDI is the
actual completed participant-loop count, rather than an arbitrary fixture.
Private-stack equivalence of every descendant remains outside this proof.

Retained293/295/310/3201 are checked against target SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
They prove450e50's451038/45103f participant calls,451088/45108d/451092/451097
intervening sequence, both surface gains, and the five genuine coordinator
children. Their evidence IDs are included in each report. Existing source
algorithms and the browser racing session were not modified for this binding.

## Original-process result

[The retained v1 sequence](../analysis/native-frame-drive-sequence-v1-20261023/report.json)
passes three frames at native clocks288–290: **4,902,122 semantic bytes per
physics frame**, with zero mismatch. The captured selection isHIGH/LEV3,
native vehicle selectors6,5,4,1,0,2, all six controller modes8. Identity comes
from captured session/configuration producers, not the recording filename.

Both transitions protect192 complete bytes: the existing144 motion/timer/glyph
bytes plus each car's complete6a8/6ac drive words, including unchanged bytes.
All384 protected comparison bytes match. Genuine source execution replaces
66+60=126 formerly supplied changed bytes. The other211,903 external patch
bytes and8,200 caller-ABI refresh bytes remain explicit inputs. Each physics
exit is checked before continuation; every protected output is checked before
patches and excluded from their footprint. Corrupted source outputs therefore
cannot be repaired by captured answers. This remains a selected continuation,
not a closed source-only racing trajectory or a full450e50 comparison.

Actual gates and reached-state limits in both transitions:

- Procedural rendering is configured on, but the captured wormhole mode is0,
  so the original499de0 gate does not call it. Genuine49ac30 runs its mode0
  return. Active wormhole/texture behavior is not established by this recording.
- Genuine48d7c0 runs its pickup, projectile, terrain-wave, time-effect and
  target stages. There are12 pickups and3 pickup controllers. All24 projectile
  slots are inactive; terrain-wave and time-effect states are0, and no contact
  color owner is active. Pickup matrices/timers and launch ages are populated.
- The target registry has9 rows, with12 model targets. The128-byte registry
  capture is an **observation bound**, not a proven native capacity; replay
  requires the actual count to fit. Its producers append without a recovered
  capacity guard. The separately observed controller/pending block is likewise
  a bounded observation, with the actual controller count checked before use.
- The periodic stage is genuinely called and enabled. Its age and retired
  clock are0; clock288/289 is below its600-tick spawn gate, so no random spawn
  is claimed. A synthetic focused test separately exercises this same gate.
- Five launch states are1, with source post-call ages68–72 across the two
  transitions. The original recording does not exercise age expiry or weapon
  firing; constructed tests cover the actual expiry/break/minimum behavior.

The new profile was captured by the primary agent. This tool only reads the
saved blobs and never launches the original game, a browser or a GUI.

## Why the overwrite counters are110 and118

[The compact carried-write audit](../analysis/native-frame-drive-produced-write-audit-v3-20261023.json)
reexecutes the same source sequence, validates the retained report hash and
capture hashes, and exactly reconstructs the original patch counters. Earlier
audit versions remain retained. These counters compare source prefix output
with the **earlier physics exit**, so a source-produced byte can already equal
the following native entry while still being counted by a later patch.

| Source field/storage | Transition1 | Transition2 | Already equals next entry? |
| --- | ---: | ---: | --- |
| Pickup matrices | 98 | 105 | Yes, every byte |
| Pickup timer | 1 | 1 | Yes |
| Pickup-controller timers | 2 | 2 | Yes |
| Vehicle launch ages | 5 | 5 | Yes |
| Shared square-root scratch91d45c..91d463 | 4 | 4 | No; later native producers remain supplied |
| Other carried observation byte | 0 | 1 | Yes; already different before this continuation |
| Total | 110 | 118 | 106 /114 already match |

The last byte is actual address394478581: native physics exit observes1,
carried source already contains0 before the second continuation, and the next
native entry is0. It lies outside the declared physics semantic comparisons;
the audit does not attribute it to the coordinator. All declared physics and
protected output comparisons pass, but this is explicitly **not** an
entire-observed-heap equality claim. Actual heap identities are preserved;
they are not rebased as if they were module literals.

The only four bytes per transition needing a different later value are shared
square-root scratch. Counts are retained honestly; no source writes are
discarded to make them zero, and no broader parent match is inferred.

## Input coverage and earlier failures

The helper exports `nativeFrameDriveInputRegions`, the fixed source-known
module observations used by the new capture profile. It admits only bytes
actually covered by the carried observation. Compatible overlapping and
adjacent module aliases merge using the single observed module base; conflicting
translations, heap shadows, unavailable data and changed alias maps fail.
Geometry and physics views are rebound over carried source bytes after this
merge, without constructors, pool initialization, static-table seeding or
next-entry answers. The original angle table is captured as4096 signed-short
phase pairs. Reached missing allocations, services or feature state remain
errors, with the genuine executed prefix retained in failure reports.

The old narrower windows correctly remain failures at actual module root
80b5e0, before a wormhole mode can be read:

- [Initial window](../analysis/native-frame-drive-sequence-three-missing-inputs-20261023/report.json)
- [Moving window](../analysis/native-frame-drive-sequence-moving-missing-inputs-20261023/report.json)
- [Contact window](../analysis/native-frame-drive-sequence-turn-missing-inputs-20261023/report.json)

These failures were not relabeled as inactive gates. Existing motion-only
reports, default sequence behavior and all old retained evidence are preserved.

## Verification

```powershell
node --test tests/native-frame-drive-continuation.test.mjs tests/native-frame-motion-continuation.test.mjs tests/native-frame-sequence.test.mjs
node tools/check-native-frame-drive-sequence.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY
node tools/audit-native-drive-continuation.mjs MATCHING_REPORT_FILE NEW_AUDIT_FILE
```

The combined focused suite passes23 tests. It includes the original moving
three-frame regression, unchanged old-capture rejection, exact captured-input
aliasing, constructed complete-coordinator/expiry behavior, and the existing
changed/unchanged protected-output corruption checks. Reports are written
exclusively to new paths; no captured or installed file is overwritten.

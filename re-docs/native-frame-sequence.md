# Carried native physics frame sequences

`tools/lib/native-frame-sequence.mjs` replays consecutive original-process
`4749e0` entries through the `474b1e` pre-RET boundary. Pairing verifies the
same-thread, same-ESP caller at `451012`, returning to `451017`, with the
captured active session phase 4 and numerical context. See the
[frame replay plan](native-physics-frame-replay-plan.md) and
[native geometry binding](native-frame-geometry.md).

The first entry seeds source memory. Each source result is compared exactly
with its native exit **before** any subsequent input is supplied. All declared
non-ABI semantic regions and the return value are compared; read-only regions
also require native entry/exit invariance. The next frame is rebuilt from
carried source bytes, preserving unchanged bytes even when source diverges.
Views, aliases, geometry and participant bindings are recreated from those
source bytes so live pointer changes are observed.

This is carried physics with observed external producers supplied. Between
frames, only bytes that actually differ between native exit(i) and native
entry(i+1) are patched, except for separately declared caller ABI refreshes.
Those changes may include AI, input, post-physics, rendering and service
producers; byte differences alone do not identify their individual authors.
Next-entry registers are supplied explicitly, and the declared 4,100-byte
stack/return observation is refreshed separately. The report counts observed
changes, applied external bytes, changed source bytes and overwritten source
divergence independently. An immediate failed comparison remains failed even
if an external producer later overwrites that byte.

## Coverage policies

The default `strict` policy requires identical named regions, normalized
coverage, root descriptors and resolved roots throughout the sequence.
The retained first attempt in
[native-frame-sequence-initial-20261022](../analysis/native-frame-sequence-initial-20261022/report.json)
failed this check because particle free-list movement changed the redundant
`VirtualQueryEx` readable-region descriptors.

The explicit `initial-observation` policy preserves the **full normalized
union of the first entry**, not an intersection of later observations. Every
later entry and exit must cover every initial byte. Readable-region boundaries
may move inside overlapping observations; named root descriptors, fixed-region
identities, module base and thread identity remain checked. Every observed
`requestedResolvedRoot` is reported, including mutable particle free-list heads.
Later surplus bytes are reported by address, length and hash but never admitted
to source memory. Required semantic spans and all reached source accesses must
remain inside the original footprint; a newly reached pointer outside it fails.
This footprint is an observation window, not a native logical-allocation
capacity or an entire-process-heap claim.

## Compact patch ledger

Schema 2 uses `relative-runs-v1`: containing ranges of at most 64 KiB hold one set
of native-exit, next-native-entry and source hashes, plus separate `externalRuns`
and `abiRuns` arrays of `[relativeOffset, byteLength]`. Region identities and
hashes are stored once per containing range. Actual patch bytes come from the
retained native snapshots; at most eight short samples are included per
transition. Existing larger schema 1 evidence is preserved.

`expandNativeFramePatchRuns` recovers exact changed addresses and lengths.
`applyNativeFrameSequenceTransition` verifies hashes, bounds, overlap,
changed-byte completeness inside each containing range, ABI classification and
all divergence/change counters before writing anything. Tests independently
reconstruct the patched image, preserve accumulating drift, check dense
one-byte changes across 64 KiB boundaries and reject corrupted ledgers without
partial writes.

## Original-process results, 2026-10-22

All three windows pass with `initial-observation`; each window independently
seeds its first frame. These are three carried three-frame windows, not a
continuous nine-frame trajectory.

| Captured selection clocks | Semantic regions/frame | Compared bytes/frame | External patch bytes, transition1 /2 | Relative external runs, transition1 /2 | Retained report |
| --- | ---: | ---: | ---: | ---: | --- |
| 228–230 | 163 | 4,885,396 | 191,587 / 192,765 | 62,301 / 63,512 | [Initial window](../analysis/native-frame-sequence-three-compact-20261022/report.json) |
| 288–290 | 208 | 4,880,872 | 202,136 / 200,166 | 75,573 / 77,126 | [Moving vehicles](../analysis/native-frame-sequence-moving-union-20261022/report.json) |
| 348–350 | 208 | 4,880,872 | 39,230 / 43,046 | 11,576 / 13,970 | [Terrain-contact window](../analysis/native-frame-sequence-turn-compact-20261022/report.json) |

Every window has zero semantic/return divergence, zero overwritten source
divergence bytes in external patches, zero surplus bytes, and 8,200 separately
refreshed ABI bytes over its two transitions. Comparison scope matches the
independent-frame checker exactly for each recording; geometry ledgers differ
between windows. These results establish the declared frame scope for the
observed states, not closed source AI/input production or wall-clock cadence.

## Verification

```powershell
node --test tests/native-frame-sequence.test.mjs tests/native-frame-replay.test.mjs tests/native-frame-manifest.test.mjs tests/native-frame-geometry.test.mjs
node tools/check-native-frame-sequence.mjs analysis/native-physics-local/startup-20261022/hidden-turn-frames-capture NEW_OUTPUT_DIRECTORY initial-observation
```

The focused suite passes 33 tests, including 12 sequence tests. The checker only
reads an existing capture and writes a new exclusive output directory; it never
launches the original game. Capture blobs and installed game files stay
read-only.

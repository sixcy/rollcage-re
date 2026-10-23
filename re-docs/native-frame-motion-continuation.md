# Selected motion-state producer between native physics frames

The opt-in continuation executes the existing `443d90` speed/timer producer
from carried source physics output. All six participants match the following
original-process physics entry in the three retained windows. This replaces
353 captured changed bytes with genuine source execution; the remaining race,
input, rendering, service and caller-ABI producers are still supplied inputs.

`tools/lib/native-frame-motion-continuation.mjs` verifies retained assembly293
(`ev_46d22bb690247378da4f778dc7ea56d10aafe43ef53e5bf7d3f0e5974134e7fe`)
and caller310
(`ev_d15324804cfcb1308ec6f86f28c7350a908d9cee745a7616dd8619f94cd3053f`)
against target SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
The recovered order is physics `451012`, attachments `451017`, recovery
`45101c`, then the participant `443d90`/`48d680` sweep at `451038`/`45103f`.
The selected producer uses the same direct-callee entry ESP as physics and
publishes relocated return `45103d`. `443d90` restores its three saves before
tail-jumping `4459f0`, so the formatter shares that ESP. This verifies output
production and known caller publication, not complete private-stack/register
equivalence. Attachments and recovery are not executed by this continuation;
states whose effects invalidate the selected outputs fail their comparison.

Each transition declares 30 complete output spans before running the producer:
body `664..66b`, and participant-record DWORDs `2c`, `34`, `3c`, `44`, for each
of six participants: 144 bytes. The sequence checks every produced byte against
the next native entry **before any captured patch**, including unchanged bytes.
The complete owned spans are removed from the external-patch footprint and
cannot overlap an ABI refresh. Ledger reconstruction validates their produced
and expected hashes and mismatch counters, and rejects an external/ABI write
into them. A failed producer comparison remains failed and its divergent bytes
carry into the next physics frame. Earlier physics failures also remain failed.
Default sequence behavior and schema2 remain unchanged; opt-in reports use
schema3 and retain the other external-producer and ABI policies.

| Native clocks | Proven selected resource / native car selectors | Source-owned bytes checked | Changed bytes replaced | Remaining external patch bytes | New report |
| --- | --- | ---: | ---: | ---: | --- |
| 228–230 | HIGH/LEV3 / 6,3,5,0,4,1 | 288 | 102 + 41 | 384,209 | [Initial window](../analysis/native-frame-motion-sequence-three-20261023/report.json) |
| 288–290 | HIGH/LEV2 / 6,0,5,2,4,3 | 288 | 53 + 57 | 402,192 | [Moving window](../analysis/native-frame-motion-sequence-moving-20261023/report.json) |
| 348–350 | HIGH/LEV2 / 6,4,0,2,1,3 | 288 | 49 + 51 | 82,176 | [Contact window](../analysis/native-frame-motion-sequence-turn-20261023/report.json) |

All nine physics frames and six selected producer comparisons pass, with zero
owned-output mismatch. The windows remain independently seeded recordings.
Each retains 8,200 ABI refresh bytes. The historical patch counter named
`overwrittenSourceDivergenceBytes` is now 4/2, 4/4 and 4/4 respectively: genuine
`443d90` execution changes shared square-root scratch `91d45c..91d463`, and
later supplied native producers write that scratch again. The preceding full
physics comparisons pass, and owned outputs cannot be overwritten. These
counts are preserved, not suppressed; a counted patch may already equal its
next-native byte and therefore need no byte change. The audit lists exact
scratch addresses and that distinction.

## What the large remaining patches represent

[The immutable producer audit](../analysis/native-frame-producer-audit-v2-20261023.json)
hash-verifies original capture blobs and baseline reports, records source
hashes, and reconstructs every changed-byte run. It separates proven storage
membership from writer attribution. The first audit file is retained; v2 also
lists scratch patches that already equal the produced value.

| Baseline window | Other used body-arena bytes changed | Inline vehicle effect storage | Particle storage | Observation-only bytes |
| --- | ---: | ---: | ---: | ---: |
| 228–230 | 193,167 | 44,342 | 8,097 | 131,626 |
| 288–290 | 238,665 | 43,013 | 27,691 | 85,709 |
| 348–350 | 26,160 | 22,900 | 16,462 | 9,544 |

These categories are disjoint storage classes, not four identified producers.
Constructor481100 (retained2553,
`ev_88b898cc65970e7805a5785092f1afe8574f2268e88a60993ce2f64de3d8905d`)
owns the inline effect block at body+728 through +2963. Its large changed
interior is not evidence of AI or force changes. Other used arena storage
includes native body/render allocations; its individual writers remain open.
Particle/debris storage is established by the actual4357c0/4758d0 producers,
not inferred from a broad `VirtualQueryEx` region label.

The changed geometry bytes in the moving/contact windows lie at offsets8/9
and10/11 of native12-byte spatial nodes: body and particle list heads. This
supports spatial-list membership changes, not a terrain-vertex deformation
claim. Exact intervening insertion/removal authors still need their stage
boundaries. Captured broad heap regions can also contain rendering, timers or
asynchronous audio; offsets alone do not identify those services. These old
recordings lack a complete manager/source/worker lineage for that attribution.

The recovered450e50 order provides the next integration map: after physics,
wheel rendering, linked animation/lights, particles/debris, ground projection,
histories and other world stages run before clocks advance; the following call
then runs410220 AI,431750 route control, audio/input, handling conversion and
world/progress stages before4749e0. Their current source modules exist, but
connecting their actual input roots, callbacks and shared stacks remains work.
The clock increment at4511f3 and caller stack/register refresh are separate
from AI production and from host wall-clock cadence.

An independent candidate probe deliberately keeps a useful failure: running
48d680 alone does **not** reproduce next-entry front drive6a8 in any of the six
transitions. Later48d7c0 also decays/clamps6a8/6ac. Its patch cannot safely be
removed using only the earlier surface stage. The next useful increment is a
connected, observed48d680→48d7c0 drive-production slice, followed by the full
AI/input-to-handling chain; neither is claimed here.

The subsequent [drive continuation](native-frame-drive-continuation.md) now
validates that selected drive slice in a fresh original three-frame capture.
Its broader192-byte protected output per transition includes the motion
outputs described here. The original motion-only scope and reports above
remain unchanged; the complete AI/input-to-handling chain remains open.

## Verification

```powershell
node --test tests/native-frame-motion-continuation.test.mjs tests/native-frame-sequence.test.mjs
node tools/check-native-frame-motion-sequence.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY initial-observation
node tools/audit-native-frame-producers.mjs NEW_AUDIT_FILE
```

The focused suite passes17 tests. It includes retained active-state execution,
preserved default behavior, ledger reconstruction, and deliberately corrupted
changed **and unchanged** producer outputs. The tools read existing captures
and write only new exclusive reports. No original game, browser or GUI was
launched, and installed files and historical reports were untouched.

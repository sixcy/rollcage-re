# Pickup editor source validation

`tools/validate-pickup-editor.mjs NEW_REPORT_JSON` checks all 17 supported
original Rollcage levels in both LOW and HIGH quality. Levels 15, 16 and 17
remain outside the editor scope. Installed archives are opened read-only.

Each original resource first passes an unchanged compilation byte comparison.
The capacity fixture repeats original same-track template references until it
contains 16 pickups and changes all three signed source coordinates of the first
pickup by one unit, staying inside i16 bounds. This deliberately duplicates some
locations; it is a capacity fixture rather than a proposed level design. The
compiler preserves each selected original record's bytes 6..11, the original
resource prefix outside DWORD90h/BYTE94h, and packed adjacent header bytes95..97.
LOW/HIGH original pickup counts and XYZ must agree, while each quality retains
its own original record metadata.

The modified resource runs through `createSession` with the stock six vehicle
types, Expert difficulty and weapons enabled for 600 complete updates. A second
case deletes every pickup and runs 120 updates. Authored runtime pickup positions
and counts are compared with the compiled table at every snapshot. Car and
weapon positions must remain finite. The original resource, compiled resource,
and textures are hashed again after disposal to detect mutation. The report
also checks source-file hashes across the complete matrix.

An optional read-only `onDebugFrame` diagnostic in `solo-session.mjs` exposes a
frozen body-arena summary, pending count, a copied frozen array of 24 queue
bytes, and the independently authored controller count. It adds no public
snapshot field or gameplay callback. The matrix checks:

- Arena alignment, actual cursor plus alignment displacement within the
  allocation `(DWORD709808 + 140000) << 5` made by474160.
- Global body registration count at6e6b44 no greater than512, distinct from
  both pickup and controller counts.
- Pending indices inside the compiled table and pending count no greater
  than the initialized 24-byte queue storage.
- All16 constructor countdowns naturally transition from pickup state2 to
  pending state4 in the first complete update.

The last check describes 16 individual enqueues, rather than claiming a sampled
queue count of16: the genuine controller update can consume entries before the
next diagnostic stage.

`tests/pickup-editor-capacity.test.mjs` independently checks retained original
instructions from the exact Redux target SHA
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
Evidence3287 has byte controller count at auxiliary+f7, MOVDQU16 at4319ce to
91d498, MOVQ8 at4319dc to91d4a8 and the separate WORD pending count91d4b0.
Evidence3209 has the unbounded pending-byte store47b880 and WORD increment47b886.
Thus16 is a deliberate conservative **editor** limit, not a claimed native
format maximum or a native queue-bound check. The nearby controller pointer
table and the global512-body registry are separate structures.

Constructed source/instruction comparisons execute the real47b680 updater,
including432680, with 16 countdowns and separately with zero pickups. A clearly
synthetic zero-controller subdomain isolates the enqueue branch without
replacing a game child. All mapped bytes at10000h and above match retained x86;
the private stack is excluded. A separate source/instruction comparison runs
431950 with zero authored controllers and compares its actual queue initialization.
These fixtures do not claim original constructor or runtime provenance.

The matrix report is `analysis/pickup-editor-source-matrix-20261024.json`, with a
per-case JSONL journal. Collection and respawn totals are observed natural
snapshot transitions in edited source fixtures; intra-update events can be
missed. This is bounded reconstructed-source robustness, not original-process
export, collection, respawn, combat or full physics fidelity. Separate
[original-process validation](pickup-editor-native-validation.md) now passes
unchanged, zero and16-pickup LEV1 exports in both graphics qualities.

The retained 24 October 2026 run passed **68/68 cases**, with no failures:
34 sixteen-pickup runs of600 updates and34 empty runs of120, totaling24,480
updates. It observed92 collection and356 respawn transitions, with sampled
pending-queue peak15 and registered-body peak284. Every sixteen-pickup run
observed all16 initial countdown-to-pending transitions. All arena/queue/registry
checks passed; original/edited/texture bytes and the declared source files
remained unchanged. Report SHA-256:
`e8ffaf3945df6fc4183f62b0056e3648a4fbc44f83f8c8160ea7cee2ffbb359b`.

Validation commands:

```text
node --test tests/pickup-editor-capacity.test.mjs tests/pickup-editor.test.mjs tests/archive-write.test.mjs
node tools/validate-pickup-editor.mjs analysis/pickup-editor-source-matrix-20261024.json
```

The focused suite passed20/20 with no skips. The optional installed-data observer
regression also compares otherwise identical source sessions with and without
the debug callback and proves equal simulation snapshots plus immutable copied
diagnostic storage.

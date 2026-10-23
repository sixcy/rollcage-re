# Post-audio native input coverage

The v3 original control-prefix capture completed all six `485300` vehicle
audio calls, then failed at the first `42a6e0` input pass. Its required packet
header byte was not captured: actual `009c7edd` at module base `006e0000`,
preferred `006e7edd`. This is a missing native input, not permission to skip
the read because the participant also has mode8.

All six native bodies have mode8, null replay controllers at `660`, and
`724` pointers to actual `6e7edc + index*67c` packet storage. None of those
six twelve-byte buffers exists in the v3 retained coverage. Networking is
disabled (`6eafe0=0`), so no replay/device polling or preset chat branch is
demonstrated by this scenario.

The frozen descriptor audit exports `nativeControlInputPacketRegions` from
`tools/lib/native-frame-control-continuation.mjs`, included unchanged in the
capture preparer's common input list:

| Preferred address, with participant stride `67c` | Exact observation |
| --- | --- |
| `6e7edc`, six participants |12-byte produced input packet |
| `6e7880`, six participants |4-byte availability field |
| `6e78b0`, six participants |8-byte current sampled input |
| `6e7ac4`, only indices0..3 |8-byte local sampled input |
| `6e7bd8`, six participants |64 native12-byte stamped history records |
| `6e788c`, six peers |8-byte peer address |
| `6ea69c`, `5eb518` |4-byte history clock and sample-fallback flag |
| `6e65b0`, `6fb740` |4-byte analog-init flag and129 DWORD response entries |
| `5706a0` |16 WORD replay decode entries |

Original analog constants are observed with their retained widths:
`5dc684`4 bytes, `5dc730`4, `5dc890`8 and `5dc9d4`4. No initializer or
replacement table bytes are copied into the capture replay.

Retained461 proves the `67c` stride (`4712c0`), history step12 and limit64
(`47130a/30d`), and packet address (`471377`). Retained465 proves the packet
initialization's two repeated8-byte stores followed by a DWORD at offset8.
Retained467 proves the response-table start/end `6fb740..6fb944`.
All three records identify target SHA-256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
These are source access domains, not an invented whole-peer allocation size.

The descriptor list also covers the optional `42be80` preset-chat branch's
module inputs: actual sequence/interface/local-address roots, ten-byte address
default, twenty-byte socket template, three-byte separator, and four65-byte
notification-history slots. If that branch is reached, config nickname at
`+120`, presets at `+dce + id*64` and their native string terminators must be
captured through the actual configuration pointer; a nonnull interface needs
its real vtable/platform service. They are not fabricated here.

Future nonnull replay controllers require their actual `1e884`-byte layout,
matching `42aa80`'s six-slot constructor stride and last state DWORD at
`1e880`. No such heap controller is present in this native six-AI scenario.
The native replay lockout at `9020a0` is already covered by the existing image
observation.

[`native-frame-control-prefix-v3-input-audit-20261023/report.json`](../analysis/native-frame-control-prefix-v3-input-audit-20261023/report.json)
preserves the strict missing-byte failure after this audit. The independently
observed AI checkpoint still matches4,994,515 bytes, including720 protected
AI/control bytes. No input byte, controller, polling answer or network send
was synthesized to pass it. The next capture must observe actual packets.

```powershell
node --test tests/native-control-input-regions.test.mjs tests/vehicle-input-packets.test.mjs tests/native-frame-control-continuation.test.mjs tests/native-frame-control-prefix-comparison.test.mjs tests/vehicle-auxiliary-input.test.mjs tests/vehicle-auxiliary-input-native-address.test.mjs
```

These38 focused tests pass. Two new tests validate instruction-proven domains
and admit aliases only for genuinely captured full packet extents.

# Native frame scenario identity

`tools/lib/native-frame-identity.mjs` reads declared **actual native** session
and configuration addresses. It introduces no preferred-address aliases,
constructors or installed-asset dependencies. `inspectNativeFrameScenario`
includes its optional `identity` result when both spans are declared; smaller
fixtures without those spans remain supported.

## Proven field interpretation

Original `43b0e0` formats `high\lev%d` when configuration byte `+31` is exactly 1,
otherwise `low\lev%d`. The number is unsigned session byte `+579` plus 1.
Retained request `037-session-track-select.json`, Evidence
`ev_603df6d5b2e1f6f93ac382d4541a151e240aec77e4633b574e37d1429e34786e`,
establishes this producer. Native loader `47ea40` calls `4797a0` then `44c2b0`;
the latter creates the `.BLP` and `.BTP` names from its actual stem argument.
The identity helper therefore labels its resource paths as **producer-derived
native selections**, separately from direct filename or loaded-asset evidence.

Vehicle constructor `41dbb0` captures the model/type selector from session
`+1c+participantIndex`; its primary and animation models use distinct native
lookup tables. Scene request 134, Evidence
`ev_16e1c6a62e466500605b98333c96f4863f748728e8f58cd1708448cd6dd17a25`,
and [vehicle construction](vehicle-construction.md) establish that source.
All six selector bytes are retained, along with the active participant count.
The common chassis body kind 3 does not identify the selected vehicle model.

Session/configuration pointers, track index/quality, family/local bytes, six
vehicle selectors, participant mode/spawn bytes and session mode/phase are
compared before/after each native call. Changes are reported with both values;
they are not repaired. An optional explicitly declared observation of native
filename buffer `6e6660` is read with a bounded NUL terminator and compared to
the derived selection. No filename buffer is silently fetched through an
undeclared alias or guessed allocation.

All static evidence targets Redux SHA-256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

## Captured identities, 2026-10-22

[native-frame-identities-20261022.json](../analysis/native-frame-identities-20261022.json)
retains ten original entry/exit observations. The separate
[body-pair supplement](../analysis/native-frame-identity-body-pair-20261022.json)
adds one later selected frame without modifying that ledger. Every reported
identity field is stable through its physics call.

| Recording | First clock | Selected native resource stem | Vehicle types, participant order 0–5 | First physical-list count |
| --- | ---: | --- | --- | ---: |
| `hidden-three-frames-capture` | 228 | `HIGH/LEV3` | `[6,3,5,0,4,1]` | 19 |
| `hidden-moving-frames-capture` | 288 | `HIGH/LEV2` | `[6,0,5,2,4,3]` | 16 |
| `hidden-turn-frames-capture` | 348 | `HIGH/LEV2` | `[6,4,0,2,1,3]` | 15 |
| `hidden-selected-collision-capture` | 348 | `HIGH/LEV3` | `[6,2,5,3,1,4]` | 19 |
| `hidden-selected-body-pair-capture` | 359 | `HIGH/LEV5` | `[6,3,1,5,0,2]` | 14 |

The body-pair supplement observes all six vehicles moving. Its selection and
before/after identity were checked directly from retained session/configuration
bytes; the independent
[selected body-pair comparison](../analysis/physics-native-selected-body-pair-20261022/report.json)
owns the raw collision-record and complete-frame equality claims.

Quality byte `+31` is 1 in every recording. The lineups collectively include
all seven ordinary selectors 0–6. These bounded observations do not establish
every vehicle/scenario combination. Physical-list counts are live state, not
track fingerprints; the two `HIGH/LEV2` windows already have different counts.
Geometry comparison byte counts likewise must not be used to infer identity.

The current frame observations do not explicitly declare filename `6e6660`.
An independently checked immutable installed-BLP fingerprint remains separate
work; neither the capture directory name nor attract mode establishes the
loaded authored resource. No display track names or player-facing car names
are inferred here.

## Metadata for controlled captures

Keep requested selections separate from observed selections. Retain the actual
post-producer session `+579`, configuration `+31`, session `+1c..21`, participant
modes/spawn indices, mode/phase, module/thread identity and selection clock.
The new scenario result supplies these observed fields without capture writes.
Record RNG seeds and declared startup interventions alongside them when
comparing repeat runs.

For direct filename-to-loader corroboration, a future read-only observation can
retain `6e6660`, loader filename buffers `90b920`/`90b8c0`, and the actual ECX
stem at `44c2b0` entry, with explicit address/length/terminator bounds. Match
those strings to resource hashes or relocation-aware invariant fields of the
actual loaded GFXM before claiming an installed-asset fingerprint.

```powershell
node --test tests/native-frame-identity.test.mjs tests/native-frame-scenario.test.mjs
```

Eight tests pass, including synthetic exact-quality branching, unsigned track
selection, optional filename mismatch, missing storage, changed selectors and
all ten retained original entry/exit identity pairs. This audit did not launch
the original game or modify installed files.

# Version5 integration validation

`tools/validate-editor-v5.mjs` compiles the delivery features together in the same resources, rather than validating isolated edits. The retained final matrix is `analysis/editor-v5-combined-matrix-20261025-v2.json`.

All 20 levels / 40 LOW/HIGH resources passed:

- Full version5 no-edit drafts preserve geometry and texture bytes, including opaque route header metadata.
- Version2/3 no-edit projects containing the older ordinary-only model inventory regain absent script-owned rows; version2–4 compiled geometry and texture remain byte-identical. Eligible version1 pickup source/hash pairs validate as well. Version1 never supported LEV15.
- A route point is inserted and an unblocked group cloned, with explicit reachable entry/exit connections. Serialized group/point links and spatial fallback references remain readable; original model references remain in every affected lookup sequence.
- A checkpoint is inserted and made the finish, except LEV12/13 where the native hardcoded-stage restriction is retained. Starting-slot positions stay unchanged. Packed plane IDs, logical orders and progress remain consistent in both qualities.
- A supported same-track destructible assembly is duplicated; paired member indices, configuration mappings and attachments match.
- Every available original arrow pattern is placed at 0/90/180/270 degrees on distinct, fully covered terrain cells. LEV8/16/17/18/19 have no available paired original arrow pattern and are reported explicitly.
- Version5 JSON round-trip compiles to the same paired output. Geometry and texture source hashes remain unchanged.
- Each of the 36 supported LOW/HIGH racing variants runs three reconstructed cars for 90 ticks, with checks at ticks30 and90. LEV16/17 remain available for editing and parsing; Racing test stays disabled there.

These are source/corpus checks and short reconstructed runtime checks. They do not establish original-process or full-race parity. Original-game captures are tracked separately by the delivery owner.

## Legacy migration and atomic application

`tests/track-editor-migration.test.mjs` invokes the actual `TrackEditor.restoreProject` method through a minimal DOM/editor harness. Six regression tests cover version1–4 no-edit identity, changed pickups and terrain, sparse version4 route/checkpoint/start edits, version5 save/reload, and rejection of hash, coordinate and HIGH-quality failures without changing visible drafts or history.

The review found and fixed a concrete migration error: a valid version4 project could move a route point relative to newly edited terrain, pass the old paired compiler, then fail during stable-identity hydration against the original terrain. The previous restore order had already reset visible edits at that point. Restore now builds legacy stable identities without applying the raw-terrain movement check, compiles the final complete version5 state against its edited terrain in both qualities, and only then replaces visible state and caches. A separate final-staging failure test proves existing drafts and undo history survive a rejected migration.

The final topology browser checks use actual controls, save/reload and Test changes; see `tools/check-topology-editor-viewer.mjs` and the latest `analysis/topology-editor-browser-20261025-v4/report.json`. The earlier version5 relocation/export browser check is `analysis/race-layout-editor-v5-browser-20261025-v1/report.json`.

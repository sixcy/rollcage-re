# Tool entry points

Run Node.js tools from the repository root. There is no package install or build dependency for the reference tools. Browser checks use the separately installed Playwright/Edge launcher path passed as their first argument.

## Current editor delivery

- build-track-viewer.mjs regenerates docs/track-viewer.html and the embedded/static changelog from source.
- build-object-viewer.mjs regenerates docs/object-viewer.html. Rebuild both viewers after shared scene/export changes.
- check-editor.mjs NEW_DIRECTORY runs the focused source/editor/export/page regression group without launching a game.
- validate-terrain-editor.mjs NEW_REPORT.json [INSTALLATION] checks all 20 LOW/HIGH pairs, representative terrain/surface edits and reconstructed racing initialization.
- check-editor-workspaces.mjs PLAYWRIGHT_LAUNCHER NEW_DIRECTORY [INSTALLATION] checks all targets/libraries, workspace transitions and LEV16/17 static preview.
- check-terrain-editor-viewer.mjs PLAYWRIGHT_LAUNCHER NEW_DIRECTORY [INSTALLATION] checks actual brush/paint clicks, history, v3 project reload, ZIP export and edited race startup.
- audit-test-baseline.mjs NEW_REPORT.json [RETAINED_LOG] classifies a historical broad run without rerunning or overwriting its evidence.

Older feature-specific browser checkers retain assumptions about the sidebar layout at their original checkpoint. Use the two current editor browser entry points above for this delivery; do not treat a hidden control in an older checker as a native game regression. Historical reports remain untouched.

## Native terrain acceptance

Read [terrain editor evidence and limits](../re-docs/terrain-editor.md) before using the native tools. These launch a real game process and are announced separately; keep keyboard/mouse idle during an announced capture.

1. prepare-native-terrain-editor-validation.mjs NEW_DIRECTORY LOW|HIGH [PRISTINE_INSTALLATION] [LEVEL] creates an isolated, verified installation and edited fixture. Supported validation levels are 1, 16 and 17. Preparation itself does not launch the game.
2. native-terrain-editor-capture.ps1 -ConfigPath CASE_DIRECTORY/terrain-capture-config.json -Quiet launches the owned isolated process. It changes guarded startup/selection inputs and observes native loading. LEV1 additionally requires an actual edited-cell wheel contact.
3. check-native-terrain-editor-validation.mjs CASE_DIRECTORY NEW_REPORT.json independently checks raw capture integrity, resource spans, native loader names, contact scope, source-file integrity and process cleanup.

Use new directories/report names. Keep installed game files read-only. The native observer is separate from the paused general physics work; none of these acceptance cases proves complete-race parity.

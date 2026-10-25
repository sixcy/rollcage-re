# Current reconstruction and editor status

Updated 2026-10-25. Target: Rollcage Redux 1.3.8.0. This repository contains JavaScript reference implementations, asset tools and retained evidence. A standalone game rebuild remains unfinished. Historical percentage estimates had no measured denominator and are not current completion figures.

| Area | Available | Evidence and remaining work |
| --- | --- | --- |
| Assets | Rollcage LOW/HIGH, Stage II and Firebugs scenes; textured export and assembled Rollcage cars | Installed-data/browser checks; special contexts and original rendering remain partial |
| Racing test | 1–6 Expert cars, default 3; recovered AI/physics, weapons, pickups and recovery | Super experimental. LEV16/17 racing is unavailable. Continuous native-race equivalence is unproved |
| Physics | One recorded complete six-car update matches 5,107,238 distinct declared bytes and checked return/counter state | One case, not coverage of all scenarios or continuous races |
| Pickups | Add/move/delete, projects and game-file export | Six selected LEV1 native acceptance cases; other levels have separate coverage limits |
| Scenery and effects | Original ordinary/scripted/particle transforms, coherent groups/lights/paths; compatible plain imports/duplicate/delete | All 3846 inventoried originals have supported transforms subject to capacities. Selected native LOW/HIGH construction and actual added-model contacts pass; broader behavior is unproved |
| Race layout | Existing route positions/speed bytes, checkpoint planes and starting slots; group-preserving fallback rebuild | Forty variants pass wide relocation and 854 checkpoint-plane audits. Graph/count/order/lap flags stay authored; offline rebuild policy is explicit |
| Terrain editing | Height brushes, full surface presets, undo/redo, v4 projects and export on all 20 levels | Forty variants pass representative source checks; selected LEV1 native wheel contacts match exported planes; LEV16/17 native loading is checked separately |
| Audio/rendering/platform | Many recovered components | Complete operational integration remains unfinished |

## Development baseline

The retained broad run in analysis/scenery-editor-suite-20261024-v1.log recorded 2,787 passes and 52 failures out of 2,839 tests. The read-only classification in analysis/editor-inherited-failures-20261025-v1.json finds 34 vector-instruction admission failures, four native-global admission failures, five audio/recovery comparisons, seven capture/replay regressions and two generated-page checks. This is a classification of that historical run, not a rerun or a claim that every failure persists.

The focused editor group passed all 113 tests in analysis/editor-comprehensive-regressions-20261025-v2/report.json. The separate native observer-policy regression passed without launching the game. Source checks, real browser clicks, project reloads and ZIP resource comparisons are retained in analysis/terrain-editor-matrix-20261025-v1.json, analysis/terrain-editor-browser-20261025-v3/report.json and analysis/editor-workspaces-browser-20261025-v3/report.json. Broader combined authoring checks are in analysis/editor-combined-matrix-20261025-v2.json. Native acceptance and limits are linked from [terrain editor notes](terrain-editor.md) and [scenery/layout validation](scenery-editor-native-validation.md). Generated pages are checked against current sources. These focused results do not establish a green whole-repository suite.

Run `node tools/check-editor.mjs NEW_DIRECTORY` for focused checks and `node tools/audit-test-baseline.mjs NEW_REPORT.json` for retained failure classification. Broad sweeps must preserve historical output paths using isolated workspaces where needed.

[Editor delivery and evidence](editor-validation-matrix.md) · [Research index](README.md) · [Delivery history](../docs/changelog/index.html) · [Physics ledger](physics-fidelity.md) · [Native update checkpoint](native-parent-final-tick-checkpoint.md)

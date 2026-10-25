# Current reconstruction and editor status

Updated 2026-10-25. Target: Rollcage Redux 1.3.8.0. This repository contains JavaScript reference implementations, asset tools and retained evidence. A standalone game rebuild remains unfinished. Historical percentage estimates had no measured denominator and are not current completion figures.

| Area | Available | Evidence and remaining work |
| --- | --- | --- |
| Assets | Rollcage LOW/HIGH, Stage II and Firebugs scenes; textured export and assembled Rollcage cars | Installed-data/browser checks; special contexts and original rendering remain partial |
| Racing test | 1–6 Expert cars, default 3; recovered AI/physics, weapons, pickups and recovery | Super experimental. LEV16/17 racing is unavailable. Continuous native-race equivalence is unproved |
| Physics | One recorded complete six-car update matches 5,107,238 distinct declared bytes and checked return/counter state | One case, not coverage of all scenarios or continuous races |
| Pickups | Add/move/delete, projects and game-file export | Six selected LEV1 native acceptance cases; other levels have separate coverage limits |
| Scenery and effects | Original ordinary/scripted/particle transforms, coherent groups/lights/paths; compatible plain imports/duplicate/delete | All 3846 inventoried originals have supported transforms subject to capacities. Selected native LOW/HIGH construction and actual added-model contacts pass; broader behavior is unproved |
| Race layout | Route groups/points, deletion with branch repair, checkpoint topology/timing, starting slots and reversed drafts with saved repair reports | Forty-resource source checks and browser acceptance. Native reversed LEV2 LOW/HIGH records12 checkpoint transitions, finish/lap increment and timing feedback each; no complete backwards lap or natural recovery observed |
| Terrain editing | Height/surface brushes, four-cell arrows and new centreline spline roads with optional AI route; v6 projects/export on all20 levels | All40 central identities/combined edits pass. New LEV1 LOW/HIGH sector contacts match exported planes exactly. LEV12/13 executable-dependent sectors/stages are protected; LEV16/17 racing stays disabled |
| Audio/rendering/platform | Many recovered components | Complete operational integration remains unfinished |

## Development baseline

The retained broad run in analysis/scenery-editor-suite-20261024-v1.log recorded 2,787 passes and 52 failures out of 2,839 tests. The read-only classification in analysis/editor-inherited-failures-20261025-v1.json finds 34 vector-instruction admission failures, four native-global admission failures, five audio/recovery comparisons, seven capture/replay regressions and two generated-page checks. This is a classification of that historical run, not a rerun or a claim that every failure persists.

The latest focused editor group and current source/browser/native evidence are indexed in the [v6 acceptance matrix](editor-v6-validation-matrix.md). Earlier terrain, scenery and topology evidence remains retained in the preceding delivery notes. New static imports support proven native texture addressing above63; transparent-range, ownership and native-capacity limits remain explicit. Generated pages are checked against current sources. These focused results do not establish a green whole-repository suite.

Run `node tools/check-editor.mjs NEW_DIRECTORY` for focused checks and `node tools/audit-test-baseline.mjs NEW_REPORT.json` for retained failure classification. Broad sweeps must preserve historical output paths using isolated workspaces where needed.

[Editor delivery and evidence](editor-validation-matrix.md) · [Research index](README.md) · [Delivery history](../docs/changelog/index.html) · [Physics ledger](physics-fidelity.md) · [Native update checkpoint](native-parent-final-tick-checkpoint.md)

# Comprehensive editing of existing Rollcage tracks

The user requested continued implementation through completion on 2026-10-25. This checklist records the remaining work; an intermediate viewer release does not complete the larger objective. All 20 existing levels, including LEV16/17, are in scope. Existing game files and retained evidence remain read-only.

## Delivered baseline

- [x] Documentation/index cleanup, focused regression entry points and embedded dated viewer changelog.
- [x] Explore / Racing test / Track editor workspaces, all 20 editing targets and model libraries.
- [x] Terrain height brushes, seam handling, collision normal/spatial updates, undo/redo and cancellation.
- [x] Complete existing surface presets, eyedropper, paired LOW/HIGH compilation and combined v3 projects/export.
- [x] Selected native terrain contact checks on LEV1 LOW/HIGH and loading checks on LEV16/17 LOW/HIGH.

## Extended editor deliveries

- [x] Existing race layout: inspect/edit original route points, recovered route parameters, checkpoints and starting slots; preserve links, widths, IDs and unedited data. Recompute dependent references or reject unsupported changes. No fabricated paths on LEV16/17.
- [x] Viewer race-layout controls and overlays, numeric/pointer editing, history/cancellation, project migration and paired export integration.
- [x] Existing special objects: inspect constructor/group/attachment/animation dependencies, implement coherent operations with preserved behavior and collision lookup, and state precise operation-specific limits. Do not flatten animated/destructible objects into static substitutes.
- [x] Original-game scenery export acceptance: native placement, model/collision/spatial bytes, initialization and contact evidence where available. Distinguish loading from actual behavior.
- [x] Broader combined edits: terrain + surfaces + scenery + pickups + race layout, all-level source matrix, browser save/load/export/reopen workflow and rejection atomicity.
- [x] Keep active browser checkers compatible with workspaces and current project schemas; retain historical reports unchanged.
- [x] Final viewer delivery, per-feature evidence matrix, updated documentation and changelog. Leave incomplete requirements unchecked and describe unknowns honestly.

## Completion evidence

The scoped plan is implemented. The [validation matrix](editor-validation-matrix.md) records source, browser and original-process coverage separately; the [machine-readable summary](../analysis/editor-comprehensive-acceptance-20261025-v1.json) checks every listed positive report. Completion does not claim unrestricted object cloning, new topology, all original-game behavior or a complete game reconstruction.

## Boundaries

The editor modifies existing track topology and recovered records. Arbitrary new sectors/topology, Blender import and a complete C/C++ game reconstruction remain outside this plan. AI racing on LEV16/17 requires separate path evidence. Native capture is announced before launching the owned isolated game process and sequenced centrally; ordinary source/browser work does not require user inactivity.

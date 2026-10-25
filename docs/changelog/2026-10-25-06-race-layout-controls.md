# 2026-10-25 · Existing race layout controls

## Available now
- Track editor has Route points, Checkpoints and Starting grid tools with selectable wire markers and numeric controls.
- Existing positions, route speed bytes and checkpoint direction can be edited with undo/redo, focus, cancellation and paired LOW/HIGH validation.
- New version-4 projects save race layout together with terrain, surfaces, scenery and pickups. Earlier project versions remain readable.

## Validation and limits
- All forty source variants pass existing-record round trips and representative edits. Browser checks cover controls, project reload, export and edited race startup.
- Movement currently stays in the original native spatial cell/layer; checkpoints also stay in the original sector. Wider relocation is being investigated.
- Graph links, point counts, checkpoint order/progress and lap markers remain preserved. This does not add new racing paths.
- LEV16/17 editing includes their stored records; AI racing remains disabled pending separate verification.

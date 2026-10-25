# 2026-10-25 · Existing-track editor delivery complete

## Available now
- All 20 Rollcage levels have combined terrain, surface, pickup, existing race-layout and scenery/effect authoring workflows.
- Version-4 projects save these edits together and load older project versions without losing unchanged special objects.
- Camera controls remain stable while editing, linked drag previews reset correctly, and Focus synchronizes the camera menu.
- The implementation checklist and evidence matrix are linked from the research index.

## Validation and limits
- Focused editor regressions, all forty LOW/HIGH source variants, wide route relocation and combined authoring checks pass.
- Browser checks cover real controls, old projects, archive export/reopen, all AI counts and selected special-object paths/lights.
- Six additional native LOW/HIGH cases passed: scenery move/yaw/add/delete initialization, real added-model contacts, and combined special-object/race-layout initialization with all six car spawns.
- Native initialization and selected contacts are bounded evidence. Complete destruction effects, every scripted trajectory, full-track behavior and continuous race parity remain unproved.
- Existing topology and graph counts stay authored; Blender imports and arbitrary new sectors remain future work. Special-object rotation/copy/removal depend on supported ownership rules. LEV16/17 AI racing remains disabled.

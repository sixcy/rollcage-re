# 2026-10-25 · Native terrain checks and editor polish

## Available now
- The updated viewer includes terrain heights and surface painting, with projects and game-file export on all 20 levels.
- Workspace tabs and editor actions remain accessible while scrolling; export help is collapsible.
- Project loading keeps the selected tool active. Surface thumbnails use original LOW textures even while editing HIGH.

## Validation and limits
- Original Rollcage Redux loaded edited LEV16 and LEV17 resources in both LOW and HIGH, confirmed by native loader names and matching in-memory terrain bytes.
- Separate LEV1 LOW/HIGH captures recorded actual wheel contact with an edited cell. The native point lies on the exported plane and the returned normal matches.
- Browser checks cover all 40 variants, terrain and surface clicks, undo/redo, cancellation, project reload and independently checked game-file ZIP contents.
- LEV16/17 AI Racing test remains disabled. Loading acceptance does not establish usable paths or AI races there.
- These are selected native cases. Full-track contacts, continuous races, all grip behavior and native scenery export remain unverified.

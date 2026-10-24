# 2026-10-25 · Terrain height tools

## Available now
- Track editor has Raise, Lower, Smooth, Flatten and Set height brushes.
- Brushes follow connected grids and matched sector seams, with a live wire preview, cancellation and undo/redo.
- Height edits update LOW/HIGH together and regenerate touched collision planes and spatial coverage.
- Animated sectors and point-animated regions are visibly locked; unsupported/capacity-breaking edits are rejected before changing the project.

## Validation and limits
- All 20 LOW/HIGH source pairs pass no-edit byte identity and representative edited-resource checks.
- Edited source simulations run on the 18 racing levels. LEV16/17 use static preview.
- Pickups, scenery, starting grids and routes retain their saved positions; substantial terrain changes may require manual adjustment.
- These checks are not original-game terrain-export acceptance. Native acceptance is a separate delivery.

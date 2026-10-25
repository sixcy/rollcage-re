# 2026-10-25 · Wider route relocation and checkpoint planes

## Available now
- Existing route points can move between supported terrain cells. The editor rebuilds route fallback references while preserving each original route group and collision-model lists.
- Checkpoints are edited as planes. Wire markers show their intersections with the road, and sector references follow supported intersections.
- Starting slots can move over supported terrain; their facing follows the authored checkpoint direction.
- Apply coordinates commits X, Height and Z together, avoiding invalid intermediate diagonal moves.

## Validation and limits
- All forty variants pass wider relocation checks, including 854 original checkpoint-plane checks and 30 sector reassignment cases.
- Separate combined checks cover terrain, surfaces, scenery, pickups and race layout together. The 36 racing variants run 90 reconstructed three-car Expert/weapon ticks.
- The fallback rebuild is an offline editor policy. Native point counts, graph links, checkpoint order and lap flags remain unchanged.

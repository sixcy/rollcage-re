# 2026-10-25 · Four-cell arrows, route deletion and broader model imports

- Complete speed-pad arrows now place a 2×2 four-cell pattern with textured preview, rotation and one undo. Existing two-cell project placements retain their saved shape.
- Route points can be removed with a dependency preview, replacement selection and explicit outgoing-branch conflict resolution. Native links and fallback references are rebuilt together; original identities survive save/load and undo.
- Static cross-library models can import missing textures losslessly using the full native texture address. Show only placeable models checks both LOW and HIGH. Native texture, transparency, UV, model and collision limits still apply; foreign destructible and scripted imports remain unsupported.
- LEV12 sectors 2/3/4/5/7/8/10/16 and stages 4/11, and LEV13 sectors 0/4/5/24 and stages 6–13 are read-only where the executable hardcodes behavior. Sector/stage numbers are zero-based. The compiler enforces these protections as well as the controls.
- Version-6 projects preserve deletion tombstones and the new commands. Earlier project versions remain readable.

Source matrices cover all 40 LOW/HIGH resources. Real browser checks cover placement, deletion conflicts, history, projects, exports and Camera stability. Original-game LOW/HIGH import checks confirm material words, texture uploads and live lookup entries, including logical texture IDs above 63. This establishes selected native compatibility, not complete rendering or race equivalence.

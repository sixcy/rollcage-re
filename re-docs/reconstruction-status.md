# Reconstruction status

The current target is Rollcage Redux.exe1.3.8.0, SHA-256`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. The project contains JavaScript reference implementations and retained binary evidence. It cannot yet rebuild or run the original game.

The rough planning estimate given on2026-10-21 is **15–25% of relevant game modules**, centered around20%. This is a low-confidence judgment about subsystem coverage. There is no complete function-to-module inventory or measured denominator; counting every executable function would also count runtime/library code. Passing fixtures measure the fidelity of tested components, not the fraction of the game reconstructed.

| Subsystem | Reference implementation state | Main remaining work |
| --- | --- | --- |
| Archive and names | All344 resources validated; GT20 and filename lookup recovered | Less common loading/error paths and runtime ownership |
| Textures |84 BTP files,2096 active PC pages decoded | HIGH pack image decoder and original upload/render behavior |
| Models and tracks |84 GFXM files,3460 primary models,1496 sectors; textured scene export/viewer | Runtime model preparation, remaining LOD/effect structures and animation |
| Placement/materials |7692 placement records,5172 ordinary instances and material mapping | Special objects and dynamic construction |
| Collision geometry | Terrain regions, spatial index, model lists, rays and sphere point/edge/face queries | Object-driven geometry changes and remaining allocation/lifecycle |
| Vehicle/body physics | Fixed-point math, pose/inertia, suspension, drive/traction, assists, contact friction and response | Runtime tuning/control producers and complete interaction with effects/gameplay |
| Frame orchestration | Ordinary/scripted preparation, shared candidates, grouping, event generation/refresh and final movement connected | Full surrounding game tick and original side-effect producers |
| Effects near physics | World-record pass, radial impulse/damping and rejected-contact completion recovered | Active-state target implementation, emissions/audio and effect producers |
| Scripted objects | Motion VM, curves, timers and spatial teleports | Release/filter/effect integration and real bytecode selection |
| Attachments | Queue generation and tagged-handle consumer traced | Numeric consumer integration, target registration and model-point producer |
| Race/gameplay | Track/progression context fields exposed as declared inputs | Race flow, AI, weapons, pickups, lap/checkpoint rules and scoring |
| Rendering/UI/audio | Asset previews export recovered data through a separate viewer | Original drawing, cameras, menus/HUD, sound and music systems |
| Platform/persistence | Target and packaging identified | Input, saves/settings, networking and platform runtime |

The connected level probe exercises consecutive synthetic vehicle frames on all80 level packs. Inputs, allocation order, floating conversion mode and callback boundaries are declared in each report. Retained-instruction checks compare reconstructed routines with a bounded interpreter; they do not execute the original executable or capture real game trajectories.

Current detailed findings and verification checkpoints are maintained in[RESEARCH.md](../RESEARCH.md),[simulation-frame.md](simulation-frame.md) and[unattended-progress.md](unattended-progress.md). The earlier estimate of70–85% for core asset formats and65–80% for core physics uses the same judgment-based scope; neither includes a complete loader, renderer or race simulation.

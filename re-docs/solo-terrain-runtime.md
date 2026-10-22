# Animated terrain component and camera ownership

`src/solo-terrain-runtime.mjs` composes the existing `494c80` constructor and
`494f60` update over caller-owned relocated memory. It neither creates controller
handles nor writes the animation flag. It is a validated component awaiting
session integration, not enabled animated-terrain support in Racing test.

## Startup and gates

The original `47ea40` startup calls `494c80` after track loading and before
lights and participant construction (`src/race-startup.mjs:143`). Construction
must run even when subsequent animation is gated off: it displaces vertices
and border coordinates at phase zero and writes the reserved palette ramp.
Skipping it changes the collision surface before the first physics tick.

The controller branch is independent of AI execution mode. Retained startup
assembly `analysis/race-startup-original-assembly.txt`, derived from original
reply2457, captures session byte `+54d` at `47efef`. After each `41dbb0`,
`47f01f` compares the participant index against that captured count;
`47f02e` publishes record `+18 = 909060 + index*4c`, and `47f031` calls
actual `416180`. Sentinel `12345678` at `47f116` applies when a later live
participant lies outside the initially captured count. It is not the native
default for every AI car.

`constructCameraController` creates a real type4 body, registers its physical
and spatial identity and two shape records, links it to the76-byte controller,
resets all four camera rows to mode14, and finally ORs bit2 into `91ce90`.
That is an actual source producer of unconditional terrain animation. There is
no justification for replacing it with a fake handle or setting the bit solely
to make the viewer animate.

The lifecycle continues after physics. Native `450e50` calls `4180a0` according
to `41bef0`'s session `+552` selection; this count is distinct from participant
count. Camera positioning updates the controller's physical body. When local
camera policy `41a170` leaves mode14, it can clear `91ce90` bit2
(`src/camera-mode-policy.mjs:109`). Then `494f60` traverses actual participant
handles and tests the first controller's **camera-body position**, not its
tracked car. Retained animation listing1321 proves the first-handle reuse at
`494fac..494fba`, with sentinel tests at `494fa4`.

Camera type4 cannot collide with cars through the body-pair path
(`isBodyPairExcluded`, `src/body-pair-events.mjs`). It still consumes real
physical/shape/candidate state and can query terrain. Constructing cameras but
omitting their update/policy stages would preserve neither native geometry
eligibility nor the full physical world. Current viewer sentinel policy alone
therefore cannot establish authentic all-AI race animation behavior.

## Component contract

Call `initializeSoloTerrainRuntime(runtime)` once with the actual relocated
pack, sector table, primary vertices, palette, yaw table, normalization constants,
explicit conversion mode and CRT allocator. The constructor is the existing
recovered implementation; the adapter validates native header-derived vertex
spans before mutation. Sector-byte and byte-span admission bounds are not claims
about an arbitrary native allocation. `step()` calls the existing update without
overriding its gates or consuming the native dirty queue.

`terrainVerticesFor(index)` returns the actual primary vertex address for raw
terrain queries. Immutable `snapshot.rows` records report actual runtime phases;
`snapshot.segments` contains fresh primary vertices for animated sectors only.
These are observation/presentation copies, never physics input. The existing
`createRawTerrainGrid` reads the same native vertices live, but its parsed cell
forms remain stale when494f60 changes the low flag bits. `bindCollisionGrid(grid)`
additionally binds each cell's bottom-right vertex flags, packet normal index
and quad/triangle forms to the real primary vertices and packet rows. Its
`surfaceModeFor(vehicle)` provider implements41c6c0 against the same live packed
flag/material DWORD and threshold90929c, avoiding the untouched archive buffer.
Existing covered-cell membership and normal table are retained:494f60 mutates
vertices and flags, not those separate tables. The packet root and topology are
validated rather than inferred from serialized offsets. Original parsed scene
vertices, render buffers and palette textures remain separate stale copies
until their respective consumers are explicitly updated.

Full integration needs the original controller startup and camera lifecycle,
their resource/viewport/formatting/runtime dependencies, native dirty-range
consumption and updated terrain/palette presentation. Do not enable a permanent
animation flag, substitute tracked-car coordinates for camera coordinates, or
claim that the standalone component closes that chain.

## Validation

`node --test tests/solo-terrain-runtime.test.mjs` passes three tests without
skips on the installed archive. Six supported variants have animated sectors:
LOW/HIGH LEV4, LEV14 and LEV18 (resource indices36/56/64/76/96/104, with
1/2/1 animated sectors per detail). Actual constructor and eight naturally
gated updates compare every mapped byte at or above10000h against retained
instructions1329/1321 and the actual422c70 normalizer378, with PC24 and
nearest-even explicitly selected. Only allocator/memset are declared services.
The all-sentinel worlds are explicit viewer-like fixtures, not native startup.

The tests also verify that phase-zero geometry differs from authored bytes,
raw queries read its live backing, snapshots preserve unsigned flag words and
cannot mutate native vertices, and malformed geometry fails. A separate coherent
synthetic test runs the actual camera constructor and its real physical/shape
registration: its own flag write enables the next terrain update, without a
manually supplied enabled flag. That update changes an actual collision cell
from one quad to two triangles and a registered vertex's surface mode from1
to2; the new providers reflect both while the old parsed cell remains unchanged.
Packet normal mutations also remain live. This is source execution, not an
original-process camera or terrain observation. Installed archive buffers remain
unchanged.

The broader original instruction proofs and installed corpus results remain in
[track-deformation.md](track-deformation.md). No original process or browser was
launched for this component, and no complete animated-track trajectory is claimed.

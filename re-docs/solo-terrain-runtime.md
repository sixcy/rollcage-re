# Animated terrain component and camera ownership

`src/solo-terrain-runtime.mjs` composes the existing `494c80` constructor and
`494f60` update over caller-owned relocated memory. It neither creates controller
handles nor writes the animation flag. Racing test now integrates this
component with real native camera construction, forces and mode updates.

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
count. The earlier `416400` pass, immediately after each car's `41d2b0`,
produces physical camera forces/orientation from real wheel contacts; the next
physics frame consumes them. `4180a0` updates view poses and can reinsert the
controller body spatially; it does not replace that physical force producer. When local
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
validated rather than inferred from serialized offsets. The immutable source
scene remains separate. The viewer now replaces animated-sector GPU meshes
from completed native vertices, live diagonal flags and primary palette bytes.
Other original render and dirty-range consumers remain separate work.

The standalone integration below includes the original controller startup and
camera lifecycle with explicit external services. Full reconstruction still
needs native dirty-range consumption and the wider renderer/viewport bootstrap.
Do not enable a permanent
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

## Camera lifecycle adapter

`src/solo-camera-runtime.mjs` now composes the existing full camera algorithms
without substituting poses, obstruction results, controller handles or flag
writes. The Racing test integration follows this sequence:

1. Initialize original camera/curve/policy/projection/renderer literals once in
   fresh memory with `initializeSoloCameraConstants`.
2. Supply real session/configuration, relocated spawn/route/trigger/model data,
   spatial/arena/shape storage and explicit CRT/OS interfaces. An existing
   renderer/Application context can be retained. Alternatively,
   `initializeViewportRuntime(explicitlyAllocatedManager)` runs actual517720
   scene/target/viewport construction and actual402d10/402a20 Application and
   debugger bootstrap. No graphics device is created. Manager allocation/root
   publication belongs explicitly to this viewer adapter; complete519df0
   singleton/bootstrap ordering is not reconstructed here.
3. `initializeViewSelection()` runs the actual471770/42ef80 selection/layout
   prefix; `initializeProjection()` runs the owned47ef54..47efc7 projection
   startup section. Call `beginParticipants()` at47efef's boundary, after
   these stages and **before** the first41dbb0. This captures the original
   eligibility count after any earlier CRT/service mutations.
4. Immediately after each actual vehicle construction, call
   `constructParticipant(index)` before410060. This publishes the original
   record+18 controller and calls416180 at startupESP−52. It returns exact
   controller/body identities; `bodyAt(address)` exposes only their actual
   384-byte common storage. Include it in the shared physical-view factory.
   A live-count participant beyond the captured eligibility count retains the
   native sentinel; an attempted auxiliary update through it fails explicitly.
5. Run terrain494f60 before429f30/physics. After physics/attachments/postframe
   and motion, call `updateParticipant(index)` immediately after that car's
   wheel-render stage. It executes actual416400 at raceUpdateESP−20.
6. After native animation/light/debris stages, call `step(context)` before
   weather/deferred placed effects. This reevaluates41bef0 for every loop
   condition and executes full4180a0 at raceUpdateESP−20. `context` supplies
   the same memory, physics views, live grid and model pointer mapping. An
   explicit `context.scratchBase` supplies a different outer update entry
   when startup and update parent stacks differ.

Session+552 is a view-layout selector: values1/2 produce two updates,3 produces
three,4 produces four, all other bytes produce one. Six AI participants at+54d
therefore do not imply six camera views. The runtime leaves this setting, the
RNG streams, camera mode transitions and animation flag owned by their native
algorithms. Immutable snapshots expose view count/modes/participants/positions;
they never feed physics or camera decisions.

The explicit external interfaces are CRT allocation/free/exit registration,
`%d Player` formatting, RTTI dynamicCast, projection atan/sin/cos and
float-to-signed64 conversion, renderer sqrt/libm, and OS critical-section/thread
services where Application/manager construction reaches them. Missing reached
interfaces throw. Source tests declare their finite math/RTTI/platform outputs;
this is not proof of original libm bits, RTTI implementation or OS internals.

The complete450a90 GPU-backed viewport texture/target creation remains separate
from its selection/layout prefix. A newly constructed stock manager takes the
native missing-`0 Player` fallback to explicit configured dimensions. It must
not be presented as an original fully initialized split-screen renderer, or as
evidence that rendering services cannot influence later camera coordinates.
Populated UI/renderer/Application state is retained rather than disabled.
Original camera/renderer teardown, full startup ordering and original-process
camera/terrain evidence remain open. Installed-session and viewer evidence
below checks the explicit standalone composition.

Five camera-component tests pass. Three coherent AI/controller fixtures create
real native camera bodies, shared shape/physical/spatial registration and actual
renderer/Application graphs. A300-tick source chain runs wheel contacts, full
physics, auxiliary force/orientation and camera updates: the physical camera
moves, mode14 expires, and41a170 clears the animation flag. Native view-count
selection drives the actual one/two-view update loop independently of three
participants. Tests also retain count-capture timing, immutable snapshots,
sentinel failure and missing-service failure.

The retained-instruction test compares every mapped byte at/above10000h after
12 full4749e0 calls,12 actual416400 calls and12 complete4180a0 calls at their
real child entry stacks. It then holds physical inputs fixed for168 explicitly
**camera-only** calls through mode-policy expiry; those are not additional
connected physics ticks. Every comparison matches, with an explicit synthetic
FS:[0] chain restored, exact PC24/nearest-even selected, and only genuine CRT services supplied. Full camera and
vehicle callback Listing bytes are independently validated by
`loadRetainedListing`; no game helper is replaced. This evidence is interpreted
shipped instructions over constructed storage, not original-process execution.

## Racing test integration,2026-10-23

`src/solo-session.mjs` now calls actual494c80 after the loaded pack and viewport
selection, before lights/particles and participant construction. Each41dbb0 is
followed by416180, and all real camera bodies join the same physics/spatial
views as cars and world bodies.494f60 runs before429f30 and physics. Each
41d2b0 wheel-render pass is immediately followed by416400;4180a0 runs after
475e50 debris and before414060 placed contacts, as in450e50. No camera handle,
animation flag, collision answer or placement pose is supplied as a substitute.

The standalone host explicitly supplies640x480 configuration dimensions,
monotonic owned CRT storage, free/exit bookkeeping, the one reached Application
RTTI conversion, player-name formatting and JavaScript libm. A stateful
single-thread critical-section adapter supplies genuine external interfaces;
all reached game-owned renderer/Application constructors execute. These are
declared portable services, not original Win32/libm bit-level evidence. Session
disposal releases viewer-owned storage; original renderer/Application teardown
is not claimed. ByteBuffer now implements default scalar offsets and bounded
UTF8 writes required by the real native-span and formatting paths.

Immutable snapshots expose actual camera body/controller backlinks, native
view modes, physical-body count and terrain phases/vertices/palette. LOWLEV4
has19 initial physical bodies with the six-car roster, including six cameras.
The one native view count remains independent of six participants. Camera mode
policy leaves14 and clears the constructor flag; actual camera-body positions
then gate animation. None of these observation copies feeds physics.

`tools/track-viewer/racing-terrain.mjs` creates display meshes from these live
primary vertices, original face UVs, current diagonal flags and palette colors.
The viewer uploads positions, geometric triangle normals and native colors to
separate dynamic GPU buffers, replacing only animated sectors. Display positions
interpolate two completed ticks alongside the cars; pause/reset use exact
completed geometry. The original archive and static download remain unchanged.
Cross-product display normals and direct palette presentation are viewer
adapters, not reconstruction of the original dirty-range lighting/GPU consumer.
The separate44a5c0/44a7a0 terrain-point component is now integrated; see
[point lifecycle](solo-terrain-point-runtime.md). Actual44d960 ages dirty ranges
and consumes light requests. Wider render scheduling, original dirty-range
lighting/GPU consumption and other native render producers remain open.

The first actual GPU-upload comparison caught NaN UVs from passing GPU texture
objects instead of dimensions. Its failed report remains in
`analysis/physics-viewer-terrain-camera-20261023/failure.json`. The corrected
renderer retains actual source-image dimensions and rejects missing sizes.
The final actual Edge report
`analysis/physics-viewer-terrain-camera-final-20261023/report.json` checks LOW
LEV4/14/18 for300 ticks each, complete Node/browser snapshot equality and every
uploaded Float32 position/UV/normal/color. It verifies genuine eligibility
changes, screenshots, zero page/WebGL errors and buffer release on LEV16.
The existing six-car Expert, selected recovery, camera-menu focus, interpolation
and mobile checks also pass with the final bundle in
`analysis/physics-viewer-camera-terrain-final-regression-20261023/`.

The4000-tick default single-car final report retains every-tick Node/browser
parity, five laps, zero recoveries and the strict first-three-laps recovery-free
check (`analysis/solo-camera-terrain-single-4000-final-20261023.json`). The final
36-track roster report passes all300-tick windows and its LOWLEV1 six-Expert
3000-tick window, with laps `[4,4,4,5,4,5]`, zero recoveries,753 actual car-pair
responses and ten distinct pairs
(`analysis/solo-camera-terrain-six-expert-36tracks-order-final-20261023.json`).
Both LOW/HIGH animated variants show native phases286 onLEV4,[152,155] onLEV14
and300 onLEV18, after mode policy clears unconditional animation. All35 focused
tests pass, zero failures/skips
(`analysis/solo-camera-terrain-integration-tests-20261023.txt`). These are
source/installed-data integration results, not original-process whole-race
equivalence. Earlier matrix reports remain preserved as checkpoints before the
final snapshot/display and camera-stage-order changes.

The final source also passes all252 combinations of seven native vehicle
selectors and36 supported tracks for300 ticks each; all seven LOWLEV1 selectors
add complete every-tick browser parity and deterministic reset
(`analysis/solo-camera-terrain-252vehicles-20261023.json`). This refreshes the
earlier vehicle matrix against the new physical camera and live-terrain path.

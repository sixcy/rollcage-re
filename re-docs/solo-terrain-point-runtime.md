# Terrain-point lifecycle component

`src/solo-terrain-point-runtime.mjs` composes the existing actual44a5c0
constructor and44a7a0 updater with the exact owned450fc3..451006 coordinate
restoration. Racing test now calls this shared-memory component at the original
startup and update boundaries. Its installed-session/browser validation is
tracked separately from the component instruction comparisons below.

## Installed census and storage identity

The36 supported LOW/HIGH racing variants were inspected from installed assets,
read-only. Only LOW/LEV8(resource44) and HIGH/LEV8(resource84) have nonzero
auxiliary pack+fch. Each has53 authored four-byte cells,114 deduplicated vertex
targets, eight dirty ranges, and affected sectors4,5,9. The other34 supported
variants have zero point-cell and dirty-range counts. LEV16/17 were excluded
as requested, not inferred absent from this feature.

Each cell stores an unsigned row WORD, sector byte and column byte.44a5c0
resolves all four corners through the actual sector's+20h primary vertex
pointer and deduplicates their pointers in first-seen order. It captures XYZ
WORDs in24-byte rows before initializing phase/rate/amplitude from5ec954. Both
44a5c0 and494c80 address this same primary vertex storage. There is no separate
visual-only coordinate array used to justify an alternative collision surface.
The installed point sectors do not overlap any authored494c80 deformer sector;
the latter occur on LOW/HIGH LEV4/14/18.

## Two different writes within a native tick

The ordering in actual450e50 is essential:

1.494f60 updates deforming terrain, followed by429f30 scripted objects.
2.The owned450fc3..451006 section tests pack+fc, captures point-row count/root,
  then restores each target's XYZ from row+4/+6/+8, one WORD read/store at a time.
3.449640 progression,420500 handling and4749e0 physics consume that restored
  primary geometry. Restoration does **not** write target+6 vertex flags.
4.48e310 publishes actual linked-vehicle animation and one-time kind8 lights
  before475e50 debris. Camera updates,414060 placed contacts,438550 particles,
  48edb0 model-contact fragments and494140 wheel histories precede44a7a0 at
  45114b.494140 advances5ec958 once per participant, so it is an actual emission
  RNG producer even when its wheel-history geometry is not rendered.
  44a7a0 writes presentation displacement
  and palette/material flags and emits debris/type8 particles at animated XYZ.
5.The final-substep44d960(0) call ages the native dirty records. The component
  does not clear or truncate that queue itself.

Thus physics must see captured point XYZ while retaining the live flags
published by the prior late updater. Feeding previous display displacement
directly into the next physics step would change native behavior. Reading flags
from the untouched archive would also lose native surface/material changes.

The coordinate restore preserves pointer/base aliases: each target pointer is
captured once per row, while each base WORD is read immediately before its own
store. A first store can change a later source WORD. Bulk vector preloads or
copying the entire table first would change the game.

## Component contract

Call `publishTerrainPointStartupSeed(actualCapturedSession, runtime)` at the
47eab4/47eaba startup boundary. It publishes the exact session+618 DWORD to
5ec954; zero remains zero. The caller supplies its captured session identity
rather than an implicitly reloaded global or a fallback seed. This is separate
from the5ec958 stream used by late emission and other game systems.

After loading/relocating the pack and selecting viewports, call
`initializeSoloTerrainPointRuntime(runtime)` **before**494c80. Its `scratchBase`
is the real44a5c0 entry. Actual44a5c0 always requests6000h bytes, including for
an empty authored table. A nonnull bounded CRT allocation is required; the
original nonempty failed-allocation/null-address continuation is unsupported,
never replaced by invented storage.

Call `restoreForPhysics()` at the owned450fc3 boundary after494f60/429f30,
before progression/handling/physics. Call `step({scratchBase})` at the late
44a7a0 boundary; the update entry is native450e50-entry−20. Existing real debris
and particle consumers must remain earlier stages. The component leaves pool
allocation/free/reuse, spatial links, dirty words and RNG to the existing
game-owned implementations.

Immutable `snapshot.rows` expose actual target pointers, captured base XYZ,
current XYZ/flags and phases. `snapshot.segments` contains complete primary
vertices for affected sectors; renderer integration needs the union of these
sectors and494c80's affected sectors. Snapshots never feed geometry, collision
or RNG decisions. The full native palette remains shared through909270.

The session's startup now constructs placements as part of the owned44c2b0
loader section before450a90 viewport selection, then44a5c0 and494c80, followed
by the separate48ef30 light storage and44e220 authored lights. It publishes the
captured session seed first, initializes each AI immediately after its native
vehicle/camera constructor, and uses the actual final42a670 input initializer.
Per update, the point restore lies after494f60/429f30 and before physics; late
44a7a0 lies after494140 and before415230 destruction and480e90 fragments.
The renderer/snapshot sector union now includes4/5/9 point sectors as well as
deformer sectors, with one live primary-geometry/palette snapshot per sector.
The actual final44d960(0) consumes both dirty records and real kind8 car-light
queue publications; no reset counter or placeholder light replaces it.

Running48e310 and494140 does not add their visual consumers. The linked
animation model is distinct from the five currently rendered car parts; its
mutated vertices are not uploaded as a sixth part. Wheel-history trails and
the original GPU lighting pipeline are also not rendered. The existing
full-mapped instruction comparisons cover these producers' memory outputs;
current public-snapshot browser parity covers only the exposed state, not
those unexposed model vertices, history buffers or individual light records.

These are supported-stage integration facts. Remaining omitted outer race,
renderer, controller/device and original-process comparisons are recorded in
the broader fidelity notes. This component's388-call isolated graph below uses
its own declared upstream RNG/pool inputs; its emission totals are not a claim
about the complete session's now-connected494140 RNG stream.

Admission checks reject invalid sector/grid references, insufficient backing
storage, unsupported allocation failure and row counts beyond the fixed6000h
storage. They are explicit standalone memory-domain checks, not revisions to
native numerical rules. The authored-cell count is a byte; the fixed table can
hold1024 rows. Restoration retains native disabled/negative-count early exits.

## Evidence and validation

`tests/solo-terrain-point-runtime.test.mjs` passes four focused tests, including
both installed LEV8 variants. Each constructor is followed by48 persistent
updates with actual475e50/438550 consumers and actual44d960(0) dirty aging.
Every mapped byte at/above10000h compares against retained x86 after every
constructor, restore, debris, particle, point and light call. This covers388
public calls plus96 owned restoration windows and two seed-publication windows.
The graph emits94 debris and36 particles and genuinely frees60 debris and18
particles. Eight dirty records persist through the final-substep age decrement
and drain to zero on the next final call, without a manual queue clear.

The dirty-consumer fixture uses actual initialized empty light ownership;
it does not claim populated authored-light or GPU-lighting equivalence.
The constructor uses only declared CRT allocation/memset and the compiler
cookie boundary. No game helper, spawn, lookup, allocator result or query answer
is mocked inside the connected point/effect graph. Scene/pool setup is explicit
source-constructed storage; these are interpreted shipped-instruction checks,
not original-process runtime or a complete native race.

Additional cases verify zero/full-width startup seeds, ordered source/target
aliases in the restore, disabled-pointer bypass, immutable snapshots and malformed
grid/allocation/row failures. Existing broad terrain-point arithmetic/lifecycle
reports remain documented in [terrain-point-animation.md](terrain-point-animation.md).

Retained target SHA256:
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
The new caller checks verify these original replies directly:

| Reply | Evidence |
| --- | --- |
|2457 startup47ea40|`ev_c39a69909451efe663de2dd317d58d4a778c39999a2060dea599e1d088aa0884`|
|310 race update450e50|`ev_d15324804cfcb1308ec6f86f28c7350a908d9cee745a7616dd8619f94cd3053f`|
|3505 point constructor44a5c0|`ev_b676769a10cf1512b0fd07b60f4c9ff8438e2cb0382669058d96e38808e0a0f4`|
|3501 point updater44a7a0|`ev_f47b667f7b5fffa7f1b2a05d1494a669d9770349cf683c1475e8773873cb6f21`|

No original game or GUI was launched and installed assets remain unchanged.

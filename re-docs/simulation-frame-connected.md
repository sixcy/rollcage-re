# Connected native physics parent

`tools/verify-simulation-frame-connected-instructions.mjs` compares the actual
retained `4749e0` instruction graph with `stepSimulationFrame`, using the same
constructed native memory for bodies, physical groups, spatial registration,
shape pool/cache, candidates, terrain, collision queue and contacts. The selected
Redux SHA is enforced by `loadRetainedNativeProgram`; no game executable runs.
Only compiler-cookie verification is an external service in this comparison.

The current 240 fixtures alternate one and two ordinary type-7 bodies, stationary
and falling motion, gravity and friction values, spatial lookup/outside cases,
and terrain dimensions. Every fifth fixture admits placed models, and every
tenth includes type-4 breakable configurations and actual particle/debris pools.
The floor has coherent native vertex winding, packed
normals and authored cells. They reach 164 terrain hits and 197 processed events,
including actual response, queue invalidation/refresh and final advancement.
The report records 7,536 reached instructions and 6,776,535 interpreted steps,
including 62 calls each to `421da0` damage and `480900` debris emission.
Full body, list, shape record, candidate arena, spatial node, group, event,
heap/free, plane/border, full `91d360..463` math globals, model/object and
attachment bytes match. Destruction fixtures also compare complete effect pools,
free/active arrays, spatial particle heads, RNG, ring, destruction queue and
camera globals. Available retained
instructions are not a measure of source coverage.

`context.nativePhysicsStack = {memory, views, scratchBase}` optionally binds
native shared scratch; `scratchBase` is entry ESP of `4749e0`. Its initial
`427bd0` contact begins at ESP−84h, refresh contact at ESP−7ch. The terrain
wrapper's output begins at ESP−e4h/ESP−dch respectively. These are live views,
not output snapshots. `4799f0` is entered at ESP−28h; the optional
`updateBodyDerived(body, {nativeScratch})` writes its rotation, inverse-inertia
transpose and angular-quaternion numerical temporaries as they are computed.
This matters even when no terrain contact is accepted: a later outside event
copies stale contact fields overlapping the earlier derivative matrices. The
fixture-4 event normal is `[65536,65536,0]`, rather than zero. Those stores are
included in event comparison; no differing event bytes are excluded.

The raw model query uses `context.nativeModels = {memory, views}`. Its
`423ab0` entry ESP is outer query-output address−3ch; model and terrain wrappers
use the same output address despite different entry stack depths. The adapter
preserves in-place yaw rotation/restoration of the four probe X/Z fields, local
point/normal/scalar/flags storage, live placement configuration reads and real
damage calls. `429820` publishes the packed rotation matrix before its sphere
loop, while advancement's quaternion normalization publishes the root/clz
globals. Optional state hooks preserve those writes at the calculation sites.

The debris routine also reads a stale fourth short adjacent to its local center.
An earlier `424040` polygon vertex Y occupies that address in the connected
graph. The source writes the polygon/edge vertex shorts when those vertices are
constructed, so the later DWORD copy carries the native padding. Neither zeroed
private scratch nor an end-of-call copy reproduces this consumed alias.

This is a connected ordinary-body parent check, not complete `4749e0` coverage.
Vehicle wheel stages, scripted branches, active world/body effects, placed-model
class-1/class-2/class-4 extra effects, attachment-producing bodies, multiple-frame
reuse, and genuinely interacting body pairs need further native parent cases.
The fixture memory, relocated resource tables and body constructors are explicit
inputs; this does not recover their upstream race/resource producers. Existing
standalone and structured integration checks cover additional branches, but do
not silently extend the native parent evidence here.

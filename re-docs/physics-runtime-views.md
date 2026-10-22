# Shared native storage for physics reference components

`src/physics-runtime-views.mjs` supplies live native-addressed storage to the structured physics references. It preserves supplied body identities and aliases physical lists, candidate groups, shape pools, collision heaps/free stacks/event records and scratch records to one caller-owned `Buffer`. It does not allocate or initialize a native game session.

```js
const physics = createPhysicsRuntimeViews({
  memory,
  bodyAt: respawnRuntime.bodyAt,
  bucketAt: respawnRuntime.bucketAt,
  bodyLists: suppliedPointerLists, // [{address, capacity}, ...]
  shapeCapacity: 256,
  candidateCapacity: 2048,
  candidateMapping: {
    terrainVerticesFor: sector => suppliedSectorVertexAddresses.get(sector),
    modelPointersFor: candidate => suppliedNativeModelPointers(candidate),
    modelForPointers: (objectAddress, shapeAddress) => suppliedParsedModel(objectAddress, shapeAddress),
  },
});
```

Instead of `bodyAt`, callers can supply `bodyStorage:[{address,length},...]`; those declarations create cached views of existing storage. A complete common body requires at least `180h` bytes. The factory route checks that existing `body.bytes` actually shares the provided buffer and address, rather than accepting copied bytes. Nonconfigurable body accessors are retained and must already alias this same memory, as the respawn views do. Vehicle extensions are supplied separately by `createVehicleRuntimeViews`, which can use `physics.bodyAt` as its body factory.

## Exposed storage and invariants

| Accessor / object | Native storage |
| --- | --- |
| `physicalGroup` | Header `902bc0`: pointer, unsigned word count and trailing pointer field |
| `bodyArrayAt(address)` | Declared native body-pointer array, with caller-supplied capacity |
| `candidateGroups.groups` | Up to 65 headers at `902be0`, 12 bytes each |
| `candidateGroups.count` | Signed DWORD `902bcc` |
| `candidateGroups.refreshGroup` | Header `902ee0`, also the final original group header |
| `shapePool.records` / `records` | 72-byte shapes through `[91e79c]` |
| Shape free / active / reverse arrays | `[91e780]` / `[91e78c]` / `[91e790]` |
| Shape free top / active top / allocated count | `91e794` / `91e784` / `91e798` |
| `queue` count / capacity / event base | `902ba0` / `902ba4` / `[902ba8]` |
| Queue heap / free / free top | `[902bac]` / `[902bb0]` / `902bb4` |
| `candidateArena.entries` | 16-byte records through `[91e788]` |
| `effectFlags.first` / `second` | `91cd90` / `9153d0` |
| `gravityQ16` / `selectionCounter` | `5eb5e0` / `90a548` |

Physical and group `.bodies` getters resolve the current native array pointer. Once captured, an array view retains that array's address while subsequent element reads remain live. This matches the frame's captured pointer/count semantics and permits native swap removal or later pointer replacement without cloning a body list. Assigning a `.bodies` array requires an already declared native array identity; arbitrary JavaScript arrays do not manufacture native allocations. Fixed spans preserve unused entries and trailing nulls.

The queue inherits the actual `CollisionEventQueue` reset/push/sift/pop/invalidate methods over raw-backed arrays and 104-byte event views. The shape pool similarly inherits `BodyShapePool` allocation/release over native free/active/reverse storage. Creating these adapters calls neither constructor nor reset, so stale bytes and existing cursors survive. `registerShapes(body,descriptors)` uses the actual recovered registration algorithm, appends to the physical word-counted list and writes its trailing null.

Event fields retain their original layout: kind `+0`, bodies `+4/+8`, point `+2c`, normal `+38`, field44 `+44`, scalar `+48`, class flags `+54`, tag/damping words `+58/+5a`, auxiliary vector `+5c`. Record setters support both element writes and complete-array assignments. Existing bodies are reloaded from event pointers by identity.

Body views include common dynamics, preparation/friction/cache fields, clock/state/counts, candidate pointers/counts, attachments, scripted offsets and pair-context fields. Collision IDs support the signed native index domain `-128..127`, including aggregate reads before `+140` for negative signed counts. Filter pointers at `+148` require an explicit `collisionFilters` map of native address to implementation; unknown reached callbacks throw. The pair-context state byte follows the actual pointer at `+6bc`, with `ffffffffh` representing the observed null sentinel.

Body candidate offset properties translate raw pointers at `+154/+158` relative to `[91e788]`; the native words at `+15c/+15e` remain separate and alias their original bytes. The respawn view's `closestTerrain11c` getter remains a signed native DWORD. Its setter now accepts integers or explicitly bounded `{sector,column,row}` objects and packs a byte, signed byte and signed word. This connects the existing candidate producer without replacing the body or synchronizing state.

## Candidate and scratch contracts

Terrain candidate writes retain the high flag nibble and untouched byte `+2`; they store type, point offset, columns, cell ID, packed normal and actual vertex pointer. Reads expose the low type nibble and derive vertex indices using `candidateMapping.terrainVerticesFor`. Model candidate writes retain the native low-type write and untouched fields, using explicit native object/shape pointers. Model query reads resolve `collision`, `shape` and `settings` through `modelForPointers`. These mappings connect parsed resources to supplied runtime addresses; they do not reconstruct a missing runtime loader or dynamic object producer.

`contactAt(address)` exposes the 72-byte static-contact layout, `outputAt(address)` the 36-byte low-level query result, and `wordAt(address)` the retained tag word. The caller supplies addresses appropriate to the native call sites. Scratch values are not silently initialized. `timeOptionsFor(body)` reads shared time globals and the exempt-body pointer.

The simulation wrapper now forwards its time-options provider into the vehicle frame instead of assigning `vehicle.timeOptions`. This preserves the vehicle view's read-only getter and lets preparation, drive and advancement use the same native globals. No per-body copy of those globals is introduced.

## Verified connected behavior

`node tools/verify-physics-runtime-views-instructions.mjs` passes 800 synthetic fixtures, 12,000 interpreted calls and 5,134,859 steps against 5,029 unique retained instructions. The connected chain is:

`428270` registration → `46e9b0` begin → `47a8e0` preparation → `429820` shape cache → `46ea80` groups → `440510` queue reset → `475500` event insertion → `474bb0` static response → `475630` invalidation → `4284d0` unregister.

The run includes 1,600 registrations, 800 consumed contacts, 1,600 inserted/responded events and 800 unregisters. Full body, shape, pool, physical/group-list, event, heap/free and scratch regions match. Source references operate directly on raw memory; there are no body/group/event synchronization snapshots or mocked game callees. The sole external service is checked compiler-cookie validation. Effects flags are zero and movement stays within registered position high bytes, so effect and spatial-movement branches are explicitly outside this run. Contact inputs are declared synthetic payloads.

`node --test tests/physics-runtime-views.test.mjs` passes six focused tests, including native swap removal visible through an already captured array, real event processing over raw records, candidate producer pointer/closest-cell writes, signed packed-reference validation, two coherent simulation frames containing a geometry-derived impact and retained contact, and an ordinary vehicle frame with real wheel effects using the read-only shared time getter. The 36 relevant physics/respawn/vehicle/simulation tests also pass together.

All instruction evidence is retained and enumerated in `analysis/physics-runtime-views-instruction-check.json`. No new REA requests were needed for this scope; reservation 1000–1039 remains unused. No original executable has been run.

## Remaining full `4749e0` boundary

The assembled JavaScript simulation now runs on shared raw storage in focused fixtures. This is **not** an independent complete `4749e0` equivalence result. The remaining integration requirements are concrete:

- The [raw terrain query adapter](raw-terrain-query.md) now supplies visited/edge/plane/border/math scratch writes with an independent ordered-store oracle. It still needs binding into the complete shared native parent comparison.
- Native candidate building still needs a connected full-parent check with actual spatial lookup, terrain append and model append using real runtime address mappings. Existing parent comparisons use declared append boundaries.
- Placed-model mappings must provide coherent dynamic settings and reached object/class effect implementations. Parsed static model metadata alone does not establish a native runtime model object.
- Native `4749e0` and `475760` must execute together with all reached preparation, candidate, vehicle, response, refresh and finish callees in one retained-instruction oracle. Current independent instruction comparisons prove subchains, while the two full source-step fixtures prove composition on declared states.
- Runtime body/world/attachment queues, scripted bytecode/spawn data, active effects and special-mode contexts must come from their actual producers or remain explicit caller-owned inputs. Arbitrary allocation, memory roots or zero callbacks do not close these producers.

These gaps belong to the full shared-step claim; none is hidden behind a successful storage getter test or a function-count percentage.

### Terrain-query write anchors for the next integration pass

Retained `analysis/scene/results/168-terrain-query-assembly.json` gives concrete missing write sites. At425081 the parent clears candidate flag10hex,425086 initializes candidate byte2 toff,42509a applies initial skipping,4251a7 marks visited, and425a76 publishes an edge code to byte2. These should update the existing raw candidate records rather than overwriting their low type nibble.

Plane rows at91e7a0 use40-byte stride, with reached stores4255f1..425636 writing point/normal/distance/fraction fields. The sphere checker already compares decoded `scratch.planes` against those bytes, but ordinary shared-frame execution does not publish them. Border state911c00..911c27 is written at425b71..425bc4. Other signed-short/vector transform scratch stores occur at4258cf..425965. `tools/verify-terrain-sphere-query-instructions.mjs` already retains the plane/border expected-byte codec and the actual edge/primitives union, making it the starting oracle for coherent writes. The ray checker currently compares final output/fraction only. These anchors narrow the next source change; no full native query-scratch binding is claimed here.

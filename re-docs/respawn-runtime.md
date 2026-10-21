# Coherent respawn and progression memory

`src/respawn-runtime.mjs` connects structured respawn application47d440 to the raw vehicle-record progression and race-completion references. The body, record, session, controller, route and checkpoint views all alias one caller-owned memory buffer. The adapter does not construct native gameplay state or synchronize separate copies after each call.

The normal path binds real44a2e0 nearest checkpoint processing,449d40 transition/interpolation,44a560 lap advancement and449760 race completion. The latter supplies its verified numeric defaults, including449be0 lap bookkeeping,491be0/48da10 vehicle/route bookkeeping,42ab90 replay dispatch and41a670 session input flags. Other reached completion contracts remain the caller's responsibility unless that parent has a verified default.

## Caller-owned address map

```js
const adapter = createRespawnRuntime({
  memory,                         //mapped caller-owned native bytes
  recordCount,                    //capacity at fixed native909300, stride30c
  bodyStorage: [{address, length}],
  routeAddresses: new Map([[authoredRouteObject, relocatedRouteAddress]]),
  scratchBase,                    //449760's supplied local scratch area
  trackBasis(body, record, runtime) {},
  completionHandlers: {},         //named449760 contracts, only when reached
  spatialRegistry,                //or explicit spatialHandlers below
  spatialHandlers: {removeSpatial(body) {}, insertSpatial(body) {}}
});

adapter.apply(bodyAddress, {
  position, quaternion, rotation,
  progressionPointer: authoredRouteObject,
  progressionValue, closestTerrain11c
});
```

The memory buffer, mapped body extents, pointer tables, relocated route/checkpoint storage, constants used by reached callees and runtime values must already exist. Body extents are explicit; a pointer to an unknown body is rejected. The supplied extent must cover the fields being modeled, with at least723 hex bytes; the corpus supplies full4000-byte bodies. More extensive callee state, such as replay controllers through+1e883, must also be mapped when that branch is reached. No memory contents, session mode, constructor defaults, physics tuning, native allocation order or resource relocation are guessed by the adapter.

Runtime globals5ecb1c and90b98c select the live session and pack. Records use the native909300 base and30c stride, matching449760's fixed table. Body+65e selects the same record views used by47d440. Record+00 body and+18 controller pointers are read each time the corresponding property is accessed. Controller sentinel12345678 remains a scalar sentinel; it is not dereferenced. Changing a pointer in a raw callback immediately changes later structured reads.

`runtime.pack` exposes checkpoint count+44, route count+46, routes through+60, checkpoint records through+70 and ID words through+90. Checkpoint table views retain the remaining supplied addressable memory so native-readable ID offsets are represented. The caller must map appropriate data at those addresses; a whole-memory span is not a claim that every byte belongs to the original resource. Route mapping accepts an authored object or an adapter route view, and writes the corresponding relocated address. The apply call uses a byte-backed route view, so byte05 and later record pointer reads reflect mapped memory rather than stale parsed-object fields.

The exposed accessors are`bodyAt`, `recordAt`, `controllerAt`, `routeAt`, `pointAt`, `bucketAt`, and`vehicleStateFor`. Returned views are cached by address, preserving pointer identity. Body vectors are actual Array proxies over their fixed native spans. Index writes update bytes; whole-array assignments update the same bytes and retain old array aliases. `body.bytes` and record/route/point byte spans alias those same writes. Body rotation shorts retain signed16 truncation. Deleting elements or resizing these fixed native spans is rejected.

Wheel flags/spins and field650 also alias the body bytes. Runtime record fields, lap/progress state, session modes/counters, controller flags and tagged spatial bucket/links are coherent with raw callees. `BodySpatialRegistry` can therefore operate directly on the body/bucket views. The separate selector still needs actual parsed spatial data or an explicitly declared synthetic selection contract.

`trackBasis` is required when449d40 reaches its basis read. Installed-data callers bind the real417210 reference using the current mapped body's closest terrain reference and raw record20/22 values. Completion handlers are forwarded without inventing acceptance/results. They can mutate raw pointers or session state; subsequent accesses follow the native reloads already present in the recovered parents.

`adapter.stats` counts applications, ordinary progression calls, lap calls and race-completion calls for diagnostics. It is not native game storage, and calling a routine does not by itself imply that every branch or a whole race completed.

## Verification

`node tools/verify-respawn-runtime-instructions.mjs` compares the connected source chain against2202 retained instructions across600 fixtures. It includes actual47d440,44a2e0,449d40,41c990 interpolation, lap formatting/advancement,449760,449be0,491be0,48da10,42ab90 replay dispatch,41a670 input flags and spatial removal/inline insertion. All table bytes come from retained original data. Only417210 basis and4286e0 spatial selection are explicit input-checking mocks; the security-cookie check is inert.

All2451139 interpreted steps match. The chain executes600 ordinary progression calls,600 lap calls,600 completion calls and300 cases that set the finished-record bit. It compares complete16384-byte bodies,780-byte records, session/controller/bucket storage, route and checkpoint tables, supplied pose bytes and changed globals. Network/notification branches are legitimately unvisited in these declared mode0 fixtures; replay dispatch has a declared null replay controller. The raw parent/helper oracles cover additional branches separately. The report`analysis/respawn-runtime-instruction-check.json` lists the exact Evidence IDs and limits. This is static interpreted-instruction agreement, not original-process execution.

`node --test tests/respawn-runtime.test.mjs` passes seven focused integration tests. They exercise in-place/whole-array aliasing, normal progression/lap/completion without synchronization, full finish bookkeeping and real replay/input dispatch, body/session pointer changes during a reached completion callback, live pack/route/controller views, legitimate special-mode counter behavior and explicit missing-memory/mapping errors.

## Installed-data normal-mode probe

`node tools/probe-respawn-runtime.mjs` maps actual authored route/checkpoint tables and executes47d440 with real417210 track basis on all80 level packs. It runs two speed profiles per usable route midpoint:1080 normal-mode applications and1080 actual ordinary progression/basis calls. Of these,344 reach actual lap advancement and449760 completion, with344 lap markers. All1080 spatial removals/reinsertions and wheel/motion resets pass; no initial closest-reference fallback is needed. Report:`analysis/respawn-runtime-probes.json`.

The corpus declares session mode551=0, so it does not bypass progression through mode3/8. It also declares registered-body mode718=8, controller sentinel12345678, lap/upper1, timer12345Q11, progress50000, clock600, identity selected pose and complete synthetic retained body storage. Mode718 is caller-supplied fixture state, not a reconstructed upstream producer. Completion reaches normal lap bookkeeping in344 scenarios; the end-of-race vehicle/network branches are covered by the separate connected oracle/tests rather than claimed from these installed midpoints. Pose selection is supplied here; the earlier placement/post-frame probes verify that separate query path.

This closes the previous object/raw-record bridge for explicit native memory. It does not recover body/session constructors, replay population, live input/speed producers, a full race tick, original-process trajectories, final effect emission or every reached game service. No original executable or installed game file is modified or executed.

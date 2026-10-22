# Connected native frame-candidate construction

The complete4287f0 parent now has one retained-instruction comparison with actual spatial lookup, terrain region append and model append. The source runs through existing byte-backed physics body/shape/candidate views. Its native comparison has no spatial/append/point/edge mocks; only compiler-cookie validation is an external service. This establishes the parent-visible candidate/body/aggregate contract on the declared coherent runtime inputs, not a complete4749e0 shared physics tick or original-process execution.

`tools/verify-frame-candidates-connected-instructions.mjs` runs2,530 actual retained instructions over1,200 fixtures and44,805,450 interpreted steps. It observes40,738 published terrain candidates,18,223 model candidates,4,730 region calls,2,160 model calls and2,373 spatial lookups. Model acceptance reaches5,975 actual point-sphere and6,314 actual edge-sphere calls, including their quadratic, normalization, fraction, scale, root and leading-zero descendants. There are83,901 actual plane-filter calls.

## Coherent runtime inputs and reusable helpers

`tools/lib/frame-candidate-runtime-fixtures.mjs` exports `createConnectedFrameCandidateFixture(fixture)` and the fixed address map `frameCandidateAddresses`. The factory returns:

- `memory`, `views`, `bodies`, `count` and `arena` over the same raw body/list/shape/candidate storage.
- `grid` with sectors, split/quad forms, boundaries, six regions and three zones; model `instances`, configuration flags, links and parsed collision forms in `models`.
- `candidateMapping`, `bucketAt` and `nodeForAddress` for another physics view layer to reuse exactly the same native-to-parsed identities.
- `options` directly consumable by `buildFrameCandidates(bodies,options)`.

The factory constructs authored-style packed row/map/node bytes and calls actual `parseSpatialIndex`, then relocates the same row pointers/map words/node records into native memory. Actual parsed lookup therefore sees the same direct ranges, sparse-row fallback, vertical chains and zones as native4286e0/4746f0. The existing physics-view body bucket getters map actual tagged pointers back to the corresponding parsed node. There is no fixed lookup-result callback.

Terrain input vertices, flags, normal pairs, packets, border normals and packed six-byte regions encode the declared parsed geometry. Native428aa0 and source `appendRegionCandidates` consume those matching representations. Repeated regions exercise previous-call duplicate exclusion, split forms and border paths. Source closest references pack directly into body+11c through the existing view; bound120 and count15c share the native bytes.

Three placed model instances each have a convex box/triangle form and additional point, edge and disabled forms. Their raw object/model/shape/face/record/edge/configuration storage matches the source collision metadata. Instance settings include position, yaw, class and per-shape type filters; candidate pointer codecs map the actual object/shape pointers back to the same source identities. These are **declared immutable producer inputs** during a call. This helper does not claim the missing resource loader, model-object constructor, live dynamic settings producer or static-link update producer. Integer authored placement positions are used; this is not proof of arbitrary fractional dynamically moved model settings.

`tools/lib/frame-candidate-connected-evidence.mjs` exports async `readFrameCandidateConnectedEvidence()`. It returns deduplicated `instructions`, retained `evidence`, and `initialize(memory)` for yaw/root/primitive constants. It imports no top-level verifier execution. Complete4749e0 work can reuse this union with its other retained instruction sets. Duplicate instruction addresses must agree exactly.

## Native arena overrun and alias behavior

The connected oracle exposed a missing retained-write behavior in the source parent.428aa0 increments its accepted count and writes each16-byte row at429008/4291e8, then caps the published count to64 at429254..42925f. Records beyond64 remain written in the arena. The old source truncated its candidate array before writing the arena, losing those rows.

`src/frame-candidates.mjs` now writes accepted candidate rows through the actual candidate-array push before the unchanged terrain algorithm caps its logical array. This preserves overrun records and native ordering. It does not raise the published capacity or change terrain acceptance, duplicate pruning, border ordering or nearest-point arithmetic. The normal final write remains compatible with supplied parent-boundary probes.

This matters even when later code writes to the same addresses: model append changes type/yaw/reference/object/shape fields but leaves byte2 and byte3 untouched. In the cap fixture, a later model record consequently retains terrain columns byte3=12 rather than its originala5 arena fill. Five new focused tests assert this concrete behavior and the retained high flag nibble.

The pre-existing native cursor anomaly remains: during the model pass428a72 advances by **terrain count15c**, although429360 publishes model count15e. A body with zero terrain candidates and nonzero model candidates allows the next body's model writes to begin at the same address. The connected run observes112 such overlapping model views,56 fixtures with terrain writes beyond published counts and eight outside-stays-outside state16 cases. Candidate views continue reading shared storage after later overwrites; they are not snapshots of each builder's output.

## Validation and comparison limits

`node --test tests/frame-candidates-connected.test.mjs tests/frame-candidates.test.mjs tests/physics-runtime-views.test.mjs` passes16 tests. New focused cases cover64-count overrun retention into model byte3, later model overwrites through terrain-count cursor advancement, actual sparse lookup plus prior outside state, signed aggregate index-1, and type17 radius writes visible in raw records. Existing five frame-parent and six physics-view tests still pass.

`node tools/verify-frame-candidates-instructions.mjs` still passes its1,400 parent-boundary fixtures and871,558 steps. That older checker intentionally isolates caller behavior with three helper mocks; the new checker closes those specific boundaries.

The connected comparison covers full body storage, all256 shape records including aggregate position/velocity cache changes, the entire2048-record retained candidate arena including unused/overrun bytes, list/count/root pointer bytes and unchanged terrain/model/settings storage. Point/edge helpers calculate discarded contact outputs before429600 unconditionally overwrites their acceptance flags with2. Their actual instructions execute, but those disposable local contacts and numerical scratch globals are not outputs of the source acceptance predicate and are not claimed byte-for-byte source mirrors. A complete shared-step oracle must account for any scratch state that later reached code consumes.

The new check and fixtures use explicit nearest-even x87 context for actual point/edge math. That context is a synthetic emulator input, not an observed runtime control word. Geometry, model forms, object settings, arena capacities and registered-body inputs are explicit constructor/loader boundaries until connected to their actual producers. Native data reads remain mapped and arithmetic remains within the established readable domain.

Evidence is existing retained054 frame parent; scene162 terrain append;184 model append;187 shape acceptance;205 plane predicate;665/669 raw lookup/fallback; and the complete point/edge primitive union enumerated in `analysis/frame-candidates-connected-instruction-check.json`. No new REA requests were needed; reservation1120..1159 remains unused. The report distinguishes fixture inputs and interpreted instructions from original-process runtime evidence.

Remaining scope is complete4749e0/475760 composition, coherent terrain-query cache/plane/border writes, live model/settings/link producers where reached, and all other reached frame stages and effects. This connected candidate parent closes its prior three explicit helper mocks without implying those larger boundaries are complete.

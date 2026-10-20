# Terrain and model sphere geometry

The reconstruction now computes static contacts against authored terrain and placed model geometry. It connects the previously recovered shape caches, static scheduling, contact merger and response dispatcher. These are static reconstructions of Redux 1.3.8.0; no original executable process has been run.

## Geometry paths

`src/static-sphere-primitives.mjs` implements point contact `0x422230` and finite-edge contact `0x422680`. Both accept a native 72-byte sphere-cache record or a plain `{originQ8, deltaQ8, radiusQ8}` probe. They write mutable `{point, normal, scalar, flags}` outputs and return native Q16 time. Point coordinates and primitive normals are Q8; finite-edge endpoints are authored signed-short vertices, with an explicit Q8 edge direction.

These routines retain native behavior beyond ideal sphere intersection. Point contact does not report a stationary overlap when speed is zero. Its coarse horizon uses the direct shift `((maxTime-1)>>16)`. Edge contact rejects nonapproaching motion even for an overlap. Edge endpoint rejection writes flag `0x100000`, retaining computed fields for the caller's point fallback. Time quantization, signed-short velocity truncation, overflow and stale scalar/output writes follow the instructions.

`src/terrain-sphere-edge.mjs` implements terrain edge wrapper `0x425f10`. Nearly aligned neighboring planes, or two border faces, can use averaged cached points and combined normals instead of the finite-edge primitive. Midpoint addition wraps before its arithmetic shift. Equal penetration distances select the neighboring cell reference; time and scalar still come from the first plane. Other paths map six authored edge codes to endpoints, respect native edge-disable bits for type0, and compute an edge direction with `0x4343e0`'s unreduced float normalizer. A border edge with a null neighbor is outside the admitted input domain because the native routine dereferences it before its null test.

`src/terrain-sphere-query.mjs` implements the nonzero-radius path through `0x424ff0`. `queryTerrainSphere(grid, candidates, query, options)` returns mutable output fields `flags`, `fractionQ16`, `pointQ8`, `normalQ16`, `distanceQ8` and `cellRef`. Options include the original packed time parameter, body flags, explicit rounding mode, output storage and optional scratch. Zero-radius callers retain `queryTerrainRay`.

The terrain plane screen subtracts radius and projects the contact point onto the surface. It retains native neighboring-plane reuse, traversal order, overlap depth selection, tolerance flags, exclusive time bounds and the final exterior-edge neighbor search. Optional scratch exposes visited/edge codes, each 40-byte native plane-cache payload and border diagnostic state. The query resets visited/edge state on each call. Candidate count is capped at64, as in the original.

`src/sphere-collision.mjs` now also exports `normalizeUnreducedCollisionVector` for `0x4343e0`. It shares binary32 conversion arithmetic with the contact normalizer but omits `0x422c70`'s integer input reduction. Both routines have separate retained-instruction coverage. Four x87 integer conversion modes are checked; actual runtime floating-point control words remain unobserved.

Model shape and placement paths are described in [model sphere contacts](model-sphere-contacts.md). `queryModelShapeSphere` implements `0x424040`; `queryPlacedModelSphere` implements `0x423ab0`, including yaw, shape/tag filters, edge-to-point fallback and explicit effect callbacks. Primitive normals are Q8, while the placed wrapper returns Q16 normals for the static contact pipeline.

## Instruction comparisons

| Tool | Retained instructions | Coverage and boundaries |
| --- | ---: | --- |
| `verify-static-sphere-primitives-instructions.mjs` | 1,098 | 8,000 fixtures /16,000 point and edge comparisons; no helper stubs. |
| `verify-terrain-sphere-edge-instructions.mjs` | 1,394 | 4,000 fixtures, full contact/time/flags and unchanged geometry; actual primitive and float callees, no stubs. |
| `verify-terrain-sphere-query-instructions.mjs` | 2,368 | 4,000 complete queries; all 36 output bytes, all plane-cache entries, candidate scratch and border diagnostics; no stubs. |
| `verify-model-sphere-query-instructions.mjs` | 2,035 | 5,000 fixtures plus four explicit endpoint redirects; actual geometric/math callees, only security-cookie helper stubbed. |
| `verify-placed-model-sphere-instructions.mjs` | 2,447 | 3,500 candidate batches /1,199 effect calls; full output/probe and callback order, explicit effect and cookie boundaries. |

All checks use retained x86 in a bounded interpreter. Counts overlap across tools. Reports under `analysis` record original Evidence IDs and exact limitations. Terrain fixtures cover split and quad faces, walls, disabled edges, reordered/sparse lists, stale outputs, zero and fractional time bounds and four conversion modes. Focused tests additionally force stationary tolerance, half-frame radius-bearing plane contact, exterior-edge impact, exact time-bound rejection and border diagnostics.

The complete suite has 206 passing tests, and all 40 instruction tools pass. `analysis/focused-tests.txt` and `analysis/native-instruction-suite.json` retain the sweep results.

## Installed-data probes

Run `node tools/probe-model-sphere-shapes.mjs` to check authored MODC data. All 84 GFXM resources contain 1,236 collision models /4,400 shapes: 2,744 polyhedra, 444 edges, 52 points and 1,160 disabled records. The probe runs 9,888 synthetic queries, obtaining 8,472 hits and 1,416 misses. It compares 2,848 complete results with retained instructions, including every authored edge and point shape. Native comparisons cover 2,072 polyhedron queries, 444 edges, 52 points and 280 disabled queries; all pass in 4,587,356 interpreted steps. Complete inputs, outputs, resource hashes and native-check markers are retained in `analysis/model-sphere-shape-probes.json`.

Run `node tools/probe-static-sphere-contacts.mjs` for the connected static pipeline. It samples covered terrain cells and up to three upward-facing placed model faces per pack, using three declared normal-offset/velocity profiles and original five-sphere vehicle geometry. Across all 80 level packs it validates:

- 4,332 scenarios /25,992 registered cache records.
- 47,664 terrain and 2,792 model candidates; 57,300 terrain and 14,780 model queries.
- 4,060 initial and 6,496 regenerated events, all 10,556 processed.
- 9,796 aggregate contact stores and 740 spatial reinsertions.
- 80 full native terrain comparisons on actual level geometry, all matching, including scratch state.
- Signed body state, completed frame clocks, linked-list integrity and empty lists after cleanup.

Processed classes include ordinary impact1, penetration2, sliding8, removal16 and damping64. All contact times and classes are computed from installed geometry. The probe records 44 removal requests across 12 model-face scenarios. Diagnostics show zero penetration projection against a nonzero merged normal in all 44, rather than a zero normal sum. The corresponding shape normals/projections are retained in samples.

Object effects and body removal remain explicit inert callbacks. Bodies receiving removal requests are retained in this fixture so frame-completion and registration checks can finish; this does not establish the native state after removal. Other declared inputs include unit mass, zero restitution, recovered inertia/class rows, identity orientation with rotation integration disabled, free-ID order, attachment counts, selection counter0 and nearest-even conversion. Candidate lists are retained from the initial broad phase, matching the scope of the static regeneration path under study. No wheel forces, ordinary gravity preparation, queued attachment execution, captured runtime state or complete race equivalence is claimed.

## Retained evidence and next work

Existing complete terrain/model and primitive assembly is reused from `analysis/scene/results`. New replies under `analysis/native-simulation/results` are `040-terrain-edge-assembly.json`, `041-edge-direction-assembly.json`, `042-short-scale-transform-assembly.json` and `043-terrain-edge-switch.json`. Request044 exports `analysis/native-simulation/static-sphere-geometry-evidence-bundle.json`, containing 386 records and zero ledger unknowns. Individual replies remain hash-indexed in `analysis/native-evidence-index.json`.

Next reconstruct ordinary body preparation `0x47a8e0`, scripted motion `0x476550`, original effect/lifecycle implementations and queued attachments. Wheel stages, body-pair detection and static detection now have separate connected probes; combining them into complete multi-frame simulation still requires the missing frame preparation/runtime behavior.

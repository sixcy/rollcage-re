# Model sphere contacts

`src/model-sphere-query.mjs` reconstructs `0x424040`, extending the separately retained zero-radius ray API with native nonzero-radius geometry. It uses parsed MODC shape, face, face-record, edge and vertex records. The caller supplies placement-adjusted origin and velocity in Q8, radius in Q8, translation in Q16, a Q16 time bound, and an explicit x87 rounding mode. Output fields are mutable: `point` and `normal` are Q8; `scalar` retains the routine's branch-specific distance; `flags` and `query.surfaceRef` preserve native writes.

The complete convex plane screen subtracts the radius before rejecting candidates. Polygon containment collects authored edge IDs; the first repeated ID selects the finite-edge helper. Its endpoint flag redirects to the point helper. Starts inside a polyhedron select the maximum plane distance, with the first face retained on a tie. A positive-time face hit returns the interpolated sphere center, including its radius offset; this differs from a surface projection. Radius-zero inside queries retain the original no-overlap behavior.

The native endpoint/point branch writes `query.surfaceRef = -100 - maxFractionQ16`. Face and edge success instead write `-100 - shape.slot`. This unusual bound-based point reference is preserved rather than corrected. Misses clear flags while retaining branch-specific stale point, normal and scalar fields.

`src/placed-model-sphere-query.mjs` reconstructs outer query `0x423ab0`. It retains candidate order, signed active-tag comparison, special type-four routing, native yaw-table arithmetic, shrinking bounds, Q16 output normals and `cellRef = -4`. The four rotated X/Z probe fields are restored; the nested query's surface reference survives. Class one and class two admit nonzero-radius spheres and retain their separate effect paths. Geometry is implemented; the object-effect routines remain explicit caller callbacks:

- `onClass1Contact` returns whether to replace flags with `0x240`.
- `onClass2Contact` performs the class-two effect; accepted contact flags become `0x240`. The retained native instructions reset the class-two global state word before calling this boundary; the production callback owns the corresponding external state.
- `onObjectContact` receives the original probe velocity shifted to Q16 and returns whether flags become `0x840`.
- `onClass4Break` runs after a successful ordinary object contact only for class four with object state byte `+0x198` zero.

These callbacks are required when their native call site is reached. They are not claims that breakage, pickups or other object effects have been reconstructed.

Validation interprets retained x86 without running the original executable:

- `node tools/verify-model-sphere-query-instructions.mjs`: 2,035 instructions, 5,000 synthetic quad/triangle/point/edge/disabled fixtures, plus four explicit edge-to-endpoint checks. Point/edge, normalization, fraction, quadratic and square-root helpers execute retained instructions; only the security-cookie helper is stubbed.
- `node tools/verify-placed-model-sphere-instructions.mjs`: 2,447 instructions, 3,500 synthetic candidate batches and 1,199 explicit effect calls. It compares full output, the complete restored probe cache, native return, effect call order/arguments and the class-two state-word reset. Object-effect helper returns are declared fixture inputs.
- Both checks cover four declared x87 rounding contexts with nearest binary32 SSE arithmetic. They do not establish the original runtime's floating-point control words.
- Focused tests in `tests/model-sphere-query.test.mjs` and `tests/placed-model-sphere-query.test.mjs` cover native edge/point redirects, radius-offset geometry, stale fields, yaw, tag filters and effect boundaries. Existing ray tests continue to pass.

Primary retained evidence: `analysis/scene/results/173-model-shape-contact-assembly.json`, `193-model-polygon-containment-assembly.json`, `191-model-contact-query-assembly.json`, `196-model-query-switch-table.json`, `198-model-yaw-table.json`, plus the primitive instruction evidence listed in the generated check reports. Fresh short-vector cross instructions are retained in `analysis/native-simulation/results/042-short-scale-transform-assembly.json`. The generated reports retain exact REA Evidence IDs.

Installed-data validation now covers all 4,400 authored shapes in all 84 GFXM resources: `node tools/probe-model-sphere-shapes.mjs` runs 9,888 queries with 2,848 complete instruction comparisons, including every authored edge and point shape. All pass. The [connected static sphere probe](static-sphere-contacts.md) additionally connects placed-model and terrain geometry to cache selection, contact merging, event generation, response and spatial registration on all 80 level packs.

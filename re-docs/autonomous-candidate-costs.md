# Autonomous candidate geometry costs

`src/autonomous-candidate-costs.mjs` reconstructs complete position, obstacle and route candidate scoring with actual lookup-square-root and original packed model geometry. Every game decision in these five functions is implemented; no game callback is required.

| Address | Public API |
| --- | --- |
| `411fa0` | `evaluateAutonomousPositionCost(body, fromShortAddress, toShortAddress, radius, speed, distanceSq, {memory, scratchBase})` |
| `412070` | `evaluateAutonomousBodyDistanceCost(from, delta, targetIndex, radius, speed, distanceSq, segmentSq, lengthAddress, inverseAddress, {memory})` |
| `4126d0` | `evaluateAutonomousObstacleCost(fromShortAddress, toShortAddress, radius, speed, distanceSq, {memory, scratchBase})` |
| `412870` | `intersectsAutonomousObstacle(from, to, object, radius, index, {memory})` |
| `412270` | `evaluateAutonomousRouteCost(body, groupIndex, pointIndex, originShortAddress, radius, speed, {memory, scratchBase})` |

Memory is caller-owned and retains native addresses and pointers. Points are three signed 16-bit coordinates. `scratchBase` denotes native entry ESP; reserve lower space for nested calls. Populate the shipped yaw table at `5ed030` (the existing `initializeAutonomousWeaponTables` also does this), native nearby-object/precomputed-distance lists, model pointers and packed geometry. Producers and ownership of those runtime lists remain independent reconstruction work. No synthetic visibility or obstacle search replaces their inputs.

## Recovered details

`411fa0` initializes cached root/reciprocal dwords at entry ESP-16/-20 even when its nearby-count or body `6ec` bit20 gate fails. It computes independently wrapping short deltas at ESP-12 and rejects a signed squared segment length below4. `412070` shares the cached integer segment root and integer `65536 / root` across all nearby objects. Projection uses wrapped low32 multiplication before the arithmetic shift. Perpendicular coordinates wrap to signed shorts before their square/root. Classifications2/3 use weights55/60; others use50. Range attenuation and all signed integer divisions preserve native truncation. Actual root scratch globals `91d45c` and `91d460` are updated on each reached root call.

`4126d0` reads unsigned dword count `6e651c` and byte indices `920e80`. Type5 is skipped. The broad filters use the actual object radius, precomputed distance and wrapping short segment square. `412870` transforms the world segment using inverse yaw `256 - object199`, then traverses the original model polygon descriptors, packed 10-bit normals, vertex references and nine-byte plane selectors. A null polygon pointer terminates with0; a non-null polygon with zero planes accepts immediately. Plane endpoint rejection is strict, and radius expands the plane test. The native penalty interpolation can return a positive value; the JavaScript preserves that behavior instead of clamping it.

`412270` uses the independent progression group table at global `9092a0`, rather than assuming the autonomous pack group pointer. It walks at most three successful authored-direction segments, stops at an open endpoint and computes each caller-origin distance from the original segment start before invoking actual `411fa0`. The native short copies/cache scratch locations and nested entry ESP are preserved.

## Validation and evidence

Retained assembly: `374-autonomous-candidate-position-cost-assembly.json`, `523-candidate-distance-geometry-assembly.json`, `521-candidate-obstacle-cost-assembly.json`, `525-candidate-obstacle-geometry-assembly.json`, `376-autonomous-candidate-route-cost-assembly.json`, all in `analysis/native-simulation/results/`. Corresponding pseudos373/522/379/524/375 are retained there. The root helpers use existing scene evidence133/211. No new provider queries were required.

`node tools/verify-autonomous-candidate-costs-instructions.mjs` passes **20,000 synthetic fixtures**, **4,000 per native entry**, **779 retained instructions**, **13,758,474 interpreted steps**. There are no mocked callees. The comparison includes EAX, caller-owned source/target/cache storage, body/object/model/plane/route storage, root scratch globals and meaningful parent cache/delta locals. Cases exercise direction/open/cyclic routes, near/far filters, yaw0 and arbitrary yaw, all classifications, null/empty/multiple polygon traversal, packed plane normals, signed short wrapping and speed99/100 boundary. Nonzero results: position2,206; distance helper2,817; obstacle3,115; geometry2,667; route524. The obstacle comparison contains170 positive interpolation results.

`node --test tests/autonomous-candidate-costs.test.mjs` passes **10 focused tests** covering cache initialization/reuse, short wrapping/short-segment rejection, classification weights, inclusive distance gates, null/zero-plane semantics, endpoint/radius tests, inverse yaw, native positive penalty interpolation and independent route-table traversal.

Report: `analysis/autonomous-candidate-costs-instruction-check.json`. Separately, the special-modifier worker reports its actual-cost integration passing10,000 fixtures/1,396 instructions/4,053,064 steps, including5,174 actual position-cost calls and2,135 obstacle-cost calls plus explicit mutation-contract probes.

These are synthetic-memory comparisons against interpreted shipped instructions, not original-process runtime evidence. The root input domain remains nonnegative signed squared lengths; malformed overflowed geometry or zero-width division faults are not evidence of valid game runtime inputs. Producer setup and arbitrary aliasing into unrelated model/static memory are outside this validation claim.

# Reconstructed model ray queries

`src/model-query.mjs`, `src/model-transforms.mjs` and `src/placed-model-query.mjs` reconstruct the selected Redux build's zero-radius model hit path and four-wheel terrain/model selector. The queries consume explicit candidate lists, now supplied by `src/model-candidates.mjs` in the connected vehicle path. Mutable registration/lifetimes, destruction effects and nonzero-radius contact response remain incomplete. Serialized records and surface metadata are documented in [model-collision.md](model-collision.md).

## Shape ray query

`queryModelShapeRay(collision, shape, query, {positionQ16, maxFractionQ16})` ports `0x424040`'s zero-radius branch. Input `originQ8` / `deltaQ8` are already rotated into the object's yaw-adjusted world frame. Position remains Q16. The output carries `flags` and `fractionQ16`; a hit adds Q8 point/normal/distance, `faceIndex` and `querySurfaceRef = -100 - shape.slot`. This helper's normal is Q8, unlike the outer placed-model result's Q16 normal.

The complete convex-plane screen precedes polygon containment. It checks every referenced plane: an outside/on-plane origin must approach it and reach it by the supplied fraction. The later pass visits faces in serialized order. It projects inside starts, intersects outside starts and performs the native triangle/quad containment on signed-short world coordinates. Polygon boundary is `[a,c,b]` for triangles and `[a,c,d,b]` for quads. Native outside-edge codes and the 15-entry rejection limit are retained.

A returned face hit must have a strictly positive fraction and lie inside the polygon. Radius-zero inside starts and zero-travel surface starts do not become overlap hits. Disabled shapes return the supplied fraction with flags zero; point/edge shapes return zero with flags zero. Other miss paths also distinguish the supplied bound from zero. The outer query ignores a helper's fraction when its flags are zero; callers must do the same.

The fraction limit is inclusive, unlike the terrain ray's exclusive limit. `0x451210` divides `((int64)ECX << 8)` by EDX, after its caller has already shifted the plane distance left by eight with 32-bit wrapping. Hit-point multiplication uses a signed 64-bit product shifted by eight, while the fraction's low eight bits are discarded before multiplication. Preserve those separate operations. Integer plane/cross products still wrap at 32 bits.

`modelPolygonOutside` ports `0x424a40`, retaining short-coordinate wrapping, edge order and the native two-edge codes. Nonzero query radii are explicitly rejected; their point/sphere and edge/sphere helpers remain separate.

## Placed-object transform and filters

`rotateModelYaw` and `toModelYawQuery` use the original signed Q14 sine/cosine table at `0x5ed030` / `0x5ed0b0`. The 321 shorts include the overlapping quarter-period cosine span and inverse-yaw endpoint. `node tools/recover-trig-table.mjs yaw` verifies all 642 bytes against both the selected executable's file-backed PE section and retained Ghidra memory. The table is saved in `src/yaw-table.json`, with source hash, address, file offset 2,015,280 and Evidence ID. Entries shift right by six before separate signed 64-bit products and shifts; no floating-point trigonometry is substituted.

`queryPlacedModelRay(candidates, query, options)` ports `0x423ab0`'s radius-zero geometric path. Each candidate supplies its collision reader output, selected shape and ordinary-placement settings. It retains native order, object class filtering, per-shape configuration filtering, query-tag tests, inverse/forward yaw transforms and the last accepted hit when fractions tie. Class 1/2/5 candidates are skipped in this zero-radius path. Type 5 is skipped. Type-4 tag routing depends on explicitly supplied vehicle context. Accepted results carry Q8 point, Q16 normal, Q8 distance, fraction, flags and native cell sentinel -4, plus source candidate/placement/shape indices.

Breakable type-4 contacts require an explicit `onBreakableContact` handler. The callback receives candidate, world query and local hit, and owns object-state/effect updates. A true return produces the native `0x840` hit classification; false retains the geometric classification. Without a handler such a hit throws rather than silently declaring effects reconstructed. Native421da0 and its damage/debris/destruction-queue/observer-camera children are now actual raw references; see [placed-object damage](placed-object-damage.md). The raw423ab0 sphere wrapper binds them with actual temporary velocity/storage. This legacy pure-query API retains its explicit hook. Existing corpus probes and outer-query instruction checks declare inert destruction state, so the helper returns false in both compared paths.

## Four-wheel selection

`selectWheelHits` ports `0x488e20` with injected terrain/model query functions. All four terrain calls occur before any model call. Fractions are compared unsigned. A closer model result replaces the selected fraction; otherwise only the saved terrain flags and fraction are restored.

The shared result buffer preserves any model-written point, normal, distance and cell reference even when the model fraction is farther away. This is confirmed in retained assembly and preserved by the port. It can produce a result with terrain flags/fraction and model geometry fields. Do not replace it with a conventional nearest-hit merge without new evidence that a different native path applies.

## Static spatial placement lists

`src/model-links.mjs` decodes the static placement lists read by `0x429360`. GFXM u32 `+0xac` points to the u32 index table; u16 `+0x96` bounds it. A spatial node's first word supplies a three-bit count at bits 19..21 and start at bits 22..31. Native code increments the start pointer before each read, so references are `start+1` through `start+count`. Serialized small indices become ordinary-placement pointers in the runtime loader; the reader retains bounded placement indices and preserves order/repetition.

`node tools/validate-model-links.mjs` validates all 80 level packs: 25,064 table entries, 96,348 nodes, 17,432 populated lists and 26,108 placement references. Unused table values remain raw. The report is `analysis/model-link-catalog.json`. `src/model-candidates.mjs` now consumes these lists and ports the original aggregate-radius acceptance screen; see [connected contacts](vehicle-contacts.md). Full sphere contact response remains separate.

## Verification

The full focused suite has 112 passing tests. Fixtures cover model hit arithmetic, inclusive limits, inside/on-plane misses, triangle/quad containment, translations, yaw quantization, class/tag filters, explicit effect handling, wheel call order, result-buffer restoration, static placement links and connected candidate/contact stages.

The bounded x86 interpreter is shared in `tools/lib/bounded-x86.mjs`. It executes retained static instructions in an allocated byte buffer, admits external calls per checker and does not launch the original executable. The terrain query's original 4,000-fixture comparison still passes after extracting that interpreter. These checks do not prove full game/runtime equivalence.

| Command / report | Scope and result |
| --- | --- |
| `node tools/verify-model-query-instructions.mjs` / `analysis/model-ray-instruction-check.json` | 4,000 synthetic rays; 950 retained shape/containment/fraction instructions; 1,084 hits and 2,916 misses, all matching. Only the security-cookie check is stubbed; sphere helpers are not admitted. |
| `node tools/probe-model-rays.mjs` / `analysis/model-ray-probes.json` | 9,888 aimed rays through installed model faces/shapes, including 2,472 retained-instruction comparisons; 7,896 hits and 1,992 misses, no failures. Inputs include declared fractional object translations. |
| `node tools/verify-placed-model-instructions.mjs` / `analysis/placed-model-instruction-check.json` | 3,000 synthetic candidate lists; 1,362 retained instructions, native yaw/class/tag handling; 532 hits and 2,468 misses, all matching. Destruction state is explicitly inert and its helper returns zero; the cookie check is stubbed. |
| `node tools/probe-placed-model-rays.mjs` / `analysis/placed-model-ray-probes.json` | 3,588 synthetic aimed queries using installed placements and yaw, including 449 instruction comparisons; 932 hits and 2,656 misses. Inert destruction state is declared. |
| `node tools/verify-wheel-selector-instructions.mjs` / `analysis/wheel-selector-instruction-check.json` | 2,000 deterministic sets of mocked terrain/model outputs against the 72 selector instructions; shared buffers, fractions and call order all match. Callee geometry queries are modeled inputs here. |

Complete native replies are retained in `analysis/scene/results`: `173` shape query, `191` outer placed query, `192` selector, `193` containment, `196` switch table, `197` fraction helper assembly, `198` yaw bytes and `199` destruction helper. The new Evidence ledger is `analysis/scene/model-query-evidence-bundle.json`. Level-one samples are saved in `analysis/level1-model-ray-probes.json` and `analysis/level1-placed-model-ray-probes.json`.

## Remaining simulation boundary

Spatial model lists and original body-radius screens feed the selector and wheel-side preparation with the recovered common wheel configuration. See [connected contacts](vehicle-contacts.md) for native initializer checks and installed-data coverage. [The vehicle frame stage](vehicle-frame.md) now includes drive capacity, assists and derivative refresh. Raw nonzero-radius model queries and damage now match1200 cases including fractional placements and93 query/output aliases, and run inside240 ordinary physics-parent cases. Additional class1/2/4 effects, complete constructors and populated vehicle/script/world race integration remain open. The connected code is a reconstruction component, not a playable rebuilt game.

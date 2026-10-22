# Vehicle terrain projection (`481200`)

`src/vehicle-ground-projection.mjs` reconstructs the `450e50` stage at `481200`, its `481390/481450` children, and corner helper `4815d0`. It casts vertical terrain rays and writes four projected signed-short XYZ corners plus shade bytes into the inline renderer block at body `+728`. This describes the recovered geometry; identifying the final rendered feature as a shadow would additionally require its renderer consumer.

```js
updateVehicleGroundProjection({
  memory, views, grid, roundingMode,
  scratchBase: native481200EntryEsp,
});
```

`views` and `grid` are the same coherent mappings used by `queryRawTerrain`; the runtime can be composed as `{...runtime, ...runtime.nativeTerrain}`. The stage reads the existing native terrain candidate rows at body `+154/+15c`. Candidate and body storage must share `memory`; no supplied contact answers or callbacks are needed. An empty session requires no terrain context because it reaches no query. `scratchBase` is this function's actual entry ESP, not the outer race-loop entry.

## Native order and storage

The parent captures the initial session `+54d` participant count and prepares one 72-byte ray record per participant. XYZ starts at `(position + body2f3c/40/44) >> 8`, using wrapping signed addition. Delta is `[0, 4000h, 0]`, radius and tag are zero, and the query bound is `1010000h`. Terrain calls use actual `424ff0`; fractions are written to `7130c0 + 4*index`.

Preparation uses the captured count. The query pass reloads the session root after each query and uses that live count for continuation. Evaluation starts through the last retained session pointer. It reloads the root only after the successful branch calls `481450`; the failed branch retains its previous pointer. All participant body pointers are read live. Tests include parent aliases that mutate the count or session-root bytes through the body's `+72e` flag and corner shade stores.

`smoothVehicleGroundProjection` implements `481390`. A contact with zero flags or a nonpositive signed fraction returns zero and leaves the normal, relative vector, and smoothing state untouched. Otherwise it computes relative contact coordinates and updates `body+2958/5c/60` to `(3*old + contactNormal)/4`, with signed wrapping before division toward zero. The native reads the next old component before writing the preceding output, which matters when output aliases the smoothing state.

The parent sets body `+72e` to one for an accepted smoothed contact, or zero for rejection. `writeVehicleGroundProjection` (`481450`) additionally clears that byte when the signed absolute normal Y is below `1000h`; this includes the native `INT_MIN` absolute-value wrap. On the accepted path it:

- Computes the plane offset from the actual Q16 dot product and replaces normal Y in place with its negative Q16 reciprocal.
- Forms two footprint directions from matrix columns multiplied by `380h`.
- Calls actual corner arithmetic in flag order `3,2,1,0`.
- Stores four XYZ short triples at `body+728 + 8*corner`, applying a small shifted-normal offset.
- Computes the byte at each corner `+7` from clipped signed height, wrapped multiplication by the original absolute normal Y, and truncation toward zero.

`computeVehicleProjectionCorner` preserves its X, Z, Y store order and live body-coordinate reads if its output overlaps the body. Unwritten padding and prior contact payload remain retained. All helper temporaries consumed by later calls use their original stack addresses; the parent local frame begins at entry ESP minus `2dch`.

`481100`, now recovered as part of [vehicle construction](vehicle-construction.md), initializes and registers this same inline block. The `481200` call graph contains no event-queue operation: its direct calls are terrain query, smoothing, projection, and compiler-cookie checking. The connected comparison retains and compares the populated physics event queue unchanged through this stage. Later renderer submission remains a separate consumer.

## Evidence and checks

Requests `2850`–`2857` retain complete pseudocode and assembly. Key assembly Evidence IDs are:

- `481200`: `ev_e3f0edcd469c6cdea6fc970c4b417fd7fa3d6564c5a4fff954427ee341dcf951`.
- `481390`: `ev_41cb7389e11824289b357151f02467aa11373f12ce69e435526084d150179d18`.
- `481450`: `ev_dfd75040f47c03a8ef066449782f59df8b52d2daa0ef837bacb26365ae1dfafc`.
- `4815d0`: `ev_94507c534bda92cc2df5b9029d1e2f42bd98e39650312a90b589e9391e2b0e69`.

`node tools/verify-vehicle-ground-projection-instructions.mjs` passes **723 actual physics-to-projection sequences and 6,000 raw helper calls**, 10,969 reached instructions and 97,948,244 interpreted steps. Each persistent tick first runs complete actual `4749e0`, including `4287f0` spatial/terrain/model candidate production, wheel contacts, and collision/event processing, then `481200` with actual terrain descendants. The comparison checks every byte from `10000h` to the end of the 10 MiB buffer after both stages, with no excluded differing addresses. Only the checked compiler-cookie service is external. Report: [vehicle-ground-projection-instruction-check.json](../analysis/vehicle-ground-projection-instruction-check.json).

The constructed worlds cover zero through six participant records; five/six-record cases deliberately alias some of the maximum four distinct physical vehicles. Three successive ticks preserve smoothing, candidates, queue state and temporary reuse. There are 1,027 enabled outputs and 1,118 disabled outputs in the ordinary sequences. Three additional parent aliases distinguish live counts and selective session reloads. Helper cases include signed wrapping, byte flag masks, exact `1000h` boundaries, nonpositive fractions, large normals, stale outputs, and overlapping vectors/body fields. Eight focused Node tests pass.

This is interpreted native agreement over explicit synthetic session, world, material, candidate and queue producers, not original-process runtime evidence or proof over all installed tracks and renderer topologies. No game files were modified and the original executable was not run. The remaining boundary is upstream world/session construction and downstream renderer consumption, not an unrecovered callee inside this stage.

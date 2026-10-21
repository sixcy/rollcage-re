# Respawn terrain candidate fill

`src/respawn-terrain-candidates.mjs` ports `FUN_0047d9c0` from Rollcage
Redux 1.3.8.0. This is the terrain-region append used by the respawn placement
query, distinct from the ordinary frame candidate builder.

The retained pseudocode is
`analysis/native-simulation/results/106-respawn-terrain-fill.json`, Evidence
`ev_974f5031661e3549e6bf23cabb5dce55fcd0383c6d04b158c02a31ea331a2b8c`.
The decisive assembly is `108-respawn-terrain-fill-assembly.json`, Evidence
`ev_9e149e55dbd1834a43a92be382818d57eb456c93ceaa7aa0cd5362eabc163abc`.
Plane-screen assembly `analysis/scene/results/205-candidate-plane-filter-assembly.json`
has Evidence `ev_ece0a65caac5226307e6a8746890b1ed11ced43ede51d3b008d12571e1abc1df`.
These are static binary observations, not native-process execution.

## Recovered behavior

The function precomputes signed-short vertex distances, shifts the wrapped
squared sum right by six and saturates values outside the unsigned 16-bit range
to 65535. It walks cells in row-major order and preserves the first nearest
corner on ties. Padding contributes its squared value to the region threshold.
Cells outside the radius can still pass that threshold, but the nearest-corner
edge-dot test rejects the exterior wedge.

Plane screening calls the real `4292a0` with `0x80000000`. Thus a negative plane
distance passes even for a deep overlap. The packed normal/result cache resets
its comparison word per row, while retaining the preceding acceptance result.
Quad and both triangle-split orders follow the ordinary parsed grid forms.

The list differs from the ordinary builder in several material ways:

- There is no 64-entry clamp. The working cursor keeps growing; only the final
  write to `70f28c` truncates to unsigned 16 bits.
- A write preserves byte 0's high nibble and all of byte 2 in the reused
  16-byte candidate slot. Unwritten slots remain intact.
- Cell duplicates are checked against the count captured at function entry,
  using cell ID and the candidate's low type nibble. Newly appended candidates
  are outside that duplicate search. Border candidates are not deduplicated.
- Borders follow cells, left then right. The tests use sector column zero and
  the full sector column count, rather than the ordinary path's trimmed
  `left`/`right` edges.
- Zero rows or columns leave the nearest-ID stack local uninitialized. The
  initial metric `0x7fffffff << 6` wraps to `-64`, which can replace the prior
  closest result. The port requires the caller to supply the corresponding
  scratch value if that path selects it; it does not manufacture an ID.

The border normal word is the actual packed border normal. In assembly,
`47e0c3` stores it while two arguments remain pushed; after the stack adjustment,
`47e0db` reloads that same slot. Accounting for those pushes matters when tracing
the reused local. Full-byte comparisons confirm ordinary packed normals here.

## JavaScript interface

```js
appendRespawnRegionCandidates(grid, region, query, centerS16, radiusSquared, state)
```

`query` supplies `originQ8`, `deltaQ8` and `radiusQ8`. `state` supplies
`candidates`, an explicit unsigned `count`, `closestId` and
`closestDistanceSquared`. `closestId` is the packed native sector/column/row
word. `closest` is also assigned its decoded descriptor when an update occurs.

Candidate storage belongs to the caller. Each writable slot must contain
`flagsByte0` and `byte2`; an optional `createSlot(index)` can provide explicitly
initialized new slots. The helper replaces the recovered fields of each
written slot and keeps all later slots. `packedNormal` and `normalQ8` describe
the stored normal; `planeNormalIndex`/`normalIndex` identify its parsed grid
entry. `vertexBase` is an index into the selected sector's vertices, with the
native vertex-pointer address represented by that reference.

For zero-dimensional regions, `state.scratch.nearestId` supplies the caller's
explicit uninitialized-stack model if the wrapped metric replaces the closest
result. This is a fixture boundary, not knowledge of the value in a live game.

## Verification and limits

`node tools/verify-respawn-terrain-candidates-instructions.mjs` interprets all
620 retained instructions of `47d9c0` and `4292a0`, without external arithmetic
callbacks. The 4,000 synthetic fixtures compare the complete retained arena,
the stored count and both closest-result globals: 52,015 appends, 4,246 border
appends, 263 zero-dimensional regions, 159 lists above 64 entries and 872 cases
with seeded prior duplicates. A separate native-instruction fixture crosses
65535 and verifies the two writes at slots 65535/65536 followed by stored count
one. The run executes 11,920,897 bounded instructions in total. Its report is
`analysis/respawn-terrain-candidates-instruction-check.json`.

`node --test tests/respawn-terrain-candidates.test.mjs` passes eight focused
regressions for these contracts. These checks establish equivalence on the
declared synthetic grids. They do not establish live respawn frequency,
gameplay selection, caller initialization of scratch bytes or native runtime
behavior of the complete respawn transaction.

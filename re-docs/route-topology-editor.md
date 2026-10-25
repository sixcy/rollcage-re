# Route topology editing

`src/race-route-topology.mjs` adds a serializable full route graph for cloning
an existing group, extending it before/after a selected point, and explicitly
connecting either of a point's two native outgoing slots. It does not draw
blank groups or delete authored groups/points.

The graph has stable string group/point identities. Native numeric indices are
derived only when compiling. An authored group's `sourceGroup`, and an authored
point's `sourcePoint`, identify their original records. Added points retain an
`anchorPointId`, including clone points, so supported-terrain validation can
trace their placement to authored geometry. These identities must survive
project JSON serialization. Cloned groups also retain `cloneOfGroupId`, with
acyclic provenance leading back to an authored group. `hydrateRaceRouteTopology(data, topology,
sparseRoutes)` also accepts legacy sparse route rows by source identity.

## Native bounds and metadata

Group 0 remains an unchanged reserved group. Up to 31 usable group IDs fit the
five-bit fields. Although the packed links have nine point-index bits, the
safe editor limit is **256 points per group**, with indices 0 through 255.
Native `421260` writes point IDs into candidate row byte `+2`; `4210b0` and
downstream planning read that byte. Retained instruction comparisons explicitly
cover point 300 becoming 44. The editor rejects overflow instead of truncating.
See [candidate builder evidence](autonomous-candidate-builder.md), retained
`350-autonomous-candidate-origin-assembly.json` and
`501-autonomous-candidate-append-assembly.json`.

Group headers are 12 bytes: count at `+0`, reverse at `+2`, scenery blocker
counter at `+3`, cyclic flag at `+4`, recovery group identity at `+5`, and the
relative point pointer at `+8`. Native `47fc20`/`410bd0` read progression header
byte `+5`; `47f5c0` copies it to body `+6c0` during respawn application. A clone
receives its new serialized group identity. Cloning a group with a nonzero
blocker counter is rejected because its scenery blocker ownership has not
been cloned. Original groups keep their numeric order, preserving placement
`+28`/`+29` blocker IDs in the paired BTP resource. Earlier scenery compilation
may adjust the current source's blocker counter; route compilation preserves
that adjusted value rather than restoring the project baseline counter.

Point records retain their signed-short XYZ, both speed bytes, the full flags
dword and the packed-link high nibble. Links are group/point fields at bits
0..4/5..13 and 14..18/19..27. Even unused links retain their nine unused point
bits. Group header bytes not interpreted by the editor remain intact. Authored
empty groups are retained byte-for-byte and cannot be cloned.

## Compilation and connectivity

Cloning remaps links targeting another point of the same cloned group to the
new stable IDs. External outgoing links retain their targets. Original incoming
links remain unchanged until an explicit connection operation. Connecting an
occupied slot requires the caller to request `replace: true`.

New groups require an incoming path from, and an outgoing path to, an authored
usable group before Test/export. `requireConnected: false` permits an incomplete
draft preview and emits warnings. Both `validateRaceRouteTopology` and
`compileRaceRouteTopology` are strict by default.

Compilation appends new group/point tables, updates GFXM `+79`, `+8c`, `+98`,
group counts, relative point offsets, recovery identities and all packed link
indices. Original source point identities remap spatial fallback group/point
words, consumed by native `48da10`. The following model-reference words,
consumed by `429360`, remain unchanged. Complete fallback/model sequences are
rebuilt when remapping is necessary, avoiding in-place corruption if starts
alias a model word in another sequence. The existing offline fallback geometry
policy can also select an inserted point when it improves the appropriate
authored group's spatial coverage. Native 10-bit starts and 16-bit table counts
are checked. This remains an explicit editor policy rather than a reconstruction
of the original offline authoring tool.

Unchanged full graphs compile to identical bytes. Sparse legacy layout projects
can hydrate onto a full graph without modifying checkpoint/start editing.
Resources and installed archives are never written by the topology module.

## API

- `createRaceRouteTopology(data)` returns `{version:1,nextId,groups}`.
- `hydrateRaceRouteTopology(data,draft=null,sparseRoutes=[])` clones, merges and
  checks a draft, permitting incomplete new-group connectivity.
- `validateRaceRouteTopology(data,topology,{requireConnected=true})` returns
  `{valid,errors,warnings}`.
- `cloneRaceRouteGroup(topology,groupId)` returns
  `{topology,groupId,pointIds}`.
- `insertRaceRoutePoint(topology,groupId,pointId,{side='after',position})`
  returns `{topology,pointId}`. Without a position, it proposes a midpoint;
  open endpoints require a distinct explicit position.
- `connectRaceRoutePoints(topology,fromPointId,slot,toPointId,{replace=false})`
  returns a new topology. Slots are 0 and 1.
- `compileRaceRouteTopology(data,topology,{requireConnected=true})` returns
  `{data,remap,changed,warnings}`. Remaps include source numeric IDs and every
  stable point ID's serialized `{group,point}`.

Helpers do not mutate their inputs. New points inherit the selected point's
speed/control metadata; sequential traversal handles their insertion, so they
start with empty branch slots rather than duplicating an existing branch.

## Validation

`node --test tests/race-route-topology.test.mjs` passes 15 focused regressions.
`node tools/validate-route-topology.mjs NEW_REPORT.json INSTALLATION` checks all
40 LOW/HIGH variants, byte identity, representative insert/clone/connect edits,
all native packed references, paired-compatible remaps/metadata and preserved
fallback model words. The retained result is
`analysis/route-topology-editor-matrix-20261025-v2.json`.

The corpus check ran 36 reconstructed sessions for 90 ticks with three Expert
cars and weapons enabled. LEV16/17 route topology is validated; their Racing
Test remains disabled. These checks are source runtime and retained static
instruction evidence. The matrix does not launch the original process or claim
complete-race equivalence.

Separate original-process evidence now exists for isolated LOW/LEV1 and
HIGH/LEV1 topology/assembly fixtures:
`analysis/native-topology-assembly-low-acceptance-20261025-v1.json` and
`analysis/native-topology-assembly-high-acceptance-20261025-v1.json` each pass 532
independent checks, with all 171 pristine source installation files unchanged.
Native relocated route headers and selected inserted/cloned point blocks,
rebuilt checkpoint planes/ID order, and all six actual car constructors match
the exported bytes. Original placements 31/32 and cloned placements 124/125
have disjoint linked bodies, mutable collision-configuration pointers,
destruction groups 10/24 and freshly allocated local particle attachments.
This is loader/construction/first-pickup-tick acceptance. Actual lap/timing
crossings, natural destruction and added-pad wheel contact use the separate
bounded lifecycle observer; this initial result does not establish them.

The preparer is `tools/prepare-native-topology-editor-validation.mjs`; it writes
new isolated installations and never launches them. Frozen helper/wrapper
policies for LOW and HIGH both passed the real typed PowerShell/C#
`-ValidateOnly` path. `tools/check-native-topology-editor-validation.mjs`
independently checks retained original-process captures; policy-only validation
is reported separately by `tools/check-native-topology-editor-policy.mjs`.

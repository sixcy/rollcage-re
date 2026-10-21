# Authored respawn routes

`src/respawn-routes.mjs` parses the installed Rollcage Redux 1.3.8.0 route
groups consumed by `47ccc0` and the progression byte passed to `47d440`.
It preserves serialized bytes and resource-offset identities, including
overlapping point spans supplied by a resource.

## Authored versus runtime offsets

The caller global `90b98c` points to runtime pack `909240`. Consequently the
route table at runtime `+60` and count byte at runtime `+46` are not fields at
those offsets in a raw GFXM file. Loader `44c2b0` establishes this mapping:

| Authored GFXM field | Meaning | Runtime representation |
| --- | --- | --- |
| byte `+79` | Number of 12-byte groups, including group zero | Pack byte `+46` (`909286`) |
| u32 `+8c` | Resource-relative group-table offset | Pack pointer `+60` (`9092a0`) |
| u32 `+98` | Resource-relative point-array base | Added to each group's serialized u32 `+08`, together with the resource address |

Assembly `44c472..44c4ac` reads these authored fields and relocates every
group's pointer. `44cb08..44cb11` publishes the table pointer and
`44cb2b..44cb2f` publishes the count. `44c4f6` assigns the runtime pack address
to `90b98c`. These instructions are retained in
`analysis/scene/results/068-loader-assembly.json`, Evidence
`ev_f5eddfe878790ed034b165f848b3f30c76f84c3a9ca63310c4a967679e949ff6`.
Loader pseudocode is `analysis/asset-formats/results/006-pseudo-load-e.json`,
Evidence `ev_7223d7b195c9dce27ce3662ae697bc4ec68ff0400b307243f911e04006d50751`.

The group layout is unsigned count `+00`, reversal byte `+02`, opaque fields
`+03..+07` including progression byte `+05`, and point-relative u32 `+08`.
Adding that last value to the authored point base produces the resource-relative
point location. The `47ccc0` traversal skips group zero, walks each point with
16-byte stride, and reads signed-short XYZ at `+00/+02/+04`. It does not decode
the remaining ten point bytes. This consumer is retained in
`analysis/native-simulation/results/098-post-frame-body-states-assembly.json`,
Evidence `ev_b9ab8b14c0affb661a9411d957ed11316ec5017676e0587a0224e8440a223faa`.

## Interface and alias contract

`parseRespawnRoutes(data)` returns `countByte79`, its runtime-interface alias
`countByte46`, `tableOffset`, `pointBaseOffset`, and `groups`. Groups retain
`index`, `offset`, `count`, `reverseByte2`, `byte05`, `pointRelativeOffset`,
`pointsOffset`, the complete serialized 12-byte `bytes` view and a `points`
array. Each point supplies its resource `offset`, signed-short `position`,
and complete 16-byte `bytes` view. The input resource is not relocated or
otherwise modified.

One cached point object exists for each resource offset. Repeated or overlapping
group ranges therefore share the same point and position-array identities.
Identical coordinates at different offsets remain distinct objects.
`routes.pointAtOffset(offset)` exposes this identity cache, while
`group.pointAt(index)` admits reads of adjacent native-readable records outside
the group's declared count, with resource bounds still enforced. This supports
the outer routine's previous-point read for a one-point group without inventing
neighbor coordinates. Zero-count group offsets are preserved without point
dereference. Invalid headers, table spans, nonempty point spans and out-of-file
adjacent reads fail explicitly.

The byte views alias the decoded resource buffer. Parsed scalar fields and
coordinate arrays are snapshots; the parser is intended for immutable asset
data. Mutating a shared point's coordinate array is visible through its other
point aliases, but does not rewrite its serialized bytes.

## Installed corpus and validation

`node tools/validate-respawn-routes.mjs` validates all 84 GFXM resources and
writes `analysis/respawn-route-catalog.json` with resource SHA-256 values and
complete group-header inventories. All resource bytes, point coordinates,
point bounds and repeated lookup identities agree. The corpus contains:

- 628 groups: 84 leading headers and 544 later groups.
- 80 resources with usable later groups; four front-end packs have none.
- 15,160 point references at 15,160 unique resource offsets, with no shared
  authored point spans in this corpus.
- 88 empty groups in total, including every leading header; nonempty groups
  contain 4 through 119 points.
- No one-point groups and no consecutive equal positions within a group.
- Reversal bytes only zero or one. The retained progression bytes range from
  zero through 13; their gameplay interpretation is not inferred here.

The coordinate bounds are X `[-7095,8852]`, Y `[-1512,1951]`, and
Z `[-8924,14607]`. Many absolute resource point offsets are not 16-byte aligned;
the format uses a 16-byte stride, without requiring that file alignment.

`node --test tests/respawn-routes.test.mjs` passes six focused tests, including
overlapping ranges, signed-coordinate boundaries, preservation of opaque bytes,
empty groups, invalid spans and adjacent reads. These are static asset/parser
checks. They do not establish live route choice or complete race progression.
The outer stage's separate native-instruction checker establishes its traversal
and callback behavior on synthetic runtime tables.

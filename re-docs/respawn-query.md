# Respawn placement and obstruction queries

`src/respawn-query.mjs` reconstructs placement probe `0x47d040` and obstruction caller `0x47d710`. They test a proposed position using temporary body/shape storage; route selection and respawn application are separate.

## Placement storage and order

`probeRespawnPlacementBytes(sourceBody,positionQ16,options)` uses caller-owned `{bytes:Buffer}` objects for the original and retained clone. Type3 copies `0x3e78` bytes; other types copy `0x180`, leaving the clone's remaining bytes unchanged. A supplied quaternion becomes nine signed16 matrix entries before copying. Its matrix destination may alias the original body; padding at `+0xd6` remains unchanged.

The signed count at `+0x10c` controls fresh allocation/copy of individual records and the aggregate, each72 bytes. Actual shape-cache arithmetic runs at the retained frame clock. The aggregate center becomes the proposed position in Q8 and its sweep becomes zero; mode2 changes its radius to8000. Candidate counts reset and nearest-distance storage becomes INT_MAX. Lookup precedes respawn terrain/model appends; type4 skips model append. Obstruction still runs after an outside lookup. Temporary shapes are released in reverse order, preserving freed record bytes and native free/active/reverse-index bookkeeping. Output nearest reference starts at-1.

Required options are `pool`, retained `clone`, integer `mode`, mutable `output:{value}`, mutable `terrainState`, and `handlers:{lookup,appendTerrain,appendModels,testGeometry}`. Optional orientation uses a16-byte quaternion Buffer and18-byte rotation Buffer. Optional `timeOptions` reaches shared cache arithmetic. `terrainState.count`, `.closestId` and `.closestDistanceSquared` alias the clone's actual fields. Candidate slots and nearest scratch remain retained caller storage. `respawnShapeCacheView` exposes byte-backed cache fields.

`lookup(positionQ16,clone)` returns `{outside,regions}`. Terrain callbacks receive `(clone,aggregateRecord,region,centerS16,radiusSquared,terrainState)`; model append receives `(clone,aggregateRecord,0)` and writes the clone's model count. Final callback `(clone,originalBody,mode)` returns nonzero for obstruction. Actual parsed geometry implementations are connected by the installed-data probe. The public API does not invent copied native bytes from a partially reconstructed JavaScript body.

## Obstruction arithmetic

`queryRespawnObstruction(probe,originalBody,pool,options)` first queries static geometry with bound0. Nonzero mode checks the aggregate once. Mode0 checks `count-1` individual records: count1 performs no static queries. Native mode0 counts zero or negative do not terminate normally; the reference exposes a configurable shape-query workflow budget for that invalid domain.

Physical-list screening skips the original by identity and excludes types4/22/12/17. It preserves logical `>>>8` on signed position differences and the native wrapped polynomial `x*x + (y+z)*z`, rather than substituting a symmetric sphere distance. Comparisons use unsigned wrapping. Options supply `physicalGroup:{bodies,count}`, `terrainQuery`, `modelQuery` and retained `output`. Geometry output writes and flags remain observable.

## Evidence and checks

Retained results099/100/105/107 under `analysis/native-simulation/results/` contain the relevant pseudocode/assembly; cache/allocation callees were retained earlier. `node tools/verify-respawn-query-instructions.mjs` matches906 instructions across1200 placement and1800 independent obstruction fixtures:4570 geometry calls,4200 temporary shapes and10672650 interpreted steps. It compares complete source/clone/pool bytes, free/active/reverse tables, callback snapshots and output. Parsed lookup, appends and geometry are explicit mocks in the caller comparison; actual quaternion/cache arithmetic runs retained instructions. Copy-pointer globals and rendering scratch are outside its public outputs. The independent obstruction comparison executes its complete107-instruction routine.

This comparison exposed a verifier defect: an untyped memory MOV from AX was treated as32-bit, overwriting matrix padding. `tools/lib/bounded-x86.mjs` now infers byte/word store width from the source register. The57-tool instruction sweep passed after that correction.

`node tools/probe-respawn-placement.mjs` connects actual respawn terrain append47d9c0, model append, terrain/model sphere geometry and obstruction on all80 installed level packs. All3660 declared positions pass:1956 accepted,1704 terrain-rejected,33256 terrain candidates,756 model candidates and21960 temporary allocations. Model geometry runs1956 times but produces no hits in these placements; model-hit coverage is not claimed. Each query preserves original body bytes and restores free IDs/counts and the active source prefix.

Profiles are80/10/40 units above one middle covered cell per sector, modes1/1/2, identity orientation, zero velocity, original five-sphere geometry plus wheel-extended aggregate, and declared initial registration40 units above the cell. The dynamic list contains only the excluded source; independent instruction fixtures cover dynamic screening. Effects remain explicit callbacks. These are supplied static states on installed data, without original-process execution, captured trajectories, runtime body producers or complete race equivalence.

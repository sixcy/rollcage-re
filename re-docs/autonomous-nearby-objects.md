# Nearby bodies and obstacles for autonomous costs

`src/autonomous-nearby-objects.mjs` reconstructs Redux 1.3.8.0 `411e70` and `4125a0`, the producers of the filtered body/obstacle tables consumed by candidate cost evaluation. Independent retained-instruction verification required no source change.

The subsequently traced native producers `480760/480bf0/480e90` identify registry `849a5c` as a preallocated spawned world/fragment-body pool. It is distinct from the six participant records at `909300`. A supplied synthetic registry containing racer-like bodies is a declared fixture arrangement, not evidence that the native pool is the participant registry. See [autonomous-world-registry-producers.md](autonomous-world-registry-producers.md).

Both exports take `(bodyAddress, {memory, scratchBase})`; `scratchBase` is native entry ESP. `populateAutonomousNearbyBodies` produces the nearby-body byte count/index list and distances. `populateAutonomousNearbyObstacles` produces the obstacle dword count/index list and accepted distances. The caller supplies mapped runtime state, populated source registries and valid routes. These routines contain no unresolved game callbacks or OS calls.

## Direction and origin

Each routine captures the original body's signed-short high XYZ words before calling actual `491ce0`. The direction output is retained at entry ESP minus12. The route record is `909300 + u16(body+65e)*30c`; its registered body may differ from the original caller body.

Direction normally follows the progression route stored in record54/58. If its group differs from the registered body's autonomous group6c0 and their direction flags differ, `491ce0` first walks the autonomous route locally and derives its direction instead. Thus the original caller's position supplies the distance origin, while a separately registered body can supply route/direction state. The captured origin remains valid when direction output aliases and overwrites the original body's position.

The implementation uses the checked route geometry, normalizers and fixed dot product. Their integer normalization can produce magnitude65500 for a100-unit axis vector rather than mathematical65536; geometric direction and native fixed arithmetic must remain distinct.

## Filtered tables

| Producer | Source | Count / selected indices | Distances | Eligibility |
| --- | --- | --- | --- | --- |
|`411e70` bodies|36 eight-byte registry rows through pointer849a5c; object pointer+0, active byte+4|Byte6e650e / bytes920f60|Signed dwords920ec0 indexed by source slot|Any nonzero active byte, signed squared distance at most6250000, nonnegative direction dot.|
|`4125a0` obstacles|Twelve-byte rows920b40; object pointer+0; live unsigned source count6e6514|Dword6e651c / bytes920e80|Signed dwords920da0 indexed by source slot|Object byte19a differs from5, signed squared distance at most1000000, nonnegative direction dot.|

Counts are reset after direction production. Both filters subtract signed-short object coordinates from the captured short origin with16-bit wrap, square via wrapped32-bit products, and sum with signed32-bit wrap. The cutoff comparisons are signed. A negative overflowed squared distance can therefore pass the cutoff if the wrapped fixed dot is nonnegative; the reference preserves this behavior. Exactly2500 body units and1000 obstacle units pass, as does dot zero.

Every active body row refreshes its distance before either range or front/behind filtering. Inactive rows retain old distance values and their pointers need not be readable. Obstacles refresh distance only after both filters pass; type5, distant and behind entries retain old distances. Both output lists overwrite only the selected prefix, retaining all old tail bytes.

The obstacle loop rereads the live dword source count after each entry and advances its source index through the low16 bits. It contains no invented constructor limit. The validation corpus uses at most48 populated obstacle records to keep registry and distance arrays disjoint; this fixture bound is not a recovered maximum imposed by a constructor. Upstream registry/table construction remains separate.

## Evidence and validation

Body procedure pseudocode/assembly is369/370, main assembly Evidence `ev_8192f640c9ab3529c51658faf3ec418cd23c45e2bfa7f28d33cda96a2929d39e`. Obstacle procedure is371/372, assembly Evidence `ev_93a9d119fec1734280e31164210def8baaaba4caa01ca046f62a0cc3c64e7c64`. Existing route helper evidence is described in [autonomous-route-control.md](autonomous-route-control.md).

`node tools/verify-autonomous-nearby-objects-instructions.mjs` passes1,024 retained instructions across4,000 fixtures and11,356,250 interpreted steps, without mocked calls. It executes actual491ce0, route walking/plane tests/successor/predecessor, both normalizers and dot/divide/root arithmetic. The corpus includes2,000 body and2,000 obstacle entries, all36 registry slots with varying active bytes,0..48 obstacles, reverse/cyclic/open/singleton routes,1,352 route walks,608 distinct registered-body cases and42 origin/output aliases. It compares full body, source, route, registry, distance/index and count storage plus consumed direction output. There are57,600 active body distance writes,34,753 body selections,9,454 obstacle selections and7,829 selected negative squared distances. Private saved-register/dead geometry scratch and root scratch globals are not comparison outputs. Report: `analysis/autonomous-nearby-objects-instruction-check.json`.

`node --test tests/autonomous-nearby-objects.test.mjs` passes eight focused tests for all36 slots, cutoff inclusivity, zero/perpendicular dots, stale skipped storage, short wrapping, negative overflow, progression/current-route selection, distinct registered bodies and origin/output aliasing. These are synthetic static instruction comparisons, not original-process runtime observations. No original game process or installed file was modified or executed.

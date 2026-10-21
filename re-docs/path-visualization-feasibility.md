# Path visualization feasibility

The Track Viewer now displays optional stored-path overlays for all three games. Displaying stored route points does not establish the AI's racing line or branch policy. The feasibility evidence below supports the decoder; the implementation and validation are described at the end.

## Rollcage Redux

The existing `parseRespawnRoutes` reader validates628 groups and15160 points across84 GFXM resources;80 level packs contain usable later groups. Loader44c2b0 proves the authored group table at+8c, count byte+79 and point base+98. Runtime respawn47ccc0 and route selector48da10 establish uses of positions, orientation, cyclic bounds and packed links. The standalone viewer currently offers40 PC LOW/HIGH track variants; the wider archive corpus also contains other variants.

Colored stored-point polylines, point markers and route selection are feasible with existing parsing. Follow-up evidence201 (`431750`) directly reads target XYZ from runtime-pack+60 using12-byte group and16-byte point strides and body route/index6c0/6c2. Parent450e50 calls it for mode718=8 bodies. This strengthens the connection to autonomous control, including the post-finish mode entered by491be0. Direction flags and links are available, but branch/lane policy and which initial AI modes use this path remain incompletely traced. A viewer must distinguish authored reference routes from captured trajectories or a claim that every AI decision is recovered.

## Rollcage Stage II Extreme

Retained loader42f250 (`analysis/stage2-native-live/024-loadera-entry.c`, lines118–126) independently reads authored+8c/+98/+79 and relocates group+8 with12-byte stride, matching the Redux organization. `tools/probe-stage2-path-feasibility.mjs` checks all67 GFXM resources and all66 catalog environments with the shared route parser:4315 points,4103 nonzero adjacent segments, zero bounds failures, and every point within its environment's terrain XYZ bounds.

All20 race environments have paths, totaling4024 points. Fifteen of25 Scramble environments have drawable groups, with50 points in total. Training has10 single-point markers across10 environments, without drawable polylines. Deathmatch has63 points across5 environments, Pursuit152 across5 and Football16 in its one environment. In total46 environments have groups with at least two points.

This is strong evidence for visualizing stored adjacent polylines on racing tracks. The Redux packed-link interpretation does not transfer automatically:2312 of3595 nonzero link candidates do not resolve with those masks/count rules. Loop closure, branch semantics, direction policy and actual Stage II AI consumption remain open. Do not infer all modes have full race-like paths or repair those link fields heuristically. Report: `analysis/path-feasibility-stage2.json`.

## Firebugs Europe PS1

The corrected native loader80061328, retained in `analysis/firebugs-native-20261021/focused-decompiled.c`, independently establishes the same authored+8c/+98/+79 organization,12-byte group relocation and publication into runtime+60/+46. This is direct Ghidra MIPS static evidence with the correct8001b000 load base, without REA Evidence IDs or game execution.

`tools/probe-firebugs-route-layout.mjs` checks all33 retained terrain-bearing resources with the Redux16-byte XYZ-point interpretation:74 groups,39 nonempty groups and1941 candidate points;1888 fall inside terrain XYZ bounds. No resource-span checks fail. Forty nonzero packed-link candidates are observed, but only16 resolve with Redux rules. Thus the loader/table relationship is established; point consumption, link masks and loop/branch policy still need Firebugs-specific native tracing. Candidate polylines are promising for an exploratory overlay, with lower semantic confidence than Redux or Stage II racing data. Report: `analysis/path-feasibility-firebugs.json`.

## Viewer work

`src/track-paths.mjs` adapts the existing route parser into scene `paths` with `status`, `experimental`, `message` and nonempty `groups`. Each group retains its authored `index`, group-record `offset` and ordered display `positions`. Both PC and Firebugs scene decoders publish this independently of terrain/object geometry, OBJ output and camera bounds. Positions use the shared terrain transform X,-Y,-Z. Empty tables report no points; malformed path pointers report unavailable paths while leaving terrain and objects usable. Firebugs always carries an experimental point-interpretation note.

The viewer's Stored paths controls offer visibility (initially off), point markers (initially on), Show through terrain (initially on), and all-groups/single-group selection. Colors follow original group IDs. Every nonempty group is included, including group zero and single-point markers. Open WebGL line strips connect consecutive stored positions only: no inferred closing edge, branch, direction or packed-link policy is applied. Repeated points and points outside terrain bounds are preserved. Group and point/segment counts describe the displayed data. Terrain-sector/object filters do not filter paths; track switches reset group selection and preserve visibility preferences. Path buffers are released when replacing or clearing a scene. Track downloads retain their existing contents and omit the overlay.

Validation on 2026-10-21:

- `node --test`: 513 passing tests, including browser-bundle parity, signed coordinate boundaries, malformed tables, experimental labeling, isolated/repeated points and unchanged Firebugs scene/export data when path pointers fail.
- `node tools/validate-track-paths.mjs analysis/track-paths-20261021-overlay.json`: independent source-byte checks match all84 Rollcage GFXM resources (15160 points), all67 Stage II GFXM resources (4315 points) and33 retained terrain-bearing Firebugs resources (1941 candidate points). Source hashes remain unchanged. Group counts in this report exclude empty groups; feasibility reports above count declared groups.
- Browser/Node parity passes all40 Rollcage tracks,66 Stage II environments and33 Firebugs environments, including path-data hashes, unchanged terrain/OBJ/texture summaries and complete ZIP downloads. Stage II and Firebugs UI checks compare each track's overlay directly to Node decoding; Rollcage UI controls are exercised on the first track and packed readers cover all40.
- Pixel checks on a synthetic WebGL scene verify depth occlusion, Show through terrain, point-marker visibility, absence of an invented closing segment, restored depth state and buffer deletion on scene replacement/clear. These are renderer checks, not original-game runtime evidence.

Retained browser reports and screenshots: `analysis/track-paths-rollcage-browser-20261021/`, `analysis/track-paths-stage2-browser-20261021/`, and `analysis/track-paths-firebugs-browser-20261021/`. Each browser run reports zero page errors, external requests and WebGL errors. Installed game files remain read-only.

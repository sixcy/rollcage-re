# Native new-road validation

Updated 2026-10-25. These fixtures test a genuinely new LEV1 sector16, including native construction and an actual wheel terrain query. They extend the earlier edited-existing-terrain observer with separate purpose-specific helper files; previous frozen observers are preserved.

## Fixture and exported data

`tools/prepare-native-spline-road-validation.mjs` calls the same `compileTrackDraft` used by the browser. It builds a flat512×256 road, four columns and eight rows, at source position approximately`[-20000,-1000,-20000]`. Its direction follows the original physical finish direction and its surface copies sector8/cell263. All six authored grid records are moved onto the road through normal layout editing. Original routes, checkpoints, scenery and pickups remain unchanged.

The original start area cannot accept an extra lit sector without exceeding the native four-sector lighting program. The fixture deliberately uses an empty location and authored grid relocation rather than weakening that native bound or writing a car pose at runtime. AI driving away or recovering later is outside this contact test.

New terrain needs companion BTP packet initializer records. `44c3ea` allocates `GFXM+8 × 0x120` renderer bytes, while `44c93c` and `44c99a` initialize per-record mode from inline BTP words at`+0x40`. `src/spline-road-textures.mjs` inserts a table extension, clones each new face's source initializer, updates BTP count`+0x0c`, and adjusts the five proven absolute pointers`+0x1c/+0x24/+0x28/+0x38/+0x3c`. Original indexed images, palettes and relative pixel displacements are preserved. Unknown reserved-header variants reject instead of guessing relocations.

Final all40 source validation at `analysis/spline-terrain-corpus-20261025-v3.json` checks original decoded RGBA, placement records and initializer prefixes, plus exact new initializer clones. Focused initializer tests additionally cover no-edit identity and atomic rejection.

## Read-only observer additions

The frozen helper adds bounded reads at existing constructor/tick/contact observation points:

- Full new96-byte SEGM header and its actual sector-table pointer.
- Native relocated vertex/packet/LOD/lighting pointers; instance-row pointer; 28-byte row-state pointer computed by `44c6fd–44c712` from the authored row index and `GFXM+0xc4`.
- Last generated renderer packet at global`0x909244 + packetIndex×0x120`, including constructor initialization of both packet buffers.
- Twelve pinned resource spans covering new vertices, packets, normals, surface, authored starts, spatial node/map and PVS data.
- An actual native chassis terrain-query result restricted to the32 new cells, including source point, normal, radius and packed sector/row/column reference.

The original bounded startup interventions select the staged quality/level. New observer code adds no physics, texture or pose writes. Fixed duration, event/snapshot bounds, original executable hash, child/registry restrictions and owned-process cleanup remain enforced. The preparer and wrapper's`-CompileOnly`/`-ValidateOnly` modes do not launch the game; actual launches are coordinated by the parent agent.

`observer-manifest.json` pins the frozen helper, wrapper, capture config and expected file. The checker verifies those files, captured helper/config hashes,171 original/staged files, loader selection, byte spans and pointer contracts. It independently matches an observed new-cell wheel point/normal to an exported triangle plane.

Renderer packet bytes become mutable after initialization: lighting, primitive commands and chain links replace the initial contents. The checker therefore asserts the`44c770` initialization markers at constructor/tick snapshots, then checks pointer/allocation bounds at later snapshots. The initial checker wrongly required markers throughout rendering; raw evidence showed the normal buffer update and that assertion was corrected without changing captured evidence or observer behavior.

## Retained evidence

`analysis/native-spline-road-low-initial-acceptance-20261025-v6.json` passed with30 pointer/renderer contract snapshots and360 pinned spans. A zero-radius wheel query hit sector16,row2,column1 at exact exported height−1000 with normal`[0,-65536,0]`; plane error is zero. All171 source files matched their original hashes and the owned process was terminated.

The final compiler preserves the complete authored SEGM`+0x24` word, including border-column inset bytes`+0x26/+0x27`. An earlier fixture cleared these unused inset bytes for open-edge generated sectors. Fresh final fixtures are retained separately in `analysis/native-scenery-editor-spline-road-{low,high}-20261025-v6b`; both frozen wrappers passed`-ValidateOnly`. Final original-process reports must be checked against these final resources. No pixel-perfect GPU screenshot, AI route usability, seam crossing or complete-race parity is claimed by the initial flat-road contact result.

Final v6b original-process acceptance passed in both qualities: `analysis/native-spline-road-low-acceptance-20261025-v6b.json` and `analysis/native-spline-road-high-acceptance-20261025-v6b.json`. Each verifies30 native allocation/sector/renderer snapshots and360 pinned spans. Each records a real wheel query in new sector16,row2,column1 with exact exported plane error0 and matching normal. Both verify171 original files unchanged and owned-process cleanup. These final reports supersede the initial v6 fixture for current compiler compatibility.

Commands, using a new output path for each run:

```powershell
node tools/prepare-native-spline-road-validation.mjs NEW_CASE LOW
powershell.exe -NoProfile -ExecutionPolicy Bypass -File NEW_CASE/observer-wrapper.ps1 -ConfigPath NEW_CASE/spline-road-capture-config.json -HelperSourcePath NEW_CASE/observer-source.cs -ValidateOnly
# Actual capture launches the original game; coordinate desktop use first.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File NEW_CASE/observer-wrapper.ps1 -ConfigPath NEW_CASE/spline-road-capture-config.json -HelperSourcePath NEW_CASE/observer-source.cs -Quiet
node tools/check-native-spline-road-validation.mjs NEW_CASE NEW_REPORT.json
```

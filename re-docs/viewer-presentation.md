# Viewer color and orientation corrections

On 2026-10-21, the user reported red speed pads that should be blue, a blue-dominant LEV3 that should be red, and mirrored track layouts. The fixes are shared by the standalone viewer, its ZIP downloads, and the Node scene/texture exporters.

## Palette channels

`decodeBTPTexture` interprets palette entries as B,G,R,unused and emits R,G,B,A. Black transparency rules are unchanged; the fourth source byte is not exported as alpha.

Retained native observations:

- `analysis/asset-formats/results/018-asm-palette-input.json`, evidence `ev_bb8210961e6b9054993f0c93cf500834ab6be72367b19ddb15ce9a1c74b4dc57`: `FUN_00408680`, instructions `0x408821..0x40883b`, copy source bytes 2,1,0 into temporary bytes 0,1,2.
- `015-pseudo-palette-convert.json`, evidence `ev_e37b440ac5e8f4cd857f3b15ff5f828405f83c88234f642b8ddf3df4957c6ad6`: `FUN_0040a2f0` packs temporary channels using descriptor shift pairs +4/+5, +6/+7 and +8/+9.
- `012-pseudo-texture-create.json`, evidence `ev_6bd3052743794ce1a7f2f0c635a36b252e4be1244a84953e9029aaf91f9fe5fe`: the direct 32-bit path passes masks 0xff0000, 0xff00, 0xff, 0xff000000, corresponding to BGRA byte storage on little-endian x86.

The byte reversal is directly observed. The descriptor initializer is absent from this retained evidence, so naming the source channels BGR also uses the user's in-game color references as corroboration. No original game process was run for this correction.

## Coordinate conversion

The previous display mapping `(x,y,z) -> (x,-y,z)` has determinant -1: it changes handedness and reflects the scene. The corrected mapping `(x,y,z) -> (x,-y,-z)` has determinant +1. It converts the Y-down/forward-Z presentation into Y-up/backward-Z without reflection.

This is a presentation conversion after native placement transforms. Raw archive coordinates, fixed-point math, physics and collision algorithms retain their native axes. Terrain and placed objects receive the same conversion. Face order and UV attachment remain unchanged, and viewer triangle normals are recomputed from the converted vertices. OBJ metadata and downloaded import instructions identify the new axes.

The reported in-game orientation is the visual reference; the determinant, synthetic signed volume, UV associations and upward-facing road normal provide independent mathematical regression checks. These checks establish the corrected conversion rather than complete rendering equivalence to the original game.

## Validation

- `node --test`: includes asymmetric BGR fixtures, black transparency checks, signed-volume preservation, upward road normals, UV attachment and placed-object coordinate assertions.
- `node tools/check-viewer-presentation.mjs`: validates all installed BTP PC texture pixels against the source BGR entries and all 40 supported track exports against native terrain and placed-object coordinates. Writes a new report directory.
- `node tools/check-track-viewer.mjs <installed-REA-launcher>`: checks all 40 packs in Edge against the Node pipeline, validates downloaded OBJ and PNG pixels, exercises camera controls, and records screenshots for LEV1 and LEV3. Reports remain under `analysis/track-viewer/`.

Previously generated previews, textures and check reports retain their original bytes; regenerate exports to obtain the corrected presentation.

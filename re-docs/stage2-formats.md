# Rollcage Stage II: static track reconstruction

The supplied installation is the Extreme build, not an unmodified retail release.
Installed files remained read-only and the game was not executed. Native findings
below are Ghidra static observations, independently checked against archive bytes
where described; successful parsing is not original-process visual evidence.

## Target identity and resource catalog

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `BIN/Rollcage Extreme.exe` | 2233856 | `26f8e8d874e5081f599000e04000414112da6600c493d80f45e4ddd33cd0d148` |
| `IDXData/ROLLCAGE.IDX` | 4640 | `54e06749a8a5ad23467f85c8f996f732c53065987467a3b0f9931c8592c71f75` |
| `IDXData/ROLLCAGE.IMG` | 41328187 | `12282c36a265fd5ebb18ee7f13d70080bf3aba92efafd658086cf697de8b1b50` |

The archive has 290 entries. The existing archive/index/GT20 readers decode them.
Terrain-bearing GFXM entries are 80,82,...,210, paired with BTP entries 81,83,...,211.
The other GFXM/BTP pair has no terrain and is excluded from the track selector.

The executable contains 66 ordered environment labels at VA `0x512fd0`, file
offset `0x111dd0`: LEV01–20, SCRAM01–25, TRAIN01–10, DEATH1–5,
PURSUIT1–5, FOOTY1. Native loader `FUN_0042f250` selects resources by track
ordinal: geometry `80+2*n`, textures `81+2*n`; its actual input is a localization
code converted to the ordinal. `FUN_00471610` corroborates the race, scramble,
training and arena menu categories. `src/stage2-resource-map.json` aligns the
labels with this order. **The `.BLP`/`.BTP` extensions are extraction aliases**;
no original filename-to-ID table was established. Other raw resources remain
accessible by ID without invented filenames.

Reproduce the map with `node tools/stage2-recover-resource-names.mjs`.
The script checks the exact executable SHA-256 before reading fixed offsets.
GFXM `+4` is not a constant uint32 version: low16 flags and high16 level metadata
vary across environments, including inherited or duplicate level IDs.

## Geometry, placement and materials

Stage II retains the SEGM primary grids, model headers, local signed-short
vertices, indexed faces, 16-byte terrain UV descriptors, and BTP texture layout
used by the original game. The following differences are material:

- BTP placement count is uint32 `+0x14`, base uint32 `+0x28`, record stride
  **66 bytes**. Flags/type remain uint16 `+0`, model index byte `+3`, position
  signed shorts `+8/+10/+12`, angles signed shorts `+14/+16/+18`.
- Record shorts `+32/+34/+36` point bytewise into GFXM `+0x1c` streams.
  They encode **run-length lighting**, not texture references: low byte is run
  length and high byte indexes the GFXM color table. Reusing original-game
  per-placement material starts produces incorrect materials.
- Ordinary model material start is uint16 MODL `+0x3c`. Without its high bit,
  it indexes the GFXM `+0xcc` uint16 table; with the high bit it identifies an
  inline table at `model+(start&0x7fff)`. Each key is a **direct byte offset**
  into GFXM `+0xd8` descriptors; original Rollcage shifts packed keys by two.
- Descriptor uint16 `+2 == 0xffff` means direct UVs. Otherwise low8 selects a
  24-byte animation state, state `+6` selects a 6-byte frame, and a zero-duration
  initial frame follows its link. The selected 16-byte terrain UV descriptor
  supplies the static initial snapshot. High8 selects one of eight UV corner
  permutations, confirmed in `FUN_00433a10`. This does not animate the viewer.

Pose arithmetic can be shared: the Stage II loader uses x angle `>>1`, y/z
`imul(0x6488)>>9`, and the last nonzero axis for the quaternion cosine exactly
as reconstructed for Rollcage. `FUN_004452b0`/`FUN_00445360` retain the same
piecewise Q16 trigonometry; all 202 int32 values at `0x4f0a70` match
`src/trig-table.json`. `FUN_00444fd0` matches the Q16 quaternion-to-Q12 matrix.
Native model draw packets use the same first/third/second/fourth corner order.
Terrain lighting pass `FUN_0043fcb0` also confirms the shared grid flag mapping:
bottom-right vertex flag bit `4` selects TL/TR/BL/BR, otherwise TR/BR/TL/BL.
`FUN_0043e490` copies the terrain UV descriptor's four corners into the template
packet, and native texture consumers mask the page word with `0x3f`.

## Textures and transparency

`FUN_004a5d20` consumes the BTP texture count, transparent start/count, 12-byte
texture records and palette/image bases. Source palette bytes are B,G,R,unused;
`FUN_004a0f40` reverses color bytes when constructing native palette entries.
Pages in the transparent interval allow black transparency; opaque pages protect
later black palette entries from the zero color key while palette index zero
can remain keyed. These static observations support the shared decoder's BGR
conversion and black/index-zero handling. Other device-specific blend modes,
mipmap behavior and runtime effects are outside the static exporter.

## Retained native evidence and limits

Complete REA responses are under `analysis/stage2-native-live/results/`; adjacent
`.c`/`.txt` files are convenient text copies of normalized pseudocode/assembly.
`evidence-bundle.json` retains 71 complete Evidence records. The native session
was closed successfully after exporting `analysis-snapshot.json`; no native
analysis process is needed to use the resulting viewer or extractors.
The initial connected server lacked configured Ghidra/Java environment variables.
The workspace REA stdio client reused the installed engines without changing
client configuration. `analysis/stage2-native/` retains the initial failed
sandbox/provider probes.

| Finding | Retained response | Evidence ID |
| --- | --- | --- |
| Label bytes | `008-labelbytes.json` | `ev_35367aee370a4e10d5d19fccbaef999bc3d95d284593acf605e059281d399ccd` |
| Pair selection, placement stride/layout | `024-loadera-entry.json` | `ev_0adc39dcfbe5efc3bb6ac67a56c8bd8f0266a36bcbd2b9b63f10c4ec8ec7f7a5` |
| Material addressing | `034-modelrenderer.json` | `ev_94ac6d7a398f502d4b3e46bfa94bc9f4cdce5eccebc610c4d5d232953c6ad566` |
| Lighting runs and initial animation selection | `035-modelrenderer2.json` | `ev_e5a619d3de6528e1a1d1cf4284c0ab28cec1e8a0d27faa637fbfcb6799778a05` |
| Palette conversion | `038-texturedecode.json` | `ev_aeca0dc61367845beb9bc84f8ed865ddeb19f731d696ed8053c757fe842761f5` |
| Placement angle instructions | `064-loader-asm.json` | `ev_4631913cc0a0f925dee60d5eb731d4831964a5ab5e263fadcd9c5cc98cc1af61` |
| Matching trigonometry table | `065-trigtable.json` | `ev_abf57bcf3b0651519dc3b44e93e3f0c63303c4c84c900d4518eb5d12fba570a0` |
| UV permutations | `066-permutation.json` | `ev_2ee1105e68be7f40ff8b80fbb5c5317e860dbe9f32f7f50311f9ebd5d6cfe8d3` |
| Terrain grid corner mapping | `085-template-consumer3.json` | `ev_8f0b3d8038e1e6541ecf9951db7404de79e19b3d457e2d765b68d363f016eb91` |

The implementation targets primary terrain and ordinary initial object poses.
Alternate LODs, dynamic object types, destruction, native lighting/effects and
time-varying animations are not reconstructed by the viewer. The supplied build
has no ordinary model using the inline material path, so that branch is supported
by static native evidence and synthetic validation rather than installed examples.
Human-readable localized track titles and compatibility with other releases
remain separate research tasks.

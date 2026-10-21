# Recovered asset formats

The historical level-one export examples below have been superseded by the [general Track Viewer](../docs/track-viewer.html). The generated `analysis/level1-scene` and `analysis/level1-objects` directories were removed; use the viewer's Download track button to export a track again.

These layouts apply to the artifacts installed with Rollcage Redux 1.3.8.0. Code addresses refer to executable SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. Fields are little-endian. Names assigned to fields below describe observed use rather than original source declarations.

## Filename lookup

`FUN_00447ae0` walks 340 entries at `0x5eb600`, each containing a 32-bit filename pointer, a signed 16-bit archive ID, and two unused bytes. The table starts at original file offset 2,008,576. A complete 2,720-byte Ghidra memory read matches the original file bytes; `analysis/resource-catalog.json` records that verification and every filename's source offset.

Lookup uppercases ASCII, maps backslash to slash, maps a single underscore to a dot, and maps a double underscore to slash. Thus `LOW__LEV1_BLP`, `low/lev1.blp` and `LOW\LEV1.BLP` identify resource 30. An unknown name returns -1. Resources 4–7 have no names in this table; that does not establish they are unused by numeric callers.

Sources: `analysis/asset-formats/results/009-pseudo-filename-lookup.json`, `013-filename-table-offset.json`, and `017-live-filename-table.json`.

## BTP PC texture tables

| Offset | Type | Observed use |
| --- | --- | --- |
| `0x00` | 4 bytes | `BTP ` magic. |
| `0x04` | u32 | Version field; zero in all 84 resources. |
| `0x24` | u32 | Image byte-array offset, relative to resource start. |
| `0x32` | u8 | Start of special black-transparent texture range. |
| `0x33` | u8 | Length of that range. |
| `0x34` | u16 | Number of PC texture slots, including empty slots. |
| `0x36` | u16 | Palette count; consistent with observed palette ranges. |
| `0x38` | u32 | Texture-descriptor table offset, relative to resource start. |
| `0x3c` | u32 | Palette array offset, relative to resource start. |

Each descriptor has 12 bytes: u16 width, u16 height, u16 palette index, an unused u16, and a u32 pixel offset relative to the image byte array. Pixels use one byte per palette index. Each palette contains 256 four-byte entries; the source channels are R, G, B, followed by a byte discarded by the observed PC uploader.

The uploader returns early if either dimension is zero. Those descriptors are empty slots; their palette and pixel fields are not dereferenced. This matters because 1,034 of the 3,130 slots across the archive are empty. All 2,096 active slots have bounded pixel ranges and valid palette references.

For a 32-bit RGBA representation, palette index zero is transparent when its color is black; other indices are opaque by default. In the special texture range, any black palette color becomes transparent. Device-specific color quantization and GPU processing are outside this representation. The reference decoder retains eight-bit source color channels.

Some BTP resources have only empty PC slots and still carry other VRAM image data. The parser inventories their empty PC tables; it does not decode that other image representation.

Sources: `003-pseudo-load-b.json` and `014-asm-fe-load.json` identify the header fields; `010-pseudo-btp-upload.json` and `016-asm-texture-upload-loop.json` identify descriptors; `012-pseudo-texture-create.json`, `015-pseudo-palette-convert.json` and `018-asm-palette-input.json` establish pixel/palette conversion. These files are under `analysis/asset-formats/results`.

## GFXM / BLP primary models

BLP/BL6 resources begin with `GFXM`. Their u32 field at `0x18` points to a resource-relative array of u32 model offsets. The u16 field at `0x2c` counts slots. A zero table entry is an empty slot.

Primary model records begin with `MODL` or `MODC`:

| Model offset | Type | Observed use |
| --- | --- | --- |
| `0x04` | u16 | Vertex count. |
| `0x06` | u16 | Face count. |
| `0x0c` | u32 | Face array offset, relative to this model record. |
| `0x1c`, `0x1e` | u16 | Two auxiliary model displacements, likely LOD variants. Not decoded/exported yet. |
| `0x40` | u32 | Vertex array offset, relative to this model record. |

Vertices have eight bytes: signed 16-bit x, y and z, followed by a retained fourth word whose meaning is unconfirmed. No world transform or unit conversion is applied.

Faces have eight bytes. Their first four bytes contain one-based vertex indices. The fourth can be zero, giving three referenced vertices. The following u32 contributes to vertex-normal generation in `FUN_0041e910`. Subsequent collision-query tracing confirms signed ten-bit x/y/z normal components at bits 20..29, 10..19 and 0..9, using the Q8 scale. The primary model reader retains the whole `packedWord`; the collision reader decodes its normal components.

All 84 resources parse with bounded primary arrays and valid face indices: 3,460 model records, 212,906 vertices, 156,238 three-index faces and 92,278 four-index faces. Counts include repeated models across resource packs; they are not counts of unique game objects.

The subsequently traced model renderer places source corners in draw order 1,3,2,4, giving polygon boundary 1,3,4,2. `modelToOBJ` now uses that winding. Materials and placement require the instance context described below; this standalone reader/exporter does not select them. Auxiliary variants remain unexported. Sector geometry has a separate topology described below.

Sources: `003-pseudo-load-b.json` and `006-pseudo-load-e.json` establish model-relative pointer relocation; `019-pseudo-mesh-init.json` walks signed vertices with an eight-byte stride; `022-pseudo-model-prepare.json` visits the auxiliary variants; `024-pseudo-model-transform.json` subtracts one from every face index and walks eight-byte faces.

## GFXM / SEGM track grids

The GFXM u32 fields at `0x10` and `0x14` give the sector count and resource-relative array of sector offsets. The u32 at `0x110` points to the primary UV-record table. Each sector starts with `SEGM`:

| Sector offset | Type | Observed use |
| --- | --- | --- |
| `0x08`, `0x0c` | u32 each | Grid columns and rows. |
| `0x20` | u32 | Resource-relative vertex array offset. |
| `0x50` | u32 | Resource-relative primary cell packet array offset. |

There are `(columns + 1) * (rows + 1)` row-major vertices, each eight bytes: signed i16 x, y and z, then u16 flags. There are `columns * rows` eight-byte primary packets. A packet's first u16 selects a compiled runtime template; its u32 at `+4` indexes a 16-byte record in the global UV table. The remaining packet bytes are retained in the resource but not interpreted by this reader.

Within the UV record, four byte pairs at `0/1`, `4/5`, `8/9` and `10/11` supply the corners' pixel coordinates. The u16 at `+2` is retained as `clutWord`; the u16 at `+6` is retained as `pageWord`. Its low six bits select the PC page for the supported base pass. Other packed page effects are not reproduced. Every page reference in the 40 supported PC scene packs resolves to an active slot of the immediately following BTP resource; that corpus observation does not establish support for every packed texture mode.

For a cell with grid corners TL, TR, BL and BR, bit `0x4` in BR's flags selects draw corners `[TL, TR, BL, BR]`. With that bit clear, draw corners are `[TR, BR, TL, BL]`. The triangles use draw corners `[0,1,2]` and `[1,3,2]`. Unlike primary-model quad topology above, this ordering is traced through the native coordinate renderer. Original runtime facing tests can suppress individual triangles; the static exporter emits both and its viewer renders both sides.

The native texture initializer builds coordinate tables at texel centers, `(pixel + 0.5) / powerOfTwoSize`. The source images are padded by the original uploader. Our PNGs retain their unpadded dimensions and use `(pixel + 0.5) / actualSize`, with edge clamping in the viewer. OBJ V coordinates are flipped for conventional image loading. Geometry is exported as X, -Y, Z in source units. The viewer uses computed triangle normals and optional preview lighting, not original lighting values.

`analysis/scene-catalog.json` records 1,496 sectors, 1,155,548 vertices and 1,067,936 quads across all 84 structurally valid GFXM files. Forty scene packs have complete PC base-page references. Forty HIGH packs need the other BTP image representation decoded, and four front-end packs have no sectors. `analysis/level1-scene/scene.json` records the exported level-one base pass: 16 sectors, 14,883 vertices and 27,840 triangles. Placed models, secondary texture passes, animated textures, fog, dynamic lighting, culling/LOD and game logic remain unreconstructed.

Native evidence below is static decompiler output, not original source or an observed game run. Full records are in `analysis/scene/results` and the exported Evidence bundle:

| Native anchor | Supported conclusion | Evidence ID / result |
| --- | --- | --- |
| `0x44c2b0` | Relocates sector and global table offsets. | Earlier `analysis/asset-formats/results/006-pseudo-load-e.json`. |
| `0x48d130` | Primary packet UV-index lookup and four corner UV transfers. | `ev_687b7c3f9fed30d0299fc178b0f94d8f69a020ccb51595445ecf6d1276660873`, `027-pseudo-sector-render.json`. |
| `0x48f2d0` | Grid dimensions/stride and flag-dependent corner lighting. | `ev_50f2d79b51549cf548dd08978ea49809b77f963e1910517947e48e311f95206e`, `034-pseudo-sector-submit.json`. |
| `0x489e40` | Signed coordinates, corner rotation, triangle ordering and facing tests. | `ev_55f0021bf139d0c272eebb256623d97f44de6f9b394244925d00758f60b12ada`, `042-pseudo-sector-coordinates.json`. |
| `0x407ee0` | Texel-center coordinate table construction. | `ev_acf197598736bc67d1ab1dcaf12cb5b604cfe8d2d4f1374705b01c8199d381bc`, `046-pseudo-texture-bind.json`. |
| `0x490290` | Follows sector-associated instance lists; next placement research seed. | `ev_a7e85b576e8b0af4035866826bd1f4d80159e8aaaa987eecfe60727632838d2a`, `039-pseudo-sector-pass.json`. |

## BTP model placements and per-instance materials

The u32 at BTP `+0x14` counts 56-byte placement records; `+0x28` is their resource-relative offset. These coexist with the texture tables. The loader masks the first u16 with `0x3ff` for dispatch. All raw records are retained; ordinary type-zero models are implemented, while types 2, 13 and 24 need their separate constructors.

| Record offset | Type | Ordinary model use |
| --- | --- | --- |
| `0` | u16 | Type and flags; rendering checks bit `0x400`. |
| `3` | u8 | Index into the paired GFXM model pointer table. |
| `8/10/12` | i16 each | Initial world x/y/z. |
| `14/16/18` | i16 each | Rotation inputs, interpreted exactly as loader assembly. |
| `40/42/44` | u16 each | Primary / auxiliary-1 / auxiliary-2 UV-index starts. |

The loader initializes a quaternion directly: x uses half its raw input; y/z use `(input * 0x6488) >> 9`. Nonzero components use `FUN_00492c00`; w uses `FUN_00492b50` on the last nonzero half-angle. These are lookup-based sine/cosine functions, not floating-point library calls. `FUN_00492720` converts Q16 quaternion components into a row-major signed-short Q12 matrix. All ordinary placements in the installed corpus use at most one nonzero rotation input. The implementation preserves the observed initialization rather than assuming general Euler composition. Exports apply that matrix to local vertices, then add the initial position and flip Y for presentation.

GFXM `+0xcc` points to u16 material keys. Start at the placement's primary UV-index offset and read one key per primary model face. The key shifted right by two is a byte displacement into the descriptor data pointed to by GFXM `+0xd8`. Static descriptors occupy 12 bytes: four UV pairs at byte positions `0/1`, `4/5`, `8/9`, `10/11`, a `0xffff` sentinel at `+2`, and a packed texture page at `+6`. Draw corners use source vertex indices `[a,c,b,d]`, with the fourth omitted for triangles. The descriptor UV pairs already follow draw-corner order.

When descriptor `+2` is not `0xffff`, its low byte selects a 24-byte animation state in the table at GFXM `+0xb0`; byte `+0xb4` bounds that index. State u16 `+6` selects a six-byte frame at the table pointed to by GFXM `+0xb8`. A zero i16 duration at frame `+4` redirects to the frame index in its first i16. The selected frame's first i16 indexes the main GFXM `+0x110` UV table in 16-byte units. The descriptor's high byte selects one of eight corner permutations implemented by `0x46c690`. Export samples the serialized state and does not step its clock. Original lighting, face suppression, LOD selection and effects are separate.

Validation in `analysis/placement-catalog.json`: all 84 resource pairs, 7,692 placement records, 5,172 ordinary models and 142,744 material-bound faces parse successfully. Forty HIGH pairs still need their non-PC image representation. `analysis/level1-objects` contains 114 ordinary objects with the terrain, using 19 PNG pages. New tests cover quantized rotations, translations, malformed placement/material ranges, native triangle corner order, animation redirects/permutations and triangle export.

Evidence anchors, retained under `analysis/scene/results`:

- `068-loader-assembly.json`: model selection, position, UV starts and rotation initialization. Earlier loader pseudocode is `analysis/asset-formats/results/006-pseudo-load-e.json`.
- `061-model-instance-allocator.json`: model vertex/face pointers and instance setup.
- `063-instance-transform-matrix.json`: quaternion-to-matrix math, Evidence `ev_d927e3297b5d02d171f067145c3c8b7dba7d10b893f095330e56a5e38d3e7e49`.
- `069-angle-half-sine.json`, `070-angle-quaternion.json`, `078-cosine-table.json`: native lookup and verified table bytes. `tools/recover-trig-table.mjs` checks the complete 808-byte span against the original PE before writing `src/trig-table.json`.
- `079-model-base-render.json`: topology, materials and animated descriptor resolution, Evidence `ev_29968ccbdad60701a6cf52354fc5e26ce579ec6483c89066df01d694d89cb121`.
- `080-model-world-transform.json`: combines the instance matrix and world translation with the camera transform.
- `082-model-uv-transform.json`: eight UV corner permutations, Evidence `ev_0d1c344ba26cb2f1a6a4e6850ea4922df6f5c5a0cd1537c47722e3ad4ae22eda`.
- `083-model-special-render.json`: the normal-lit variant shares the recovered geometry/material path.

## Runtime reconstruction seeds

The later [model collision investigation](model-collision.md) decodes `MODC` shape, face/edge lookup and edge tables, plus ordinary-placement collision settings. First-auxiliary stored face blocks and primary vertex arrays can include collision-only entries beyond rendered counts; do not restrict those references to the visible geometry. Terrain surface metadata also shares the sixteen-byte UV table, with category and grip-reduction flags in its final word. Detailed layouts, corpus checks and remaining query work are recorded separately.

`0x41dbb0`, reached while tracing model use, allocates a `0x3e78`-byte instance and installs callback `0x41e080` at instance offset `0x148`. It also initializes model/configuration references and calls functions such as `0x42aa80`. This is a vehicle-instance initialization candidate, not yet a reconstructed vehicle simulation. The retained observation is `026-pseudo-model-render.json`; that request filename reflects its original investigation hypothesis, not its final classification.

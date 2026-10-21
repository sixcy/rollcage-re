# Firebugs PS1: static environments

The supplied Europe disc (`SCES_038.84`, volume `FIREBUGS`) is the validated
target. It remained read-only; neither the game nor an emulator was executed.
Browser checks establish reconstruction consistency, not original-process
visual equivalence.

## Disc and resource identity

The ZIP has one `MODE2/2352` data BIN and thirteen audio BINs. The data track
contains ISO9660 `IDX/IDXFILES.IDX` and `IDXFILES.IMG`. Readers decompress only
the CUE and data BIN, verify ZIP CRCs, and remove sector framing. The ISO volume
size includes audio; individual file extents are bounded against the data BIN.
Stored/deflated ZIP members and separate BIN files are supported. ZIP64,
merged data/audio BINs and other sector modes are rejected.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| IDXFILES.IDX | 3664 | `f020b8f8b6ebc4e2a29261450ec732bd71cc9038551e71bfe39846b9ba9a6147` |
| IDXFILES.IMG | 19443712 | `b24e781e33c915e9c9ef87c2789a85d05b76ea7c1ecd30405bff954cc6199531` |
| Main program, resource 0 | 608184 | `141daf906961168af0b2031dd8f2a1d0158b2305ef1dc2d411dbaf66822ae072` |

The existing 16-byte index and GT20 readers decode all **229** entries. There
are **33** terrain-bearing GFXM resources, `14,17,...,110`, each followed by
VRAM and BTX. The catalog discovers signatures and explicit triplets; both
archive hashes identify the known release independently of ZIP filenames or
compression. Other releases require explicit Firebugs selection and remain
unverified. These 33 **disc environments** include duplicates and variants;
original menu names and ordering remain unestablished, so labels use resource IDs.

## Geometry, textures and placements

- GFXM retains segment count/table `+0x10/+0x14`, model table/count
  `+0x18/+0x2c`, and terrain UV table `+0x110`. SEGM grid dimensions remain
  `+8/+0xc`, signed-short vertices are at absolute resource offset `+0x20`,
  and packets at `+0x50`. PS1 packets are **4 bytes**, versus PC 8 bytes.
  Low11 selects a GPU template; **bits11–17** select a 16-byte UV record
  (`FUN_8005f9c0`, `0x800600c8..0x80060110`). Bottom-right vertex flag mask `0x4`
  selects TL/TR/BL/BR; otherwise drawing rotates to TR/BR/TL/BL
  (`0x80060b40..0x80060b60`).
- Model tags are `0x4d4f4401`/`0x4d4f4301`, not ASCII MODL/MODC. Primary
  vertices use relative pointer **+0x44**, faces `+0xc`, relocated by
  `FUN_80062948`. Byte indices are one-based; zero fourth denotes a triangle.
  Native draw order is first/third/second/fourth. Model **uint32 +0x3c**
  selects the GFXM `+0xcc` uint16 key stream; keys are byte offsets into
  `+0xd8` descriptors (`0x8005b370..0x8005b37c`). Materials are decoded only
  for placed ordinary models; some unplaced slots use special-object paths.
- UV pairs are at `+0/+1`, `+4/+5`, `+8/+9`, `+10/+11`; CLUT is uint16
  `+2` masked with `0x7fff`, TPAGE uint16 `+6` ORed with `0x20`. Each
  TPAGE/CLUT pair gets its own material, preserving per-face palettes.
  Overlay flags do not become palette-address bits; secondary passes are omitted.
- `FUN_80061328` uploads VRAM bytes after the 16-byte signature to
  **(512,0,512,512)** and bytes `+0x80010` to **(0,511,256,1)**. Rectangle
  constants are at `0x800af4e8/0x800af4f0`. The decoder supports 4-bit/8-bit
  palettes and direct 15-bit color, expanding RGB from five bits to eight.
  Zero words are transparent; `0x8000` remains opaque black. PS1 blend modes
  and original draw ordering are not reconstructed.
- BTX placement count/base are uint32 `+0x14/+0x28`; records are **64 bytes**.
  Flags/type are uint16 `+0` / low10; model slot byte `+3`; position signed
  shorts `+8/+10/+12`; angles signed shorts `+14/+16/+18`. The native loader
  increments by `0x40` and calls `FUN_80028b94` then `FUN_800288b4` for type0.
  Both match the shared PC angle/quaternion arithmetic, including last-nonzero-axis
  cosine. All **202** int32 trig values at `0x800a55d8` match `src/trig-table.json`.
  The provisional Euler rotation was replaced before browser validation.

## Evidence, validation and limits

REA rejected the PS-X executable as an unsupported format. Direct Ghidra 12.1.4
MIPS little-endian analysis supplied native evidence instead, without successful
REA Evidence IDs. The main program's correct load address is **0x8001b000**.
Initial `0x8001a800` results were provisional, misaligned call targets, and are
superseded. Retained focused C and assembly excerpts use the corrected base.

- `analysis/firebugs-resources/inventory.json`: resource identities and initial
  PC-reader rejection probes illustrating format differences.
- `analysis/firebugs-native-20261021/focused-decompiled.c` and
  `native-excerpts.json`: loader, model relocation, placement arithmetic,
  terrain packet/UV selection, upload rectangles and matching trig table.
- `analysis/firebugs-layout/final-validation.json`: all 229 resources and 33 scenes,
  valid OBJ indices/materials, finite bounds, counts and hashes.
- `analysis/firebugs-browser-final-20261021/browser-check.json`: all 33 browser/Node
  scene/texture matches, navigation/recovery, exact downloaded OBJ/manifest and
  decoded PNG pixels, screenshots, zero external requests or WebGL errors.
- `analysis/firebugs-pc-regression-20261021/` and
  `analysis/firebugs-rollcage-browser-20261021/`: all 66 Stage II and 40 original
  Rollcage variants pass browser regressions.

```text
node tools/list-firebugs-tracks.mjs <disc.zip>
node tools/validate-firebugs.mjs <disc.zip> <new-report.json>
node tools/export-scene.mjs --game firebugs 14 <new-directory> <disc.zip>
node tools/build-track-viewer.mjs
node --test
```

The scene includes finest-grid terrain and enabled ordinary type-zero scenery.
Other placement types remain counted in manifests. Special objects, overlays,
animated textures, original lighting, visibility/LOD, semitransparency blending
and simulation remain outside scope. No game assets are embedded in the website.
Extracted binaries, transient Ghidra databases and local exports are ignored by Git.

# Rollcage pickup editor

Open `docs/track-viewer.html`, select the original Rollcage IMG/IDX pair and
load a racing track. The Pickup editor panel supports levels1–14 and18–20.
LEV15 has no original pickup definitions or respawn controllers and remains
deferred. LEV16/17 remain excluded. Stage II, Firebugs and unverified releases
retain their existing viewing features without pickup editing.

## Using the editor

Enable **Edit pickups** to pause Racing test and use the authored track view.
Gold markers show original pickups, cyan markers show additions, and a white
outline identifies the selection. Select a marker or use the pickup selector.
Drag a marker across the terrain, or change X, Height and Z. These coordinates
use the viewer's Y-up display convention; the compiler converts them once to
the original signed16-bit X/Y/Z format.

**Add pickup** then click the terrain. The selection supplies its original
pickup definition; without a selection, the nearest original pickup supplies
the template. Placement preserves the template's ground clearance where a
supporting terrain hit exists, otherwise uses the original model's bottom.
**Duplicate** creates one copy and lets the next terrain click position it.
Esc cancels placement. **Delete**, **Undo**, **Redo** and **Reset level** work
on the current level; a drag is one history operation. Camera navigation still
works when dragging empty space or using right-drag to pan.
The Camera menu supports Orbit & pan and Fly-in while editing. Follow car is
disabled until editing ends, since Racing test is paused.

Both LOW and HIGH variants share the level's draft. Switching tracks retains
drafts, including drafts for other levels. The editor permits up to16 points
per level, a conservative editor limit rather than a claim that the original
engine's queue is limited to16. Native initialization writes24 queue bytes;
the original global body registry has512 entries. Controller count, script
definitions, award probabilities and non-position placement fields remain
unchanged.

**Test changes** rebuilds Racing test using the same compiled GFXM bytes used
by game export, enables weapons/pickups and starts a new race. It retains the
selected AI count and Expert difficulty. Racing test remains super experimental;
browser/source equality does not establish original-game compatibility.

## Projects and game files

**Save project** downloads `pickup-project.json`. To continue editing later,
load the original IMG/IDX files and then the project. Projects contain version1
metadata, an archive-index fingerprint, original LOW/HIGH resource hashes and
pickup positions/template references; they contain no original mesh/texture
data. Import validates the complete project and both original resources before
changing any drafts. Changing sources or closing the page with unsaved edits
triggers the normal browser discard warning.

**Export game files** downloads a locally generated ZIP containing:

- `Rollcage.img` and `Rollcage.idx` for a separate game copy.
- `pickup-project.json` for continued editing with the original archives.
- `README.txt` with installation instructions.

Copy both archive files into the separate installation's `IDXData` directory.
Enable weapons/pickups in that game. Edits apply in both LOW and HIGH graphics
settings. The page never writes to the selected files or installed game, and
does not upload archives or projects. The browser can cancel ZIP preparation
without losing drafts. Modified archives do not retain the stock identification
fingerprint; use original archives plus the project for further editing.

## Binary and validation boundaries

`src/pickup-editor.mjs` reads GFXM's relative pointer at90h and BYTE count94h.
Records are12 bytes: signed16 XYZ followed by six preserved template bytes.
Changed nonempty tables are appended on a4-byte boundary. Only pointer90h and
count94h change in the original resource prefix; bytes95h..97h are unrelated
and preserved. Empty tables retain the original pointer with count zero.
An unchanged effective draft returns byte-identical resource contents.

`src/archive-write.mjs` keeps the original IMG prefix and appends changed
resources uncompressed. Original401160 supports equal stored/decoded sizes.
Only their IDX offset/stored/decoded fields change; allocation metadata and
unrelated entries remain unchanged. Linked replacements and offsets beyond
the native signed31-bit file range are rejected. Blob-backed ZIP assembly
checksums at most1MiB at a time and retains original file slices.

Pure format/picking/export tests cover malformed inputs, source fingerprints,
template preservation, both graphics variants, coordinate limits, zero/16
pickups, archive byte identity and independent ZIP CRC checks. The actual Edge
editor check covers pointer editing, history, project roundtrip/rejection,
multi-level drafts, mobile layout, source/browser preview parity and downloaded
archive contents. See `tools/check-pickup-editor-viewer.mjs` and the retained
`analysis/pickup-editor-browser-20261024-v3/report.json`. Its 700-frame edited
preview matches Node in 71 complete snapshots, including four natural pickup
collections, three respawns and one projectile activation.

The separate source-runtime matrix passes68 cases across34 variants:16 pickups
for600 updates and zero pickups for120 updates, totaling24,480 updates. Arena,
queue, registry and original-resource preservation checks pass. Its collection
and respawn observations are reconstructed-source evidence, not original-process
evidence. See [source validation](pickup-editor-source-validation.md).

Original-game acceptance passes six separately retained Redux1.3.8.0 runs on
LEV1: unchanged, zero and16 pickups in both LOW and HIGH. Both16-pickup runs
prove all exported positions plus natural collection and subsequent full native
respawn of added index15. This is representative native export validation;
the other supported levels are covered by source and format checks.
All171 original installed files remain unchanged. See
[native validation](pickup-editor-native-validation.md) for the evidence,
declared capture inputs, retained failures and limits.

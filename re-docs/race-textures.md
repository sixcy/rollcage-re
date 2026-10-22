# Race texture startup

`src/race-textures.mjs` reconstructs Redux `4900a0`, called by race startup
`47ea40` at `47ec96`. It executes the actual bitmap loader `4895d0`, texture
construction `408680`, timewarp geometry initializer `40f310`, ice initializer
`490040`, and bitmap tiler `409bd0`. The color helper is the existing actual
`47c300` reference. Installed files remain read-only; these checks interpret
retained instructions, without running the original executable.

The public entry is `initializeRaceTextures(runtime)`, with `runtime.memory`
and `runtime.scratchBase` denoting the native entry ESP. It returns native EAX
as zero or one. Its CRT, GDI+, STL and renderer service interfaces are those of
the image modules, described in [game-texture-construction.md](game-texture-construction.md).
Caller entry registers can be supplied through `entryRegisters`; nested calls
thread the original incoming EBP and the actual live saved registers. Source
stack writes include consumed native SEH and CALL-return producers, rather
than a snapshot copied after the operation.

`Timewarp.jpg` is uploaded under the next logical texture ID, skipping 63.
Failure to load it preserves the old timewarp ID. Rejection of this first
upload is ignored by the native parent. Geometry initialization runs in either
case. A separate 256-square procedural target is then allocated with native
flags 9. Its rejection publishes `5ed02c=-1`, returns zero, and skips ice-sheet
initialization. Successful setup subsequently loads `Icesheet.jpg`.

The ice tiler allocates a 256-square staging buffer plus a palette buffer. Each
tile starts zero-filled, copies the remaining source rows and columns with
the supplied pitch, and goes through the actual texture constructor. Thus a
257-pixel source dimension produces a second tile containing one source row
or column and zero padding. It advances logical IDs while skipping 63. A
rejected upload returns -1 without freeing these two allocations; this is
preserved native behavior. Allocation failure reaches named game reporter
`4a1fe0`, which remains an explicit handler outside the successful allocation
domain of the connected checks.

The geometry producer reads the original signed-short circle table at
`5ed030`, builds five rings of 32 vertices at `6f4ea0`, and four strips of
32 records at `6f53a0`. It preserves the native material encoding, HSV helper
calls, intensity levels, byte flags, and final hue-zero seam. The existing
actual `40f5d0` UV producer in `race-time-effect.mjs` consumes these records.
References also reach later drawing code at `40f6ee`, `40faee`, `40fb93` and
`40fba1`; this startup package does not claim those drawing routines.

Evidence is retained in `analysis/native-simulation/results/9011` and `9012`
(parent pseudo/assembly), `12000..12003` (ice and geometry), `12007..12008`
(tiler), and `12004`, `12009..12013` (filenames, original table and references).
Those prefixes identify the full descriptive JSON filenames in that directory.
`12005..12006` independently retain the already implemented color helper.

`verify-race-texture-geometry-instructions.mjs` compares every mapped byte at
or above `10000h` for 1,200 geometry fixtures, including the original table,
signed-short boundary data and varied material IDs: 358 reached instructions
and 52,576,800 interpreted steps match. The connected checker
`verify-race-textures-connected-instructions.mjs` starts the actual image
library before executing `4900a0`, retaining shared allocations and globals.
It compares all mapped bytes, allocation addresses, ordered non-memory CRT
and platform requests, actual STL captures and lifetimes, renderer requests,
and every uploaded level byte. Its full run passes 24 persistent library/startup
pairs: 48 operations, 59 uploads, 444 actual worker callbacks, 4,582 reached
instructions and 11,236,709 interpreted steps. Four fixtures use cold graphics
settings with the native default mipmaps enabled. Six additional pairs with
nonzero incoming registers and a separate rejected-ice-tile fixture also match;
the rejection retains the native staging allocations. Synthetic GDI+ pixels and device descriptors,
a deterministic reusable CRT heap and a serialized await schedule are explicit
fixture services. This proves the reconstructed game algorithms within those
contracts; it does not establish original concurrent scheduling or GPU output.

The full bitmap/conversion/copy/resampling/mipmap graph is actual for these
ordinary uncompressed, unrotated and unblended paths. Compressed-image
conversion and rotated or alpha-composited copies retain the explicit wider
image-module gaps. Renderer calls are the existing `408680` manager virtual
interfaces at offsets `78h` and `88h`; this package does not substitute a new
game algorithm for either backend or claim an implementation of those
backend virtual functions.

The precise conversion SEH producer correction was also checked against the
older 480-case conversion, 240-case full texture, and 48 persistent weather
startup fixtures. All three retained-instruction comparisons pass.
The actual `40ebc0` saved-pointer stores are published for called append paths;
the native inline append blocks in the mipmap routines do not invent a callee
frame. The 1,000-operation storage and 3,000-fixture renderer constructor checks
also pass after this correction.

`tools/probe-race-textures.mjs` reads the installed `Timewarp.jpg` (128 by256)
and `Icesheet.jpg` (1024 by640), supplies host GDI+ decode output to the actual
startup graph, and enables actual default mipmaps. Its new report
`analysis/race-installed-textures-probe.json` records source SHA-256 hashes,
logical IDs62/64/65, fourteen uploads, 97 levels and664 actual worker callbacks.
The complete timewarp base image and all twelve ice base tiles are independently
checked byte-for-byte, including the last128-row tile padding. This is installed
asset evidence through the JavaScript references, not original-process evidence.

Allocation-failure reporter `4a1fe0` is retained in12014/12015. It is a game
assertion manager with synchronization, ignored-site registry, logging, debugger
and message-box policies and several further game callees. It remains an
explicit reached boundary if allocation fails; it is not classified as CRT or
silently replaced with success.

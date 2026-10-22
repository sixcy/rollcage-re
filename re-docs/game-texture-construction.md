# Game texture construction and weather startup

The successful weather image path now executes recovered game algorithms from bitmap loading through texture upload requests. `weather-initialization.mjs` uses `constructGameTexture` by default after actual `401b70`/`401be0` bitmap and ID policy. This is a JavaScript reference checked against retained Redux instructions and installed assets; the original game process is never executed.

## Modules and native ownership

| Module | Recovered work |
| --- | --- |
| `game-image-startup.mjs` | `4bbf40` GDI+ startup, `4bbfe0` worker-pool constructor, `40c0a0` tree sentinel, `4c4a60`2049-entry gamma/linear tables |
| `game-graphics-settings.mjs` | `405010` singleton/locking and full `402fa0` defaults, including actual `4023a0`/`402340` two-element construction |
| `game-image-workers.mjs` | `4c4a00` affinity policy and `4c4910` synchronized per-thread quota lookup |
| `game-image-jobs.mjs` | `4bddf0`/`4c5750`/`4c87e0` capture wrappers, `4bdf80` refcounts, job-vector append/growth/moves and `4c1310` await checks |
| `game-image-conversion.mjs` / `game-image-conversion-rows.mjs` | Uncompressed `4bcdb0` parent and full `4bd770` byte/palette/float conversion worker |
| `game-image-copy.mjs` / `game-image-copy-rows.mjs` | `4c2710` allocating copy constructor, `4c2850` deep copy, `4c45b0` metadata copy, `4c7300` clipping/job parent, and reached unrotated/unblended `4c75b0` worker paths |
| `game-image-resampling.mjs` / `game-image-resample-rows.mjs` | `4c4c20` job parent and full `4c4f40` nearest, box and fractional-area filters |
| `game-image-mipmaps.mjs` | `4bc3b0` extra-level release and `4bc1c0` mip generation from the original first level |
| `game-texture-construction.mjs` | `408680` raw/palette/device-format paths, powers-of-two extents, edge padding, default mipmaps, renderer virtual requests, cleanup and separate `408c23` ID/extent publication |

Retained procedure and data evidence includes3682/3683,3810..3817,3800..3840,3847..3882,3892..3986, with the original half-conversion, float-scaling, epsilon, gamma and settings tables. Request filenames3930/3938 mention thread registration, but their actual addresses are library startup `4bbf40` and gamma initialization `4c4a60`; the implementation follows the retained instructions. Failed table requests3883/3884 are preserved, with corrected reads3894/3895 supplying the used evidence. The provider omits `408c84` from its procedure bodies: Listing3985 plus independent byte read3986 prove `MOV EAX,1` followed by shared epilogue `408c89`. The zero-size texture exit therefore succeeds without touching renderer/ID state; it is now included in the connected comparison.

## Runtime contract

All raw APIs take the same address-backed Buffer and the native entry ESP: `{memory,scratchBase,services,...runtime}`. Original static data must be loaded. `constructGameTexture(index,width,height,depth,pixels,palette,flags,runtime)` models native ECX/EDX plus five stack arguments. `initializeWeather(runtime)` models `496290`; `initializeGameImageLibrary(runtime)` models the separate earlier `4bbf40` stage and is not silently called inside weather initialization.

Actual startup publishes the allocated worker pool through `6eb038`, including its sentinel and Win32 synchronization handles. Conversion/resampling consume that live pool and the real captured affinity/quota limits. Raw callers must provide real incoming registers where saved stack bytes are later consumed; `entryRegisters` supplies those ABI inputs. Inline pointer-vector parents use the actual `growthScratchBase` and `growthRegisters` rather than pretending their inline append is a call to `40ebc0`.

CRT allocation/free, `memcpy`, string services, `registerExit` and libm `pow` use `services.libraryCall(name,args,runtime)`. Win32 synchronization/affinity, QPC and GDI+ use `services.platformCall(name,args,runtime)`. QPC comes from the shared actual `489cd0` clock reference. Bitmap decoding itself is the real GDI+ boundary.

Texture allocation/upload use `services.rendererCall(request,runtime)`. A request contains `{thisAddress,virtualAddress,offset,arguments}`. Offset `78h` receives `[outputPointer,0]`, returns the pointer whose dword supplies the texture handle, and can mutate memory. Offset `88h` receives `[handle,imageList,0,0,flagBit3,outputBytePointer]`; only AL equal to1 counts as success. The original game still publishes its logical ID and extent tables and releases all temporary images when upload fails. This explicitly virtualizes the original renderer interface and does not claim live hardware execution.

## Genuine STL boundary

The native async/future library state constructors `4bde50`, `4c57c0` and `4c8850` are admitted C++ library boundaries. Game capture wrappers and their9/10/14-word tuples remain actual game code. The service is `stlAsyncConstruct({futureAddress,functionAddress,thisAddress,arguments,execute},runtime)`. It owns the opaque STL state while preserving caller-read refcount, retrieved and delegate fields. `execute({scratchBase,...})` invokes the actual captured game worker with an explicit worker stack. `stlFutureWait`, `stlFutureDestroy` and `stlFutureError` receive the actual selected state/virtual target and child entry ESP.

The check fixtures use an explicit serialized schedule that executes each job exactly once when awaited, with worker ESP4000h. Captures are immutable values; source/target image fields remain live memory. This proves the game behavior for that declared schedule, not original concurrent runtime behavior or a general STL implementation.

## Consumed private stack producers

Image clear `4c1af0` copies stale private local words into fields, including fields of freed images. The connected proofs retain those stores. Source parents publish actual call arguments, saved registers and retained return-address words at their original steps. This includes settings' tiny array constructor, copy/allocator prologues, mipmap child calls, native self-metadata calls and vector reservation/moves. These are real producers, not end-of-call snapshots copied from the oracle.

The generic bounded interpreter leaves external callee frames opaque. The texture checkers explicitly publish the original external CALL return stores `40f0a2→40f0a8` and `40f0ba→40f0c0` at ESP−4 because later cleanup consumes those slots. They are proven CALL instructions with original next addresses. CRT internals beyond that declared ABI remain opaque; callback artifacts are not substituted for these CPU stores. The original `__allmul` call sites similarly publish their consumed argument/return words.

Every mapped byte at or above10000h is compared after each connected operation, including freed storage and globally published stale fields. Private stacks are excluded from direct equality, but their consumed effects are included without filtering legitimate stores. Exact STL tuples, child ESPs and renderer requests/full uploaded mip pixels are compared. Ordered non-memory CRT/platform requests are compared; pure memory/string CRT operations are represented by the full memory comparison.

## Verification

| Checker | Fixtures / operations | Interpreted steps | Reached instructions |
| --- | --- | --- | --- |
| `verify-game-image-startup-instructions.mjs` |160 /243120 real libm requests |4,165,320 |138 |
| `verify-game-graphics-settings-instructions.mjs` |480 |83,520 |134 |
| `verify-game-image-jobs-instructions.mjs` |240 /1680 operations /600 actual workers |138,240 |398 |
| `verify-game-image-conversion-instructions.mjs` |480 /442 actual workers |758,915 |2336 |
| `verify-game-image-copy-instructions.mjs` |240 /720 actual workers |549,840 |1326 |
| `verify-game-image-resample-rows-instructions.mjs` |720, filters0/3/4 and ignored filter |2,027,475 |1056 |
| `verify-game-image-resampling-instructions.mjs` |240 /623 actual workers, including same-size copy/defaults |618,299 |2426 |
| `verify-game-image-mipmaps-instructions.mjs` |240 /2400 actual workers |2,182,960 |2717 |
| `verify-game-texture-construction-instructions.mjs` |240 /1778 actual workers, including zero-size exits |3,462,352 |3585 |
| `verify-weather-startup-connected-instructions.mjs` |48 persistent startup/weather pairs /96 operations /64 uploads /716 workers |11,103,088 |4756 |

The final chain runs actual image-library startup followed by weather initialization across all three modes,5×3/16×16/64×64 bitmap fixtures, both stride signs, RGB565/RGBA32 device formats, real default mipmaps and ID63 avoidance. Sound is disabled by the actual native policy. Texture-specific fixtures additionally cover palette conversion, forced nonpalette flags, empty pixel storage, non-power-of-two extents and rejected uploads. Independent leaf format/storage/resource/bitmap proofs remain available.

`probe-weather-texture-construction.mjs` reads the installed `Raindrop1.jpg`64×64 and `Snowflake2.jpg`16×16 through host GDI+, then executes actual bitmap fallback and the complete game-side texture graph in RGB565 and RGBA32. All decoded rows and every base pixel match independent checks; every mip dimension/byte count and RGBA alpha is checked. The report records16 generated mip levels and104 actual captured pixel callbacks, with per-level hashes in `analysis/weather-installed-texture-construction-probe.json`. It uses explicit renderer/CRT/STL service fixtures and never executes the original game.

Focused tests cover captured arguments surviving later parameter mutation, deferred real pixel work and ownership release, invalid futures, actual worker-pool→quota consumption, gamma initialization once, box averaging, texture edge padding and rejected-upload cleanup/publication.

## Remaining boundaries and limits

Compressed-block conversion `4c6c60`, rotated/alpha-composited `4c75b0` image copying, palette-copy allocation `4a3290`, allocation-failure debug reporting and arbitrary nonempty metadata constructor strings remain explicit game work outside the reached weather-JPG path. Resampling arithmetic is verified for finite colors; NaN payload propagation during arithmetic is not certified. Copy-only raw-bit fixtures include arbitrary pixel words.

Weather drawing consumers `497110`/`497350`, broad renderer backends and complete application lifecycle remain project scope. Standalone helper fixture counts are evidence of stated paths, not whole-game coverage percentages. The successful startup package does not claim original-process or concurrent-runtime observation.

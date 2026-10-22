# Dynamic light storage and authored constructors

`src/dynamic-light-state.mjs` now includes the actual constructors for the light pool, attenuation lookup, sector band storage and authored scripted lights. These close the caller-input boundaries formerly left at `80f20c`, `80f214` and `80f220`; the full map loader and renderer remain separate requirements.

| Export | Native entry | Required input |
| --- | --- | --- |
| `initializeDynamicLightAttenuation(runtime)` | `48eeb0` | Existing `6e6ca8` or CRT allocation service |
| `initializeDynamicLightStorage(runtime)` | `48ef30` | Loaded pack `90b98c`, segment array and row counts |
| `initializeAuthoredDynamicLights(runtime)` | `44e220` | Authored rows, palette/script offset tables, spawn table and body arena |

The runtime uses the same raw `Buffer` and native address space as the light update. `handlers.allocate(size, runtime)` is an explicit CRT allocation interface returning a pointer or `{eax: pointer}`. It supplies storage, without replacing game allocation decisions. These routines do not call a host allocator themselves.

## Storage ownership

`48eeb0` returns immediately when `6e6ca8` is already nonzero. Otherwise it allocates 4,096 bytes and builds 1,024 DWORDs. Entries 0–31 are `0x7ffd-index`; subsequent entries are `max(0, trunc(0x100000/index)-index-3)`. The original code continues writing after a null allocation result. The reference preserves writes at address zero in the explicit buffer; this is not a claim that a real process could safely write to the null page.

`48ef30` calls that actual constructor, then clears only the kind WORD in slots 1–70 of the 64-byte pool at `80f520`. Lifetime and all other slot fields survive; slot zero is untouched. For every segment of the loaded pack, it reserves `((rowCount >>> 4) << 5)+32` bytes. The table at `80f220` receives each sector's offset plus a final sentinel, then the allocated base is added to those entries. The eight cells in each 16-row band are zeroed.

The loaded pack pointer is captured before allocation. The sector count is read again from that captured pack after allocation, even if the allocator changed the global pack pointer. The implementation preserves that order. Finally the constructor clears the high-water count `80f20c`, search index `80f214`, dirty count `80f210`, 64 dirty entries at `80f420` and queued count `810920`.

The native relocation and zeroing loops use wrapping 16-bit counters. The checked domain has bounded, valid sector counts and allocation sizes; counts at or beyond the counter's terminating range can fail to terminate in the native code. No arbitrary input cap or corrective loop behavior is inserted into the game reference. This constructor itself does not free the previous band allocation. The direct cross-reference query for base global `80f208` reports only its constructor store at `48efb0`; that does not establish the lifetime of the underlying heap block through aliases or broader allocator ownership.

## Authored lights and mini-bodies

`44e220` installs 32-byte authored rows into slots starting at one. It copies RGB with alpha `0x3c`, signed short positions converted to 16.16, mode, palette ownership and four range DWORDs. Palette offset differences wrap to 16 bits before division by two. Actual `44d5b0` inserts those ranges into the sector bands. The final high-water and search indices are both `authoredCount+1`, including one for an empty authored list.

A nonzero script byte claims exactly 384 bytes from `*902eec + (*70dcf4 & ~3)` and advances the original arena offset by 384. The full block is first filled with `0xff`; only native fields are then initialized. Mass `a8`, rotation and numerous gaps retain that fill. The constructor does not synthesize a normal vehicle/body constructor. It appends to `70e200` only while the signed registration count `6e6b44` is below 512, preserving the original signed comparison and body registration WORD.

The script offset is read from `9092b4`; the spawn byte indexes the short position table at `*(90b990)+a8`. Script state `138..13f` and the five attachment handles are initialized in their native widths and order. The new actual raw script bridge is now the default reached `476550` call in the light update; optional `handlers.call476550` remains available for caller-boundary tests. [The connected script/light check](raw-scripted-motion.md) covers constructor-produced mini-bodies through subsequent scripted updates and release, retaining the original nonunit mass and initially uninitialized rotation.

## Upstream evidence and limits

The retained incoming references and full parent assembly identify `47ea40` as the caller of both `48ef30` and `44e220`, in that order, after successful `44c2b0` map loading and three intervening setup calls. The full startup parent remains outside this constructor package. The authored data is published by the larger `44c2b0` map loader from its relocated auxiliary header:

| Header field | Published global | Meaning consumed here |
| --- | --- | --- |
| `+44` | `90926c` | Authored 32-byte rows |
| `+48` | `909268` | Authored row count |
| `+9c` | `9092ac` | Palette offset/data table |
| `+a4` | `9092b4` | Script offset/data table |
| `+a8` | `9092b8` | Spawn positions; scripted construction reloads the header field |

The complete `44c2b0` resource loading/relocation lifecycle is not replaced by fabricated input producers. This package starts with those mapped inputs and an existing arena. The visible-light/dirty sampling builder `48f030`, attachment release `44ef90`, rendering and broader level startup remain separate functions. The exploratory `4130c0` evidence was found to describe sky geometry, not header relocation, and is not used as a light constructor.

## Validation

`node tools/verify-dynamic-light-construction-instructions.mjs` passes **349 distinct retained instructions**, **1,600 sequential constructor fixtures** and **11,668,245 interpreted steps**. It reaches 1,600 storage constructors, 3,165 attenuation entries, 1,600 authored constructors and 3,184 actual range insertions. There are 2,400 allocations requesting 3,549,856 bytes and 2,016 mini-body claims. Only CRT malloc/memset are services.

The comparison checks complete attenuation, bands, pool, dirty/queue ownership, body arena, registration and affected globals after each stage. It includes cached lookup ownership, allocator mutation, aligned claims with preserved low arena-offset bits, signed registration limits, palette-length wrap and buffer-address-zero allocation results. Report: `analysis/dynamic-light-construction-instruction-check.json`; retained assembly requests `1248`, `1252`, `1256` and existing `1173` carry the evidence IDs recorded there.

Eight constructor tests and eleven light update tests pass via `node --test tests/dynamic-light-construction.test.mjs tests/dynamic-light-state.test.mjs`. These are synthetic caller-owned state and interpreted shipped instructions, not original-process or rendered-light observations. Reused range helpers and script instructions overlap other reports and must not be added as unique reconstruction coverage.

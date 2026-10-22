# Weather primitive drawing

`src/weather-draw.mjs` implements the whole `497110` rain and `497350` snow
primitive producers and their actual children `432320`, `432470`, `4323f0`.
The entries are `drawWeatherRain(index, runtime)` and
`drawWeatherSnow(index, runtime)`, where runtime supplies the shared raw
`memory`, native entry ESP in `scratchBase`, and optional `entryRegisters`.
`roundingMode` declares the x87 integer-conversion policy: nearest-even by
default, toward-zero, down, or up. No renderer service is called by these five
algorithms. They transform packed particles, clip them, and link raw primitives
into the renderer's depth buckets; later bucket submission is outside this
package.

The caller supplies the original live roots: the indexed volume pointer at
`80dde0`, its body pointer at row+10h, the rain/snow primitive buffers at
`80dee0`/`80ded8`, and the renderer bucket manager at `91d590`. Camera
translation, float matrices, perspective ratio, center and clipping words are
read at their native `91cdxx`/`91cexx` addresses. The source keeps the native
`index*8` offset at the beginning of the 2,048-particle traversal; it does not
normalize this unusual access to the first volume record.

Rain transforms both endpoints into 60-byte records, retaining the original
packed-lane addition for its endpoint displacement. Both flag words and the
rounded first depth decide acceptance. The depth bucket compresses distance
above256 and384, clamps to511, subtracts48 and clamps to1. The queue link and
bucket head are direct shared-memory stores. A fully accepted 2,048-record
buffer returns before reversing the expanded clipping bounds; this native
early-exit behavior is preserved. Other exits reverse the original binary32
additions/subtractions, without substituting a saved bounds snapshot.

Snow builds120-byte quads. Negative-sign depth skips projection completion;
the near flag excludes other clipped depths. Size derives from the captured
projection scale and is capped at the original16.0 constant. Screen clipping
combines integer X/Y halves before arithmetic, preserving inter-lane carry
and borrow and the native signed comparisons. Accepted vertices retain the
primitive's initialized material/UV words while replacing their flags,
coordinates and depths.

The transform helpers keep the pending x87 scalar until `4323f0` consumes it.
`432320` divides by the unrounded depth; `432470` reloads its stored binary32
depth first. Clip comparisons use signed IEEE float words. Projection writes
`91ce18`, packed input globals and final `6fb5dc` at the actual steps. Matrix
reads, output stores and shared aliases remain live; private stack partial-word
stores remain part of the caller contract.

The connected proof exposed two real upstream stores: `496580` saves incoming
ESI at entryESP−4, later consumed by rain's partial local write; image startup
`4bbf40` leaves its original SEH handler56ab4c in aligned scratch, whose high
half survives `496640`'s short initialization into every snow primitive. Those
stores now occur in the actual producer modules. Snow initialization likewise
publishes its original saved registers when supplied. No final-state scratch
copy is used.

Retained evidence is `3643..3646` for the parents and `12016..12021` for the
three transform children in `analysis/native-simulation/results`. The
primitive storage/texture producers are the existing actual `496580`,
`496640`, `401be0`, `4895d0` and `408680` references.

`verify-weather-draw-instructions.mjs` passes120 full-parent fixtures:
5,202,249 interpreted instructions,441 distinct reached instructions,
8,382 accepted rain and8,383 accepted snow primitives. It compares every
mapped byte at or above10000h, with finite mixed float matrices, negative and
near depths, all four integer rounding policies and complete2,048-particle
buffers. `verify-weather-draw-connected-instructions.mjs` passes eight
persistent actual image-library→render-buffer/texture constructor→four-frame
chains:48 operations,32 draws, four texture uploads, eight actual image workers,
2,915 reached instructions and4,607,428 steps. All mapped bytes, ordered
platform/CRT requests, STL captures and uploaded image bytes match.

The connected chain explicitly supplies synthetic GDI+ pixels, CRT allocation,
renderer virtual services and a serialized STL await schedule. Raw world and
camera roots are declared fixtures. It does not claim original game execution,
GPU pixels, concurrent scheduling or complete scene renderer submission. The
bounded interpreter uses binary64 x87 intermediates; arbitrary extended80-bit
precision, exception status and full control-word behavior are not certified.
The reached narrow x87 FST/FSTP/FADD/FDIVR forms have accepted/rejected operand
and stack-depth tests. Four focused weather tests cover full-buffer clip
retention, ordinary clip restoration, capped snow geometry and negative-depth
queue preservation. Existing160-case library startup,120-case weather
initialization and48 persistent weather startup chains also pass after the
upstream producer corrections.

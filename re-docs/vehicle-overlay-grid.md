# Vehicle textured-grid preparation (`00487540`)

`src/vehicle-overlay-grid.mjs` reconstructs the complete ordinary-race stage `00487540`, its actual leaf `00487790`, the adjacent constructor `00487410` and the color/height producer `00487620`. “Overlay grid” is a neutral module label; the exact visual presentation is not established by these routines alone.

| Native entry | JavaScript API | Public native inputs |
| --- | --- | --- |
| `00487540` | `updateVehicleOverlayGrids(runtime)` | No public register or stack arguments |
| `00487790` | `updateVehicleOverlayGrid(index, runtime)` | ECX participant index |
| `00487410` | `initializeVehicleOverlayGrids(runtime)` | No public register or stack arguments |
| `00487620` | `updateVehicleOverlayAppearance(index, colorsAddress, runtime)` | ECX participant index, EDX color-output address |

Runtime holds caller-owned `memory`. These routines contain no external calls or remaining game callbacks. `initializeVehicleOverlayTables(memory)` installs the existing original 321-word sine/cosine table from `yaw-table.json`; it does not allocate material/configuration/session storage or execute the constructor automatically.

## Outer stage and live ownership

Configuration pointer `005ecefc`, byte `+30`, gates `00487540`. The stage captures the session pointer from `005ecb1c`, then resets participant-record byte `+255` to `ff` for every live `session+54d` participant. Both loops reload that count as native does. Records are `00909300+30ch*index`, with the body pointer at `+0`.

A body is skipped when its `+6bc` pointer differs from `ffffffff` and the pointed byte is nonzero. Eligible bodies derive an amount from signed `body+664`:

```
amount = trunc(i32(i32(speed - 003a0000h) << 8) / 00190000h)
```

The shift wraps before division. The native comparisons rank amounts greater than one, assigning record byte `+255` consecutive values zero through five. The **sixth qualifying participant is ranked and then returns before its leaf grid update**. Lower amounts still receive a leaf update without a rank. An active `+6bc` controller suppresses both ranking and grid update. The prepass has already reset later ranks when the early return occurs.

`body+664` has an existing actual producer, `updateVehicleMotionState` (`00443d90`) in `vehicle-control-state.mjs`. This stage consumes that live field; it does not recalculate speed or invent a controller/configuration producer.

## Actual grid, constructor and appearance behavior

Each grid block starts at `0082eda0+4208h*index`. Its first `4200h` bytes hold 128 primitive records of 132 bytes; trailing dwords at `+4200/+4204` hold texture phase and cache/sentinel state. The constructor initializes six blocks, setting phase zero and cache `ffffffff`, then invoking the actual UV leaf. An odd native clock therefore leaves constructor phase **one**, rather than zero.

`00487790` increments phase on odd low byte of `0090a548` and clamps a resulting signed value of nine or greater to zero. Even clocks retain the supplied phase. Material selection is:

```
material = [0090b988] + 16 * (u16([0090b990]+2e) + 86h + phase)
```

The source material fields are captured before any output writes. The leaf fills an eight-ring by sixteen-column UV grid with logical fixed accumulators shifted right 19, mirrors X after passing the material endpoint, and stores low bytes with their original wrapping. Only the first two vertex UV dwords retain material high words. The other two originate from zero-extended source WORDs and retain zero high words. Primitive gaps and all other bytes remain unchanged. Material data overlapping the first UV output is checked against native instructions.

The shared 16×9 short geometry begins at `0082e920`, immediately before the first grid block. The constructor **rewrites this same shared geometry on each of its six passes**, using original sine/cosine values, radial steps of eight, signed divisions by 14000/27500 and height `80-trunc((row*6)^2/64)`. Each vertex is eight bytes with its fourth short preserved.

`00487620` reads the participant body pointer before testing config `+30`, then uses the same wrapped speed expression clamped to zero through 160. It writes sixteen copies of each of nine row colors to caller-supplied color storage, alongside shared geometry heights. Rows seven and eight have separate speed-derived height changes. Packed colors retain the native `8e` top byte, squared intensity byte and linear intensity byte. Its masked RNG advances **17 times** per enabled call: once on row zero and twice on each later row. RNG remains local until the final write to `005ec958`; even color output overlapping the RNG global preserves that final publication. Height/color output overlap is retained in native store order.

## Evidence and complete instruction comparison

Target: Redux 1.3.8.0 SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

- `2900/2901`: `00487540` pseudo/assembly, assembly evidence `ev_21d86677dd9ad93cd13c42487d9ca96a798ec97489f05b8051e12ec2713a617d`.
- `2902/2903`: `00487790`, assembly `ev_38cdb30ce19ed14a2b495e29842d592d9160ae36883221258678656bd631d469`.
- `2904/2905`: `00487410`, assembly `ev_18dfd0a3c72d00edba17b324fd11d2ac0d2994dfd62745d70d7db494c3e5bc49`.
- `2906/2907`: `00487620`, assembly `ev_2d0b840dc3ce7ecf40bf683f1c0ae3dfd55afc103cdedec685fa0cd27657a0e9`.
- `2908`: phase-counter xrefs. Original yaw bytes remain those of existing `yaw-table.json`, evidence `ev_f2b04d8b6ef54e468978fde5d7e1c51258e31a0ec672232ece1dcb89e4271411`.

`node tools/verify-vehicle-overlay-grid-instructions.mjs` **passes** all **386 retained instructions**, with **10,560 calls**, **84,299,498 interpreted steps**, **400 alias fixtures** and **120 sixth-rank early exits**. There are 2,400 mixed direct fixtures plus 96 constructor-to-consumer sequences, each continuing for twelve ticks through the actual outer stage and all six actual appearance producers. Call visits are constructor 696, outer stage 1,752, appearance 7,512 and UV leaf 12,452. The latter includes nested calls and is not additive to public calls.

Every mapped data byte from `10000h` upward is compared after each operation: all grid records/gaps, shared geometry, materials, session/configuration/body/record inputs, colors and RNG. Only declared between-tick clock updates occur in the persistent sequences. No external services or game mocks are admitted. The final fixture uses the coherent six records preceding `0090a548`: that address physically aliases the location of a hypothetical seventh participant pointer and is the real clock global. Earlier preliminary fixture outputs are retained separately and are not additive.

Primary report: `analysis/vehicle-overlay-grid-connected-instruction-check.json`. Earlier `vehicle-overlay-grid-instruction-check.json` and `vehicle-overlay-grid-complete-instruction-check.json` are preserved preliminary comparisons.

`node --test tests/vehicle-overlay-grid.test.mjs`: **9 tests pass**, covering config gates, actual constructor phases and stale gaps, UV reflection/flags, phase wrap and signed supplied phases, speed thresholds/controller gating, sixth-rank ordering, known color/height/RNG outputs, RNG/output alias and a smaller full native comparison.

## Explicit limits

Config/session/body/controller/material resources are caller-owned mapped inputs. The complete scene/material constructors and renderer submission/rasterization are separate callers, not game mocks hidden beneath this package. The appearance routine writes its native buffers; this does not establish a reconstructed rendered frame or the visual effect’s name. The checker uses bounded synthetic memory and interpreted retained instructions, not an original-process capture. Installed files were neither changed nor executed.

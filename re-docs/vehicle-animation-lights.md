# Linked vehicle animation and attached lights (`48e310`)

`src/vehicle-animation-lights.mjs` reconstructs the outer `450e50` stage `48e310`, its linked-model animation, integer color conversion, and one-time attached-light queue publication. Its actual producers and consumer are connected in the instruction checker; no game callees are replaced with callbacks.

```js
updateVehicleAnimationLights({memory, scratchBase: native48e310EntryEsp});
```

No allocator, terrain context or service handlers are required by this stage. It consumes the inline animation state at body `+2b88`, initialized by actual `48dc60` during [vehicle construction](vehicle-construction.md). The linked model's vertex pointer, selected indices and flags remain native writable storage. The API does not manufacture a model or selected-vertex list.

## Recovered operations

The parent captures the session pointer once, then reads its participant count byte `+54d` live after each call. Each participant body pointer is read through the corresponding `909300 + index*30c` record.

| Address | Export and observable behavior |
| --- | --- |
| `48e4f0` | `updateVehicleAnimationParameters`: recoil from two wheel-record values, weapon-related counter, and edge-triggered signed-byte timer |
| `48e5e0` | `updateVehicleAnimationVertices`: selected authored vertex Z coordinates, with signed-byte live count, independent selection flags and wrapped short writes |
| `47c300` | `convertVehicleAnimationColor`: integer hue/saturation/value conversion with wrapping products, signed truncation, six sectors and division by 33 |
| `48e3d0` | `updateVehicleLinkedAnimation`: the preceding operations, RNG, phase/flash bytes, and packed RGB output |
| `44e470` | `appendVehicleAnimationLight`: bounded 16-entry, 36-byte queue append, optional three-DWORD payload |
| `48e310` | `updateVehicleAnimationLights`: participant orchestration and once-only attached-light creation |

The resulting RGB, phase and flash bytes are body `+2e78/+2e7c/+2e7d`. The actual existing `44d960 → 44df50` consumer reads these exact fields to update vehicle-attached lights, including color pulse, speed scaling, transformed position and terrain-band registration. This establishes a concrete producer/consumer relationship, rather than inferring semantics from an address or nearby strings.

The first stage-four session update with guard `6e6ca4 == 0` appends one record per participant with mode 3, kind 8 and lifetime 1. Its payload begins with the actual body pointer. The guard is committed even if the queue is full or the participant count is zero; rejected appends are not retried by this stage. A null payload leaves the old three payload DWORDs untouched. Queue and vertex stores preserve forward/native ordering, including aliases.

`48e4f0` uses signed short counters and a signed byte threshold for the final trigger value. A byte above 127 is not interpreted as a large positive timer. `48e3d0` updates the phase modulo 256 and advances RNG `5ed008`; its chance comparison is retained exactly. The color helper preserves the hue-360 special case and zero output lanes for unmatched sectors, including signed/wrapped inputs outside the ordinary authored range.

## Stale stack payload producers

The native `48e310` local frame begins at entry ESP minus 28. The payload at entry minus 16 contains three DWORDs, but the parent initializes only the first to the body pointer. The other two are retained caller-stack words at entry minus 12 and minus 8. They must not be replaced with zero or inferred vehicle fields.

The connected comparison exposed two real producers of these retained words:

- `44d960` stores its security cookie at entry minus 8 (`44d96a`): `5e8890 ^ (entry - 44h)`. The raw light implementation now preserves that actual store. Its value can later be committed to a queue payload.
- `443d90` can tail-jump to `4459f0` with the same entry ESP. The formatter's `445a29` store retains the current row's whole timer at entry minus 12, and `445a00/445b2c` retain its output pointer at entry minus 8. The final pointer is `record+4c`; with `allRows=0`, the last processed timer is row two, `record+34`.

The minimal failing sequence was entry `9000`: construct a vehicle; run a state-three `48e310` call; run `44d960`; change to state four; run actual `443d90(record=909300)` and its tail formatter; then run `48e310`. The queued third payload DWORD at `810700` was native `90934c`, while an earlier source path retained a cookie or zero. The raw formatter now publishes its actual private stores when `scratchBase` is supplied to `updateVehicleMotionState`. The full sequence is restored in the passing checker; focused tests separately retain cookie-to-payload and formatter-to-payload regressions. There is no remaining substitute for this caller context in the verified chain.

## Evidence and validation

Requests `2950`–`2961` retain full pseudocode and assembly; `2962/2963` retain queue-global references. Main assembly Evidence is `ev_6f49de79fc5ad018fa052e1920b6ba7666281e465715cb6ea5117627b42bd6f7`; child assembly IDs are `ev_6c9b32b99298ad31ab54765e6426293e341ed9d676aad5561011cdc99f677455`, `ev_c866ec614117dfba154072c6b60bb73dff5146b78440442afd4d4dfea0604cce`, `ev_a63e397a84d4534b324f91ea50e5cea97a7e487ff223eb50f4636c4a119293e7`, `ev_043d0de44f013ebf867216913f93241f922e1fdb48d2b64e0eb3101345eae520`, and `ev_98abb402fdf941648c58e8bb85a93b91bcaf19b0054c719537ec377c57ccb5fd`. Formatter assembly is retained request `128`, Evidence `ev_46177f3a63e69aed1b352c86edddf2c485134aef6089ac8c48750a1b8592f688`; motion parent assembly is request `293`. All target Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

`node tools/verify-vehicle-animation-lights-instructions.mjs` passes **120 worlds over eight ticks**, with **423 actual vehicle constructions**, **3,360 motion/formatter calls**, **963 animation-parent calls**, **960 light-consumer calls**, and **8,000 direct helper cases**. It reaches 4,471 instructions and executes 12,776,725 interpreted steps. The consumer performs 2,940 actual `44df50` attached-light updates; populated type-eight lights carry the constructed body pointers and live animation colors. Three additional constructor/parent alias cases distinguish the captured session pointer, live count and live once guard.

Every byte from `10000h` to the end of the 10 MiB buffer is compared after each initialization, constructor, motion, animation, light update and helper call. No differing addresses are excluded. Only CRT allocation/memset/memcpy and asserted compiler-cookie services are external. Report: [vehicle-animation-lights-instruction-check.json](../analysis/vehicle-animation-lights-instruction-check.json). Eight focused Node tests pass.

The fixtures use one through six distinct actual constructed vehicles. Model/session/world/heap inputs and velocity/weapon field samples are explicitly synthetic; there are no supplied animation colors, vertices, queue answers or light-update results. Heap storage avoids executable literal/table ranges. Installed authored models, original-process behavior, complete world loading, device input acquisition and the whole outer race lifecycle remain broader integration work. The original executable was not run and installed files were not modified.

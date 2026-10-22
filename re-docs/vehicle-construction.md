# Native vehicle construction

`src/vehicle-construction.mjs` reconstructs `41dbb0` and its previously missing state producers over shared raw memory. The parent defaults now call actual game algorithms throughout, including `4741c0` body allocation, `4798d0` body initialization/spatial registration, `428270` shape registration, and the separately recovered [41caf0 wheel constructor](vehicle-wheel-construction.md).

```js
initializeVehicleConstructionTables(memory); // once for a new runtime
const body = constructVehicle(participantRecordAddress, participantIndex, {
  memory,
  scratchBase: native41dbb0EntryEsp,
  handlers: {allocate: (size, runtime) => suppliedCrtAllocation(size)},
});
```

The allocator returns a numeric pointer or `{eax: pointer}`. It represents the native CRT allocation service; the game-owned arena, model publication, layout initialization and ownership changes run in the port. The source returns the newly allocated primary body as a convenience; this does not assert a native `41dbb0` return-value contract. The actual native arguments are ECX = participant-record pointer and EDX = session participant index.

`initializeVehicleConstructionTables` installs original retained bytes, including the mutable body template, tuning/model selection tables, animation translations/pointers, initial animation seed, timing literals, and type table. It also initializes the wheel/render constants. Calling it again deliberately resets those mutable values; it is not a per-vehicle operation.

## Construction and ownership

The parent captures the initial session pointer and the vehicle type at session `+1c+index`. The runtime pack supplies the model-pointer array at `+18` and signed resource lookup words at `+58`. `5eadc4[type]` selects the primary body model; lookup word `+10h` selects the wheel/render model passed to `41caf0`; `5ead50[type]` selects the separate animation model passed to `48dc60`. These are distinct native selections.

The primary claim is `3e78h` bytes with flags `1c03h`. Session byte `54e` additionally creates a secondary `c03h` body. The spawn row comes from pack `+48` using session `+10+index`. Its signed-short XYZ values update the shared `5eab18` configuration before actual body initialization. The first packed checkpoint determines the facing direction; `41e3f0` normalizes the mutable direction and constructs the quaternion. Five authored shapes plus their aggregate are registered, followed by the four native descriptors and wheel objects.

New raw exports cover these reached producers:

| Address | Export and behavior |
| --- | --- |
| `4494a0` | `resetVehicleParticipant`: timer/status fields, session timing literals, nearest route scan excluding group zero, checkpoint IDs |
| `488220` | `initializeRawVehicleDescriptors`: signed-short descriptor copies, tags, range and aggregate-radius enlargement |
| `481100` | `initializeVehicleEffectBlock`: inline `body+728` renderer records and global registry publication |
| `4831e0` | `initializeVehicleSkidStorage`: CRT allocation and complete skid-record initialization |
| `48dc60` | `createVehicleAnimation`: linked body and actual `48dd10/48dda0/48e670` initialization |
| `42c9d0/42c950` | `initializeVehicleSurfaceLinks` / `initializeVehicleGripRecords`: tagged inline lists and material fields |
| `42aa80` | `initializeVehicleController`: first state-eight replay slot, record/playback headers, actual checksum validation |
| `47e240` | `initializeVehiclePresentation`: mode-four participant-zero six-body presentation and double-buffered panel |
| `41cfc0` | `cloneSecondaryVehicleWheels`: forward wheel copies and four independent render objects |

`42aa80` retains the native exhausted-search behavior: its fallback controller address is the incoming body address. It is not converted into a null or an invented allocation failure. `41cfc0` captures the body registry cursor once across all four allocations, including crossing the 512-entry registration limit. Its forward DWORD copies preserve overlapping-source order.

The animation path retains once-per-type modifications of shared authored vertices. A primary model with more than 250 polygons changes three shared translation pointers before selecting the translation. Range selection uses native signed shorts, wrapping RNG, actual stack temporaries, untouched record fields, and the signed-byte polygon list consumed by `48e670`.

The parent installs `41e080` at body `+148`, publishes participant ownership through `8495e0`, adds the body to `82e880`, and preserves the native mixture of captured primary-body pointers and later participant-record reloads. Allocation-side mutations in the checker exercise that distinction. AI initialization `410060` is a separate later stage in session parent `47ea40`, not a child of `41dbb0`; see [vehicle autonomous initialization](vehicle-autonomous-init.md).

## Evidence and verification

The complete parent assembly was already retained as scene request `134`, Evidence `ev_16e1c6a62e466500605b98333c96f4863f748728e8f58cd1708448cd6dd17a25`. Native-simulation requests `2550`–`2575` retain the missing child pseudocode/assembly; `2576`–`2579` retain the original constants, whose target SHA and Evidence IDs are recorded in `src/vehicle-construction-tables.json`. All evidence targets Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

`node tools/verify-vehicle-construction-instructions.mjs 200` passes **2,800 calls across 14 entries**, 3,498 reached instructions and 5,095,444 interpreted steps. Cases include allocation-side changes to session/pack roots, participant body pointers, a captured model stack slot, tuning and participant index; exhausted controllers; empty routes and signed distance overflow; registry-cap crossings; large-primary-model translation; and equal-depth animation vertices. Only CRT allocation/memset/memcpy and compiler cookie services are external. Every byte from `10000h` to the end of the 10 MiB buffer is compared, without excluded differing addresses. Report: [vehicle-construction-instruction-check.json](../analysis/vehicle-construction-instruction-check.json).

`node tools/verify-vehicle-construction-physics-instructions.mjs 48` carries **48 actual constructors into 384 actual control conversions and 384 persistent physics frames**. It passes 9,143 reached instructions and 14,124,734 steps, with 1,390 wheel contacts and 32 collision events. Every byte above the private stack is compared after construction, control conversion, and each physics frame. Clock values, byte-axis input samples, session state and upstream assets are explicit matching inputs; no wheel/contact answers or game callees are substituted. Report: [vehicle-construction-physics-instruction-check.json](../analysis/vehicle-construction-physics-instruction-check.json). Ten focused tests cover ownership, modes, aliases, native quirks and connected comparisons.

These checks use constructed resource/session/spatial/model/allocator inputs, not installed authored vehicle models or original-process observations. The native session/world loader `47ea40`, device acquisition, full constructor-to-AI orchestration, lifetime destruction, every renderer topology, and every multi-vehicle constructor/physics combination remain further integration work. The separate 640-frame vehicle-physics checker supplies interacting pairs and populated effect emission coverage; this constructor chain does not replace that broader check. Installed files were read only and the original executable was not run.

An additional bounded chain in `tools/verify-vehicle-construction-ai-physics-instructions.mjs` now carries48 actual constructors through actual410060 AI/profile/seed initialization before384 actual control/physics frames. It matches9,991 reached addresses/14,157,774 steps,1,390 wheel contacts and32 events, comparing all mapped bytes after every stage. Its synthetic CRT heap starts at600000 so allocated controllers cannot overwrite the immutable410060 dispatch table at41020c; the older physics-only fixture heap at400000 did not preserve that newly consumed code-data span. No dispatch target or game answer is mocked. This does not execute47ea40, its intervening416180 auxiliary setup, actual input/AI dispatch or the complete scene/session lifecycle; those remain open.

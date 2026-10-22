# Native race object dispatch and types 20, 31 and 32

`src/race-object-update.mjs` reconstructs the complete `429f30` outer object pass and its three reached game children. The type numbers are native classifications, not inferred object names. All reached effect, spatial and sound decisions have actual game defaults.

| Export | Native entry |
| --- | --- |
| `updateRaceObjects(runtime)` | `429f30` |
| `updateRaceObjectType20(bodyAddress, runtime)` | `42a1f0` |
| `updateRaceObjectType31(bodyAddress, runtime)` | `429fa0` |
| `updateRaceObjectType32(bodyAddress, runtime)` | `44ac80` |
| `initializeRaceObjectType20(ownerAddress, runtime)` | `42a0e0` |
| `initializeRaceObjectTables(memory)` | Original bytes at `570600` and `570660` |

Runtime is `{memory, scratchBase, handlers?, soundRuntime?}`. `scratchBase` is native entry ESP. Nested calls receive their actual entry stack offsets; raw body, pool, list, UV and global storage remains shared and live. `soundRuntime` can supply the existing native sound library interfaces. Optional `handlers.emit484bb0` is a focused caller override; ordinary execution uses actual `emitNativeEffect` and `dispatchNativeSound`.

## Outer pass and producer ownership

`429f30` captures signed count `91e778` and list pointer `91e77c` once. It then reloads each list entry and that object's low nine type bits. Type 20 resets global phase `91e744` when session mode `551` is 3; otherwise it calls `42a1f0`. Types 31 and 32 call their children. All other types are left unchanged. A child may change a later list entry; the next iteration observes it. A child changing the global count does not change the captured iteration count.

The retained `47ea40` startup parent allocates an initial 64-byte list, publishes `91e77c`, zeros `91e778` and zeros the type-20 phase. `429c90` appends constructed objects through its type-dependent `40feb0`, `46e810`, `44ac20` and `429e00` constructors. Those constructors and the complete startup/resource lifecycle are separate work; this source does not manufacture them or claim that list appends enforce the initial allocation's capacity. The already recovered `42a4e0` race transition controller can change an active type-20 phase.

## Type 31

State DWORD `body+184` selects the behavior. State 2 uses signed age WORD `188`; an age of at least 96 changes to state 3 without an effect or matrix update. Otherwise it advances RNG `5ec954`, constructs a jittered position above the body and velocity `[0,-0x400000,0]`, and looks up the actual effect mask through the original 96-byte index table and eight-DWORD mask table.

A nonzero mask calls actual `435ba0` with count 9 and sound code 11. The effect dispatcher reaches its actual particle, debris, trail and other policy helpers, with original RNG and pool state. Nine signed matrix shorts at `c4` are then multiplied by 253 and arithmetically shifted by eight; negative rounding and the sticky value -1 are preserved. The live age WORD increments afterward. State 3 calls actual packed spatial removal `474850` and sets state 0.

The signed lookup admits negative ages into memory before `570600`. Original adjacent bytes are not assumed to be part of the 96-entry table. A focused synthetic case supplies its own preceding byte; this is not a claim that negative ages are a normal authored state.

## Type 20

This child uses global phase, counter and UV state rather than body fields. Session mode 8 resets the phase and returns. Its native phases are:

| Phase | Behavior |
| --- | --- |
| 1 | Clear `91e774` |
| 2 | Alter selected polygon UV bytes in both buffers; enter phase 3 and run its sound test |
| 3 | Emit code 40 every unsigned `90a548 % 25 == 0` |
| 4 | Publish signed wrapping `counter*2`, capped above at 110; increment counter |
| 5 | Publish clamped `200-counter` shifted by eight; enter phase 6 after a negative result |
| 6 | Restore each selected polygon's saved UVs; enter phase 7 with counter 1 and zero output |
| 7 | Replicate the counter into the native packed output below 128; otherwise advance RNG `5ec958` and choose `808080` or `303030`; wrap counters above 1024 to 512 |

The UV owner at `91e748` supplies two pointers at `+14` and `+18`. Polygon IDs at `91e750` are signed bytes and records have stride 132. Count `91e74c` is signed and reloaded after each record. Phase 2 rereads the first saved U byte for each of four wrapping writes; phase 6 restores distinct eight-byte saved records. Both buffer pointers and saved bytes retain native live-read ordering, including aliases with globals or later object-list entries.

Actual initializer `42a0e0` selects polygon IDs 35, 36 and 37, captures three widths from the first polygon buffer, subtracts five from each cumulative width, and builds the saved UV records. It sets phase 1 and counter zero. Its final output writes only the low 24 bits of `91e774`, preserving the upper byte. The compiler-cookie check remains an explicit validated service in the instruction comparison.

## Type 32

State DWORD `180` drives three active states and an RNG-selected inactive branch. Timer and emission-count fields at `184` and `186` are independent wrapping WORDs. The state machine retains the 64-tick count growth, transition at emission count 5, randomized 8/24 timer, countdown, and alternate-tick decay. The emission loop uses the signed count and advances two RNG steps per requested item even if the free pool is exhausted.

The child emits at its original fixed coordinate ranges, independent of the source body's position. It consumes ushort IDs from `902b7c`, appends them through `902b80`/`902b88`, claims 128-byte records under `902b84`, and calls actual `474670` spatial registration before remaining field writes. The widened ID cannot equal the native comparison sentinel -1; even ushort 65535 is not silently discarded. Free cursor and RNG are committed at their original loop exit, with native body/debris/global aliases preserved.

## Validation and limits

`node tools/verify-race-object-update-instructions.mjs` passes **549 instructions belonging to the five newly recovered functions**, **1,373 reached instructions including actual descendants**, **3,960 calls** and **891,605 interpreted steps**. There are 1,200 fixtures with three persistent calls each, 120 UV/list alias fixtures, and 120 actual initializer-to-phase-2 chains. All phases 0–9 occur. The comparison covers the entire declared memory except native stack scratch, including every reached body, pool, UV, RNG and effect write.

Watched actual calls include 1,560 dispatcher entries, 2,119 type-20 updates, 2,224 type-31 updates, 2,344 type-32 updates, 120 initializers, 34 full effect bursts, 2,722 spatial registrations, 36 removals and 445 actual `484bb0` → `40ea40` sound decisions. No game handlers are mocked. The sound bank is explicitly empty in this connected corpus, so populated source/channel/device operations are covered by the separate audio checks rather than claimed here. There are 120 validated compiler-cookie calls and no platform execution.

Report: `analysis/race-object-update-complete-instruction-check.json`. Earlier preliminary reports are retained as `race-object-update-instruction-check.json` and `race-object-update-connected-instruction-check.json`; they are not additional independent coverage. New retained requests `1334..1352` supply parent/child/producer evidence and original tables. The malformed older `1332` byte request is preserved and is not used; replacement requests use the advertised `length` field. Source table bytes and evidence IDs are retained in `src/race-object-tables.json`. The executable digest is recorded in the complete report.

`node --test tests/race-object-update.test.mjs` passes 11 focused tests, covering signed age and matrix rounding, delayed spatial removal, signed polygon IDs, both UV buffers, restoration, overflowing phase arithmetic, exact initializer output, exhausted-pool RNG, ushort ID 65535 and captured list length. These are interpreted shipped instructions over synthetic mapped runtime storage, not an original-process observation. Upstream constructors, real resource/model loading and renderer consumers remain explicit requirements. Reused helper totals overlap other checks and must not be added as unique reconstruction coverage.

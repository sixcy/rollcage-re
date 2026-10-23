# Native background audio manager update

`src/audio-manager-update.mjs` adds the actual `4a6600` update and its normal
`4a6a6d` continuation, plus supported `4a6b60` source-consumer branches.
The source now reaches genuine mixer lookup and source gain/frequency updates
through the original manager consumer. It is a bounded reconstruction; the
complete background worker, all source states and native interleavings remain
unfinished.

```js
updateAudioManager(managerAddress, {
  memory, scratchBase: entryEsp, moduleBaseAddress,
  entryRegisters, sehWord, services,
});
updateAudioManagerSources(managerAddress, runtime); // original 4a6b60 entry
```

Both APIs require original shared memory and native entry ESP. Incoming
callee-preserved registers and the previous SEH word supply their native
private stores in instruction comparisons. The outer return contract is AL
equal to one; it does not claim every volatile EAX bit. The consumer returns
its final native EAX for the checked branches.

## Implemented producer behavior

The outer update executes the game-owned depth/owner changes at manager
`+894h`, `+854h` and `+874h`, including recursive depths and zero-depth owner
clearing. Win32 Enter/Leave services own their external effects; a thread-ID
query supplies the actual ID, and source code writes the game wrapper fields.
No observed manager or concurrent wrapper result is copied into game state.
The event handshake resets/sets the original handles and increments the
`+8cch` counter in native order. JavaScript execution alone does not establish
the original atomic scheduling semantics.

Actual stopwatch children produce the timestamp and its private arithmetic
stores. The outer's `716e00h` timestamp is consumed as the original code
consumes it; the port does not replace it with an invented frame delta. The
source consumer separately updates manager `+8e0h/+8e4h` and computes the
wrapped delta at `+8e8h/+8ech`.

Deferred retirement performs the three native remove/erase sequences on the
containers selected through manager `+834h`, `+83ch` and `+838h`, preserving
duplicates, untouched capacity tails, conditional header reloads and original
CRT memmove calls. Known deleting targets execute real `4ad8f0`, its concrete
source destruction and the existing decoder/waveform/callback ownership
children. Unknown targets and reached unsupported relocated children throw.

Mixer ramp updates and `4a90f0` hierarchy processing run the original float
operations and getter slots. The new module supplies explicit relocated
native frame/return-word handling around the existing field-only getters,
without changing the frozen mixer module. Parent-chain gain/rate propagation
remains the recovered game algorithm.

The populated consumer runs actual source playback-state updates, removes
completed entries through CRT memmove, constructs the nonspatial priority/gain
candidate list, applies the original `<=32` sorting implementation and voice
limit, and reaches the actual `4b12d0` / `4a7c10` parameter implementations.
Known sample virtual queries execute their real field-backed algorithms.
The implementation also expresses known prepare/start and decoder-vector
rebuild paths through actual existing children; this batch's populated proof
uses already-playing, nonspatial sources with null decoders and no effects.
Those additional prepare/start/rebuild branches are not claimed exercised by
this batch.

## Explicit remaining branches

The following reached paths still fail rather than receiving fabricated game
answers or having their flags changed:

- Spatial listener selection/attenuation at `4a6cebh`, and the subsequent
  spatial/reverb parameter children where applicable.
- Over-limit stop logging (`4a6f72h`), resume logging (`4a727ah`), and the
  manager's inlined first category registration (`4a7063h`).
- More than 32 candidates, through the existing unported introsort/heap branch.
- Queued-next playback through original virtual `+44h`, whose original queued
  vtable resolves to `4aac60h` and whose assembly is already retained as 12297.
- Cold relocated stopwatch creation and relocated calls into old source-state,
  destruction and stream-polling ports that still store preferred-base code
  words. The new module rejects these boundaries; it does not translate
  arbitrary pointer-looking integers or repair child output afterward.

Warm relocated clock reading, empty source arbitration and populated mixer
hierarchies do execute. Their image globals use explicit module translations;
the strict sparse fixture declares its one shared image-global alias. Heap
addresses and stored object pointers remain their original scalar values.
Preferred-base calls use existing actual stopwatch/state/destruction/stream
ports by default. No game-owned algorithm is replaced by a caller callback.

## Retained evidence and validation

The immutable Redux target SHA-256 is
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
The parent assembly `12234` terminates early in Ghidra's flow model at the
jump to `4a6a6dh`; retained `12285` supplies that genuine normal tail.
`12289` supplies the full source consumer. Their Evidence IDs are respectively
`ev_95b7530e7bfbbff9ab50c99c69ebc5e143f8a9cf0490d0744c1196f3360f47f4`,
`ev_bac09dbbaf34b79dc75432dfaa21366fc1a042e9b096c704cfd7d0ef709ceb30`,
and `ev_ecc4ad5681760ee00fa25aa933375447ca7d02322a2e7d181b4f5a5412ff2605`.
Existing retained child instructions supply stopwatch, sorting, state,
destruction, mixers and source parameters. No new REA queries were needed.

`tools/verify-audio-manager-update-instructions.mjs` executes those retained
instructions in the bounded interpreter against constructed inputs. It
compares all mapped memory, or every declared strict sparse span, including
private stack bytes; native callee-preserved register/TLS restoration;
ordered external calls, arguments, entry ESP and return words; and the defined
return contract. Original PE HIGHLOW relocations establish relocated
instruction operands. This is not a native worker runtime comparison.

The fixtures supply explicit genuine Win32/QPC/COM/CRT outcomes. They do not
run a background host thread or return game-child answers. Source GetState,
volume and frequency operations execute the game algorithms around those
interfaces. Free-service fixture behavior is explicitly opaque; a matching
original debug-heap allocator/deallocator lifecycle is not claimed.

`node --test tests/audio-manager-update.test.mjs` passes five focused tests,
covering the outer update, steady populated arbitration, duplicate retirement,
relocated sparse execution and an actual spatial flag reaching its error
without being cleared. Reports under `analysis/` retain separate domains and
the source SHA-256. The six reports retain 192 constructed cases:

| Report under `analysis/` | Cases | Reached instructions | Steps |
| --- | ---: | ---: | ---: |
| `audio-manager-update-outer-20261023.json` | 48 | 503 | 25,584 |
| `audio-manager-update-steady-sources-20261023.json` | 48 | 913 | 74,488 |
| `audio-manager-update-retirement-20261023.json` | 24 | 723 | 23,220 |
| `audio-manager-update-consumer-20261023.json` | 24 | 229 | 5,328 |
| `audio-manager-update-outer-aslr-20261023.json` | 24 | 503 | 12,792 |
| `audio-manager-update-consumer-aslr-20261023.json` | 24 | 229 | 5,328 |

A whole worker proof across all modes,
exception unwinding, arbitrary FP contexts, NaN payloads in every new outer
arithmetic operation and every compiler-helper private spill remains open.

## Actual native scope and next inputs

V13 parent-before snapshot 233 contains 97 pointers/capacity 141 through manager
`+834h`, but the container read by `4a6b60` is manager `+838h`: it contains 24
pointers/capacity 28 in that snapshot. Neither number is an observed worker
candidate count. Source state can filter candidates or change before a worker
entry; the native worker's full arbitration has not yet been replayed. A
greater-than32 sort is therefore a conditional requirement, not a proved V13
event.

The next original-process binding needs an actual same-thread entry/exit pair
for `4a6600` and its `4a6b60` child, with the original return chain, thread
object/ID association, registers, stack, SEH, CW and MXCSR. It needs the actual
QPC outcomes for every reached read and coherent container/header/capacity
inputs at `+834h/+838h/+83ch/+840h/+844h/+848h/+84ch`. Reached source records,
waveform/decoder/stream objects, mixer chains and real COM argument/output
spans must be supplied from before-use observations. Any reached vector
allocation needs its exact requested-byte preimage at its genuine return,
not the subsequently initialized vector. Background source-state/queue
producers and all source-selected spatial/effect modes must remain intact.

This module is not wired into the frozen recovery replay or a synthetic
concurrency intervention. V11/V12's strict waiter/game-wrapper failures and
V12's missing 560 bytes of its 564-byte new active-vector allocation remain
unchanged. The separately positive V13 parent has spare active-vector
capacity; it does not supply that missing allocator evidence or prove a
matching worker schedule.

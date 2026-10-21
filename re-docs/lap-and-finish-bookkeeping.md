# Lap and finish bookkeeping

The reconstructed references cover complete449be0 lap bookkeeping,445d40 packed-time conversion,491be0 vehicle finish bookkeeping and48da10 route selection. They use the caller's native-addressed memory to preserve body aliases, record aliases and cached session pointers. Original game files remain read-only; validation interprets retained x86 instructions and does not execute the installed process.

## Evidence

| Function/data | Retained reply under `analysis/native-simulation/results/` | Evidence |
| --- | --- | --- |
|449be0|`137-lap-bookkeeping-assembly.json`|`ev_8987ab0bf3e6e9b6249159e0b9b3d0386f2619bf34cae64bfdd5300495679cb3`|
|491be0|`139-finish-bookkeeping-assembly.json`|`ev_aab19f3a43f411d6ee98ac34ae743ebc669949bb8972613af951ee2b03bc168f`|
|445d40|`143-lap-time-pack-assembly.json`|`ev_35d6e6207f9f761a0651509c88f75f34cf00fbe125e7a219b934dac3cadab675`|
|48da10|`145-finish-score-assembly.json`|`ev_6f9f032c0fd1193ece12bf384c1510d4bc8709e8c3acdb2274b6b0af2f8f85bf`|
|Threshold bytes570680..5706f0|`146-finish-skill-tables.json`|`ev_bce1594633d7328cd02155ce6579d96fc3cd2f00c766d4d59cd72180e3854b83`|
|445d40 switch bytes|`147-lap-time-pack-switch.json`|`ev_33f5f9cef28ed8ca74e28a8cf6654340a18ae64a03fddab1786a35921d2da2f8`|

Pseudocode136/138/142/144 remains retained. The lap formatter4459f0 and its switch data128/129 are verified separately in `analysis/lap-timing-instruction-check.json` and included as actual numeric callees in the new lap check.

## Lap timing

`finishLapBookkeeping(recordAddress,{memory,handlers})` in `src/lap-bookkeeping.mjs` updates the best timer at record+30 when its value isffffffff or the current+2c value is smaller **unsigned**. It always copies current time to+38, captures `((clock90a548<<11)>>>0)/3` truncated at+4c, and formats all four rows through actual4459f0.

The lap byte+1c is read after formatting. A zero lap, or nonzero session+58c, skips session timer storage. Other game modes write the converted time at `session+(vehicleIndex*37+lap)*4+2c`. Mode1 inserts into five values at `session+vehicleIndex*dc+30`, using a strict unsigned comparison and shifting later entries down; an equal fifth value does not insert. Both modes cache the session pointer and lap before time conversion. Mode1 captures the vehicle index before conversion; other modes re-read the body pointer and index afterward. Callback overrides preserve those distinctions.

`packLapTime(time)` ports445d40 directly. It packs six decimal nibbles using signed division/remainders plus the native unsigned fractional extraction. It returns literal595999 for-1 or signed times at/above04650000. Negative nonsentinel timers retain the original unmasked OR behavior, rather than being clamped or normalized as display-friendly values. This helper is distinct from4459f0's eight HUD glyph nibbles.

## Vehicle finish state

`finishVehicleBookkeeping(recordAddress,{memory,handlers})` in `src/finish-bookkeeping.mjs` captures the initial body pointer, sets its mode+718 to8, and chooses indices at+720/+721/+722 by scanning the native byte threshold tables downward. The first table uses indices32..1 at5706d0, the second31..1 at570680, and the third15..1 at5706c0. No threshold approximation is substituted.

It runs actual48da10 by default. Afterward, the current record body receives checkpoint+6c0 from the selected route byte+05 and checkpoint+6c2 from the low word of record+58. The two globals6e6570/6e658c have only their **low words** cleared. The original captured body has five dwords+6c4..6d4 and byte+6d8 cleared. The final clock-plus-one-plus-current-body-index wraps unsigned32; its remainder modulo6 is stored at the original body's+6d9, and its quotient is returned.

An explicit48da10 override may relink the record to another body. Checkpoint writes and the final index then use the replacement, while the reset fields and phase remainder still use the original body. This alias behavior is covered by byte comparisons.

## Route selection

`selectFinishRoute(recordAddress,{memory})` ports48da10. A null original route returns without changing the record. Otherwise it tests the current point, next point and previous point, plus two route links encoded in each point's dword+0c. Cyclic groups apply one add/subtract of their count. Noncyclic linked groups are bounded against the **original group's count**, including native-readable points beyond the linked group's declared count. Retaining readable tail storage is therefore required; the reference does not invent a corrected logical boundary.

Distances use signed32 overflow of squared signed-high-word body-coordinate differences. Candidate ties retain the earlier candidate. A final candidate comes from the body's tagged spatial bucket, its top10-bit key and the pack+7c mapping. The spatial fallback wins an exact distance tie. Record+54/+58 receive the selected group pointer and point index.

## Integration and remaining limits

```js
import {finishLapBookkeeping} from '../src/lap-bookkeeping.mjs';
import {finishVehicleBookkeeping} from '../src/finish-bookkeeping.mjs';
import tables from '../src/finish-skill-tables.json' with {type:'json'};

//The caller supplies mapped records, bodies, route data, globals and session.
Buffer.from(tables.hex,'hex').copy(memory,0x570680);
const handlers = {
  call449be0:({memory,ecx}) => finishLapBookkeeping(ecx,{memory}),
  call491be0:({memory,ecx}) => finishVehicleBookkeeping(ecx,{memory})
};
```

The buffer addresses represent caller-owned state, not allocation or input producers. `finishLapBookkeeping` optionally accepts `handlers.formatTime4459f0(allRows,address)` and `handlers.convertTime445d40(time)`; defaults run the actual references. `finishVehicleBookkeeping` optionally accepts `handlers.finish48da10(address)`; its default runs the actual route selector. Overrides explicitly move those behaviors outside the default equivalence claim.

`tools/recover-finish-skill-tables.mjs` compares the113 bytes against REA146 and the installed executable SHA256, preserving them with file offset1505408 in `src/finish-skill-tables.json`. A caller supplying raw mapped memory must install those immutable bytes or supply an equivalent mapped original image. Empty/malformed native-readable route pointers and pointer arithmetic outside supplied memory remain error domains. The broader449760 race-completion caller, notifications, audio/network producers and lifecycle behavior have their own reconstruction scopes; these modules make no claim about them.

## Validation

`node tools/verify-lap-bookkeeping-instructions.mjs`:287 retained instructions,5000 parent fixtures including4000 complete numeric calls and1000 state-mutating callback cases, plus3000 independent packed-time fixtures;3696602 instruction steps, all matched. It compares full780-byte records, two16384-byte bodies, two16384-byte sessions, clocks/session globals and callback snapshots. The complete numeric path has no mocked callees. Report: `analysis/lap-bookkeeping-instruction-check.json`.

`node tools/verify-finish-bookkeeping-instructions.mjs`:261 retained instructions,4000 parent fixtures including3000 complete numeric calls and1000 body-relink callbacks, plus100 null-route helper fixtures;2202004 steps, all matched. It compares record/body bytes, route headers/point memory/fallback tables, original threshold bytes, low-word-only globals, clock and returned quotient. The complete numeric path has no mocked callees. Report: `analysis/finish-bookkeeping-instruction-check.json`.

`node --test tests/lap-bookkeeping.test.mjs tests/finish-bookkeeping.test.mjs` passes nine focused tests covering unsigned timing, sentinels, strict insertion, cached/live pointers, threshold endpoints, global-width preservation, cross-body reset targets, route ties and linked-route bounds.

# Vehicle control and speed producers

`src/vehicle-control-state.mjs` reconstructs the digital input, handling-field and speed producers used around450e50's physics call. The control chain now connects autonomous control bits to actual steering/drive fields rather than supplying those fields as fixed fixture answers. Physical packet retrieval471250 and analog packet decoding434360 now default to the recovered [input packet algorithms](vehicle-input-packets.md). Native device sampling and configuration producers remain separate work; the parent oracle's packet/analog overrides remain declared boundary probes.

Native timing matters:450e50 first preserves the previous control word at+70c, runs autonomous control, vehicle audio485300 and input42a6e0, then linked-control copying49bbc0 and handling conversion42a9a0. Physics, attachments and post-frame recovery follow. Only **after** those stages does443d90 produce speed664/668/peak66a and lap timers. Those speed values feed the next update's autonomous and physics callers; recomputing them before the preceding physics call would change the recovered order.

## Recovered routines

| Address | Export | Behavior |
| --- | --- | --- |
|42a6e0|`updateVehicleInputBlock(bodyAddress, vehicleIndex, context)`|Packet/autonomous/replay dispatch into body708 control storage, including edge word714.|
|42a870|`advanceDigitalVehicleControls(recordAddress, inputAddress, {memory})`|Digital bits become byte-valued steering/throttle/brake axes; inputAddress is body+708.|
|42a9a0|`updateVehicleControlState(bodyAddress, {memory})`|Produces644 steering,64c/d/e bytes and650 drive or prestart6b0.|
|49bbc0|`copyLinkedVehicleControls({memory})`|Copies linked controls through690 with signed-byte expiry and retained local metadata.|
|443d90|`updateVehicleMotionState(recordAddress, {memory})`|Produces664/668/66a from linear velocity and updates eligible lap timers/glyphs.|

The context for42a6e0 is`{memory,scratchBase,handlers}`. `scratchBase` is native entryESP and is required only when packet polling is reached. Other routines require the already mapped native body/record/session/table memory. No native constructors, physical device input or initial axis counters are invented.

### Digital axes and handling

42a870 receives the vehicle record at909300+index*30c and a body+708 input-block pointer. Record short+25e has separate analog exemption bits for throttle, brake and steering. Exempt branches preserve the corresponding raw input byte while resetting its digital counter; steering's counter resets to16. Input mode718=8 forces those exemptions off, allowing autonomous control bits to use the same digital axis pipeline.

Throttle bit40 increments the counter721 up to31; release subtracts2 with a zero floor. The original table570680 supplies raw throttle709. Brake bit80 selects original table5706c0 index15 or0 and writes counter722/raw brake70a. Steering bits8000 and2000 act in native order, including the simultaneous-bit case. Direction changes first reach the centered index16, continued steering advances by3, and neutral steering returns by4. Table5706d0 maps the index to raw steering708. These original table bytes are also preserved in`src/finish-skill-tables.json`; the table name reflects an earlier consumer, not exclusive use by finish logic.

42a9a0 copies raw steering708 to64c and raw throttle709 to64d. Steering subtracts128, removes an eight-unit deadzone on each side, then multiplies by320 for signed644. Brake70a below16 clears64e; otherwise64e becomes255. Throttle below16 becomes0 and above240 becomes255. For signed session state+57c below4, throttle<<8 writes prestart6b0 and leaves650 unchanged. Active states write650. With control bit10 set, active drive becomes signed integer`-65536 / max(5, signedShort666)`, truncated toward zero. Short666 is the high half of the produced664 speed dword.

An actual autonomous signal therefore flows431520/430fc0→710 bits→42a6e0/42a870→708/709/70a byte axes→42a9a0→644/650. This establishes those consumers/producers for supplied native state, not complete steering/drive configuration or every autonomous gameplay decision.

### Input parent and replay

42a6e0 preserves mode9's early return: it polls a packet, writes719 from packet byte1 and writes the **full32-bit complement** of packet bytes2/3 to710, then returns before edge714 or replay processing. Mode10 combines a low16 complement with packet short4 as the upper control word, invokes analog decoding, and reloads session state. Mirrored mode inverts raw steering708 and swaps bits2000/8000 while retaining unrelated control bits.

Replay controller states5/6 dispatch playback instead of digital conversion. Other states may run42a870 when a readable non-`#` packet exists or body mode718 equals8; session state2 then forces brake counter15/raw255. The controller pointer/state are reloaded afterward, allowing a changed state2/3/7 to invoke replay again. The final edge dword714 is710 AND NOT70c. Mode9 deliberately does not write that edge dword.

The default replay implementation is actual`stepReplayControl`42ab90. Optional`handlers.replay42ab90({memory,bodyAddress})` is an explicit override used by caller-order tests. Physical packet and analog routines also have actual defaults. Optional boundary overrides use these contracts:

```js
handlers.pollInput471250({
  memory, bodyAddress, vehicleIndex,
  pointerAddress, //native body+724 output pointer
  statusAddress   //native entryESP-12 storage
});
handlers.decodeAnalog434360({memory,bodyAddress,vehicleIndex});
```

The defaults are documented and checked in [vehicle-input-packets.md](vehicle-input-packets.md). Overrides may mutate native pointers and globals; the parent observes the original reload/capture behavior. Supplied device samples and configuration still need their native producers.

### Linked controls

49bbc0 traverses the native vehicle registry, reloading the live session count between records. A nonzero body690 link decrements signed byte698 and saves current710 into694. A new edge714 cancels links below60; signed expiry at zero or below also cancels, including byte wrap0→255 interpreted as-1.

An active link copies seven dwords708..720 in native forward order, so overlapping source/destination aliases retain native propagation. It masks copied70c/710/714 withf0f0 and restores local mode/metadata, packet pointer724 and raw byte70b. Byte723 remains copied, whereas720/721/722 remain local. The source reference690 and registry/body pointers preserve their original capture/reload order.

### Actual speed and timer production

443d90 takes the body from record+00, shifts each linear velocity component68/6c/70 right8, and sums three wrapped32-bit integer squares. Native432e70 lookup root multiplied by256 becomes664. It also preserves the root scratch globals91d45c/91d460. The existing fixed root reference requires a successful nonnegative squared sum; the native128-unit velocity limit places ordinary resulting magnitudes in that domain. Malformed/unbounded supplied states are not silently clamped to a different speed algorithm.

Before active session state4,668 becomes0 while664 still updates. Active states multiply the664 value by108 with native32-bit wrapping, divide by16 toward zero, then arithmetic-shift16 and store the signed low16 result in668. A greater signed value updates peak66a; lower speeds never reset it.

Timer eligibility uses the session state captured at function entry and compares lap byte record1c with the live session lap limit586. Eligible calls convert the wrapped unsigned clock90a548<<11 by division3, subtract record4c/50 into timers2c/34, and invoke actual4459f0 with its default row policy. Alternate packed display rows40/48 remain stale, as native does. Full state/mode initialization and timer origins remain caller-owned producers.

## Retained evidence and trace boundary

The precise new anchors under`analysis/native-simulation/results/` are273 for42a6e0,277 for42a9a0,279 for42a870,285 for49bbc0 and293 for443d90. The supporting Evidence IDs are listed in`analysis/vehicle-control-state-instruction-check.json`; main speed evidence293 is `ev_46d22bb690247378da4f778dc7ea56d10aafe43ef53e5bf7d3f0e5974134e7fe`.

Additional candidates were inspected without claiming a producer implementation:485300 is a large vehicle-audio stage;42be80 dispatches auxiliary/network controls;41d2b0 prepares wheel-render matrices/steering smoothing;416400 drives auxiliary animation;429f30 dispatches object updates;494f60 deforms animated track data;475e50 updates a transient pool;48d680 updates a contact-dependent6a8 accumulator. Their retained replies270..295 preserve this bounded search. These routines are not substituted with inert implementations or counted as completed modules.

## Verification

`node tools/verify-vehicle-control-state-instructions.mjs` passes625 retained instructions.5000 sequential fixtures execute20000 complete numeric calls across42a870,42a9a0,49bbc0 and443d90, including actual root and time-formatting callees, without mocks. Another2000 full42a6e0 caller fixtures run actual42a870 with explicitly state-mutating packet/analog/replay boundary mocks; the independently reconstructed replay default remains available in production. They compare three full16384-byte bodies, three780-byte records, session/controller/packet storage, original tables, root globals and callback order. All1886213 interpreted steps match. Linked cases include2500 copies and3750 cancellations; caller cases include1000 polls,500 analog calls and1035 replay calls.

`node --test tests/vehicle-control-state.test.mjs` passes twelve focused tests: autonomous→digital→handling integration, analog exemptions, steering reversal/neutralization, handling thresholds, active braking/prestart behavior, actual speed/peak/timer production, linked copy/expiry, mode9 early return, mode10 mirroring and replay-state reloads. Tests declare their initial memory/counters; they do not capture a running game.

## Contact-dependent drive adjustment

`updateVehicleSurfaceDrive(recordAddress,{memory})` ports `48d680`, called immediately after each participant's `443d90` speed/timer update in `450e50`. It captures the body/input mask, scans four material pointers at body+198 with28-byte stride, and adds5000h to body+6a8 once if any material's category byte+0c equals1. Throttle bit40 selects3000h instead. Other material flag bytes do not affect this category check. It returns before dereferencing any subsequent material after the first hit; the signed32 accumulator wraps.

Pseudocode902 and assembly903 are retained under `analysis/native-simulation/results`; assembly Evidence is `ev_25d0e08b400dae142d89ded057f0f7b25b9df9eed938ad18ddd58fa099caa2ac`. `tools/verify-vehicle-surface-drive-instructions.mjs` matches all30 instructions over6000 fixtures/305467 interpreted steps with no callees or mocks, including body/material aliases and signed overflow. Four focused tests cover contact selection, single adjustment, throttle choice, category width, termination and wrap. A further outer-update test verifies the actual default runs after speed publication. Material constructors and whole-tick closure remain separate requirements.

The original executable and installed data remain read-only and unexecuted. These recovered producers close the previously supplied664/668/644/650 boundaries for explicit native state. Device sampling, configuration/registry constructors, real-world input ownership, broader race-tick stages and other object/effect systems remain separate work.

## Formatter stack production consumed by attached lights

When supplied native entry `scratchBase`,443d90 now tail-calls the raw4459f0 adapter `formatRawLapTimeDigits` using that same entry ESP. It publishes mode at entry-4, current output pointer at entry-8 and each processed timer's whole value at entry-12 at their actual native write points. Mode/output reloads preserve aliases. Final pointer is normally record+4c; with mode0 the last processed timer is row2. Without an entry stack the earlier structured formatting API remains available.

This footprint is observable: later48e310 initializes only the first word of its three-DWORD attached-light payload, reusing the formatter's last two local words. Similarly,44d960's actual saved-cookie word can survive into the same payload; its producer now publishes that exact write at44d96a. These are reached producer stores rather than assigned consumer answers. `tools/verify-lap-timing-stack-instructions.mjs` matches2400 complete formatter calls, all mapped record data and all three defined local slots, using original dispatch bytes and signed/overflowed timers:118 reached addresses/1466400 steps. The animation/light package checks their subsequent consumption in the constructor→motion→animation→light chain. Other private saved-register bytes are not claimed as a complete generic stack model.

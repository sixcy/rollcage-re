# Guarded frontend settings plus held-force preparation

This is a separately opt-in, prepared experiment. **No original process or native fixture was launched for this implementation.** It is not a native wall-contact result or a deterministic race/roster mechanism. The earlier static proposal and evidence audit remain preserved in `native-controlled-race-settings-plan.md` and `analysis/native-race-settings-input-audit-20261023.json`.

The subsequent root-owned HIGH/LEV1 V3 attempt **verified the actual settings guards, two one-byte settings writes and native track/family/local/stem publication**, then failed its held-buffer budget check. It has no completed capture, held pre-input/output snapshot, force input or physics/contact comparison. The independent audit and exact limits appear below.

The frozen shared C# helper SHA256 is `be12d33fdbe3a85fd902d26b4becc27659f79dd9530480146a94d13344ee9f89`. With `controlledRaceSettings` absent, existing profiles retain their prior path. The old70-snapshot held configuration is independently regenerated and checked for exact equality with the retained V2 configuration.

## Preparation API and bounds

```text
node tools/prepare-native-controlled-race-held-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG [LEVEL1..20] [QUALITY0|1] [SKIP_FRAMES]
```

The exported `createNativeControlledRaceHeldCaptureConfig(directory, output, {level:1, quality:1, skipFrames:120})` defaults to HIGH/LEV1 and prepares only. Existing output paths are refused by the writing API. It enables:

```json
{"controlledRaceSettings":{"breakpointId":"controlled-race-settings","level":1,"quality":1,"expectedTrackByte":0,"expectedQualityByte":1}}
```

This contract is permitted only with the distinct held-force profile. It adds exactly one startup snapshot and raises that profile's total from70 to71: three existing startup observations, one settings observation, held pre-input/before/after and all64 dispatcher observations. The128 MiB pending-byte limit,90-second total deadline,20-second hold, one candidate frame and24-trial source-only planner limit are unchanged. There is no automatic retry. Track/quality choices do not guarantee a border candidate, sufficient future heap coverage or a native collision comparison.

## Original input boundary and guards

The sole added site is43e0c5, before original `MOV EAX,[5ecefc]`. Retained052 assembly proves the configuration0b override read, its1..20 validity branch, native session579 publication and family/local reads from574760/57477c. No jump, instruction, register, selector result, session output or filename is substituted. The runtime requires the live breakpoint byte plus originalA1 opcode and relocated DWORD operand, and records both the patched instruction and the instruction to be restored.

Before either input write, the helper verifies:

- Actual owned main TID, first raw hit/first captured hit and the full716-byte stopped context.
- EIP at the relocated site; EBX0; EAX equal to ECX, an original selected track index0..19.
- Actual stack28 bytes: saved incoming EDX10 at+16, relocated43dae8 caller at+20 and unchanged native frontend argument0..3 at+24.
- Actual configuration/session root DWORDs, bounded pointees, no configuration alias with the protected session or caller stack, configuration0..7f and tuple14/15=`00 0a`.
- Exact configuration0b=`00` and31=`01` preimages. A pre-existing track override or LOW baseline declines this particular profile; it does not silently replace another configuration.
- Native natural-idle context: DWORD5ec138 menu4, DWORD6e6654 latch0, DWORD6e66c8 state1 and nonzero DWORD6e6aac deadline. DWORD6e66cc is retained as a varying state counter; no zero requirement is invented.

The frontend globals follow retained062 idle predicate and027/028 main callback evidence supplied by the static audit. These guards were subsequently directly observed at the new hook in V3, as recorded below. An unexpected actual value aborts before any input write. Heap addresses and relocated caller words come from the actual process, never a previous capture's pointers.

One pre-write snapshot retains13 exact declared ranges: roots,128-byte configuration, session header48 bytes, session54d..61f, caller28 bytes, both actual20-byte classification tables, bounded260-byte image window at6e6660 and the frontend globals. The260-byte window is transport around the null-terminated stem, not a claim about a typed string allocation; its overlap with the main-state globals must agree byte for byte. Actual FS selector/descriptor/SEH evidence is also captured and independently checked.

The helper rechecks every captured span and raw context before publishing its guarded ledger. It then performs exactly two one-byte writes, configuration0b=level and31=quality; a HIGH request may be a same-value quality write. Each operation is separately logged with address, preimage and replacement. All input guards finish before the first write. A later OS write/readback failure aborts rather than becoming a positive result; the per-write ledger preserves any actual partial input change.

The full128-byte post configuration, both roots, full context and every other captured byte must agree afterward. Generic phase actions are forbidden at this site. Re-entry cannot consume another settings input. The pure replacement function returns a copy; it cannot write target memory.

## Original producer observations

Before offering a held request, the helper requires the completed settings input and reads the native current session/header/runtime, both real classification tables and bounded stem. It requires579=level−1,0e/0f equal to the selected actual table entries, and the original null-terminated `high\levN` or `low\levN` stem. Only slash direction is normalized when comparing the known literal format. A separate output record precedes the held request. No output bytes are written or used to fill missing source inputs.

The final checker independently verifies the owned-process/debug-event identity, raw context versus register metadata, FS provenance, snapshot/guard/two-write/completion ordering, full pre/post configuration, relocated instruction and exact two-byte write addresses. Both table snapshots must remain identical; the output marker must match the actual later held snapshot and current session root exactly. Missing records, altered pointers, forged preimages, additional observations/writes or unrelated debug events during the stopped intervention fail verification.

Configuration0b may be consumed or cleared by native code after the input. The later proof uses actual native track/family/local/stem outputs and does **not** assume configuration persistence. Roster, spawn selectors, time/session seed, RNG streams, difficulty handling and all vehicle/terrain construction remain original. Natural demo mode still has the existing native Expert behavior; this profile does not establish Easy/Hard race setup. Complete formatter source reconstruction, deterministic rosters and identical audio scheduling are not claimed.

## Validation and remaining scope

`tests/native-controlled-race-settings.test.mjs` has five focused tests: retained instruction assertions; exact old-profile identity and malformed new-profile cases; synthetic pure input/ABI/frontend closure; synthetic actual-record schema/order/FS/context/output corruption; and full typed C# validation plus pure C# input/transition/output mutations. Tests include incorrect main TID, roots/alias/overflow, caller/argument/index/mode/preimage/state/deadline, non-input configuration changes, raw-context changes, moved write addresses, altered relocated instruction, table/session/stem corruption and a varying state counter. Synthetic record fixtures are explicitly synthetic, including their FS descriptor; none is presented as original runtime evidence.

The combined safe suite passed **55/55, zero failures or skips**, with helper hash unchanged throughout: `analysis/native-controlled-race-settings-focused-20261023.txt`. This includes the existing held/bank/preflight and legacy worker/gain/window/V18 tests. PowerShell runs only `-NoProfile -Command` pure typed tests with hidden windows/timeouts; no game, native fixture, security-policy override or settings-file modification occurred.

Root separately reviews, prepares an exclusive configuration, announces and launches each original capture. The actual V3 settings observation below closes that bounded input/publication proof. Full semantic frame/dispatcher equality and a genuine planned type3/type6-or7 chassis-border event remain independent required evidence. Natural wall, ceiling and sustained inverted driving remain open.

## Closed HIGH/LEV1 V3: settings observed, held budget declined

The original attempt at `analysis/native-physics-local/startup-20261022/held-chassis-border-high-lev1-v3-20261023` used immutable helper `be12d33f…` and the separately retained configuration. It ended with a capture error and owned-process cleanup at **50,141 ms**. The [independent audit](../analysis/held-chassis-border-high-lev1-v3-audit-20261023.json) checks all **120 emitted blobs / 43,421 bytes**, including all four published snapshots, raw contexts and stop diagnostics; every hash and declared length matches. No complete record was fabricated or admitted through the complete-capture loader.

Settings snapshot4 belongs to actual owned process37136 / main TID40416 at debug event705, before original relocated `43e0c5`. Its raw context/FS provenance, exact pointer/range extents and register metadata pass the existing input-only verifier. The actual frontend tuple is menu4, latch0, main state1 with a nonzero deadline; the state counter is observed without a zero requirement. EBX is zero, EAX equals ECX with a valid selected index, saved incoming EDX is ten, the original caller is actual `71dae8`, and the frontend argument is three. Configuration/session roots are actual `00b279e0` / `00b29a60`.

The ledger orders the pre-input snapshot, all-guards marker, exactly two one-byte writes and completed configuration transition within the **same stopped debug event**, with no intervening debug event. Configuration `+0b` changes `00→01`; `+31` is the declared HIGH no-op `01→01`. Only offset0b differs in the full128-byte configuration. Raw context identity, roots and all other captured bytes were rechecked by the immutable native helper before emitting its transition flags. The independent audit checks the original pre-input blobs and full logged transition; there is no separate raw post-context blob, so it does not invent another comparison snapshot.

At the later stopped native-frame event2734, the frozen helper emits its original process-read **native output marker** before attempting the held request. The retained marker contains track index0, family1, local index0 and native `high\lev1`. Its two20-byte classification tables exactly equal the original input table blobs, and index0 selects1/0 from those actual tables. All six native participant modes are8; the roster is recorded as original output, not forced. Configuration persistence is explicitly not assumed. These marker bytes are original observations, but there is no published raw held-frame snapshot with which to independently compare the marker's entire session/stem transport.

The same event's metadata-only budget diagnostic calculates `50,129,730 × 3 + 3,239,552 = 153,628,742` bytes against the unchanged **134,217,728-byte** pending limit. The audit independently sums every declared range footprint and the context/thread-environment bytes to recover that pre-snapshot size; the event reserve is exactly `50,618 × 64`. The diagnostic precedes full held blob reads and the exception. It reports insufficient capacity before a held request, so **zero held requests and zero held force writes** occurred. The earlier settings input did occur; “no input written” in this error refers to held force, not those two settings operations.

This failed attempt establishes the scoped native settings input/publication behavior and confirms the strict budget refusal. It establishes no selected force scenario, source-held forecast result, native chassis-border contact, completed frame or final semantic/output equality. Installed-target171-file integrity is separately root-owned evidence. This audit launched no game or fixture and changed no C# or production helper.

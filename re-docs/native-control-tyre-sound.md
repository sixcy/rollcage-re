# Native control tyre-onset sound

`createNativeControlSoundCreationBindings` now admits the genuine48608f call
in addition to48627c collision sound. Other creation sites still fail explicitly.
The actual V3 parent replay had stopped at this newly reached source call;
`analysis/native-parent-rtti-stock-first-replay-v3-20261024/report.json` is
preserved. No original process or native fixture was launched for this change.

Retained271 (`271-vehicle-state-485300-assembly.json`, exact Redux SHA
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`)
proves the incoming registers and arguments. Let S be485300 entry ESP, F=S-84
its local frame and E=S-116 the484bb0 entry:

- EBX is the actual source body and EBP is participant index times5.
- ESI is the surface handle read at486000 from713194+EBP*8.
- EDI is the **full32-bit RPM** loaded at485b5a. Audio+24 retains only a WORD;
  recovering full EDI from that truncated value would be unjustified.
- EAX is the full first-code DWORD reloaded at486086 from F+3c; ECX is its
  low byte, selected at48608c. EDX is body+34 from486080.
- Seven caller arguments are `[0,signed16(basePitch),0,7,liveECX,0,0]`, followed
  by CALL48608f's return486094. The actual material table, slip gate and signed
  counter5 must agree with the carried source locals and audio state.

The source port now passes its actual `surface,rpm` local values in native
metadata only at48608f. The adapter verifies the surface against live audio
storage and the low RPM word against the source's audio publication, while
retaining the full source value. It does not take native register outputs or
guess the overwritten local. EAX and all remaining inputs derive from the
retained source material/slip/counter producers.

The smoke branch exposed a separate existing source mistake in the otherwise
unused fifth argument. At486033 **SAR ECX,18** runs before the CL mask/OR/add
and shift at486036..51. Thus the result is20 or28; the old slip high bits do
not survive. For a slip value0xa0000, the interpreted original produces28,
whereas the old source expression would produce0xa001c. The source now applies
the exact shift-derived result. The earlier broad vehicle-audio contract oracle
normalized argument4 to null, so it could not detect this discrepancy. No
original-process observation of that old expression is claimed.

The adapter calls the existing real `sound.call484bb0`. The emitter, dispatcher,
bank lookup and populated-owner branch remain game-owned source algorithms.
It supplies no null bank entry, channel answer, native after memory or allocator
outcome. `creationEvents` record partial execution when a genuine dependency
is missing.

Validation:

```text
node --test tests/native-control-tyre-sound-creation.test.mjs tests/native-control-sound-creation.test.mjs tests/native-control-audio.test.mjs tests/vehicle-audio.test.mjs
```

All16 tests passed with no skips. The new tests include32 constructed cases
using the original PE's real HIGHLOW relocation at preferred400000 and actual
6e0000, four stack alignments, full positive/negative RPM, and smoke/ordinary
branches. They execute the retained producer through real484bb0/40ea40 and
compare every declared span:640 shared stack bytes,3e78 body bytes, actual
audio/table inputs, and a256-byte explicitly constructed bank with absent
slots. These are bounded interpreted fixtures, not original runtime evidence.
A separate full485300 source/native caller comparison proves fullRPM70000
metadata and the smoke argument. Negative tests reject corrupt registers,
caller words and the former smoke result; a populated bank remains populated
and reaches its real missing-owner boundary.

The actual saved V3 input replay now reaches sound2's populated owner and
strictly fails at **0x10d1feb8,1168 bytes (490h)**. Its computed source registers
are EBX279148160, EBP10, ESI127, EDI8551, ECX2, EDX279148212, EAX2; arguments
are `[0,1200,0,7,493160,0,0]`. The new exclusive report is
`analysis/native-parent-rtti-stock-tyre-replay-v3-20261024/report.json`, with
`matched:false` and `completed:false` on the creation event. The490h owner
must be observed at original parent entry before its channels/services can be
executed; after bytes cannot fill this gap. Consequently this V3 run does not
yet prove joined cameras/weather despite its separately captured CRT outcomes.

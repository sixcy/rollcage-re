# Vehicle collision sound creation boundary

`tools/lib/native-control-sound-creation.mjs` provides an explicit opt-in
factory, `createNativeControlSoundCreationBindings`, for
`replayNativeControlPrefix`'s `createControlAudioBindings` option. All existing
source-control handlers remain in place. Only the original `48627c` call from
`485300` to `484bb0` gains this continuation; other creation sites retain
their explicit unsupported boundary.

The original collision branch supplies every register. `486223` loads the
previous timestamp into ECX; `486229` loads clock `90a548` into ESI; `48622f`
zero-extends collision byte `body+66f` into EDI. `486244` writes ESI to
`body+3e74`. At `48627c`, EBX is the current body, EBP is participant index
times five, ECX is 19, EDX is `body+34`, EAX is collision byte plus 256, ESI
is the clock, and EDI is the collision byte. The seven argument words are:

`[0, collision+256, collision*48, 7, previousTimestamp, 0, 0]`.

Collision is an unsigned byte, so the original gain clamp does not reduce
`collision*48`. The emitter entry ESP is `485300` entry ESP minus 116, and
its actual return is relocated `486281`. The fifth argument preserves the
previous timestamp as a real caller residue; the emitter does not read it.

The adapter reconstructs ESI from the timestamp already written by the
genuine source caller, checks it against the live source clock, and obtains
EDI from the still-uncleared collision byte. It validates the actual caller
site, ESP, return word, register/body/index identities, and all seven stored
argument words. It then executes existing `emitNativeEffectOnStack` and the
real native frame dispatcher on the same memory. It installs no owner,
channel, initialized source, allocator return, or replacement null.

The original V3 entry replay reaches this path with arguments
`[0,304,2304,7,278,0,0]`, ESI 288 and EDI 48. Its captured bank begins at
`10939ba0`, ends at `10939ca0`, and contains 64 logical entries. Code 19
requires slot `10939bec`, but those four bytes were not captured. The opt-in
source continuation therefore stops at that exact read; it cannot establish
the owner identity or whether the slot is null. Reports are preserved in
`analysis/native-control-sound19-input-audit-v3-20261023.json` and
`analysis/native-control-sound19-source-prefix-v3-20261023.json`.

The next observation needs the actual code-19 slot, then a guarded nonnull
`490h` owner. Any channel vector must follow actual observed begin/end and
selection state. Neither the observed count of 64 nor a transport region is
a universal native allocation capacity.

`tests/native-control-sound-creation.test.mjs` passes three tests: 24 constructed
preferred/actual-PE-relocated cases execute the original caller, emitter and
dispatcher and compare all shared-stack bytes and seven incoming registers;
corruption/unsupported-site cases fail; the saved original V3 parent replay
retains its genuine missing-slot failure. The absent-bank-slot fixtures are
constructed inputs, not observations that V3's slot is absent. Retained
`271`, `149`, and `151` verify target SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
This establishes the caller/emitter binding, not complete sound creation,
audible playback, or a joined native parent match.

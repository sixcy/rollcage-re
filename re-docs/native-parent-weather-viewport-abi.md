# Source weather viewport caller publication

The two direct498030 screen queries now publish their proven game-owned stack
words. This implements the source-publication gap identified in
[the weather RTTI plan](native-parent-weather-rtti-plan.md). Original-process
weather RTTI outcomes remain a separate dependency; no original process was
launched for this change.

`weather-screen.mjs` writes hOut, widthOut, yOut and the actual498092/4980f5
CALL return, in original PUSH order. It passes the narrow metadata
`nativeViewportQueryCall: {returnAddress}` with the actual source pointers.
`queryWeatherViewport` accepts only those two known return identities, validates
the carried source caller words, and completes the original nonempty-name scan.
It publishes the40ab70 forwarding stores in retained order:

1. Live hOut/widthOut/yOut loads from T+12/+8/+4.
2. xOut and NAME from the actual source arguments.
3. Saved ECX=NAME+1:40ab7a initializes ECX once, and the strlen loop modifies
   ESI/AL without changing that pointer.
4. Actual40abf3 at R=T-44 for CALL402d10.

After the real external cast handler returns, CALL407050 publishes actual40abfd
at T-40. This overwrites the previous saved-ECX slot exactly as native code does;
the five real query arguments remain above it. The existing407050 frame is
`(T-40)-72`. No saved nonvolatile register, SEH record or CRT-private bytes are
invented. Other weather callers, including the extent and spawn paths, receive
no inferred direct-screen caller identity.

Root-owned `weather-update.mjs` separately publishes496822 at the actual screen
entry before calling498030. The new test covers that store as well. The resulting
parent relationship remains R=U-420, Q=U-460, with the weather parent return
451116 at S=U-20. The first missing genuine source dependency remains the
separately authenticated weather CRT outcome; the camera's outcome is not reused.

`tests/weather-viewport-abi.test.mjs` uses retained original instructions and a
read-only original PE image whose SHA is checked against
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
The preferred400000 and relocated6e0000 fixtures apply only real HIGHLOW
relocations and relative control-flow movement. Reached unresolved relocation
sites fail. Application, map, session and external CRT outcomes are explicitly
constructed test inputs, not observed native results or game-child answers.

The tests compare exact28-byte wrapper and16-byte caller words at the native
CRT instruction, and then the known407050 CALL/argument words, source-written
screen fields, map node, sentinel header and application header. The full496700
case stops the interpreter at its original pre-RET boundary. Aliased outputs,
name-buffer outputs and a record-field output exercise native live-read/store
order. Missing/swapped source arguments and unsupported callers fail before
the external cast. A handler that throws for missing evidence leaves the
genuine first-call words intact and supplies no result. These tests do not claim
complete private stack/CPU/CRT ABI equality or original-process weather parity.

Validation:

```text
node --test tests/weather-viewport-abi.test.mjs tests/weather-update.test.mjs tests/weather-initialization.test.mjs tests/weather-draw.test.mjs
```

All14 tests passed with no skips. Existing instruction-check APIs were also run
with `output:null` to preserve retained reports: viewport16 fixtures/144
operations matched, and screen60 fixtures/199 queries matched. Their constructed
native-input and external-service limits still apply. The frozen component
summary is `analysis/native-parent-weather-viewport-abi-check-20261024.json`.

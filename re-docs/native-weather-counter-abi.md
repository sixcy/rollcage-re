# Source weather counter call ABI

With explicit `runtime.nativeWeatherCounterCalls===true`, the source publishes
the known game-owned stack words on the initialized
`498030 → 498453 → 489cd0 → QueryPerformanceCounter` path. It supplies no timer
result or external-service outcome. No original game or native fixture was run
for this component.

Evidence is retained in `analysis/native-simulation/results`:

| Listing | Evidence |
| --- | --- |
| `3611-object-effect-498030-procedure_assembly.json` | `ev_63ead536e7f90d678a521be318a0a0941f4941f54d121c96773c7f2b6f8ce804` |
| `3630-weather-489cd0-procedure_assembly.json` | `ev_ff29e60114cb96f219e316aff00030e0be8766dec59f42ce80cd1df1bc5b8288` |

Both identify original Redux SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
The existing [counter plan](native-parent-weather-counter-plan.md) records the
original import and viewport-caller evidence.

Let `U` be parent entry ESP, screen entry be `U−44`, and screen frame
`F=U−360`. The timer's entry is `C=F−4`, with source-produced return
`actual498458`. Define `A=alignDown(C−4,8)`, `B=A−32`, `P=B+24`, and `K=B−4`.
The source publishes exactly these timer stores before the service:

| Address | Original producer | Source value |
| --- | --- | --- |
| `C` | `498453 CALL489cd0` | `actual498458` |
| `B+12` | `489ce0 PUSH EBX` | screen caller's live `emitEnabled` |
| `B+8` | `489ce1 PUSH EBP` | timer's own frame pointer `C−4` |
| `K` | `489d10 PUSH EAX` | `P` |
| `K−4` | CPU return from `489d11 CALL ESI` | `actual489d13` |

The timer does not initialize `P`. Its eight-byte preimage is carried from the
second genuine viewport query. For `U mod8=0`, it is
`[actual4980f5,F+18h]`. For `U mod8=4`, it is `[F+28h,actual4980f5]`.
The latter includes the original `40ab70 PUSH ECX` saved name pointer. That
previously omitted source write is now published at query entry `T−4`, only
within the existing validated direct screen-caller contract and before strlen.
It is not installed later as a timer preimage.

`readGameMicroseconds` accepts optional `runtime.nativeWeatherCounterCall`
metadata with exactly `{returnAddress:0x498458,screenEntryEsp,entryEsp:C,
frame:B,outputAddress:P,ebx}`. It validates these values, the source return word
and initialized flag exactly equal to one. It reads the genuine observed IAT
DWORD through preferred input operand `56e0fc`, then forwards an immutable
enriched contract to `platformCall(name,args,runtime)`, adding `iatTarget`,
`preCallEsp:K` and actual `serviceReturnAddress:489d13`. The original service
runtime scratchBase remains `C`.

The screen caller supplies metadata and its timer CALL word only when this
explicit option is true and the initialized flag equals one. Root enables it
only with an authenticated weather-counter service. The generic screen path
retains the previous opaque timer ABI and does not require the extra IAT input.

Unknown incoming EBP/ESI/EDI saves are not reconstructed. Their private bytes
are not a claimed match. Generic protocol callers without metadata retain the
existing implementation. Lazy weather frequency/origin initialization also
keeps that generic service path; the narrow typed contract covers only the
initialized branch. Missing frequency still fails genuine timer division.

Validation:

```
node --test tests/native-weather-counter-abi.test.mjs
```

Six tests pass. The independent retained-instruction comparison executes the
whole screen caller, both original viewport queries and timer prologue up to
the QPC CALL for both DWORD-aligned stack cases, at preferred base `400000` and
ASLR base `5f0000`, using actual original PE HIGHLOW relocation records. All
eight preimage bytes and declared known caller/saved/argument words match.
External CRT cast and memory-interface operations in these constructed
fixtures are explicit synthetic services, not original-process observations.
The interpreter stops before QPC; the CPU CALL return word is separately
checked against the retained CALL/next-instruction addresses. Further tests
check the exact timer write set, malformed contract rejection, explicit
synthetic eight-byte output arithmetic and failure on zero frequency.

The broader focused run includes the original V4 parent test, which retains
its missing QPC-service first boundary without opting into this new contract.
Opted-in replay additionally requires the genuine `56e0fc` IAT DWORD; no
guessed IAT pointer is admitted. Root owns the external-service binding and
capture. No new runtime QPC result, full timer
private ABI or joined weather completion is claimed here.

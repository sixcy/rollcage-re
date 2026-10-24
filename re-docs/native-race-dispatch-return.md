#450d60 return bridge after a completed parent

[Source](../src/native-race-dispatch-return.mjs) now executes the recovered450e38 suffix. It consumes the actual current ESP P=U+4 and explicit known CPU registers after450e50 returns. It introduces no clock, input or game-child answers.

`resumeNativeRaceDispatchReturn({memory,moduleBaseAddress,scratchBase:P,entryRegisters,eflags?})` requires EAX,ESI,EDI as uint32 inputs. Other known GPRs are optional; supplied EIP/ESP must identify this boundary. Results use lowercase register names and `kind:'returned'|'sibling'`.

- On failed child EAX0, TEST takes the exit without incrementing ESI. Auxiliary carry is architecturally undefined, reported as unknown rather than copied or invented.
- On success, INC ESI wraps32 bits and CMP/JC uses an unsigned comparison with EDI. Even the synthetic iterationffffffff→0 case follows those actual instructions.
- Exit reads saved EDI/ESI/EBP/EBX/ECX from P+4/+8/+12/+16/+20 and the real caller at P+24, returning with ESP P+28. Address-shaped saved words and return targets stay raw actual values.
- A sibling continuation executes PUSH EDI and the architectural CALL return write, exposes actual450e50 entry at P−4 with EDX equal to the next iteration, and stops. It does not execute a replacement child handler. Unneeded outer-pop storage is not read on this branch.

The result includes defined arithmetic flags and their known-bit mask. Without incoming EFLAGS, it makes no claim about preserved system flags. The failed TEST path excludes AF; the success path's final CMP defines all six arithmetic status bits.

## Retained instructions and original source carry

[Instruction report](../analysis/native-race-dispatch-return-instruction-check-20261024.json):504 constructed suffix states,150 sibling continuations,354 exits,126 failed-child cases and6078 interpreted instructions. It compares all known GPRs,64 bytes of caller/argument/return storage and defined flags across preferred/relocated bases. Totals0/1/2/3 and unsigned boundaries are covered. Synthetic total0 states exercise the suffix; they are not claims that the earlier dispatcher invokes a child with zero total. Evidence001/015/310 remains pinned to original SHA C058.

[Carried-state report](../analysis/native-race-dispatch-carried-return-20261024/report.json) first reruns the actual FinalV2 source parent from original entry, retaining the real source object only after all declared5,107,238 bytes and known return ABI match. The bridge receives this same memory and the source-produced registers. Native intermediate/return game bytes are never installed as new inputs.

For this observed total1 case, source predicts450d60's return at EIP00770cd5, ESP0116fc00, EAX1, EDI7704d730, ESI00a61158, EBP4, EBX0 and ECX0. The suffix reads its live stack and changes no memory. **No native outer-return endpoint was captured.** This is genuine source continuation plus retained-instruction validation, not a new original-process outer-return match or continuous-tick proof.

`checkNativeParentTail` adds only the explicit third option `{retainCompletedSources:true}` for this use. It is boolean-validated and available only for final-tick observations. Successfully verified source objects are returned process-locally, never serialized. The nested parent report is byte-identical to the previously reviewed FinalV2 report: SHA-256`cec8ecc32b954c844da53e5d69481d4c139f0715afe9f1f3d9836d39ac8007bb`.

Validation:

```text
node --test tests/native-race-dispatch-return.test.mjs tests/native-race-dispatch-carried-return.test.mjs tests/native-parent-final-replay.test.mjs
node tools/verify-native-race-dispatch-return-instructions.mjs NEW_REPORT.json
node tools/check-native-race-dispatch-carried-return.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY
```

Nine tests pass with no skips. The separate full450d60 entry composition,440930/input/render producers and next authenticated parent entry remain outside this bridge.

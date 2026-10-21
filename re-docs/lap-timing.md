# Lap timers and packed display digits

`src/lap-timing.mjs` recovers `44a560` and its complete numeric callee `4459f0`. Inputs are caller-owned native record/body bytes; no timer producer or live race state is inferred.

`formatLapTimeDigits(record,allRows=0)` reads four signed32 timers at record+2c/+30/+34/+38 and writes packed glyph words at+3c/+40/+44/+48. With a zero mode it updates rows0 and2, preserving stale rows1 and3. A nonzero mode updates all four. Each output contains eight nibbles in reading order from the low nibble: minute digits, separatora, second digits, separatora, centisecond and fractional digit. Timer-1 uses blank glyphb and separators, yielding bbabbabb.

The coarse timer is arithmetic-shifted right11. Signed divisions truncate toward zero; their remainders are reduced to the original low nibble. The final digit uses wrapped multiply of `(timer>>4)*10`, then a logical right shift7 and unsigned remainder10. Negative timer values therefore retain native unusual glyphs. The helper does not normalize them to an absolute time or a display string.

`updateLapAdvance(record,{body,clock90a548})` compares byte1e with lap byte1c. If unequal, it leaves all storage unchanged. Otherwise it copies timer2c to38 before checking checkpoint byte20. A zero checkpoint and lap zero return after that copy. Other zero checkpoints write `((clock90a548<<11)>>>0)/3`, truncated, to+4c and body+66c=bf. Nonzero checkpoints write body+66c=4f while preserving+4c. Reached display updates format all rows. The record must expose at least50 hex bytes; body uses `{bytes:Buffer}` through66c. The shared buffer can alias a larger caller-owned native memory map.

Retained assembly122/128 and switch bytes129 under `analysis/native-simulation/results/` establish this behavior. `node tools/verify-lap-timing-instructions.mjs` executes all149 instructions and the original eight-entry switch without mocked calls or arithmetic helpers. It compares complete780-byte records and16384-byte bodies across6000 fixtures:3000 lap updates and3000 independent formatting calls,18572 formatted rows and2250 timer captures. All3458377 interpreted steps match. Seven focused tests cover packing order, missing/negative values, stale rows and early-return/clock branches.

The bounded interpreter gained unsigned32 MUL with its actual64-bit product and overflow/carry flags, needed for the compiler's reciprocal divisions. Reports are `analysis/lap-timing-instruction-check.json` and the full instruction-suite report. No original executable has run.

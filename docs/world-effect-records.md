# World effect record pass

`src/world-effect-records.mjs` reconstructs **0x413fc0**, the stage between physical-body preparation and the physics frame's global effect-flag clearing. The routine updates one byte in each of a caller-selected set of **16-byte records**. Their gameplay meaning is unresolved.

Evidence: `analysis/native-simulation/results/068-external-world.json` (`ev_50e184e3b5fcdfc1cd5ae88331cbf8ff415a1c4b96d4989006edd81b233106c5`) and `069-external-world-assembly.json` (`ev_256545fd0549fa857256d1b7be189bc19cbb5ddea29bd15d9b2c090b33e09efa`). The assembly is authoritative for the signed maximum and wrapping arithmetic.

Call `updateWorldEffectRecords(records,{count,effectFlag,originS16,strength})`. Supply a Buffer of complete records, an explicit in-bounds nonnegative count, signed 32-bit effect flag and strength, and a three-component signed-short origin. It mutates the Buffer and returns an observational count of initially positive status bytes processed. Native code has no corresponding count return.

| Native storage | Reconstructed input |
| --- | --- |
| Array beginning at 0x920800 | `records`, stride 16 |
| Dword 0x9207e4 | `count` |
| Dword 0x91cd90 | `effectFlag` |
| Shorts 0x91cd82 / 0x91cd86 / 0x91cd8a | `originS16` |
| Dword 0x91cd8c | `strength` |
| Record shorts +0/+2/+4 | Three signed coordinates |
| Record signed byte +6 | Status used by this pass |

The gate accepts **any nonzero effect flag**, including negative values. This differs from the ordinary-body effect callback gate, which requires exactly 1. Zero count also returns without writes. Each record whose signed status is zero or negative is skipped; all bytes except +6 remain unchanged, including unused trailing records beyond `count`.

For an initially positive status:

1. Subtract the corresponding signed-short origin from each signed-short coordinate and arithmetic-shift each difference right two.
2. Square the three shifted differences and take their signed maximum. Replace zero with one.
3. Wrap `strength <<15` to signed 32 bits and divide by that maximum using signed integer division toward zero.
4. Add `1 - quotient` to the original signed status with 32-bit wrapping. Replace a nonpositive signed result with zero; otherwise store its low byte.

The distance denominator uses the largest squared component, rather than a sum of squares. Arithmetic shifts make positive and negative fractional quarter-distances asymmetric. Positive results are truncated to a byte without saturation: status 127 becomes byte 128 when strength is zero, and that signed negative status is skipped on the next pass. Strength shift and result addition can also wrap; these behaviors are preserved.

All signed-short coordinate differences, once shifted, have nonnegative squared values that fit signed 32 bits. After zero replacement the divisor is positive; every declared signed-32 strength produces a valid native IDIV quotient. Negative counts and backing-memory overrun are outside the source API's valid storage contract.

Validation:

```powershell
node tools/verify-world-effect-records-instructions.mjs
node --test tests/world-effect-records.test.mjs
```

The native checker executes all **57 retained instructions** without calls or arithmetic stubs across **5,000 fixtures** and **770,183 steps**. It compares the complete record Buffer, records beyond count, prefix/suffix guards and unchanged globals. Fixtures include **14,069 record updates**, **834 disabled gates**, **610 zero counts**, signed-short extremes, coincident origins, signed-negative statuses, shift/add wrapping and **4,612 positive-to-negative byte transitions**. Report: `analysis/world-effect-records-instruction-check.json`.

Eight focused tests cover the nonzero gate, retained bytes, signed statuses, count bounds, largest-component distance, arithmetic-shift asymmetry, zero-divisor replacement, signed-byte wrap and strength wrapping. The original executable is not run. Record creation, record meaning and producers of count/origin/strength remain separate reconstruction work.

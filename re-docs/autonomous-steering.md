# Autonomous steering control

`src/autonomous-steering.mjs` reconstructs431520 and its numerical steering/velocity helpers for the selected Redux1.3.8.0 executable. This routine writes steering bits2000/8000 into the existing control dword at body+710. The retained207 pseudocode filename calls it speed control; that name was an early hypothesis, not its recovered behavior.

The primary assembly is`analysis/native-simulation/results/230-autonomous-steering-assembly.json`, Evidence `ev_bc4418c8f6a3afd5a7be6325757effd8f9a9dce39f9c5bc2a7e11acfd68ed9d4`. Requests231–244 retain its dot/cross/ratio, steering correction and velocity helpers. Exact supporting Evidence IDs are listed in`analysis/autonomous-steering-instruction-check.json`. The original game was not executed.

## Recovered arithmetic and writes

The body rotation's third column, shorts+c8/+ce/+d4, becomes the Q16 facing vector by shifting4. Its second column,+c6/+cc/+d2, becomes the corresponding axis. The target direction has its dot projection onto that axis subtracted, with each Q16 product independently truncated. The caller supplies that target vector; the module does not invent a route or target producer.

491540 computes the facing/projected-target cross product, chooses the axis component with greatest signed absolute magnitude, and divides the corresponding cross component by it in Q16. Strict comparisons choose Z on an X/Y/Z tie. An axis magnitude below1024 returns0. This is a signed side ratio rather than an angle from a floating atan2 function.

430ee0 converts that side ratio into a steering request. A negative forward dot returns+a000 when side is positive and-a000 otherwise, including zero side. This path bypasses angular correction. For nonnegative forward dot, side above22574 or below-22574 saturates the base request; otherwise the base is the Q16 product with1d081. An angular-momentum correction is enabled only when byte+6f1 exceeds1 and signed-absolute angular momentum+50 exceeds4000000. It uses the first flagged wheel's surface index through430e90, including the native early return when that wheel's metadata pointer is null. The correction and final desired signal respect reverse byte+64f, and the resulting request is clamped to±a000.430e90 is shared with`autonomous-speed.mjs`; its implementation is not duplicated here.

430d90 shifts linear velocity right4, measures its length with41c9c0, and uses reciprocal-then-product normalization only when that length exceeds2048. It returns facing dot and the same oriented side ratio. The low-speed case supplies forward65536 and side0. In both cases it writes the low byte of forward>>8 to body+6c8, preserving neighboring bytes.

The outer routine optionally compares a velocity-derived request when its first argument is nonzero, adjusted velocity forward is below64000 and signed speed+668 exceeds100. Three details are retained exactly:

- Reverse-argument handling negates the **old target request again** before the comparison. That negation remains even when the candidate is rejected.
- The side comparisons use bit27, not the arithmetic sign bit. Large positive side ratios can consequently follow a different branch than an ordinary sign comparison.
- The50000 threshold reads the stored **target forward dot**, after its initial reverse handling. Velocity forward overwrites the former target-pointer local, not that target scalar. This distinction is established by the complete instruction comparison.

Finally, reverse byte+64f can negate the selected request. If both its signed-absolute value and the existing steering dword+644 are below1143 (`477` hex), no new steering bit is set. Otherwise a desired value greater than current steering ORs2000 into+710; a smaller value ORs8000. Equal values add no bit. Existing control bits, including the other steering bit, remain untouched. Signed absolute arithmetic retains the native INT_MIN behavior.

## Interface and memory boundary

```js
updateAutonomousSteering(bodyAddress, targetVectorAddress, firstArg, reverseArg, {
  memory,
  scratchBase //native entryESP
});
```

Body and target bytes remain caller-owned native storage. `scratchBase` preserves meaningful outer locals at entryESP-52 through entryESP-4 and the caller's first stack argument at entryESP+4, which the second angle call overwrites when reached. Saved-register values and unused callee stack bytes are not modeled as public outputs. The reference exposes no guessed callbacks because every numerical callee is implemented.

The return object reports desired/current steering, newly added bits and whether a velocity candidate was compared/replaced. These diagnostics are not a claim about the native EAX return value. Additional exports are`orientedSteeringRatio`, `autonomousSteeringAngle`, and`measureAutonomousVelocity`; the last performs the original+6c8 write.

The complete autonomous parent, route selection, runtime controls, body initialization, steering actuator and input ownership are separate callers/producers. This routine's target and existing+644/+668/+64f/+6f1/wheel state are explicit inputs. Invalid native pointers, division faults and unsuccessful root arithmetic are not converted into a fallback steering model.

## Validation

`node tools/verify-autonomous-steering-instructions.mjs` passes5008 fixtures against725 retained instructions, including all actual41c910,491540,491f40,41c990,430ee0,430e90,430d90,492d10,41c9c0 and41ca60 callees. There are no mocked calls or arithmetic helpers. It compares every byte of the16384-byte body, target and wheel metadata, plus meaningful scratch vectors/scalars and the overwritten caller argument. Synthetic fixtures cover identity/yaw and arbitrary signed-short matrices, target aliases into body fields, reverse modes, speed/deadzone/correction thresholds, velocity normalization and large side values crossing bit27.

All5086892 interpreted steps match. The fixtures produce2917 new2000 requests,2087 new8000 requests and4 cases without a new bit;1094 compare a velocity request and704 select it.3756 fixtures alias the target into body storage. These are checks of supplied synthetic states, not captured autonomous-driving trajectories.

`node --test tests/autonomous-steering.test.mjs` passes ten focused tests covering control preservation, the1143 deadzone and signed rounding, behind-facing zero side, dominant-axis tie/threshold behavior, first-wheel correction, diagnostic-byte storage, the50000 target-forward gate, bit27 comparison, reverse double-negation and speed100 exclusion.

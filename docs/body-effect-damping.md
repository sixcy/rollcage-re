# Second ordinary body effect

`src/body-effect-damping.mjs` reconstructs **0x47b280**, the second effect invoked by ordinary-body preparation when its second global gate equals 1 and the body's protection/type filters permit the call. Its behavior scales current linear velocity and momentum near an explicit origin and conditionally writes six global dwords. The gameplay meaning of those globals remains unresolved.

Evidence: `analysis/native-simulation/results/073-second-body-effect.json` (`ev_288dc83b6a0a98a5f78ad3137ece5d3bbc327ebb79781266b690592f544aa264`) and `077-second-body-effect-assembly.json` (`ev_93e9c2d6fef6e46ae0140bd487b82a6655d2707e71d031d064059b202885a1fe`).

Call `applyBodyEffectDamping(body,{originQ16,timeScaleActive,globals})`. Supply three signed-32 origin coordinates, explicit time-scale global state (signed 32-bit value or equivalent boolean), and a mutable object retaining all six output dwords. The body supplies signed-32 position, linear velocity and momentum vectors, flags and, for an eligible type-3 body, explicit `pairCollisionContext.stateByte6bc`.

| Native storage | Source representation |
| --- | --- |
| 0x9153f0 / 0x9153f4 / 0x9153f8 | `originQ16` |
| 0x811180 | `timeScaleActive` |
| Body +0x34 | `body.position` |
| Body +0x68 | `body.linearVelocity` |
| Body +0x40 | `body.momentum` |
| Body +0x6bc | Pointer-derived `body.pairCollisionContext.stateByte6bc` |
| 0x91cd60 / 64 / 68 / 6c / 70 / 74 | `globals.field91cd60`, etc. |

Each position-origin subtraction wraps to signed 32 bits, then arithmetic-shifts right **18**. The sum of the three squared results must be strictly below **0x1000**. Exact-boundary and farther bodies are unchanged. Wrapped subtraction matters: positions at opposite signed-32 extremes can produce a near difference after wrapping. The source preserves the native signed arithmetic and gate.

For type **3**, the native +0x6bc pointer sentinel **-1** permits the effect; the source represents that sentinel as `stateByte6bc:null`. A pointed byte of zero also permits it. Any nonzero pointed byte suppresses the effect. Other body types do not inspect that state, and an out-of-radius body returns before the state check. Null here is a deliberate representation of pointer -1 rather than a claim about a native null pointer.

An eligible body uses Q16 factor **`0x8000 + distanceSquared*8`** on each component of its existing linear velocity and each component of its existing momentum. These two vectors are scaled independently; momentum is not reconstructed from velocity and mass. At the origin the factor is one half. Signed products retain their arithmetic shifts, so an odd negative component rounds downward. No angular, force, clock or position fields are changed.

If the time-scale global equals zero, the pass writes the retained outputs in native order: +0x6c receives origin x, +0x70 receives origin y, +0x60 becomes **1**, +0x64 becomes **31**, +0x68 becomes **2**, and +0x74 receives origin z. Any nonzero time-scale value preserves all six prior outputs while still applying the body damping. The pass itself does not test the ordinary parent's second effect gate, clear that gate or infer the output globals' consumers.

The result `{applied,distanceSquared,scaleQ16}` is a reconstruction observation. Rejected bodies return `scaleQ16:null`; the native routine has no equivalent structured return. This module is independently callable and leaves binding into the ordinary-preparation parent to the concrete frame adapter.

Verification:

```powershell
node tools/verify-body-effect-damping-instructions.mjs
node --test tests/body-effect-damping.test.mjs
```

The native checker executes all **98 retained instructions**, with no helper calls or stubs, across **4,000 fixtures** and **220,983 steps**. It compares all **4,096 body bytes**, all six output globals, unchanged input origin/time globals and pointed state byte. Fixtures include full signed-32 velocity/momentum/origin values, wrapped subtraction, exact radius boundaries, all type-3 state cases, **1,949 accepted bodies**, **1,382 distance rejections**, **669 special-state rejections** and **379 global-output writes**. Report: `analysis/body-effect-damping-instruction-check.json`.

Six focused tests cover independent vector scaling, negative rounding, strict summed-distance gate, subtraction wrapping, type-3 state behavior, retained globals and pointer-check ordering. The original executable is not run. State-pointer producers, origin producers and global-output consumers remain separate reconstruction work.

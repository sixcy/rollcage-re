# Vehicle wheel/render construction (`0041caf0`)

`src/vehicle-wheel-construction.mjs` reconstructs the complete wheel constructor called by the main vehicle constructor `0041dbb0`. `createVehicleWheels(bodyAddress, wheelModelAddress, participantIndex, runtime)` accepts a shared `Buffer` as `runtime.memory` and the native **child entry ESP** as `runtime.scratchBase`. The function returns no value. The main constructor's call enters at its entry ESP minus 84; the preceding shape-call arguments are still on the parent stack.

The constructor initializes four 200-byte records at `body+324h`, allocates their linked render bodies using the existing actual `004741c0` implementation, then calls actual `0041d460` for each wheel. Model storage measurement/publication (`00474510`/`00474490`) and every matrix, angle, offset and fixed arithmetic descendant remain actual implementations. There are no game callbacks in this module.

## Native ordering and representation

- The incoming short body matrix is copied to `0091d360`, including its tenth padding short. Nine signed values are converted to renderer floats in `0091cdc0` using original `005dc5f4`; float row padding remains unchanged.
- Each wheel receives cleared vector/contact fields, the body matrix's third column as its Q16 drive direction, `+5c=1000`, zero spin and an allocated render-body pointer at `+6c`. Render bodies use flags `8c0bh`, base size 384 and mode zero. Model geometry, reference counts, shared auxiliary model selections, arena offset rounding and the 512-entry registration limit are handled by actual `004741c0`.
- **The first render update happens before authored wheel offsets, the old accumulator, `+80` distance and wheel byte `+1` are reset.** Incoming wheel offsets and accumulator can therefore affect the allocated render body's first world position. This ordering is retained and directly tested. The constructor uses incoming `body+644` steering for the first two wheels, zero steering for the others, and incoming `body+64f` orientation behavior. It clears `body+644` and byte `+64f` only after all four wheels succeed; cached steering `+648` stays unchanged.
- Original authored `+70/+72/+74` offsets are `(-33,0,26)`, `(33,0,26)`, `(-33,0,-26)`, `(33,0,-26)`. `+76` padding is retained. Native three-point geometry uses `(14,14,8)`, `(-14,14,8)`, `(0,-14,8)` with the documented odd-wheel swaps and negative Z. Participant and wheel indices at `+9c/+9d` are bytes, including participant truncation. Each linked render body receives its wheel backpointer at `+164`.
- Coefficients read three signed shorts at `body+180+28*i`, shift each left eight, form wrapped Q16 squared products, and use actual `0041ca60`'s bitwise signed root walk. `wheel+bc` multiplies the squared sum by body mass `+a8`; `+c0` divides 65536 by the root. The root writes `0091d45c/460`, including negative wrapped sums. Zero roots preserve the native divide-by-zero domain and preceding writes. Four late body triples at `+3e38/+3e00/+3e54/+3e1c` become `(1,6000,16)` only after every wheel completes.

`initializeVehicleWheelConstructionTables(memory)` installs original bytes and the existing wheel-render angle table. It does not allocate bodies, arenas or model resources. `vehicle-wheel-construction-tables.json` retains the original eight geometry bytes at `005eac18` and 32 offset bytes at `005eac40`.

## Evidence and validation

The target remains Redux 1.3.8.0, SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

- Parent pseudocode/assembly: retained replies `1530`/`1531`; assembly evidence `ev_33c24b3dcc5ff1de35a891abf1fef5135b47f7d5a9c2e9c4f5d071a699c81ea0` contains 247 instructions.
- Original geometry/offset bytes: replies `2500`/`2501`; evidence IDs `ev_3a39fe436688074c3a0835ec9d91fcf5ad200eb23ee7746dfba83691429d8ca0` and `ev_b93bc30a710f52b9d1f17ef0f83fb192ef7e2acbfb833c385122feee37d2b54b`.
- `node tools/verify-vehicle-wheel-construction-instructions.mjs`: **passes** 2,400 mixed constructors, 256 coefficient boundary cases (160 complete, 96 matching division faults), and 120 constructor-to-consumer scenarios with four persistent render/auxiliary-animation frames each. The comparison reaches 2,195 distinct instructions and executes 15,675,175 interpreted steps. All mapped bytes outside declared stack scratch are compared after each stage, including models, reference counts, arena allocations, list/registration state, body/wheels, renderer/root scratch and auxiliary controller bodies. No game or external-service handler is reached.
- `node --test tests/vehicle-wheel-construction.test.mjs`: **7 tests pass**. They exercise allocation/registration limits, byte indices, authored geometry and stale padding, first-render ordering, descriptor coefficients, shared model publication/reference-count wrapping and pre-fault state; a smaller complete native comparison is included.

The primary retained report is `analysis/vehicle-wheel-construction-complete-instruction-check.json`. The earlier `vehicle-wheel-construction-instruction-check.json` is a preliminary subset; its counts are not additive.

## Remaining ownership limits

The caller supplies the already-created main body, its mass/matrix and 28-byte descriptors, arena storage at `00902eec` with offset `0070dcf4`, registration storage and loaded wheel models. These are explicit inputs to this helper. The main `0041dbb0` constructor and secondary `0041cfc0` constructor are separate ports owned by the vehicle-construction package. In particular, the corrected main constructor call selects the wheel model through its own resource-index mapping; this module does not invent that producer.

Connected consumer fixtures declare a nondegenerate body orientation, existing auxiliary controller/body and spatial storage, and new wheel contact/spin values between frames. They run actual constructor, wheel-render and auxiliary-animation code; they do not simulate original physics or establish loader/constructor provenance for the auxiliary controller. This is retained-instruction equivalence on explicit synthetic memory, not an original-process capture. Original installed files were neither changed nor executed.

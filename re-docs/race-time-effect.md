# Race time effect (`48c120`)

`src/race-time-effect.mjs` reconstructs the time-scale weapon's activation, tick, renderer texture-coordinate producer, slot release and driver recovery. This is one closed branch of the still unfinished `48d7c0` coordinator graph.

The shared-memory API is `activateRaceTimeEffect(record, age, runtime)` and `updateRaceTimeEffect(runtime)`, where runtime supplies `memory` and an optional explicit x87 `roundingMode`. Activation returns `{eax, ecx, edx}` because the native weapon dispatcher retains register values across this call. The other exports expose the actual smaller native entries for reuse.

The implementation preserves unsigned low-word multiplication before intensity division, signed slot comparisons, live state reloads after renderer writes, byte texture coordinates and the difficulty-dependent random recovery loop. `40f5d0` is a texture-coordinate producer despite the early evidence filename calling it a sound refresh. Four groups of 32 records use binary32 accumulation and FISTP rounding; the disabled renderer path instead writes four explicit words per record.

Validation: `node tools/verify-race-time-effect-instructions.mjs` passes 3,000 mixed-entry fixtures and 24 activation-to-expiry sequences of 140 ticks. The comparison executes 6,384 calls, 216 distinct retained instructions and 7,897,354 instruction steps. It compares every mapped byte from `10000h` through the 10 MiB fixture after each call; no differing outputs are excluded and no game calls are mocked. Seven focused tests pass with `node --test tests/race-time-effect.test.mjs`. The report is `analysis/race-time-effect-instruction-check.json`.

These are interpreted native comparisons with synthetic sessions, vehicle records, texture storage and RNG state, not original-process observations. The complete weapon coordinator, other weapons and their upstream session setup remain separate work.

Evidence is for Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`:

- `48c120`: retained `3217`, `ev_0a13f1097e9b973ebf0ff7c705c12921de39d93e6bdbcfb53c3ed1d946edb3c1`.
- `48c2a0`: retained `3233`, `ev_863f197f14a9dcaf834db756cd7c965bbb4cda2bb06b92421dcf7b01982b6bdd`.
- `40f5d0`: retained `3227`, `ev_78662eb384fdec02d4da517c9e3d1a4d9a3f5f4ee41f5b028ca23945a7e70022`.
- `430890`: retained `3229`, `ev_e63fc845ef1470fe4f13b89eec884dba79ee167dfa37a2d504c7f4843e99881a`.
- `47c2d0`: retained `3231`, `ev_fc1e2c3b5a0bdf3057ff57fdef36f646b456db0c15dc82ad32e3121868fa722d`.

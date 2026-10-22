# Candidate alignment and route modifiers

`src/autonomous-candidate-modifiers.mjs` implements Redux1.3.8.0 candidate alignment420ba0, turn bias420de0/420ed0, mode bias434800/434910/434a20/434c00 and event bias4352f0/491ec0. `src/autonomous-candidate-scores.mjs` supplies4209d0 reset,420f90 authored entry bias and420a90 linked extra-score lookup. The complete421430 route planner now calls these implementations by default.

Rows at91f1e0 have52-byte stride. Group/point are+0/+2, normalized point direction+4, route tangent+16, velocity/tangent alignment+28/+32, special type+37, disabled flag+38, mode+42, score+44 and extra score+48. Reset clears only dwords+0/+36/+44/+48 and word+42. Other bytes deliberately retain their previous contents.

420ba0 normalizes displacement and tangent with the original small/large vector paths. It walks backward first, forward at an open endpoint, and consumes retained low-word deltaZ when neither walk succeeds. Speed below10000 forces velocity alignment65536. Tangent alignment changes score only after the left shift wraps to32 bits, then an arithmetic shift. Lookup/reciprocal normalization remains approximate; an exactly straight100-unit fixture has tangent alignment65464, not65536.

420de0 consumes actual4919d0 curvature from the opponent package, tests strict side signs for both bend vectors, and reuses one result for consecutive same-group rows. Its classification uses authored XYZ, not the row's normalized direction vector. A zero side fails.434800 similarly shares one score across the preceding same-group run, including rows whose point lacks flag4.434910 uses asymmetric signed progress-gap thresholds.434a20 uses the retained5705d0 tier table, authored flag tiers, competitor-route connectivity and last-lap scaling.434c00 receives a registered vehicle index, not a body pointer.

4352f0 scans authored8-byte events backward, updating score, disabled flags and mode20. Difficulty/session/lap/finished state controls event permissiveness. Type4 inventory checks compare raw slot bytes with4; a byte24 does not match. ThresholdFF may leave score unchanged while still selecting mode20. Ordinary same-route events and special-type4 targets have distinct branches.

The table initializer copies original5705d0 bytes explicitly; it does not reconstruct a session or invent runtime inputs. Native state producers and whole-race integration remain separate requirements.

Evidence: native-simulation results348/352/358/360/364/368/378 and527/529/531/533/535/537, with original switch/profile bytes520/538/539. Full Evidence IDs are retained in `analysis/autonomous-candidate-modifiers-instruction-check.json`.

Validation: `node tools/verify-autonomous-candidate-modifiers-instructions.mjs` executes1567 retained instructions over12000 synthetic fixtures,1000 per entry, with actual geometry/math callees and no game mocks. It compares defined EAX results and complete candidate/body/route/competitor/event records. `node --test tests/autonomous-candidate-modifiers.test.mjs` checks sparse reset, linked scores, exact gap thresholds, approximate alignment, same-group propagation, strict turn signs and item/event behavior. These are static instruction and constructed-memory checks, not original-process trajectory evidence.

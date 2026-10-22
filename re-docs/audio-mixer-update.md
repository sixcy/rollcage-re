# Mixer update consumers

`src/audio-mixer-update.mjs` recovers 4a9380 (time-based ramp) and 4a90f0 (hierarchy gain/rate) with the original 4a9300, 4a9320 and 4a9360 getter targets. Both require caller-owned raw memory and native entry ESP in `scratchBase`. The ramp's float argument remains at entry+4. Hierarchy publication and getter CALL return stores occur in native order; parent links and fields remain live. Unknown virtual getter targets throw.

The parent subtracts each ancestor's lost gain, rather than multiplying all gains, and multiplies the separate rate. SSE float rounding, x87 float stores and COMISS unordered branches are retained. NaN gain survives the clamp; NaN final rate becomes zero. The implementation does not model x87 control-word exceptions or NaN payloads.

Evidence: retained native-simulation results 12286/87, 12290/91, 12300..12305. `verify-audio-mixer-update-instructions.mjs` passes 2,400 fixtures: 1,600 ramp calls and 1,600 hierarchy calls, 174 parent-field/caller-scratch aliases, 94 reached instructions and 193,158 steps. It compares all 10 MiB of mapped bytes plus 256 private/caller bytes, using both original vtables and zero through four ancestors. No child/service callbacks are substituted. No original game process was executed.

These are reached consumers of 4a6600; the complete manager update/source-selection graph remains separate work.

# Vehicle sound and force-feedback policy

`src/vehicle-audio.mjs` reconstructs Redux1.3.8.0's1090-instruction485300 pass. It uses actual sound emission, playback/reverb, four sound-control wrappers and four force-feedback helpers by default. [The sound/haptics note](vehicle-sound-controls-and-haptics.md) defines the lower libaudio, standard-container and device services. No original executable, audio device or force-feedback hardware is executed by these references.

`initializeVehicleAudioTables(memory)` installs retained5750a0 table bytes, six explicitly terminated horn sequences and four float constants. It preserves neighboring live5eced0/5eced4 fields. The588-byte table span includes every0..26 material index accepted by the native parent; adjacent values are preserved without inventing a more plausible material layout. Initialization does not allocate a sound bank, initialize channels or produce a session.

`updateVehicleAudio(bodyAddress,vehicleIndex,runtime)` requires caller-owned native memory and native entryESP in`runtime.scratchBase`. Runtime handlers supply genuine imported/container/virtual services. Optional`call...` overrides support interface probes; normal game-owned decisions have actual defaults.

## State and order

The pass captures the previous engine state, throttle, contact mask, wheel slip and selected horn sequence before updates. Per-vehicle sound rows start713190 with40-byte stride; horn sequence state starts713280 with16-byte stride. Sound handle127 is the game sentinel. The registered participant body used for feedback may differ from the original body; the source preserves that live reload.

Horn/control-bit20 handling supports authored pitch/duration sequences and a continuous special sound for vehicle type6. The original duration255 row ends a sequence. Reverb is refreshed for a live handle and the clock is published after sound work. Surface contact can start/query a separate sound. The selected sector then produces body6b4 reverb state and global5eced4 ownership, including autonomous-mode exceptions.

Engine-like speed is supplied by either prestart6b0, wheel fields50c/5d4, or the previous retained value plus throttle/decay. Contact/air counters use signed16 wrap. Gear changes emit body71a/71c/71d/71e/71f feedback state, preserve a byte cooldown and change the next pitch. Fixed32 multiplication and the signed high-word clamp are retained. Wheel speed smoothing is approximate integer arithmetic rather than a floating interpolation.

Feedback has constant, directional and transient branches. The parent captures the original body's axis before reloading the registered body for momentum and collision intensity. In particular, the directional momentum projection and angle9000/27000 selection are present in assembly but missing from the decompiler pseudocode; the source implements the instructions. Gain and descriptor conversion use exact float32 steps.

Engine, optional secondary, wheel and surface channels each preserve their own handle guards and live reloads after service calls. Surface loops use material-specific codes, pitch/gain and low-slip policy, including a5→1 delay before loop replacement and a signed prior-material byte. Collision sound requires a high collision byte and an unsigned elapsed interval of at least10 ticks; the entire word at66f is cleared at return, including byte670.

`450e50` calls this pass for every participant after all AI/route-control sweeps and before packet/input conversion. It therefore reads prior handling values; moving it after input conversion changes the native ordering.

## Evidence and validation

Parent assembly is retained271, Evidence`ev_ba18dbda8825a020d0f56e7504d1377e94372004104491c290fe6f9097616702`; pseudocode270 is supplementary. Original tables/constants/sequences are708..712. `src/vehicle-audio-tables.json` retains the original data Evidence IDs.

`tools/verify-vehicle-audio-instructions.mjs` checks6000 parent cases/1090 instructions/3421056 interpreted steps, comparing full caller-visible body/session/record/channel/global storage and52691 game-boundary calls/19069 audio virtual calls. Ten game callees are explicit contracts in this parent-only checker; it preserves that stated boundary after actual defaults were added. Mutations exercise reverb changes, live channel replacement, feedback device/body reassociation, wheel smoothing reloads and late collision writes. Retained byte evidence independently checks every literal table span. Private/dead parent stack fields and unused fifth484bb0 arguments are outside its comparison.

The connected vehicle-audio checker separately uses actual game callees and populated sound-bank/channel/feedback state; its report records the exact standard-library/device/compiler interfaces. Focused tests cover table preservation, actual missing-bank guards, smoothing, gear feedback/cooldown, horn termination and exact collision cooldown widths. These checks supply explicit native-shaped runtime state; they do not establish bank/sample decoding, device setup, voice ownership/teardown, every audio producer or original-process sound equivalence.

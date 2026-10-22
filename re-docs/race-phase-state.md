# Race phase, countdown and clock gate

`src/race-phase-state.mjs` reconstructs the complete `47f370` caller. `updateRacePhaseState({memory, scratchBase, entryEcx, handlers})` returns its meaningful EAX0/1; `scratchBase` is native entry ESP. The caller caches the initial session pointer/phase/counter, writes the original phase to its native stack slot and mirrors it at `6e6ba4`. Later reloads follow the assembly, including paths that deliberately retain a cached session or reread stack values after callbacks.

Phase1 advances after15 ticks; phase2 advances after150 and initializes a63-tick countdown. Phase3 decrements the HUD countdown only at original counter30/20/10, then captures each registered body's `6b0` into650, stores the wrapped unsigned `(clock90a548 <<11)/3` start timestamp and runs actual lap bookkeeping. Its loop rereads the original cached session's vehicle count. Phase4 applies the exact512/1500 boost decay and calls the actual start-launch helper during the first seven ticks. Phase5/6 process completion/skip state. Phases7..11 apply the signed50-step fade and return1 after the counter exceeds60; this early return does not store the incremented counter. Signed overflow comparisons, playback58c/58e handling, mode3/8 score limits and the network finish gate are retained.

The actual sound adapter ignores its fifth stack argument. For diagnostic parity, phase2 carries optional `entryEcx` into this unread slot; the default is zero. At phase3 start the exact value is known: `449be0` explicitly saves/restores ECX on every return, so it is the last record address, or `clock<<11` when the loop has no vehicles. A void callback is not required to manufacture a return register for an unread argument. `471800` preserves ECX; its actual network-client predicate therefore leaves the cached flag word intact in the final mode3/8 loop.

## Recovered children

- `setRaceTransitionInputState` implements42a4e0 and changes the transition controller only when91e744 is already active. `isRaceNetworkClient` implements471800.
- `aggregateRaceInput` implements42b330 using actual existing packet retrieval/conversion. It selects sampled/local/history data, attaches the packet to the captured body's724 and ORs the native decoded digital mask. Device sampling/configuration remains an upstream producer.
- `spawnRaceModeFourIndicators` implements479360's two indicator positions. Width/height are captured, each call reloads scale91d338 and its own authored text pointer; unsigned shifted products remain unsigned. The separate48b7d0 text/animation allocation is an explicit game boundary.
- Actual449be0/4459f0/445d40 lap bookkeeping and484bb0 sound emission are reused. This package's instruction fixtures use the actual missing-bank sound gate; populated bank/channel/reverb behavior is separately connected in [vehicle-audio-connected.md](vehicle-audio-connected.md).

`src/race-launch-state.mjs` implements `startRaceLaunch(record, ageEDX, countdownStackArgument, runtime)` for48d6e0 and `applyRaceLaunchImpulse(body, strength, runtime)` for48d490. Existing launch age, level clamping, live record/body709 reload, stack countdown strength, sound22 arguments and body6a0..6ac state are actual. All four contact bits are required for the impulse. It adds a fixed-point local axis contribution to raw40/44/48 fields, preserves432e70's scratch globals even though its root return is discarded, projects the result into all four wheel-speed fields and updates feedback bytes670/71a/71d/71e. It does not invoke original physics or infer constructors.

`src/race-phase-audio.mjs` implements:

| Export | Entry |
| --- | --- |
| `updateRaceAudioListeners(runtime)` |484880 |
| `refreshRaceAudioState(runtime)` |484b20 |
| `setRaceAudioVolume(signedCX, runtime)` |484dd0 |
| `setRaceSerialVolume(signedCX, runtime)` |484440 |
| `updateRaceMusicState(lowCL, runtime)` |4843a0 |
| `sendRaceMusicCommand(lowCL, runtime)` |484510 |

The listener pass zeroes one76-byte descriptor, then reuses it across four active entries. A later null position/velocity/rotation source retains the preceding descriptor's flag and values. It supports both native pointer layouts, float32 conversions and scaled rotation, checks the live listener vector's signed count, and copies the actual descriptor chunks. Audio refresh updates axis polarity/reverb ownership before the listener pass and final master-level virtual call. The volume wrapper preserves integer scaling before float32 multiplication and reloads the stored volume after the device getter. Serial volume preserves the double unsigned adjustment before float32 conversion/multiplication/truncation. Music commands are exact one-byte55/53/41 writes and serial volume emits56 plus the encoded low byte.

`initializeRacePhaseAudioConstants(memory)` initializes only the immutable scalar bytes retained in974/975/978. The master level5ecdb8, listener pointers, source records, session/settings and file/device ownership remain caller-owned.

## Explicit remaining boundaries

Reached game handlers use `{memory, ecx, edx, args, scratchBase}`:

- `call48b7d0`: text/animation allocation; five stack arguments and authored text pointer are retained.
- `call478fa0`: completion UI progression.
- `call477310`: the larger pause/session transition parent.
- `call445b70`: results/time finalization.
- `call4702c0`: network end-state packet/session lifecycle.
- `call4a0420`: generic mode1 transport called with an eight-byteA0 packet and flags11hex. The separately closed auxiliary chat mode2/flags0 path does not establish this mode.

These are genuine remaining game routines, not claimed library services or inert defaults. Optional named handlers can also override separately implemented helpers for focused caller probes. Platform services are `handlers.audioDeviceCall(pointer, method, args, runtime)` and `handlers.writeFile({memory, handle, buffer, length, written, overlapped}, runtime)`. The audio getter must return an integer or `{eax}` pointer. Imported writes have explicit native byte/output addresses; source modules open no device/pipe and issue no OS calls themselves.

## Validation

`node tools/verify-race-phase-state-instructions.mjs` compares the complete caller plus actual small/input/lap/launch/audio children. **1,630 retained instructions**, **6,000 full-parent fixtures**, **2,000 direct helper fixtures**, **1,963,425 interpreted steps**, PASS. Original switch tables and scalar bytes are mapped, all twenty watched actual entries execute, and the report records separate visits to the six remaining game contracts. Counts include4,893 platform audio calls,1,697 imported writes and1,917 cookie checks. The emitted sound path uses an empty bank; listener records and input bodies/packets are populated. Native and source mutable body/session/record/packet/listener/audio/clock/transition/root globals, meaningful returns and service order/arguments are compared. Mutation contracts exercise session replacement, native stack phase/counter aliases and cached versus live settings/scale.

`node --test tests/race-phase-state.test.mjs`: twelve focused tests cover the connected instruction comparison, sequential countdown, start timestamps, boost decay, terminal early return, playback skip through actual input, mask ordering, listener descriptor carry, launch contact gating, exact music/serial commands and live indicator scale reloads. Four additional interpreter tests cover full-lane signed double conversion/addition/float32 rounding, metadata invalidation and invalid float-to-integer conversion. Retained audio484440 required the bounded interpreter's CVTDQ2PD/ADDSD/CVTPD2PS/CVTTSS2SI forms; they preserve known consumed lanes and reject missing provenance.

Report: `analysis/race-phase-state-instruction-check.json`. Primary evidence900/901; children910..938 and970..978; previous packet/lap/emitter/math evidence is listed by ID in the report. These are interpreted shipped instructions over synthetic caller-owned runtime memory, not original-process, sampled-device, audible-output or whole-race runtime evidence. Instruction totals overlap existing helpers and must not be added as unique reconstruction coverage.

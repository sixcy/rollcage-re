# Redux physics clock, gravity and numerical context

Target: Redux1.3.8.0 SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. New static replies are retained under `analysis/physics-clock-elevated-20261022/results/`. The executable was not launched for these findings. `src/race-clock.mjs` exposes the recovered constants, gravity producer, integer scheduling tail, wrapped timer conversion and captured-register decoder.

## Gravity initialization

Original initialized image bytes at VA`5eb5e0`, file offset`1ea5e0`, are `00000100`: signed/Q16 **65536**, rather than the viewer's former16384 assumption. REA byte read003, Evidence`ev_9e2e0ba78ac20e34a88f65ba6e2a806eda9ce4b51c34d6124fcffd8f7ad8503d`, and the independent read-only PE inspector agree.

There is an actual normal startup producer before `47ea40`: `4412c0` loads configuration pointer from`5ecefc`. Its byte`+82` nonzero forces65536; otherwise byte`+97` equals1 selects45000, equals2 selects20000, and every other byte selects65536. The separate `5eb518==1` startup branch does not perform this gravity write. `initializeRaceGravity({memory})` reproduces this selection and preserves the existing gravity in the separate branch; it does not replace that branch's broader startup work. Assembly017 Evidence`ev_e5fffa7429892ce7357a4edfc3eab251bcc625d646a0152f1d4f5c468ec9985a` proves the exact widths/order. Xrefs002 additionally identifies runtime cheat-parser writes at`44173d/441760`; the original image value alone would not have established the live race value.

## Logical clock and outer scheduling

The logical rate is **30 ticks per second**, corroborated by two independent consumers/producers:

- `443d90`, `449be0`, and`44a560` encode time with unsigned32 wrap **before** division: `((clock90a548 << 11) >>> 0) / 3`, truncated. HUD formatter`4459f0` interprets2048units as one tenth of a second:30clocks produces`00:01.00`,300 produces`00:10.00`. Existing comments calling those units "Q11 centiseconds" are inaccurate. This encoding wraps at clock`0x200000` and must not be replaced with an unlimited floating timer.
- `441c70` obtains elapsed microseconds and multiplies by original binary64`[5dc6e0]`, bytes`681d554d1075ff3e`, exactly`0.000029999999999999997`. `489cd0` converts QueryPerformanceCounter/frequency to whole microseconds using integer64 arithmetic. Scale019 Evidence`ev_ca593b36e916fd9afe3c879d18fb267804561440784f3db5bd42cc6c13eb3aec`; clock assembly010 Evidence`ev_38b8d5dfff1b32d7bb9ba4457b9681775a4c160c95e12a9b821e21a9e17e4f64`; platform-clock assembly021 Evidence`ev_ff29e60114cb96f219e316aff00030e0be8766dec59f42ce80cd1df1bc5b8288`.

`441c70` first initializes clock origin`6e66b0/b4`, clears backlog streak`6e66e4`, sets delivered count`6e66f8=1` and returns1. Subsequent **offline** calls always return1 and increment delivered count, regardless of elapsed wall time. Only network flags`6eafe0` with bit1,bit80 and either bit2/4 admit catch-up. A deficit2/3 must persist for ten consecutive eligible calls before catch-up; larger deficits immediately set streak10. Catch-up is capped at3. Ineligible calls clear the streak; delivered count wraps32bits. `advanceRaceStepCount` ports this exact integer tail after native time conversion. It does not claim to implement the CRT's full uint64/double conversions.

Parent`450d60` calls`441c70`, then executes`450e50` with EDX iteration0..count−1 and stack argumentcount, stopping if the race update returns0. Its pause/background path can advance sample counter`6e675c` without executing physics. Parent assembly001 Evidence`ev_7b9bed3c32690505a0fc371b3be2907a87296a209fb2d9165e2ccc4962b64f87`. `440930` is its caller: it gates updates on alternating `6e66c4` unless the engine object`+5c` is zero, and passes foreground status as ECX. Entry/input/render/platform pacing is not reproduced merely by adopting30Hz in a browser scheduler. Original wall-clock observation remains required.

## Numerical context

CRT helper`56927d` invokes `_controlfp_s(NULL,0x10000,0x30000)`, requesting53-bit x87 precision through the CRT abstract precision mask, and returns at`569298` on success. It does **not** set rounding bits. Assembly013 Evidence`ev_a43d5d55e0be3531ab8c43f55016c632762be104a65b6dd23696d6d3bd892cc6`. Its call at`568673` is an actual decoded instruction, although Ghidra does not assign that containing startup body: instruction043 Evidence`ev_6ee990f9a379fd1f6526cd93e6f313f7939f23c2b0e39a2359ca19eebe8f4e08`. The startup `_initterm_e` table includes`5685d4`, whose retained byte span contains that call: table044 Evidence`ev_04d65393b3d8f4e20347ed1cc876cfc8cf2705c43620af568df207048c70e8df`. This static evidence does not establish the later live rounding modes, exception masks, SSE flush-to-zero/denormals settings, or absence of Direct3D/library changes.

`decodePhysicsNumericalContext` requires actual supplied x87CW/MXCSR, decodes their rounding independently, reports x87 precision, masks and SSE FTZ/DAZ, and supplies no invented defaults. A useful bounded capture point is **WinMain404d70**, called at`568802` after `_initterm_e` and `_initterm` but before game/menu work. Entry035 Evidence`ev_d404d09562cf89ed3c884a71333b6e77991c38aaeae9da163ff6ea52deb530fd`. Physics-stage captures must separately establish any later context changes.

## Validation and remaining work

`node --test tests/race-clock.test.mjs`: five focused tests pass (timer wrap/fractions and actual HUD formatting, gravity options, catch-up persistence/capping/wrap, independently captured numerical modes). `node tools/verify-physics-clock-instructions.mjs` matches1024gravity cases and2772clock cases/95402interpreted instructions. It compares all mapped memory above`10000h` and the scheduling return value. Gravity's full-startup children and platform/CRT conversion are declared boundaries; no complete startup, render loop or original-process equivalence is claimed. Immutable report: `analysis/physics-clock-elevated-20261022/instruction-check.json`.

`node tools/inspect-physics-clock.mjs [original-executable] [new-report-path]` independently checks exact target SHA, PE file mapping and gravity initializer; its raw E8 scan is explicitly a candidate search, not decoded reachability evidence. Optional report writes refuse overwrites. Initial unprivileged REA errors are preserved in the separate `analysis/physics-clock-20261022` directory; the approved elevated static session supplied the successful Evidence above. Installed files remain read-only.

Outstanding: uninterrupted original wall-clock/race-stage timing, full engine/render pacing and pause/restart transitions, later live numerical contexts, comparison of controlled physical trajectories, and interactions outside the isolated gravity/scheduling proofs.

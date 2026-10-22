# Physics numerical context

The original Redux process has now been observed with **24-bit x87 arithmetic precision and nearest-even rounding at the first physics frame**. Exact PC24 arithmetic is now available in the bounded interpreter and connected to attachment transforms; its historical default and other runtime operations still use JavaScript binary64. It does not mean every floating-point operation in the physics needs changing.

## Original-process observations

The SHA-verified executable is `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. The primary agent acquired these bounded instrumented captures; this numerical audit did not launch a target:

| Retained local capture | Stage (original RVA) | x87 control word | MXCSR |
| --- | --- | --- | --- |
| `analysis/native-physics-local/startup-20261022/post-crt-capture-v2` | WinMain `0x4d70` | `0x027f` (53-bit, nearest-even) | `0x1fa0` |
| `analysis/native-physics-local/startup-20261022/post-device-capture` | renderer cache entry `0x118cb0` | `0x007f` (24-bit, nearest-even) | `0x1fa1` |
| `analysis/native-physics-local/startup-20261022/attract-capture` | first `0x4749e0` physics-frame entry, RVA `0x749e0` | `0x007f` (24-bit, nearest-even) | `0x1fa0` |

ASLR loaded the main image at `0x6e0000`; for example, the captured physics EIP is `0x7549e0`. Original addresses must be converted through the observed module base, not treated as live absolute pointers. The legacy-named capture includes native session construction, race startup, race-update entry and physics entry. The user pressed Start in the launcher. Despite the legacy name`attract-capture`, actual launch ECX3/EDX1, config mode3 and constructed session551=9/58c=0/body718=10 identify a manually entered race with unknown subsequent external inputs. It does not establish an AI demonstration, controlled replay or unattended launch. The observed physics-entry numerical context remains valid.

The subsequent `analysis/physics-native-hidden-idle-20261022/report.json` independently confirms CW`007f` at first physics entry through the native idle-demo route: six mode8 participants, session mode0/attract1, no external Start press or driving. Its hidden/windowed, launcher/movie-skip and foreground-query interventions are declared in the retained configuration and trace. This successful unattended run remains an entry-context observation, not a controlled trajectory comparison.

These MXCSR values all select nearest-even, with DAZ and FTZ disabled. Low exception-status bits differ; those sticky flags are observations, not a rounding-mode transition. All x87 exception-mask bits are set in both captured control words. The exact producer of the 53→24 precision change is not established by these endpoint captures. Do not assert a specific Direct3D call caused it without tracing that boundary.

Folder/registry/audio/temp service adapters and software observation breakpoints are explicit capture interventions. The original process was stopped at bounded stages. Debugger wall time does not establish native frame cadence. Raw captures remain local/ignored; retain portable reports separately for published claims.

## Static audit and affected sites

The audit inspected retained `procedure_assembly` evidence in `analysis/scene/results` and `analysis/native-simulation/results`, plus the corresponding source/interpreter implementations. This bounds the search to retained functions; it is not an exhaustive disassembly of the executable or proof that every listed function executed in the attract trace.

| Site | Arithmetic and consequence | Retained evidence |
| --- | --- | --- |
| `0x422c70`, used by sphere contacts and raw float-vector normalization | FILD→FSTP binary32 loads, SSE MULSS/ADDSS/SQRTSS/DIVSS, then FLD→FISTP. There is **no x87 arithmetic operation** here to which PC24 applies. PC does not round FILD or FLD loads; memory stores use destination width, and FISTP uses RC. Existing `Math.fround` steps describe the SSE lanes, not general x87 emulation. | `ev_6aa80b28f8c9a4edddf3ad665cdca5c737ef7f2acabfb01dfdc68035a31d8ac7`, retained `3137-object-stage-422c70-assembly.json` |
| `0x432080`, reached by `0x44f050` attachment processing and track-object point transforms | Nine FMUL and nine FADDP instructions precede three FISTP results. Each arithmetic instruction rounds at PC; final integer rounding alone is insufficient. Source and interpreter now support explicit exact PC24/53/64; historical callers remain53/default Number-stack unless opted in. | `ev_4f11390a164e680ba1a045c162466cf9d6cf45d3f937cf146a50973151aa1984`, retained `3147-object-stage-432080-assembly.json` |
| `0x432320`, `0x432470`, `0x4323f0` | x87 multiply/add and reciprocal projection in weather transforms. Relevant to renderer precision consistency; not established as a core vehicle-force dependency. | `ev_9864be99b5db6c672208fa88e7980381e6540913a41de4e511220832fa1858eb`, `ev_8b76d265aec3159b9ffb4446c945a4b8c5893cd66dd2a226090f5462fbe2a8ed`, `ev_f2b6b5e3100c871a50038acd41938c24bf77e7b99e1a69e7d15e0149e28fb60c` |
| `0x4a90f0`, `0x4a7c10`, `0x4997f8` | Retained x87 multiplication in audio gain/spatial audio and procedural texture storage. Separate from the current physics-fidelity target. | Retained `12287-sound-manager-update-mixer-gain-assembly.json`, `12361-audio-spatial-4a7c10-assembly.json`, `2437-procedural-texture-storage-assembly.json` |

In `tools/lib/bounded-x86.mjs`, the historical default retains its JavaScript Number stack and final FISTP rounding. Explicit constructor option`fpuPrecisionBits:24` (also53/64) selects exact finite-value loads, arithmetic, destination-width stores and FISTP conversion using the independent primitive below. SSE remains separate. Existing instruction matches retain their original scope unless the report explicitly selects exact precision. Instruction admission and unsupported-domain bounds remain narrow; this is not a general x87 machine.

A concrete bounded attachment-row example uses translation `19529`, point `[2016,-26177,-9198]`, and Q12 coefficients `[-1127,0,-3938]/4096` (a rounded rotation row). Sequential binary64 evaluation yields `27817.4990234375`, then nearest-even integer `27817`. PC24 arithmetic yields `27817.5`, then integer `27818`. This is a synthetic arithmetic counterexample, not an observed Redux trajectory divergence.

## Bounded primitive and hardware check

`src/x87-finite.mjs` is an independent primitive, now integrated into the opt-in interpreter path and`432080` attachment transforms. It uses BigInt dyadics and exact rational rounding for add/subtract/multiply/divide, plus an integer-root midpoint comparison for square root. It accepts explicit PC24/PC53/PC64 and RC settings, keeps FILD/FLD loads exact, and rounds memory stores independently of PC. Its extended exponent range prevents incorrectly substituting `Math.fround`, whose exponent range is binary32. Exact rational operations also avoid a binary64→binary32 double-rounding boundary.

The supported arithmetic domain is finite zero/normal extended values. Extended-subnormal arithmetic, overflow, NaNs, infinities, exception/status emulation, transcendental instructions and stack/tag state are deliberately rejected or absent. Binary32/binary64 memory-store subnormals and signed zeros are supported; memory-store overflow is rejected. Integer conversion returns both the result and masked-invalid indication. This is not a general x87 emulator.

`tools/prepare-x87-precision-fixture.mjs` prepares an independent x86 opcode probe without executing it. `tools/check-x87-precision-fixture.mjs` validates a separately acquired capture against literal expected results and the bounded helper. The primary agent's retained `analysis/native-physics-local/x87-fixture-20261022/capture` matched all eight declared fields in both PC24 and PC53: exact integer load, arithmetic-rounded add, `2^200` product, an above-midpoint rational division, sqrt(2), binary32 store, control word and nearest-even integer store. The native status word was `0x20` in each pass; full status-flag equivalence is not claimed. This fixture contains no game code and establishes only those hardware cases.

`node --test tests/x87-finite.test.mjs` covers explicit context, exact loads, ties/signs, directed rounding, extended exponent range, rational double rounding, square root, subnormal memory stores, integer overflow indication, unsupported-domain rejection and the attachment counterexample.

## Attachment integration and remaining work

1. Preserve a numerical-context field per captured/native thread and carry it into replay; initialize from observed race-stage `0x007f`, rather than from WinMain's earlier state.
2. The opt-in exact x87 stack and`432080` source integration are complete. `transformAttachmentPoint(scratch,roundingMode,{x87PrecisionBits:24})`, structured/raw queue options and authored-object runtime propagate the captured setting. Default53 preserves historical callers. Other transform consumers and x87 sites must be opted in explicitly; no global native-physics precision closure is claimed.
3. New reports in`analysis/attachments-x87-20261022/` match3072 direct retained-transform cases,1600 PC24 raw attachment/spatial cases and2400 PC24 authored metadata/allocation cases. Historical4000 structured,1600 raw and2400 metadata cases were rerun separately with their original precision scopes. The concrete27817-to27818 difference is covered through direct, structured, raw and authored source calls. These checks use the shared hardware-checked arithmetic primitive, so their independent contribution is native sequencing/storage/propagation. A native transform/trajectory capture remains separate. The SSE normalization path is unchanged.
4. Run controlled original-process physics-stage replays before claiming trajectory equivalence. PC24 fixes one established numerical-context gap; it does not replace timing, initialization, collision and force comparisons.

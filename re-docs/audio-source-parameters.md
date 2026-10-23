# Native source gain and frequency parameters

`src/audio-source-parameters.mjs` implements `4a7c10` and the nonspatial,
effect-free branch of `4b12d0`. These are game-owned descendants of the
background source consumer, not a simulated worker schedule or a replacement
for its manager update.

```js
updateAudioSourceFrequency(manager, source, force, {
  memory, scratchBase: entryEsp, moduleBaseAddress,
  xmm2: {bits: incomingXmm2LowWord}, entryRegisters, services,
});
updateAudioSourceParameters(manager, source, force, {
  memory, scratchBase: entryEsp, moduleBaseAddress, entryRegisters, services,
});
```

The frequency function requires the actual incoming XMM2 low float, supplied
as a number or `{bits}`. The outer nonspatial branch loads the original image
literal itself. Both functions use the real caller stack and preserve native
argument overwrites, saved-register words and CALL return words. Only known
image literals, function identities and return addresses use
`nativeCodeAddress`; heap addresses and scalar data are never rebased.

## Actual game children and behavior

`4a7c10` derives frequency from source `+440h` and XMM2. A populated decoder
runs actual `4ad760`, including its block-alignment WORD and average-byte-rate
DWORD writes. A streaming decoder invokes its known `4b3ed0` format-pointer
getter when the native flag/pointer selects it. Decoder rate conversion is
**signed**, whereas waveform rate conversion is **unsigned**. The null-format
case reads the original `5dcaac` fallback literal.

The actual `4a79f0` mixer lookup executes its real vector traversal, ID getter
and game lock-wrapper stores. Its effective-rate getter `4a9370` loads mixer
`+3ch`; the frequency caller performs the original x87 multiply/store. The
source `+988h` cache records the rate/frequency product **before** voice-limit
clamping. An equal cache skips both voice setters unless the force low byte is
exactly one. Unordered NaNs take the native update path. Return EAX includes
the comparison's LAHF overwrite when setters are skipped, and always ends
with AL equal to one.

The bounded `4b12d0` parent obtains effective gain through real lookup and
`4a9340`. It multiplies the two source gain fields and mixer gain, applies the
original negative clamp and float32 cube, then updates source `+984h` and
calls the voice volume setter when required. The later COMISS/JA converts an
unordered gain to positive zero for that call. It executes real `4ae4a0`
virtual effect queries, reading source `+9a0h`, before and after its genuine
frequency child. A nonnull effect or spatial flag exactly one reaches an
explicit dependency error. The implementation does not clear those fields or
select the supported branch on the caller's behalf.

## External service contract

The caller supplies genuine Win32 locking/thread-ID outcomes through the
existing factory service interface. COM calls use
`services.xAudio2Call(voice, slot, args, context)`, with `args` including the
voice pointer and `context.interfaceTarget` equal to the actual vtable method.
The call returns an integer EAX or `{eax}`. Original slots are `30h` for gain,
`68h` for frequency ratio and `70h` for source sample rate. Null interface
targets are rejected.

`services.convertFloatToInt64(value, context)` represents the genuine
`568a60` CRT boundary and must return a signed 64-bit BigInt. The port uses its
low DWORD exactly as the game does. It supplies the original conversion CALL
return word and does not invent exceptional CRT outcomes. No game child is
supplied through an external callback.

## Evidence and numerical checks

The target SHA-256 is
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
Retained `12361` covers `4a7c10`; `12339` covers `4b12d0`; existing `12359`
covers the stream getter. Fresh read-only evidence is preserved under
`analysis/physics-audio-parameters-native-20261023/`, with an exported
five-record bundle. Exclusive copies `15012` through `15016` in the ordinary
retained results directory make it available to existing instruction loaders.

| Entry / data | Evidence |
| --- | --- |
| `4a9340` effective gain | `ev_45b389ca6b1b941b2f093aed2906c71941fc6915ce93d35c071cffb13f68ac78` |
| `4a9370` effective rate | `ev_a7e42b1834059be7628138c34f8e13a7ae6592538f1a9450aafcf5acd1e38f6c` |
| `4ad760` decoder rate | `ev_376b9b95f302f4a97aafe52771bbb92555a3b8983cff78028d4e354f8fbf3b62` |
| `4ae4a0` effect query | `ev_69954062de813ddf14b6183ee19fde0e4642089592d44febefb93bc79b512fa1` |
| Original frequency literals | `ev_d8b91b76f34971dc0aaa948320e5b1c34e6317f7118b0f95e0760fe14c5f33e0` |

Source SSE multiplication carries NaN payload bits explicitly, avoiding JS
JIT canonicalization. The independently specified rules come from
[Intel SDM volume 1, table 4-7](https://cdrdv2-public.intel.com/782149/253665-sdm-vol-1.pdf).
Legacy SSE chooses its first source NaN and quiets signaling NaNs; the x87
mixer multiply instead selects the larger quiet-NaN significand. The positive
sign tie rule also agrees with the original
[QEMU x87 propagation implementation](https://qemu.googlesource.com/qemu/+/313938c105946dacfc886217b47310adb01194c3/fpu/softfloat-specialize.c.inc).

The larger corpus exposed a reference-interpreter defect: arithmetic retained
stale low scalar bits or allowed JS/JIT to choose a two-NaN payload. The narrow
`BoundedX86` fix covers only scalar `MULSS`, `ADDSS`, `SUBSS`, `DIVSS` and
`SQRTSS` result bits. It explicitly records the selected quiet NaN or masked
invalid-operation FP-indefinite result and replaces the stale bit cache.
Independent constructed-instruction tests verify signaling/quiet and signed
payload permutations, square-root source selection and finite controls.

`tools/verify-audio-source-parameters-instructions.mjs` compares constructed
inputs against retained original game instructions. No original process is
launched. Final reports are:

| Report under `analysis/` | Cases | Reached instructions | Steps |
| --- | ---: | ---: | ---: |
| `audio-source-parameters-frequency-final-20261023.json` | 240 | 156 | 30,414 |
| `audio-source-parameters-nonspatial-final-20261023.json` | 160 | 244 | 41,109 |
| `audio-source-parameters-frequency-aslr-final-20261023.json` | 48 | 156 | 6,064 |
| `audio-source-parameters-nonspatial-aslr-final-20261023.json` | 48 | 244 | 12,328 |

Each compares all mapped bytes, or every declared sparse span, including the
private stack; ordered external argument/return-site records; complete EAX;
preserved registers; and balanced entry ESP at the original `RET 8`. The
interpreter stops at its outer sentinel before the final RET pop. Relocated
cases load the unchanged original PE, apply its actual HIGHLOW relocations,
and compare the same game instructions against strict sparse source storage
without preferred-address aliases. Fixtures vary rate signedness, decoder and
stream branches, unknown mixer IDs, scale/gain, NaNs, infinities, denormals,
cache equality and force bytes. These are constructed-memory comparisons,
not native background-thread runtime evidence.

`node --test tests/audio-source-parameters.test.mjs tests/bounded-x86-scalar-nan.test.mjs`
passes nine tests. A broader run including mixer/control/playback and the
affected interpreter scalar, projection, procedural and x87 regressions passes
38 tests. Final report `source` rows retain SHA-256 for the frozen source,
interpreter and checker files.

Floating-point exception flags, unmasked traps, arbitrary MXCSR rounding or
DAZ/FTZ, and an exhaustive x87 extended-precision/double-rounding domain are
not established by this batch. The instruction interpreter's ordinary x87
Number path remains distinct from its separate exact finite x87 mode.

## Remaining connected-parent gap

These standalone descendants are not wired into the frozen V12 replay.
Its existing strict concurrency failure remains unchanged. Explaining the
observed game-wrapper writes still requires the actual background manager
consumer `4a6600` / `4a6b60`, original thread-object/caller identity and a
declared interleaving. The separate main-thread active-vector growth still
lacks 560 of its 564 original allocator-return bytes. This implementation
neither imports later allocation output into earlier state nor treats any
manager/vector write as a GetCurrentThreadId result.

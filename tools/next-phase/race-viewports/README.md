# Isolated next-phase race viewport parent

Historical freeze-time package. Canonical `src/race-viewports.mjs` now uses
actual game defaults throughout the viewport graph; see
`re-docs/race-viewports.md` and `tools/verify-race-viewports-instructions.mjs`.
The isolated contract checks below remain as provenance and focused boundary
probes, and no longer describe the canonical reconstruction's current limits.

This directory implements the complete `450a90` parent while canonical sources,
tests, shared libraries, instruction checkers and REA evidence remain frozen.
**It does not close the viewport feature and is not integrated into `src/`.**

`parent.mjs` exports `initializeRaceViewports(runtime)`. Runtime supplies shared
`memory`, native entry ESP in `scratchBase`, optional original `entryRegisters`,
and these interfaces:

- Missing game contracts `handlers.call471770`, `call42ef80`, `call404020` and
  `call406b80`, receiving `{memory,ecx,edx,args,scratchBase}`.
- Existing application-bootstrap services: `handlers.allocate`, `free`,
  `registerExit`, `dynamicCast`, plus `services.platformCall`.
- True CRT `services.crtCall('_itoa',[ordinal,output,10],runtime)`.

Actual `getRaceStageCount`/`41bef0` and `constructViewportApplication`/`403430`
are imported from their existing recovered modules. The latter executes its
actual Application/debugger constructors, registration vectors and platform
critical-section services; it is not replaced by an opaque constructor callback.

The port preserves the unconditional `471770` then `42ef80` prefix. The latter
receives **four** arguments: ECX from `5ec120`, EDX from `5ec124`, then two stack
words from `5ec128` and `5ec12c`. Creation is gated by `6e6758`, which becomes1
before any named view is created. The count stays live at every loop iteration.
Names use the view ordinal, while rectangles come from the selected participant
record's `+8/+c/+10/+14` DWORDs. Existing singleton state is checked repeatedly,
including after each game contract. Width/height remain unsigned16 inputs;
negative cinematic coordinates for small dimensions are preserved.

For parent entry `S`, its saved-register frame is `S−60`. Initial game entries
are `471770: S−64`, `42ef80: S−72`; definition and enable entries are respectively
`S−84` and `S−72`. Pending call arguments are stored in raw memory and reloaded
after CRT RTTI, preserving mutation aliases. The player rectangle Y local is
reloaded after an actual lazy constructor/atexit path. The parent cookie, local
string clearing/copies and defined saved-register inputs are retained.

## Evidence and checks

Retained parent assembly is `9009-startup-child-450a90-procedure_assembly.json`,
206 instructions/716 bytes, Evidence
`ev_f683c976647eb7567de682f857fb469f612ac797405be1ed6d5327d9d53c0516`.
The corresponding pseudocode is9008. All target evidence uses Redux SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

`extract-literals.mjs` independently reads the installed PE, verifies that exact
SHA256 and maps virtual addresses through its raw section table. It retained
`" Player"`, `"Rear View Mirror"` and `"Cinematic Window"` in the new file
`analysis/race-viewports-next-phase-literals-20261022.json`. This is a read-only
artifact extraction, not original-process execution or new REA evidence.

Commands:

```text
node --test tools/next-phase/race-viewports/parent-check.mjs
node tools/next-phase/race-viewports/check-parent.mjs 1200
```

Seven tests pass. The native comparison passes **1,200 fixtures,589 reached
instructions and509,103 steps**, including450 actual Application constructors,
4,056 named-definition contract calls and2,136 enable contract calls. It compares
all mapped bytes at or above`10000h`, defined parent locals, ordered raw game
contracts, CRT/platform requests and restored synthetic FS exception chains.
It includes240 already-created gates,31 live-count changes,33 allocator/local
mutation fixtures and142 RTTI/pending-argument alias cases. Service/contract
mutations are identical independent fixtures; their outputs are not extracted
from the native result to patch the source.

The saved report is
`analysis/race-viewports-next-phase-parent-check-20261022.json`. New extraction
and saved reports refuse overwrites. Use `--save` only when the new report path
does not already exist; ordinary reruns do not write outputs.

## Required next work after freeze

Obtain complete bodies and transitive calls for **471770,42ef80,404020,406b80**.
None has an instruction entry in the current retained program. Do not replace
their contracts with guessed semantics. In particular, the existing viewport
string/map helpers in `weather-viewport.mjs` are useful infrastructure but do not
prove what `404020` or `406b80` writes.

Trace the actual producer of `5ec120..12c` and participant rectangle DWORDs;
`471770`/`42ef80` are leading candidates from caller order, not proven producers.
Those roots also feed existing camera/weather consumers. Confirm loader/session
ownership and `6e6758` reset lifetime, then exercise actual setup-to-consumer
chains before canonical integration. Only genuine CRT/OS services should remain
external once those game children are recovered.

No original process was executed, installed bytes were not modified, no REA
requests were queued and no frozen canonical file was edited.

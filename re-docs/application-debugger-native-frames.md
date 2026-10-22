# Optional native debugger frames

The existing application-bootstrap APIs keep their default semantic behavior. Raw callers can now request exact original frame producers:

- getApplicationDebugger(runtime) accepts nativeDebuggerFrame:'wrapper' for4a0e80 or'direct' for4a2290. It requires actual incoming entryRegisters.ECX and native scratchBase; EBP is supplied when its saved word matters. The wrapper publishes its aligned call and saved EBP. The singleton publishes PUSHECX, guarded lock/exit-registration calls and actual4a0e90 constructor pushes at their original points, retaining reentrant publication and owner/count reloads.
- getAudioDebuggerCategory(runtime) accepts nativeCategoryFrame:true for4a91d0. It publishes its SEH words and, on a cold category, the original name argument, wrapper call, registration call and inherited context.
- registerApplicationDebuggerName and appendApplicationDebuggerRecord accept nativeDebuggerRecords:true. NEW application-debugger-records.mjs implements4a1840/4a1a20 registration,4a23a0 alias append,4a2510 growth policy and4a2670/4a2940 allocation/forward DWORD-copy/deletion producers. Capacity decisions retain native signed/unsigned widths, source offsets are captured before growth and rebased afterward, and live vector fields are reloaded after services.

Genuine CRT allocation/deletion/exit registration and Win32 locks/thread ID remain runtime services. Their exact call entryESP is supplied. No original process is run; no callback is treated as a substitute game algorithm.

verify-application-debugger-frames-instructions.mjs passes2400 cases/833 real constructors/97 reached/124045 steps with every mapped byte and256 private bytes compared. It includes direct/wrapper alignment, incoming ECX/EBP, guard states and reentrant platform/exit-registration changes.

verify-audio-debugger-category-instructions.mjs passes2400 cases/343 reached/154770 steps with all10MiB mapped bytes,4KiB private stack, TLS and ordered services. It executes600 categories,800 primary registrations,600 secondary registrations,1805 appends,400 real allocations/copies and40 singleton constructors. Cold/guarded categories, disabled/enabled debugger state, empty/full vectors and aliased unaligned records are covered. Focused tests also verify actual growth records, wrapper stack words and rebase behavior.

The existing600 bootstrap,1200 loaded/error database and600 XAudioManager comparisons retain their exact semantic metrics after rerun. New immutable outputs are application-bootstrap-category-frame-regression.json, sound-manager-category-frame-regression.json and xaudio-manager-category-frame-regression.json; the prior historical reports remain intact. Source hashes change for the optional APIs, so consumers should use the new provenance output when recording current source.

These hooks close consumed private words reached by the audio parser/resampler. They do not claim native exception unwinding, allocator failure propagation, arbitrary opaque CRT internal frames or all debugger output/lifecycle paths beyond the existing reconstructed functions.

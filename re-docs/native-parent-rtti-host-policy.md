# Scoped native parent CRT observer host policy

This implements the separately prepared `parentRttiObservation` contract from `tools/lib/native-parent-rtti-capture.mjs`. It observes the original CRT call, supplies no return value and performs no gameplay writes. No original game or executable fixture was launched during this implementation. The typed source adapter and retained instruction/import proof remain documented in `native-parent-rtti.md`; actual original-process scoped RTTI evidence is still pending.

## Capability, selection and original checkpoints

`NativeDebugger.GetCapabilities()` declares `scoped-parent-rtti-and-singleton-map-preflight-v1`. An active profile also records that capability in the capture header's `helperCapabilities`. Existing profiles retain their prior header and execution path when the option is absent.

C# validates the same frozen purpose policy, ordered15 sites, exact three startup observations/actions, security/window/document policy, target SHA256, one selected parent and map/CRT descriptor contracts as the JS profile. It retains the13 original observations and admits at most eight extra CRT snapshots, for21 total; duration90 seconds and one million debug events remain unchanged. It cannot combine held-force, controlled-settings, worker, pending-frame or legacy observation-activation policies. No extra startup/game writes are permitted.

Foreign-thread parent checkpoint hits are rejected before phase-predicate matching, parent latching or map reads, without advancing matching/snapshot counters. On the first selected owned-main450e50 entry, the host latches actual U/clock/iteration, incoming nonvolatile registers and original caller/iteration words. All ten original parent checkpoints must then follow in order with the actual derived child stack and unchanged parent identities. This preserves every checkpoint; no native observation is substituted for carried source state.

## Conditional singleton/map input observation

At selected parent-before, after-cameras and after-world-effects, a purpose-specific preflight runs before resolving any **snapshot** ranges. The existing phase predicate has already been read to select the configured skip/matching hit; records explicitly say so. The preflight is on the owned main thread within the same uncontinued debug event.

It observes DWORD at actual root RVA2efb38, requires nonzero APP, then observes DWORD at actual APP+7c and requires nonzero head. Bounds are checked before pointer addition. Null short-circuits before chasing; an unreadable nonnull pointer such as16 is a real read failure, never classified as null. The initial actual APP/head identities are latched and must be stable at both later points. There is no resume between this check and the following range resolution/read.

The separate fixed100-byte guarded head row and nonnull readable-region row capped at16 MiB retain their original meanings. This policy adds no generic guarded-pointer/readable-region combination, assumes no capacity from the region and provides no replacement map. Only original parent-entry coverage can supply source input; later map bytes remain observations for comparison.

## Deferred camera window and external pairs

402d86 and402d8b remain entirely unpatched at startup. After the selected4510ef auxiliary snapshot's complete bytes/context/files are captured, the host verifies both original instructions/counters and arms only those two sites. The call must remain `e89f651600`; the return site must remain `83c414`. It then records activation and publishes the auxiliary snapshot with the identical activation annotation, before resuming that original instruction. Capturing bytes and publishing the JSON row are distinct lifecycle states; activation before capture or after publication is rejected.

Inside the window, an endpoint first needs the selected main TID and Q=U−276 before any argument/registered range reads. Its actual clock must match. The actual52-byte stack observation must prove the common41a0c3 wrapper: Q+40 returns to actual41a0c8, mode1 at+44, original name pointer U−60 at+48, and Q+256=U−20 contains actual451107. The five actual arguments are `[latched APP,0,actual6e213c,actual6e20a4,0]`. Foreign threads, other stack depths/callers and closed/outside windows produce explicit counter-neutral skip records and execute their original instructions normally.

Each accepted call opens one pair; its post-call observation must have the same main thread/Q/clock/caller/arguments. Nested, unmatched or fifth pairs fail. Private stack bytes20..39 are retained raw and may change; they are not reconstructed or supplied to source. The actual returned EAX and complete raw context are captured without inventing an allocation, null fallback or game-child result. The typed source adapter separately requires original initial84-byte coverage of the returned pointer and rejects unsupported outcomes.

451111 closes the observation window before its snapshot range reads. It requires no open/unmatched pair. The two INT3 guards remain armed through the terminal world checkpoint so existing queued owned-breakpoint replay obligations remain intact; later calls are explicitly skipped rather than observed. Completion requires all ten selected parent checkpoints, three map preflights, exactly2N CRT snapshots for N≤4 and exactly13+2N total snapshots. A zero-pair window is reported truthfully; it cannot supply a missing source CRT call.

## Proof records

Each proof includes owned PID/TID, parent entry debug ordinal/U/clock/iteration/caller and its actual observed debug-event ordinal. Independent records are embedded unchanged in the relevant snapshot, including their emitted elapsed time:

| Record | Snapshot annotation | Meaning |
| --- | --- | --- |
| `parent-rtti-map-preflight` | `parentRttiMapPreflight` | Actual root/slot DWORDs, APP/head pointers, initial latch or stable identities, before-range/same-event proof |
| `parent-rtti-activation` | `parentRttiActivation` | Auxiliary bytes already closed, exactly two verified code patches, before snapshot publication/original instruction |
| `parent-rtti-admitted` | `parentRttiObservation` | Call/return role, pair index, raw hit, derived Q, exact52-byte stack, camera return, clock/singleton DWORDs and five arguments |
| `parent-rtti-closed` | `parentRttiClosure` | Actual pair/snapshot totals, closed window and no open call before camera range resolution |

Per-site `parent-rtti-breakpoint-activated` rows retain original full instruction bytes and patch identity. `parent-rtti-skipped` and `parent-rtti-checkpoint-skipped` explicitly retain counter-neutral exclusions. Failed map preflight is retained separately and aborts before the optional graph ranges. Completion's `parentRttiObservation` includes the ten checkpoints, three startup snapshots, pair/snapshot/preflight totals and closed/no-open state. The independent JS provenance verifier is owned separately and must check actual records before a future positive runtime claim.

## Pure validation and remaining limits

Four focused tests in `tests/native-parent-rtti-host-policy.test.mjs` pass: full typed validation plus28 independent profile/security/write mutations; lifecycle and max-four ordered pairs including capture/activation/publication order; null/unreadable/foreign/outside pointer admission and identity stability; exact original opcode/counter guards and actual runtime source ordering. All use `-NoProfile -Command` pure C# calls, hidden windows and timeouts. They execute no target code, create no device, modify no settings/security policy and launch no native fixture.

These tests and constructed JS adapter records establish the host contract, not a native CRT result or full parent match. Full wrapper private ABI/SEH, unsupported camera/weather callers, new allocations, map-node/service producers, broader renderer startup and general interleaving remain independent bounds. Original-process observation and semantic comparison require root's separately reviewed, announced capture and final verification.

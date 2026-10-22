# Attachment and persistent particle emitters

`src/attachment-effects.mjs` implements the complete reached game graph for two `450e50` stages: queued attachment effects `44f3a0` and ten persistent emitters `44f990`. The actual particle creator `44f7a0`, type2 scalar propagation `44f740`, allocation/reuse `435df0`, spatial removal/insertion and bucket lookup are included. The outer race update binds both stages by default.

## Native behavior

`updateRawAttachmentEffects({memory})` captures the queue count at6e6b1c and traverses body pointers at902f00. Session byte552 enables in-place duplicate removal and clears6e6b20. This is the original advancing swap-removal scan: it advances even after replacing a duplicate. It does not promise stable ordering or the behavior of a JavaScriptSet. Queue entries remain retained after the count is cleared.

Up to five unsigned handles atbody+16a are read until a zero high nibble. Type2 updates an active target's field90 from every reached type1 handle's64-byte scalar row; the last such handle wins. Type3 increments a signed16 cadence counter in the level+108 twelve-byte target table and emits a type27 particle on reaching3. Type4 uses the level+10c table and emits type28 every visit. Level/queue/body pointers remain native memory, with no inferred semantic replacement.

`emitRawAttachmentParticle(target,type,vertical,jitterBase,flags,{memory})` uses the real free/active allocator and spatial insertion. It preserves the native low16 vertical argument, a32-bit masked shift count, RNG order, saturated doubled RGB, alpha255, mesh selection, retained unrelated fields and caller-owned size/lifetime publication. In particular, type3 supplies a full product whose low16 bits are zero; the routine does not reinterpret that argument as a full Q16 velocity.

`updateRawPersistentEmitters({memory})` scans ten20-byte records beginning6ff140. A positive remaining duration decrements before a signed16 cadence update. A reached emission performs two RNG steps, selects the next interval from the first seed's high bits, applies the below450 remaining-duration color change, and creates a type34 particle. The initial mesh pointer and RNG are captured once, with native reloads after an emission. Size, lifetime, coordinate shifts, alternate-mesh flag and color saturation retain their widths.

`activateRawPersistentEmitter(position,{memory})` implements44f910. It captures cursor6fbb14, selects a20-byte row at6ff140, writes cadence4 before sequential source-position high-word reads atinput+2/+6/+10, then sets color404040, duration900, interval4 and flag15hex. The unsigned32 cursor increments and wraps using the original comparison against10. Readable out-of-range and wrapping cursor cases preserve native arithmetic rather than enforcing an invented0..9 precondition. Source/destination overlap is intentional and tested.

## Validation

`node tools/verify-attachment-effects-instructions.mjs` passes **766 unique retained instructions**, **1600 fixtures across allfour entry points**, **6400 calls** and **2980483 interpreted steps**. There are9956 actual allocations/registrations,2331 spatial removals,3950 creator visits and3412 type2 helper visits. No callees are mocked and no external services are admitted. Full body/handle/target/queue/persistent-record/free-active/spatial/RNG storage is compared, including pool exhaustion/reuse, signed cadence overflow, flags, color boundaries and termination. Five focused tests verify those behaviors separately.

`node tools/verify-persistent-emitter-setup-instructions.mjs` matches all **22 instructions** over **4000 fixtures/88000 steps**, including1334 overlapping-source cases and921 cursor-wrap cases. Full emitter/cursor/neighbouring/source bytes compare with no callbacks. Three focused tests include actual activation followed by actual type34 emission.

`node tools/verify-attachment-effects-lifetime-instructions.mjs` now uses **988 unique instructions**. Its original **32 scenarios of132 persistent frames**, **4352 calls** and **1123936 steps** retain the relative order438550 advancement,44f990 persistent emission,44f3a0 queued effects. Types27/28/34 execute actual motion and expiry/freeing. Atframe130, active endpoints are empty and spatial membership contains only preexisting type2 targets before reclaimed-storage emissions. These cases record192 emitted particles and96 frees; their final emission set remains active as declared.

Eight additional1060-frame scenarios start with actual44f910 activation and the full native900 duration. They run16976 calls/13710184 steps,16 activations,2016 emissions and1968 frees. Atframe1040 the pool is fully reclaimed apart from the preexisting type2 targets, before actual reactivation and reuse. The source producer's lifetime is not shortened to fit the check.

Evidence1060..1067 retains both parents and both children; existing115/117/118/665/669 and particle-lifetime evidence close allocation/spatial/motion dependencies. Exact Evidence IDs are in `analysis/attachment-effects-instruction-check.json` and `analysis/attachment-effects-lifetime-instruction-check.json`.

These are interpreted native instructions over constructed shared runtime memory. Persistent-emitter activation is now reconstructed; queue/handle/target construction, the activation's full gameplay caller, other effect-family lifetimes and rendered submission remain separate requirements. No original executable or device was run.

## Remaining producer ownership

Xrefs1071/1073 and function analysis1074 identify the queue producer as `46beb0`, called by `48c640`. It traverses packed spatial lists selected through80e4c0/80e1a0, handles flag400 bodies, defers type3 bodies to91e680/91e6a0, and appends other bodies with a nonzero first attachment handle to902f00 only while its captured count is below350. It captures6e6b20 from the incoming count, then publishes the final count at6e6b1c. Reached children perform transforms, screen projection/clipping and object processing. This establishes an interaction with the original rendering traversal; filling the queue from every physics body would not reconstruct this producer. Its caller48c640 and five children remain unported.

Xref1072 and pseudo/assembly1075/1076 establish the now-implemented44f910 producer. Callers1200 identify415230 as its sole direct caller. Pseudo/assembly1201/1202 retain that large placed-object/destruction controller: it mutates geometry, traverses controller phases and route flags, emits particles/flashes/terrain effects, activates fragments and removes spatial objects. This parent remains unported; exposing44f910 does not substitute for its activation decisions. Evidence IDs are retained in the immutable replies; the1077 provider bundle includes1071..1076, and newer exports must additionally retain1200..1202.

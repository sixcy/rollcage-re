# Optional experimental viewer weapons

The standalone Track Viewer offers **Weapons & pickups (experimental)** in the Racing test, enabled by default. Changing the option rebuilds the race; Reset race preserves the selected option and reconstructs the same seeded startup. The bottom-right HUD shows the followed car's two pickup slots, including empty/active states. Labels describe the recovered launch handlers; original frontend wording/icons remain separate. Stage II, Firebugs and LEV16/17 retain their existing static-preview limits.

`createSession(..., {weaponsEnabled: true})` selects native session mode0 and pickup option+0xa86=1 **before** the real constructors. The standalone viewer passes this option by default; API callers omitting it retain mode1/option0. This distinction matters:47b580 gates pickup construction on the mode/option, and47b920 mode1 awards boost only. The existing native pickup, probability, AI policy, launch, projectile movement, collision, force, terrain-wave and retirement routines execute in their existing frame order. No new collection distance, weapon statistics, grant timer or AI fire policy was introduced. Reached missing dependencies still throw; no game-owned callback is replaced with an inert answer.

Presentation reads the actual47b580 pickup list and46a420's24 projectile slots. `assets.weapons` contains the original archive meshes, embedded UV/material packets and decoded texture pages. Immutable `snapshot.weapons.objects` supplies body identity, original model index, native state, visibility and pose; `pickups` additionally retain each authored12-byte placement's signed XYZ coordinates. Gold dots mark these authored spawn locations even while a box is unavailable. Actual boxes become visible only in original active states; exploded projectile bodies hide while their trail state drains. The renderer applies the existing handedness conversion once, and interpolates poses only across the same existing visible state. It never writes a rendered pose back to physics. GPU buffers/textures and spawn markers are released on reload, reset and failure.

Each car's enabled snapshot exposes its two actual+0x68c/+0x68d inventory bytes. The sidebar and bottom-right HUD show descriptive labels based on the recovered47be20 dispatcher, including empty/active states. The names describe behaviour rather than claiming original localized frontend wording. Both slots follow the selected car without changing simulation state. Counts describe currently visible pickups/projectiles. Effect diagnostics expose the actual impulse/damping pending flags, terrain-wave flag and time-scale value. The new `before-weapons` diagnostic stage is enabled-only and read-only. Disabled sessions gain no weapon meshes, inventory fields or enabled snapshot fields.

The browser packer now publishes exported function declarations before requiring child modules. This preserves their hoisted initialization across the genuine `game-network-protocol` / `vehicle-weapon-launch` / `projectile-launch` cycle. Previously the dormant weapon path captured an undefined packet function; executing the actual function also retains its original network guard and stack writes.

## Verification and limits

`tests/solo-experimental-weapons.test.mjs` runs700 complete installed LOW/LEV1 updates in Node and the browser bundle and compares every complete immutable snapshot. With six Expert cars, real pickup startup first makes a box active at tick51; collection starts343; original AI first launches ground slot22 at400. The test follows real movement, state16 detonation at497 with the actual pending impulse, consumption on the following frame, release of the pool slot, a later terrain-wave activation, and deterministic reset. It injects neither inventory nor fire commands. The renderer regression checks native visibility/poses, original texture upload, authored marker coordinates, disabled behavior and exact resource cleanup. Existing weapons-off950-tick, startup/instruction-stage, roster and world-renderer checks also pass: **20 focused tests, no failures or skips**.

`analysis/viewer-experimental-weapons-startup-20261023.json` retains source-only startup and120 complete updates on all36 allowed LOW/HIGH variants, with original input hashes unchanged. Those tracks have0..14 authored pickups. A separate LOW/LEV1 source run completed1800 ticks (60 nominal seconds), reaching six simultaneously visible projectiles without errors. These are reconstructed-source checks using installed assets, **not new original-process captures or proof of continuous native parity**.

The first enabled run exposed a pre-existing three-byte-short5ec408 configuration literal. The failure and source pre-stage/after-state images remain in `analysis/viewer-weapons-first-projectile-failure-20261023.json` and the two `viewer-weapons-*-tick400-20261023.bin.gz` files. Independent retained3162 evidence (`ev_7e90a726d7a555e601824bd1d784e2d8dc2a00183b62d6458a461a23d6f81d85`) proves the exact128-byte template; restoring it gives mass8192/inverse-mass524288. The original479b30 also faults on the malformed source input, so no square-root clamp or altered weapon speed was used. The repaired template has its own independent retained-byte regression.

Audio output, original weapon trails/particles, the wormhole visual pool, HUD icons and complete renderer submission are not drawn. World/vehicle effects can affect the recovered simulation without their complete visual presentation. The bounded host service adapter, remaining unsupported effect branches, native interleavings and continuous race fidelity remain open. This option does not establish weapon parity on all tracks, every projectile state or every item combination.

## Final combined verification

The [default-enabled HUD check](../analysis/viewer-default-weapons-inventory-hud-20261023/report.json)
additionally verifies weapons are checked and active on initial load, both HUD
slots start empty, natural collection displays Wormhole/Triple missiles, and
switching to car3 displays its Empty/Homing missile inventory. All700 browser
ticks still match Node state. Disabling weapons hides the slots; reset, mobile
layout and excluded-level cleanup remain verified. Thirteen generated-page,
renderer and archive checks also pass after this display/default change.

The fixed [36-track matrix](../analysis/solo-weapons-matrix-600ticks-fixed-20261023.json)
passes600 ticks on every allowed variant (21,600 world updates), with91
observed collection transitions and44 projectile activations. The original
35/36 matrix remains retained. [Actual Edge](../analysis/viewer-experimental-weapons-browser-final-20261023/report.json)
passes700 enabled ticks using the real DOM step control, complete Node/browser
state equality every10 ticks, original mesh drawing, inventory/follow selection,
toggle/reset, mobile layout and excluded-level cleanup, with zero page/WebGL/HTTP
errors. A separate default weapons-off Edge check still passes150 ticks.

The [combined regression](../analysis/physics-weapons-parent-tail-regression-20261023.txt)
passes2,384 tests across456 selected files, no failures/skips. It explicitly
excludes the previously security-rejected `native-deferred-breakpoint.test.mjs`;
it is not an unqualified full-suite result. All1,594 implementation/generated
files still match the source freeze afterward, with no additions
([verification](../analysis/physics-weapons-parent-tail-source-freeze-verified-20261023.json)).

## Active shield impulse binding

The broader600-tick source matrix initially passed35/36 variants and stopped HIGH/LEV15 at493 when a natural ground-projectile impulse reached a shielded vehicle. The failed matrix remains preserved in `analysis/solo-weapons-matrix-600ticks-20261023.json`. The missing boundary was the physics parent's active-effect callback, not shield construction: real4820f0 already publishes the64-byte direction lookup through713180,482590 constructs six controllers at8495e0+i*8c, and41dbb0 links body+6bc/controller+6c.

The enabled Solo adapter now invokes the existing raw482730 helper for that callback, using the same shared roster body, live controller and generated lookup. It checks the real controller stride/backlink and that the lookup is an owned bounded allocation. It uses47b020's normalized-direction workspace at physics entryS−108 and482730 child entryS−156. The raw helper captures the original controller before actual484bb0/40ea40 emission, reads the real body+6b4 flag, preserves post-emission reloads, and updates that controller's status/timer and selected intensity byte. No copied265-byte controller, zero-filled lookup, suppressed emission, force clamp or skipped effect implements the binding. This numeric workspace binding is not a claim of complete native private-stack parity.

`tests/solo-active-weapon-effect.test.mjs` observes the actual owned memory read-only and runs600 natural HIGH/LEV15 ticks in Node and the browser bundle. It compares complete snapshots and the backing8c-byte controller/64-byte lookup at selected boundaries. At492 the impulse is pending and car0's active shield has status10/timer0; at493 the flag is consumed,482730 reduces status to7, and the ordered late482990 pass leaves timer9 with genuine propagated intensity bytes. At494 the timer is8 and the wave continues; the generated lookup is unchanged. No test item, pose, flag or firing input is injected. Default weapons-off code retains its prior callback policy.

# Postphysics rejected-body states

`src/post-frame-body-states.mjs` reconstructs the outer `47ccc0` traversal for Rollcage Redux1.3.8.0. The game caller `450e50` runs physics `4749e0`, attachment processing `44f050`, then this stage. A state32 body has already had its remaining frame clock completed by `47cc20`; state32 is not itself destruction.

Retained evidence is `094-after-physics-body-states.json`, pseudocode `ev_80bd47f3e8c8c401b931daf70c3f6f81fce3e4faf092e3ee1721c59b151a4dbb`, and `098-post-frame-body-states-assembly.json`, assembly `ev_b9ab8b14c0affb661a9411d957ed11316ec5017676e0587a0224e8440a223faa`, under `analysis/native-simulation/results/`. These are static observations. No original process was executed for this reconstruction.

## Traversal and retirement

The routine calls47e180 before capturing the unsigned word count at902bc4 and body-array pointer at902bc0. Subsequent callback changes to those globals do not replace the captured array/count; edits of entries in that same array remain visible. Only bodies whose dword+128 equals32 enter the state dispatch.

Type4 loads its controller from+164, writes controller byte+3a=20, ORs200 into the flags of the controller's own body pointer, ORs80 into controller byte+39, and **stops the entire traversal**. Later rejected bodies are not handled in this call.

Types7/21 load that controller, call4284d0 unregister on its body pointer, reload that pointer for474850 spatial removal, then range-check controller byte+05 against36. After both callbacks they clear the selected byte in849940, controller byte+04 and the current controller body's short+160. Type33 instead calls46a2d0. All three retirement paths hold the array cursor in place and decrement the local remaining count **twice**, including the ordinary loop decrement. The reference preserves that behavior even when the callbacks compact the array.

## Route selection and fallback

Other rejected types search the route table at **runtime pack+60**, counted by **runtime pack byte+46**. Global90b98c points to the runtime pack909240, not directly to the authored GFXM header. Loader44c2b0 maps the resource-relative table at **GFXM+8c** and count at **GFXM byte+79** into those runtime fields. It relocates each group's pointer+08 by the resource base plus **GFXM+98**. `src/respawn-routes.mjs` reads the authored representation and supplies the existing runtime-named interface; see [respawn routes](respawn-routes.md).

The count includes a leading12-byte group which47ccc0 skips. Each scanned group has an unsigned short point count at+00, direction reversal byte at+02, and a point-array pointer at+08. Points have16-byte stride, with three signed16 coordinates at+00/+02/+04; other fields are preserved as opaque caller data. The group's byte+05 is retained for the separate47d440 apply helper.

The body position uses its signed high16 coordinates. Squared distance is a signed32 sum of three wrapping32-bit products. Large coordinate differences can therefore produce negative distances that beat geometrically nearer points. Comparisons are strict; ties retain earlier selections. The point whose identity equals global70eb18 is skipped.

Closest and second-closest routes, points, indices and distances are initialized **once per47ccc0 call**, outside the body loop. They persist across rejected bodies. In particular, a zero nearest distance found for the first body can prevent replacement for a later body, even after that point becomes the excluded global point. The reference does not reset these native scratch values per body.

For the closest point, global70eb18 receives its pointer and70eb0c receives signed16 coordinates shifted16. Direction uses the next point unless the selected index is the final index, in which case it uses the previous point with a negative sign. The group's reversal byte flips that sign. The differences are shifted8, written to global70eb1c and normalized **in place** by the already reconstructed41e3f0 quaternion helper. The body rotation pointer+c4 and quaternion scratch are then passed to47d040 with mode1 and a mutable output value.

A zero query return replaces only the selected route/index, global point identity and global position with the second candidate. It does **not** recompute direction or quaternion, undo query changes to the body rotation, or invoke the query a second time. The47d440 apply call receives the first orientation together with the fallback position. Its final scalar argument is the query's output value.

After apply, the body flags are read again. A current type3 invokes47d900 with EDX0. Emission484bb0 always follows the respawn path, with ECX43, EDX0, and stack arguments`[0,-1,9000,6,previousCalleeECX,0,0]`. That fifth argument is a leaked register value; no meaning is assigned to it. Explicit callback return data carries it through the reference.

## Interface and boundaries

```js
runPostFrameBodyStates(physicalGroup, {
  routes: {
    countByte46,
    groups: [header, {count, reverseByte2, points: [{position:[x,y,z]}, ...]}]
  },
  routeState: {currentPoint, position, direction},
  slots36,
  mathScratch,
  handlers: {
    prepass() {},                        //47e180
    unregister(body) {},                 //4284d0
    removeSpatial(body) {},              //474850
    retireType33(body) {},               //46a2d0
    query(body, request) {},             //47d040, returns native integer
    apply(body, request) {},             //47d440, returns {registerEcx}
    vehicleTail(body, zero) {},          //47d900, returns {registerEcx}
    emit({code, registerEdx, args}) {}     //484bb0
  }
});
```

The physical group is`{bodies,count}`. Body fields are`flags`, `position`, `rotation`, `collisionState128`, `field160`, and the reached`controller164`; controllers expose`body`, `active4`, `index5`, `flags39`, and`timer3a`. Point, route, controller and body identities model native pointer identities. Routes may carry extra opaque fields such as byte05 for the separate respawn apply helper.

Query requests contain`{position,quaternion,rotation,mode:1,queryValue}`. The position aliases mutable route globals, rotation aliases the body's array, and quaternion is mutable scratch. The callback writes`queryValue.value`; that scratch object is reused across bodies. Apply requests contain`{position,quaternion,rotation,route,index,queryValue}`, where the final queryValue is the **scalar** result from that scratch. Callback mutations to arrays are supported; replacing routeState's array properties with unrelated storage is outside the native global-memory alias contract.

Callbacks are required only when reached. They must implement or explicitly declare the original behavior; the outer port supplies no silent lifecycle or progression approximation. The separate47d040/47d440 references can be bound to these boundaries, and`checkPostFrameVehicles` supplies the numeric47e180 prepass with explicit registry/wheel/sector-height state. Full race state, input producers, type33 retirement46a2d0, vehicle tail47d900 and emission484bb0 remain separate reconstruction work.

The native routine dereferences route candidates without checking that usable points exist and can read adjacent point memory when a one-point group chooses its previous neighbor. The JavaScript boundary reports missing supplied memory explicitly. A group may provide`pointAt(index)` to expose native-readable neighboring storage or point aliases. Invalid native pointers and zero-length direction division faults are outside the successful fixture domain.

## Verification

`node tools/verify-post-frame-body-states-instructions.mjs` passes2400 synthetic fixtures against488 retained instructions. The actual47ccc0 outer and41e3f0 fixed arithmetic execute in the bounded x86 interpreter. The eight listed stage/lifecycle/query/apply/emission callees are explicit state-mutating mocks, and the security-cookie check is inert. This is interpreted static-instruction agreement, not runtime observation.

The checker compares all16384 bytes of each of seven bodies, all256 bytes of each of seven controllers, both captured/global body lists, all36 slots, route/point records, mutable route/root globals and every callback argument and call order. Coverage includes1309 respawns,1998 retirements,667 whole-loop type4 stops,426 fallback queries,600 prepass list replacements,167 later global count/list changes,418 controller pointer relinks and142 signed-distance overflow fixtures. All2256616 interpreted steps match. Report:`analysis/post-frame-body-states-instruction-check.json`.

`node --test tests/post-frame-body-states.test.mjs` passes nine focused tests for header/current-point exclusion, cross-body nearest scratch, fallback orientation, whole-loop type4 stop, retirement compaction/double decrement and live controller pointer reload, prepass capture, post-apply type/ECX emission, signed-distance overflow and reversal/range checks.

## Shared-memory retirement and sound defaults

When`memory` is supplied, bodies must expose their native`address` and their accessed fields/physical-group array must view the same bytes. The caller now defaults4284d0 unregister,474850 spatial removal,46a2d0 type33 retirement and484bb0→40ea40 code43 sound to their actual references. Explicit handlers still override these defaults for boundary probes. `scratchBase` means native47ccc0 entryESP; the type33 child receives entryESP-104, preserving its effect-position/velocity locals and nested call stack. `retirementHandlers` supplies optional effect probes and actual audio virtual-stop service; an existing`soundRuntime.handlers.sourceCall` supplies stop method34 automatically.

The generic prepass/query/apply/type3 vehicle-tail still require their current contexts/handlers. The fifth484bb0 stack slot is unused by the native adapter: a supplied`registerEcx` observation is preserved, but void callees need not invent that result. Shared-memory integration tests exercise both actual raw-array/collision-ID compaction and the nested type33 effect argument/timestamp contract; the second uses an explicit burst probe, while the separate retirement oracle checks the actual effect graph. A missing-bank sound guard is tested through actual defaults. These additions preserve the earlier parent check's declared overrides.

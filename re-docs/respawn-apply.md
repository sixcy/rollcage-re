# Respawn application

`src/respawn-apply.mjs` reconstructs `47d440` for Rollcage Redux1.3.8.0. It consumes an already selected pose and progression location; checkpoint selection belongs to a separate stage. This is static reconstruction checked with retained instructions, not original-process runtime observation.

Evidence: pseudocode `ev_0fbbf1c31a6a91e9d1154b4e47ebdf3143aeb3ae500f89027cf6cd5b777cac93`, assembly `ev_c329f2472b4fcb32cbb31106e54ad1db5a35f1ebfd0bf6b7df7d74fabfca2c76`, retained in `analysis/native-simulation/results/101-respawn-apply.json` and `102-respawn-apply-assembly.json`.

## Recovered behavior

The body is removed from its spatial list before reading the supplied pose. The routine writes position at+34, quaternion at+58, nine signed rotation shorts at+c4, then clears linear velocity, momentum, angular velocity, force, torque and angular momentum. It stores the supplied terrain reference at+11c. Quaternion derivatives at+8c and all unrelated cache/clock/contact state remain untouched. No derived-body refresh is implicit.

For type3 (`flags&1ff`), it clears four wheel spins at+37c with stride+c8 and the dword at+650. The caller supplies the existing wheel state; angles and contact flags remain unchanged.

The vehicle index at+65e selects a caller-owned record from native909300 with stride30c. It writes the selected progression pointer at record+54 and value at+58. If record+00's registered body has byte+718 equal8, that body's short+6c0 receives progression pointer's byte+05 and short+6c2 receives the low16 bits of record+58. The registered body can differ from the body being respawned.

Session modes3/8 decrement a nonzero counter at session+08 indexed by the *registered body's* +65e. Other modes invoke44a2e0, unwrap the signed change in record+24 across16 bits, and compare the result to0 and65536. A negative result decrements a nonzero record+1c lap only when it does not exceed session+586. A result strictly greater than65536 calls44a560 then449760. Exact65536 does not complete a lap. Arithmetic retains signed32-bit wrapping, including unusually large synthetic inputs.

After these callbacks the routine reads the respawned body's vehicle index again, obtains that record's controller at+18, and ORs4 into controller byte+39 unless the pointer is native sentinel12345678. It finally selects the spatial bucket and inserts the body at its head.

## Interface and explicit boundaries

```js
applyRespawn(body, {
  position, quaternion, rotation,
  progressionPointer, // caller object { byte05, ... }, retained by identity
  progressionValue, closestTerrain11c,
  vehicleState, // { wheels:[{spin},...], field650 }
  runtime: {
    records: [{
      body00, controller18, lap1c, progress24, respawn54, respawn58
    }],
    session: { mode551, lapLimit586, counters08 }
  },
  spatialRegistry,
  handlers: {
    updateProgress44a2e0(record) {},
    advanceLap44a560(record) {},
    finishProgress449760(record) {}
  }
});
```

`body` also exposes explicit `vehicleIndex65e`, `mode718`, `checkpoint6c0` and `checkpoint6c2` where the reached vehicle branches use them. Nonvehicle calls need no runtime or vehicle state. Runtime records, session state and controller objects belong to the caller; this module supplies no input producers or assumed starting values.

`BodySpatialRegistry` supplies recovered removal474850 and insertion474600. The native47d440 insertion is inline, and the instruction check executes that exact tail. Its effects agree with the registry after removal clears both link shorts. A caller can instead provide explicit `removeSpatial(body)` and `insertSpatial(body)` handlers; their behavior then remains the caller's boundary. Registry bucket selection can use the existing parsed spatial index through `createBodySpatialSelector`.

The three progression callbacks are required only when their native branches execute. Their implementations remain unported here. They may mutate live body indices, record values, controller references and session state; accesses after each call use the resulting state. Checkpoint/route selection, progression generation and lifecycle management are separate unresolved producers. Unsupported object-memory aliases between distinct pose arrays and body storage are not modeled; the observed callers supply selected pose storage.

## Validation

`node tools/verify-respawn-apply-instructions.mjs` compares4000 synthetic fixtures against261 retained x86 instructions, including actual spatial removal and47d440's inline insertion. Only selector4286e0 and the three progression callees are explicit mocks. It compares two full16384-byte bodies, three780-byte records, the1536-byte session region, three128-byte controllers, two spatial buckets and callback order. Fixtures cover special-mode counters, cross-vehicle registration, signed wrap boundaries, wheel resets, untouched derivative state, live index/controller mutations and both empty/nonempty insertion buckets. Result:583595 instruction steps,1014 progress callbacks,164 forward-lap callbacks and986 special-mode vehicles; all matched. Report: `analysis/respawn-apply-instruction-check.json`.

`node --test tests/respawn-apply.test.mjs` passes seven focused tests covering pose/motion reset, nonvehicle ordering, registered-vehicle checkpoints/counters, backward/forward thresholds, live controller lookup and sentinel behavior.

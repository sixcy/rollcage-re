# Vehicle respawn ring and particle allocation

`src/respawn-effects.mjs` reconstructs vehicle effect47d900, particle creation436920, and storage reuse435df0. The existing `BodySpatialRegistry` reproduces particle registration474670 and removal4748d0 when given the particle bucket heads, which are distinct from physical-body bucket heads. These are shipped-code conclusions validated by retained instructions; the original executable was not run.

## Evidence

| Procedure | Retained reply | Evidence ID |
| --- | --- | --- |
|47d900 assembly|`111-respawn-vehicle-tail-assembly.json`|`ev_b8ac1e3c04172ee7cbc456458e61c6622b2a5de24fbe251b9cee4ab5bc21a71a`|
|436920 assembly|`113-respawn-particle-emitter-assembly.json`|`ev_372dd6220bf6905f4bd35bc9efec4c329fa960dc682830ae5c717d63df0a2307`|
|435df0 assembly|`115-effect-allocation-assembly.json`|`ev_9b4113a0de0b5b99c46880f3299ff8b2730cf17d0a13ff016756941a2ab60852`|
|474670 assembly|`117-particle-registration-assembly.json`|`ev_7f904b2a33d32ddbce34e54ea512f8578ff882a81a9aef342bae5f1651437b29`|
|4748d0 assembly|`118-particle-removal-assembly.json`|`ev_8bd76cc16fe4414866ce5e291d00929c7e29166f547ce7606a1341cdef88f513`|

All replies reside in `analysis/native-simulation/results/`. Corresponding pseudocode replies103,112,114,116 remain retained. The signed Q14 yaw table at5ed030 is already preserved in `src/yaw-table.json` (`ev_f2b04d8b6ef54e468978fde5d7e1c51258e31a0ec672232ece1dcb89e4271411`).

## Recovered behavior

47d900 sets vehicle byte+699 to31 except for event code2. Code2 instead selects the same RGB color mode as code0 while preserving that byte. The center position is captured once, then sixteen particles are emitted at angles0,16,…240. The ring offset is the yaw entry multiplied by192, equivalent to a48-unit radius in body Q16 coordinates. The input velocity uses the quarter-turn yaw entry shifted right4, with zero Y. Both position and velocity use the integer table rather than floating sine/cosine approximations. Each creation offsets its supplied position by `velocity<<8` before spatial registration.

436920 initializes fields+95=16,+96=100,+a2=32768 and flags23 for typeMode0 or30 otherwise. It stores each velocity's low signed16 bits at+9c, computes the three full-width position sums at+88, writes initial colorffffe0e0 at+98, then registers spatial membership. Only after registration does it read live seed5ec958 and time9153e8, store timestamp+a4, and set field+94 to1.

The native RNG uses `imul(seed,16807)&7fffffff`, not Park–Miller division/modulo2147483647. ColorMode0 consumes three values to form RGB; other modes consume one value for grayscale. Alpha isff. The final ECX register is the **second** seed for RGB and the **first** seed for grayscale, while the stored seed is the third/first respectively. The reference returns `{particle,registerEcx}` so the post-frame caller can preserve its observed leaked-register argument without inventing a meaning for it.

435df0 first pops freeHead6e65b4 using record+ac. When no free record exists, it scans the active list from activeHead6e65c0 for field+b0 equal0, following+a8. If all records have a nonzero value, it reuses the original head. The selected record is detached, appended to activeTail6e65c8, and removed from spatial membership only when field+94 equals1. Fields+b0/+b4 are cleared *after* removal. No whole-record reset occurs; untouched storage survives reuse. Selection of the existing tail and a one-record list must not create a self-link.

Particle spatial heads reside at native bucket+0a; physical-body heads use+08. Both use shared-pool IDs computed from128-byte allocation units and links at record+04/+06. Supply separate particle bucket objects to `BodySpatialRegistry`; a single bucket's `headId` cannot stand for both native heads. The registry selector should use `particle.position88`, or the already computed position argument supplied to the registration handler.

## API and storage example

```js
const particles = Array.from({length:32}, () => ({
  field94:0, fieldB0:0, fieldB4:0, nextA8:null, previousAC:null
}));
particles.forEach((p,i) => p.previousAC = particles[i+1] ?? null);
const runtime = {
  freeHead6e65b4:particles[0],
  activeHead6e65c0:null, activeTail6e65c8:null,
  seed5ec958:1, time9153e8:declaredTimestamp
};
const registry = new BodySpatialRegistry(
  particles.map((p,i) => ({body:p,poolOffset:i*256})),
  p => {
    const selected = index.lookup(p.position88);
    if (!selected.found) throw Error('No supplied particle bucket.');
    return {bucket:particleBuckets[selected.node.index],outside:selected.outside};
  }
);
const handlers = {
  allocate435df0:() => allocateRespawnParticle(runtime, {
    removeSpatial:p => registry.remove(p)
  }),
  register474670:p => registry.insert(p)
};
const result = emitVehicleRespawnRing(body, code, {
  emitParticle:(position,velocity,options) => emitRespawnParticle(
    position,velocity,{...options,runtime,handlers}
  )
});
// result.registerEcx is the actual final retained-register value.
```

The32-record pool,256-byte offsets, timestamp and seed in this example are declared synthetic inputs. They do not establish the game's original pool capacity, allocation layout, initial RNG seed, timestamp producer or active particle population. Direct `emitRespawnParticle(position,velocity,{colorMode,typeMode,runtime,handlers})` also supports the emitter's nonzero typeMode branch. Callers own free/active storage, runtime fields, bucket heads and the shared-pool address mapping. Separate arrays representing overlapping native memory are outside this object-model contract.

The particle renderer, per-frame particle advancement/expiration and the final post-respawn emission484bb0 remain separate work. This port creates and registers native-equivalent particle state; it makes no rendered-effect claim.

## Validation

`node tools/verify-respawn-effects-instructions.mjs` passes1200 synthetic fixtures against282 retained instructions:800 full rings plus400 direct emitter cases,13200 particles,8606 reused allocations and66 all-nonzero-b0 fallbacks, totaling3212024 instruction steps. It runs the complete ring/emitter/allocator/particle registration/removal code. Only bucket selector4286e0 is mocked, with live seed/time mutations to check ordering. All8192 bytes of a32-record pool,2048 vehicle bytes, bucket bytes, allocation globals, RNG/time values, selector order and final ECX are compared. Fixtures include an initially empty active list, free-list exhaustion, selected-tail reuse, RGB/grayscale modes, both particle types, code2 byte preservation and large signed coordinates/velocities. Report: `analysis/respawn-effects-instruction-check.json`.

`node --test tests/respawn-effects.test.mjs` passes seven focused tests covering linked-list reuse and callback ordering, initialization, RNG/ECX, and captured-center ring geometry.

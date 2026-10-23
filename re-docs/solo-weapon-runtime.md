# Installed-session weapon-stage composition

`src/solo-weapon-runtime.mjs` connects existing game-owned weapon constructors
and `48d7c0` without changing session mode or the pickup option. The module
supplies no AI decision, collision result, projectile path or force value.
Racing test now runs this composition in its installed-data sessions.
Original-process validation remains separate from the instruction comparisons
and browser checks below.

## Reached physics gap

The weapon coordinator owns a drive accumulator even when no weapon is held.
Native `48d680` adds `3000h` or `5000h` to body `+6a8` after a category-one
wheel material is found. `48d7c0` then compares that value with body `+6ac`:
below-base values become the base; all other values lose `400h`. It caps both
fields at `d0000h`, or `e0000h` when session `+587` is nonzero. Equality really
subtracts below the base for one update: an otherwise unchanged `60000h`
alternates with `5fc00h`. A guessed maximum with the base changes the game.
The following wheel-drive stage reads live `+6a8` as front drive and as part
of rear drive, so omitting the coordinator changes physical acceleration.

Before integration, a read-only source probe of LOW/LEV1, six Expert cars and
900 steps first observed a surface drive increase at step420. Per-car maxima
were `884736,933888,847872,847872,847872,933888`; four exceeded the original
normal cap `851968`. These are observations of the incomplete source session,
not native trajectory measurements or expected lap statistics after the fix.

## API and original order

Call `initializeSoloWeaponConstants(memory)` once for a fresh image. It copies
the existing recovered pickup, projectile, wormhole, notification and launch
tables; it does not enable a weapon or initialize fake runtime objects.

`initializeSoloWeaponRuntime(runtime)` takes shared `memory`, a real bounded
CRT allocator and `scratchBase` equal to the common direct-child startup
entry ESP: actual `47ea40` entry minus48. It composes the contiguous owned
`47eccf..47eda2` section:

1. Native `9020a0/a4/a8` zero stores and actual `495320` quad storage.
2. Actual `47b580` pickups and `46a420` projectile pools, including all24
   projectile bodies, six satellite masters, the wormhole and its47 particles.
3. Actual caller writes for the allocated `800h` palette map, unconditional
   FF fill, terrain-wave/time state, sound-channel sentinel and selected
   contact-topology model.
4. Actual `4820f0`, then all six `482590` controller constructors.

This follows the native world-fragment constructors and precedes debris,
particles, `429d60` scripted-object activation, projection and every vehicle
constructor. All six contact controllers are initialized before the participant
loop; each later `41dbb0` associates its participant with a controller. The
palette-map allocator and subsequent pack-root capture retain native ordering.
Nonempty allocation failure is explicitly unsupported; no fallback storage or
invented allocator/function handle is published.

The caller must retain the original loader publication
`BYTE[909276] = BYTE[auxiliary+94]` (`909240+36`). Authored pickup rows are
`9092a8 = [auxiliary+90]`, scripts are `9092b4 = [auxiliary+a4]`; those latter
pointers already exist in the session loader. Native `47b580` disables pickups
unless session `+a86` is enabled or the mode is3/8. Current mode1 with `+a86=0`
must remain disabled. Even when its option is enabled, mode1 awards only native
item4; that is not a full combat race.

Call the returned `step({scratchBase,entryRegisters:{EDI},...context})` at
actual `451092`, after the complete `443d90/48d680` participant pass and before
`41d2b0/416400`. Native `451026` clears EDI and `451049` increments it after
each completed motion-pass iteration. The immutable viewer roster therefore
supplies its length; a mutable native caller must retain the actual completed
count. `scratchBase` is the `48d7c0` entry, actual `450e50` entry minus20.

The update executes the complete existing coordinator: pickups, projectile
controllers, terrain wave, time effect, targeting, two-slot launch edges, held
recovery, drive decay/caps, launch ages/impulses and active contact colors.
Required world views, terrain, sound, CRT and other reached services remain
caller-owned. No missing service receives a fabricated successful answer.

`bodyAt(address)` and immutable `bodyStorage` expose only actual newly
registered constructor bodies and their arena storage. Compose that factory
with the physical world's existing factories. `createCollisionFilters(context)`
binds actual `46b820/44b6c0/4302f0/49ab40`; its entry ESP must come from the real
physics caller. Shared body/event identity is checked. These bindings do not
claim that a projectile collision was reached in the default disabled-pickup
session. Wormhole control copying and the separate `49ac30` update are still
distinct outer stages if a configuration actually activates that weapon.

## Evidence and tests

`node --test tests/solo-weapon-runtime.test.mjs` passes four tests:

- Three startup worlds execute retained `47eccf..47eda2` with every game
  constructor intact. Disabled/enabled authored fixture pickups and a true
  allocator-side pack-root mutation compare every mapped byte at/above10000h.
- Two persistent160-frame graphs execute actual `48d680` followed by the full
  `48d7c0`, plus four floor-cycle updates each:648 public calls, comparing every
  mapped byte after each call. Both original caps are reached and held. The
  material/contact pointer is an explicit upstream fixture input; full physics
  does not advance these fixture cars.
- Fresh independent construction is reproducible. Missing allocation/context,
  allocation failure, replacement memory and nonshared callback views fail.
- Exact retained caller instructions assert the constructor and update order,
  as well as the native decay instruction.

Only CRT allocation/memset and the compiler cookie are external in these
instruction checks. The synthetic scene/session metadata is explicit; all
weapon/game children run. The disabled projectile state is constructed by
`46a420`, rather than inferred from zero-filled global pointer slots. Existing
populated eight-weapon coordinator proofs remain documented separately in
[race-weapon-stage-connected.md](race-weapon-stage-connected.md).

## Connected Racing test checks

`src/solo-session.mjs` initializes the original weapon constants, publishes the
authored pickup count as a byte, and constructs this component after real world
destruction/fragment initialization and before debris, particles, scripted
activation, projection and participant creation. Its body factory includes the
actual new weapon bodies. A shared captured filter Map receives the projectile
callbacks after the real terrain/views exist. Each update supplies the completed
motion-pass count and calls `48d7c0` before wheel/camera preparation.

The installed callback entry is physics-entry minus52: `4749e0` pushes20 bytes,
its `474b20` CALL pushes4, that dispatcher pushes12 saved-register bytes and12
argument bytes, then the indirect callback CALL pushes4. Both first/second body
branches have that same depth. This verifies the supplied callback location;
disabled pickups do not establish that a live projectile callback was reached.
The exposed drive/base values and pickup gates/counts are immutable observations
and do not feed the simulation.

`tests/solo-weapon-session.test.mjs` passes the real installed LOW/LEV1 session
with six Expert cars for950 updates. Every car retains the original normal
drive cap; actual installed wheel surfaces produce gains, and the first two
updates preserve the native below-base equality cycle. Complete public snapshots
match the bundled browser runtime for the first150 updates. Reset reconstructs
the original ready state, and source asset bytes remain unchanged. The mode1
pickup option remains0, actual pickup count0, and the constructed contact model
has42 vertices.

The separate [4000-update report](../analysis/solo-weapon-stage-single-4000-20261023.json)
passes the existing strict single-car checks with four laps and zero recoveries,
comparing bundled browser public state on every update. Its generic method/limits
strings predate the new stage and should not be interpreted as an assertion that
`48d7c0` is absent. Changed pace follows the real decay/cap behavior; no arithmetic
was tuned to retain prior lap counts. These are source/browser comparisons,
not original-process trajectory evidence. Broader installed variant and actual
browser GPU checks are not established by the component or this checkpoint.

A separate read-only admission census inspected all36 supported installed
LOW/HIGH variants, excluding LEV16/17.34 variants have authored pickups
(4..14 each); LOW/HIGHLEV15 have none. Controller counts are0..3. Actual
constructors admitted every variant on copied session memory with an explicitly
enabled test option and the missing loader count supplied. All have42 contact
topology vertices. Maximum resulting body registry count was275; maximum arena
use was2142592 bytes, with at most329600 bytes added. That probe appended
constructors to copied source-session memory; it is admission evidence, not
proof of startup order, installed-session trajectories or original execution.

Retained evidence, all bound to Redux SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`:

| Reply | Identity |
| --- | --- |
|2457 startup47ea40|`ev_c39a69909451efe663de2dd317d58d4a778c39999a2060dea599e1d088aa0884`|
|310 race450e50|`ev_d15324804cfcb1308ec6f86f28c7350a908d9cee745a7616dd8619f94cd3053f`|
|3201 weapon48d7c0|`ev_8c7dd04a8afc52e84554e55a8065848aa8e15f7f8afcd28c2f59a1970bd47c82`|
|3285 pickups47b580|`ev_3d5b87ed05470f4c1ab4168f2988634c8183e547dcc2ae30c88e47476956b391`|
|903 surface48d680|`ev_25d0e08b400dae142d89ded057f0f7b25b9df9eed938ad18ddd58fa099caa2ac`|

No game process or capture was launched, no installed files were changed and
no existing report was overwritten. Projectile/trail rendering, original GPU
lighting, complete active-weapon original-process evidence and uninterrupted
race scheduling/trajectories remain outside this component proof.

Subsequent root integration checks pass all36 six-Expert supported variants and all252 single-car track/type combinations for300 ticks each; the long roster window completes four laps per car/zero recoveries. Actual Edge four-track GPU/public-state and existing six-car controls/focus/interpolation/mobile checks also pass. The single4000 report scope text is now corrected in analysis/solo-weapon-stage-single-4000-scope-20261023.json with a hash of its retained source report and unchanged numerical results. Canonical links and limits are in physics-fidelity.md.

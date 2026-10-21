# Installed-data autonomous route-control probe

`tools/probe-autonomous-route-control.mjs` connects actual Redux GFXM route bytes to `updateAutonomousRouteControl` and all its default target, speed, steering and pacing references. It passed all 80 installed level packs, 540 nonempty groups, 14,580 constructed scenarios and 58,320 persistent control ticks, with zero failures. Results are retained in `analysis/autonomous-route-control-probes.json`; the initial one-pack smoke report is separate.

These are installed-asset inputs combined with explicit synthetic runtime state. No original process was executed. The [retained-instruction comparisons](autonomous-route-control.md) establish the native arithmetic and call behavior; this probe checks their connection to the complete authored route corpus and its actual metadata.

## Mapping and preservation

The probe copies each complete decoded GFXM resource to a declared native address. `parseRespawnRoutes` supplies the original group table, point base and resource-relative identities. Each group's u32+08 becomes `resourceAddress+pointBaseOffset+pointRelativeOffset`; pack+60 publishes the copied table. Every other resource byte remains unchanged.

This follows loader44c472..44c4ac's pointer relocation, documented in [respawn routes](respawn-routes.md), Evidence `ev_f5eddfe878790ed034b165f848b3f30c76f84c3a9ca63310c4a967679e949ff6`. Authored reverse byte+02, loop byte+04, progression byte+05, signed-short coordinates and point speed byte+07 are preserved.

Every resource has both its original decoded SHA256 and relocated-copy SHA256 recorded. Both are checked again after all scenarios for that pack. Selected point pointers are checked against the mapped resource bounds, and their complete 16 bytes must match the corresponding original authored record. The original installed files are opened read-only.

The archive index SHA256 is `28c30b94d5612b98cc9d68540982f40bc1ae6f05df3113cb964c6b2eccf02377`. Decoded level resources range from 220,428 to 1,049,124 bytes. The final report records six implementation-source hashes and asserts those files did not change during the run.

An additional hash-checked reread, retained in `analysis/autonomous-route-control-route-counts.json`, counted all 624 serialized groups: 84 empty groups and 540 groups with at least three points. There are no singleton or two-point groups in these 80 level resources. Consequently the corpus exercises every nonempty authored group. Synthetic singleton/stale-local behavior remains covered by the separate geometry instruction checks.

## Explicit scenario inputs

Each group is sampled at its first, middle and last point. Each sample runs nine profiles for four persistent ticks, giving 1,620 scenarios and 6,480 ticks per profile:

| Profile | Declared inputs | Observed target-index changes |
| --- | --- | ---: |
|route-low|Signed speed60, low-skill input and ordinary route target|576|
|route-high-skip|Signed speed350 and6ec bit200|4,580|
|mode4|Session mode4 and its250 speed override path|696|
|steering-suppression|6c4 bit8000, preexisting steering bits, reverse gear and angular momentum|624|
|special-near5|Code5 target50 units away, inside its cancellation test|616|
|special-far5|Code5 target300 units away|0|
|special-retained1|Code1 target with high-speed flag also supplied|0|
|pacing-mask|Signed speed500, opponent selected from mask and declared-1000 progress gap|644|
|disabled|6c4 lacks its4000 enable bit|0|

Body/session/wheel/opponent/progression storage begins as explicitly zeroed memory with the reached fields set by the probe. Rotation is one of two declared orthogonal headings; no constructor defaults are inferred. Surface metadata includes the first-flagged-wheel/null-record case. Authored forward/reverse and open/cyclic flags remain untouched. The progression record is fixed for a scenario; its producer does not run here.

Between control ticks, the fixture advances position by one quarter of its fixed serialized linear velocity. The initial direction comes from the recovered authored-route direction helper. This is declared fixture motion, not reconstructed vehicle handling or a physics simulation. Controls do not feed a substitute acceleration, steering or collision model. The caller seeds control bits before each tick, then the actual recovered functions update them. Final bit-presence totals therefore include preserved input bits and can contain simultaneous throttle/brake or left/right bits.

## Checks and observed coverage

The 540 nonempty groups include 164 reversed and 376 forward groups, with 96 cyclic and 444 open groups. Across all ticks there were 7,736 target changes and 352 wraps. The probe checks the allowed authored-direction successor set, including up to two possible advances when the high-speed path and target preparation both advance. It also checks that the selected group stays fixed and the selected index remains within that group's point count.

Only known body output spans may change during the control call: group/index/flag fields at6c0..6c5, diagnostic/special bytes6c8..6c9, and control dword710. All other 16,384 body bytes are compared against the pre-call state before the declared fixture movement. Target scratch and control outputs are checked as finite-width integer values.

The report includes:

- 6,480 ticks with the high-speed skip inputs eligible and 6,480 mode4 ticks. These count supplied branch inputs; endpoint rules may prevent an actual skip.
- 1,620 near-code5 cancellations and 12,960 ticks retaining a special target.
- 1,620 first-tick steering-suppression checks, requiring both the flag and steering bits to clear.
- 6,480 opponent-pacing checks, requiring the seeded throttle bit to clear.
- 6,480 disabled checks, requiring the complete body to remain unchanged during the call.
- 160 original/mapped resource-hash checks and zero progression-group fallback inputs.

The report preserves per-resource counts/hashes, per-profile outcomes and the first 32 tick samples. Profiles provide varied concrete inputs; they do not claim every possible speed, skill, surface, caller-state or numeric fault domain.

## Reproduction and limits

```powershell
node tools/probe-autonomous-route-control.mjs
```

Optional arguments are installation directory, maximum level-resource count, and a new report path. Reports use exclusive creation and refuse overwrites. To repeat the full corpus while preserving the existing result:

```powershell
node tools/probe-autonomous-route-control.mjs 'C:/Program Files (x86)/Psygnosis/Rollcage' Infinity analysis/autonomous-route-control-probes-new.json
```

All reached game helpers in the control call are the actual JavaScript references; this probe supplies no control-handler mocks. It supplies the body/session/progression inputs, mapped native addresses and fixture motion. It does not establish captured runtime equivalence, strategic AI decisions outside431750, difficulty initialization, constructor state, input ingestion, rendering or a complete race loop.

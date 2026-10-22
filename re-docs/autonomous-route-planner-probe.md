# Installed Redux route-planner probe

`tools/probe-autonomous-route-planner.mjs` runs actual `planAutonomousRoute` (`421430`) with every recovered default callee, without reached-handler overrides. The expanded installed-data report is `analysis/autonomous-route-planner-probes-traffic-20261021.json`. It covers all80 usable Redux GFXM packs and every540 nonempty authored route group, with zero invalid outputs or resource/source hash changes.

This is authored-data integration with a declared synthetic world. It does not execute the original game, sample devices, reconstruct constructors or run physical vehicle motion. Independent retained-instruction comparisons establish the source algorithms; this probe establishes that their connected defaults operate on the installed authored routes under the declared inputs.

## Mapping and constructed state

Every decoded GFXM resource is copied intact into mapped memory. Each group+8 point pointer is relocated from its file point-base-relative offset. Runtime pack+60 and progression global9092a0 publish that copied group table. All authored XYZ, packed links, point flag bits, group direction, cyclic/open flags and opaque bytes remain unchanged. The corpus uses first, middle and last points of every nonempty group. Installed data has no singleton/nonempty group zero in these80 packs.

The runtime/model/body/session/registry layout comes from the explicit `createConnectedPlannerFixture` constructor in the connected native-comparison tool. Its synthetic routes are replaced with the mapped authored table. Progression records use actual authored descriptor byte05 and valid point indices; no progression fallback was needed. Six profiles vary skill0..4, speed60/100/101/280/350/500, policy bits, clocks349/350/1000/5000, difficulty, lap state and pickup inventory.

One profile supplies a sparse baseline. Five supply six racers, all36 registry slots, four model-plane obstacles, twelve pickup/object/marker source associations and four event rows. Coordinates are explicitly positioned along and beside the actual route tangent. Events refer to valid mapped route/point associations or declared object IDs; they are constructed events, not parsed installed event records. Models, radii, packed planes, yaw, visibility/activity flags, progress values, velocity, body orientation, inventory, cooldown and difficulty are supplied fixture state.

The skilled traffic profile puts a same-velocity opponent40 units laterally away and clears the native special-target cooldown, allowing actual type1 avoidance generation. The speed101 profile puts an opponent60 units behind and20 units laterally away, allowing actual type2 follow/route-side logic. Other populated profiles exercise candidate costs and pickup/object/marker/event policies without replacing any callee with a callback.

## Results

| Check / output | Expanded corpus |
| --- | ---: |
|Packs / nonempty groups|80 /540|
|Forward / reverse groups|376 /164|
|Open / cyclic groups|444 /96|
|Scenarios / authored endpoint scenarios|9,720 /6,480|
|Populated body lists / obstacle lists|8,100 /8,100|
|Constructed event / special-source scenarios|8,100 /8,100|
|Ordinary target selections|7,844|
|Type1 avoidance / type2 follow selections|1,620 /68|
|Type3 pickup / type4 object / type5 marker selections|44 /136 /8|
|Ordinary candidate rows / linked-group rows|54,736 /34,688|
|Disabled candidate rows|12,380|
|Native fallback-to-row19 selections|200|
|Invalid outputs / caught failures|0 /0|

Candidate production includes1,620 type1,696 type2,324 type3,220 type4 and80 type5 rows. A generated row need not win final selection. The200 fallback cases occur in the declared last-lap/event profile: when no eligible row beats the native score floor, the exact parent rule selects row19. Their ordinary outputs remain valid authored points. They are recorded separately from ordinary eligible winners.

For every scenario the probe independently recomputes the final signed wrapped base+extra score, scans rows in native descending order with strict `>`, honors disabled rows and the `-50000` floor, and applies the fallback rule. Ordinary body group/point output must match the selected row and an exact installed16-byte point. Special code and Q16 XYZ must match the selected row's retained target slot. The mapped resource must equal its untouched relocated copy, and physical position/velocity must remain unchanged.

Every decoded source resource and the archive index are hashed;26 reference source/table files plus the probe and connected fixture tool are hashed before and after the run. The report retains those identities and per-resource hashes/counts. It performs9,800 source/mapped checks. Installed archives are opened through the read-only archive interface. All outputs use exclusive-create `wx`, preserving existing evidence.

## Reproduction and scope

```powershell
node tools/probe-autonomous-route-planner.mjs 'C:/Program Files (x86)/Psygnosis/Rollcage' Infinity analysis/autonomous-route-planner-probes-new.json
```

The optional second argument limits packs for a smaller new report. Use a fresh output filename: existing reports are deliberately not overwritten. The original requested `analysis/autonomous-route-planner-probes-20261021.json` is also retained; its earlier traffic arrangement passed the same9,720 cases and selected ordinary/type3/4/5 targets. The expanded traffic report above adds actual opponent avoidance/follow selection while keeping the same authored corpus and explicit state boundary.

These scenarios establish valid connected target selection for the mapped authored data and declared worlds. They do not establish constructor defaults, real placement of scene objects/events, visibility sampling, captured gameplay decisions, physical collision outcomes, complete races or full autonomous-driver behavior over time. No production source change was needed or made for the probe.

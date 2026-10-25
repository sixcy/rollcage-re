# Native existing-editor export validation

Updated 2026-10-25. Target: original Rollcage Redux 1.3.8.0, SHA-256 c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5. The following are original-process observations with declared debugger/startup interventions. They are separate from browser/source matrices and retained-instruction comparisons.

## Completed ordinary-scenery cases

Both LOW and HIGH LEV10 exports move original placement 21 by sixteen X units and rotate it by 1024 native yaw units, remove original 22 through the supported skipped-dispatch slot, and add model 13 as placement 106 with yaw 512. This model contains enabled six-plane collision records without the contradictory-plane warning of some other original models.

The observer confirms the original native level loader argument, exported GFXM model/collision/configuration bytes, changed spatial-node words, and every relocated static-model link. The complete original BTP placement table is captured while still alive, along with the original authored-index→body map before its free call. Selected native bodies must match the exported model, configuration, position, collision-yaw byte, object class and registry backlink. The removed authored slot must map to zero. First tick, complete pickup startup and owned-process cleanup are mandatory.

| Case | Independent acceptance | Scope |
| --- | --- | --- |
| LEV10 LOW move/yaw/delete/add | [LOW report](../analysis/native-scenery-editor-low-acceptance-20261025-v3.json) | Full authored records/map, selected native bodies,472 relocated static links |
| LEV10 HIGH move/yaw/delete/add | [HIGH report](../analysis/native-scenery-editor-high-acceptance-20261025-v3.json) | Same independent checks with HIGH resource offsets |

## Actual added-model contact

A separate export adds the same solid model 13 as placement 106 near the original first starting car, at native position [-2705,20,283], yaw0. This is an ordinary asset edit. The debugger does not set a car pose, manufacture candidates, inject query answers or change physics outputs.

At native423f69, after a real accepted geometric hit and object classification, the observer requires the actual contacted object to equal the captured original constructor-map pointer for added placement 106. It also requires a type3 car and an object/shape pair in that car's current native candidate list. It retains the original query, body, object, candidate, local result and frame.

All three original query-return sites are observed. Acceptance requires that the native function itself publishes the selected hit's final point, normal, scalar, flags, cell sentinel -4 and return fraction. A geometric acceptance snapshot alone cannot finish the capture. An independent checker replays only the captured shape geometry against the exported collision data; it supplies no object-effect callback.

| Case | Independent acceptance | Observed result |
| --- | --- | --- |
| LEV10 LOW added model | [LOW contact report](../analysis/native-scenery-editor-contact-low-acceptance-20261025-v1.json) | Added106/model 13/shape1, flags 1, fraction 36732, radius 4864 Q8; final native query output observed |
| LEV10 HIGH added model | [HIGH contact report](../analysis/native-scenery-editor-contact-high-acceptance-20261025-v1.json) | Same required native object/candidate/accepted-hit/RET chain, with independent exact geometric comparison |

The LOW point is [-692480,-15201,64256] Q8 and normal [40704,0,-51456] Q16. The HIGH report records its own values; similar results do not substitute for validating that run's raw blobs and native addresses.

At423f69 frame +0x2c has already been reused for the contacted object's Z coordinate at Q8 precision. It is not the earlier fraction limit. For the independent shape replay these cases require frame +0x14 (previous accepted flags) to be zero, then use the untouched outer bound at frame +0x9c. This is a bounded first-accepted-hit comparison, not a general reconstruction of every previous candidate's shrinking bound.

## Combined special-object and race-layout profile

The independently accepted LOW/HIGH LEV1 profile combines these legitimate source edits:

- Translate ordinary class 2 placement 1 by one X unit, retaining its behavior and metadata.
- Translate scripted type 24 placement 77/model 17/script 8, its complete absolute path and restart data by one X unit.
- Translate particle type 2 placement 40 by one X unit.
- Move route1:0 by one X unit and change its target-speed byte 255→254.
- Move checkpoint 0 by one X unit and increment its last direction component by one.
- Move original starting slot 0 by eight X units.

The profile adds original constructor observation sites.44cc5b observes the actual returned type24 object;44cff1/44d078 observe the original particle constructors.41dc96 observes each of six cars immediately after4798d0 initializes it from the selected starting slot, before later physics. Native selected-slot bytes, the shared native spawn template and actual car XYZ must agree exactly. The observer also requires the selected scripted/particle bodies at first tick. It does not assume a later scripted pose must equal a static editor preview.

Actual PowerShell ValidateOnly round-trips and original-process acceptance pass for both qualities, with 14 declared geometry spans and 708 relocated static links. Each report also verifies all 171 pristine source-file hashes and owned-process cleanup.

| Combined case | Independent acceptance | Proven scope |
| --- | --- | --- |
| LEV1 LOW | [LOW combined report](../analysis/native-scenery-editor-combined-low-acceptance-20261025-v1.json) | 532 resource-span checks, complete BTP/authored map, class2/script/particle initialization and all six exact car spawns |
| LEV1 HIGH | [HIGH combined report](../analysis/native-scenery-editor-combined-high-acceptance-20261025-v1.json) | 532 resource-span checks, complete BTP/authored map, class2/script/particle initialization and all six exact car spawns |

The LOW original car0 consumed edited starting slot 0 at native coordinates [-4007,-40,1759]. Selected script77 was constructed at [-336,-358,-6556], retaining type25, model17, script8 and restart6. Particle40 was constructed at [954,-228,-803]. Both original constructors and the first tick are recorded; these coordinates are not substituted pose inputs.

## Evidence and tools

The original loader and constructor anchors are retained as:

- 44c2b0 pseudocode: asset-format result006, Evidence ev_7223d7b195c9dce27ce3662ae697bc4ec68ff0400b307243f911e04006d50751.
- 44c2b0 assembly: scene result068, Evidence ev_f5eddfe878790ed034b165f848b3f30c76f84c3a9ca63310c4a967679e949ff6.44d120 is immediately before freeing the original authored map.
- 423ab0 assembly: scene result191, Evidence ev_47d50cd28b102f71ccb17669ffc0cc0319ce79b1a0a80e3c0a8231209495c589.423f69 is accepted-hit classification;423fff/42401a/424031 are actual RET sites.
- 41dbb0 assembly: scene result134, Evidence ev_16e1c6a62e466500605b98333c96f4863f748728e8f58cd1708448cd6dd17a25.41dc96 follows the original body-initialization call.

Preparation tools make new verified 171-file isolated installations from the retained pristine baseline. They edit only those copies' IMG/IDX archives, and retain the original pair separately. Native capture is announced and sequenced by the root agent; the user need not press Start or drive, but keyboard/mouse should remain idle during an announced run.

- tools/prepare-native-scenery-editor-validation.mjs and tools/native-scenery-editor-capture.ps1: ordinary move/yaw/delete/add initialization.
- tools/prepare-native-scenery-contact-validation.mjs and tools/native-scenery-contact-capture.ps1: actual added-model contact through final query output.
- tools/prepare-native-combined-editor-validation.mjs and tools/native-combined-editor-capture.ps1: combined existing special/layout initialization.
- tools/check-native-scenery-editor-policy.mjs CASE_DIRECTORY NEW_REPORT.json: invokes the actual PowerShell wrapper's ValidateOnly path and compares typed UInt32 links with config/source manifest. Frozen helper and wrapper hashes must match.
- tools/check-native-scenery-editor-validation.mjs CASE_DIRECTORY NEW_REPORT.json: validates blob/context hashes and ordering, declared inputs, constructor/output evidence, cleanup and all 171 pristine source-file hashes.

All original helpers and earlier retained captures remain unchanged. Each new purpose-specific fork has its own namespace and frozen source/wrapper files in each prepared case. Pure policy tests compile helpers and reject malformed observation bounds, coordinates, types, identities and sites without launching the game. They also exercise a UInt32 above signed32 range through the actual converter.

## Preserved failed attempts and scope

LOW v1 and v2 are failed observer attempts, not accepted exports. v1 tried extending an immediate post-authored registry classification to first tick. This guard was unsound: native 41cfc0 creates later render-wheel bodies with flags 0xc00, which also satisfy flags&1023==0. The exact original authored map before free replaces that inference; unknown later bodies are not silently classified as scenery.

v2 exposed a PowerShell wrapper conversion defect: the inherited conversion function handled int/bool/string but not UInt32 array elements. Static-link words became defaults. The fix adds checked UInt32 conversion and an exact linksHex identity guard. Actual-wrapper preflight now checks all words against both the JSON configuration and manifest before any game launch. No native relocation rule was changed to accommodate this observer defect.

The positive reports establish selected exported assets, native construction and actual added-model geometric contact. They do not establish every model/import combination, original rendering equivalence, complete damage/destruction effects, every scripted trajectory, all checkpoint/lap transitions or continuous-race parity. Private installations and raw native process blobs remain local and excluded from Git; reports/traces/frozen observer provenance are retained.

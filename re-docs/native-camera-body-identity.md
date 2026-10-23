# Native physical camera bodies and wheel render bodies

The type4 bodies previously described as wheels in selected native collision/force observations are physical **camera bodies**. This correction is established by captured participant/controller/body pointer cycles, independently of the flags. The actual wheel render bodies are type11, initially `0x8c0b`, and point back to the four wheel records inside each car.

The read-only audit is [native-camera-body-identity-20261023.json](../analysis/native-camera-body-identity-20261023.json). [audit-native-camera-body-identity.mjs](../tools/audit-native-camera-body-identity.mjs) loaded eight retained captures and verified every snapshot blob/context SHA256:158 snapshots and5,087 blobs. It launched no native process or GUI, changed no installed bytes and preserved all older reports. The target SHA256 is `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

For each native participant `i`, the proven relationships are:

| Captured field | Actual target |
| --- | --- |
| participant record `909300+i*30c`, word0 | car body |
| participant record+18h | camera controller `909060+i*4ch` |
| camera controller+0 | physical camera body |
| camera controller+4 | the same participant car body |
| physical camera body+164h | the same camera controller |
| car body+324h+j*c8h+6ch | wheel `j` render body |
| wheel render body+164h | that same wheel record inside the car |
| wheel record+9ch/+9dh | participant index / wheel index |

Globals above are preferred image addresses. The auditor translates them using each snapshot's observed module base and preserves every captured pointer value. It never carries heap pointers between process captures or identifies a body from a matching flag alone.

The native producer stores are explicit. `47f02e` publishes participant+18h before `47f031` calls `416180`. That constructor stores its physical body at controller+0 (`41620d`), initializes its flags to804h (`41621b`), restores the tracked-car argument into controller+4 (`41618c`, `41632a`, `41632e`), and stores the controller at body+164h (`416352`). In the separate wheel constructor, `41cc74` supplies flags8c0bh, `41cd31` publishes the created body at wheel-record+6ch, and `41ce30` stores the wheel record at render-body+164h. The corresponding reconstruction is in `src/camera-construction.mjs`, `src/race-startup.mjs` and `src/vehicle-wheel-construction.mjs`.

Retained instruction evidence, checked by the auditor:

- Camera constructor: `3546-camera-producer-41634d-assembly.json`, Evidence`ev_1e753e5a86c8d408afbf18677e35cb9c097a696614b7eca5bb60b6eb605d325f`.
- Wheel constructor: `1531-wheel-render-constructor-owner-assembly.json`, Evidence`ev_33c24b3dcc5ff1de35a891abf1fef5135b47f7d5a9c2e9c4f5d071a699c81ea0`.
- Race startup: `3556-camera-producer-47f2ea-assembly.json`, Evidence`ev_31f3415cf286d2b5f45d338846077f4f86b9738076dde39473ba58a4253ca3c7`.

The six captures with full owner coverage contain12 whole-frame entry/exit pairs, or24 inspected frame snapshots. Every one proves six linked camera bodies and24 separately linked wheel render bodies. All six cameras occur in the physical-body list; none of the24 wheel render bodies occurs there. No physical type4 body remains unidentified in these snapshots.

| Retained capture | Logical clocks | Corrected observation |
| --- | --- | --- |
| `hidden-full-frame-capture` |228| Six camera bodies and24 wheel render bodies at the first retained active frame |
| `hidden-three-frames-capture` |228..230| The same complete owner relationships in all three entry/exit pairs |
| `hidden-moving-frames-capture` |288..290| Complete camera/wheel identity during the moving window |
| `hidden-turn-frames-capture` |348..350| Complete camera/wheel identity during the later window |
| `hidden-selected-collision-capture` |348| Two kind1 dispatches both involve the physical camera belonging to participant index1 |
| `hidden-selected-force-v2-capture` |513| Twelve47b020 calls alternate participant car0/camera0 through car5/camera5 |

The selected collision's actual object1 is `1158bb80`, whose body+164h points to controller`00be90ac`. Participant record`00be960c` points to that controller and to tracked car`11558680`; the controller points back to both bodies. Its first actual wheel render body is instead `11576180`, pointing back to wheel record`115589a4`. These addresses describe that closed process only.

The correction changes the interpretation of those selected collision/force cases: they validate physical camera contacts/forces alongside car-body forces, rather than physical wheel-body contacts. Existing exact byte comparisons retain their original numeric scope. They must not be cited as evidence of wheel handling solely because the observed body type was4. Separate488910 car wheel-query evidence remains separate from the identity of the physical body receiving an event.

The early standalone terrain captures do not contain the participant/controller graph and cannot independently close these ownership cycles. `hidden-terrain-active-wheel-capture` contains32 queried body headers,24 with flags1c03h and8 with11c03h, all type3. Its name refers to the query purpose, not an observed type4 wheel body. `hidden-terrain-active-body-capture` contains16 queried headers:15 with11c03h and one with10804h. The latter is compatible with a camera body carrying the transient10000h query marker, but that capture alone does not prove its owner. The audit explicitly leaves all48 standalone headers unclassified by owner and does not borrow addresses from another process.

Validation: `node --test tests/native-camera-body-identity.test.mjs` passes5 tests. They cover actual pointer-cycle classification, dispatch/force labeling, an unrelated physical body with flags804h, missing bytes, broken backlinks, wrong tracked participants, wrong wheel indices, conflicting ASLR metadata and the deliberately incomplete terrain-header case. This audit does not establish camera rendering equivalence, uninterrupted source-only frames, audible playback or whole-race fidelity.

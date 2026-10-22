# Race weapon-stage reconstruction ledger

The outer race tick calls `48d7c0`. Its retained3201 assembly is584 bytes (`ev_8c7dd04a8afc52e84554e55a8065848aa8e15f7f8afcd28c2f59a1970bd47c82`, Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`). The complete coordinator and reached game graph now have a populated connected retained-instruction proof; see [race-weapon-stage-connected.md](race-weapon-stage-connected.md) for the current600-world/16-frame result and its explicit scope. The branch ledger below records separate producer and whole-game integration limits.

| Entry | Current source/proof | Remaining scope |
| --- | --- | --- |
| `47b680` pickups | `pickup-world-state.mjs`, actual constructors/scripts/reuse and ordinary/native-network comparisons; see pickup note | Host/retirement/blocking transport branches outside the successful nonhost contract; complete asset/session parent |
| `46a7f0` projectile dispatcher | `projectile-world-state.mjs`; actual pools, all three ticks, trails/routes/terrain/effects/callbacks and constructor→retirement/launch chains | Full physics-parent and loaded-resource integration (coordinator/candidate prefix now proved) |
| `447050` terrain wave | `terrain-wave.mjs`, activation/tick/terrain helpers/contact feedback/particles, full lifecycles and successful local sends | Full session constructor; remaining network branches |
| `48c120` time effect | `race-time-effect.mjs`, complete activation/tick/UV/recovery native comparisons | Bounded coordinator now proved; full outer integration remains separate |
| `48ac00` targeting | `weapon-targeting.mjs`, complete populated target/spatial/terrain native comparisons | Full loaded runtime list/resource producers |
| `41e4a0` held-input recovery | `vehicle-weapon-launch.mjs`; actual gate in1,200 constructed-owner scenarios | Bounded coordinator now proved |
| `47be20` weapon launch dispatcher | `vehicle-weapon-launch.mjs`; all eight actual children,1,200 constructor→parent scenarios/3,600 calls | Successful transport integration for every weapon branch |
| `48d490` launch impulse | Existing `race-launch-state.mjs` actual source | Bounded coordinator now proved |
| `482990` contact colors | `vehicle-contact-colors.mjs`, actual topology/controller/activation/hit/tick producer chain | Full session model-loading and render-consumer parent |

The implemented launch API is `launchVehicleWeapon(record,slotIndex,localMode,unusedContext,packet,runtime)` in `vehicle-weapon-launch.mjs`: ECX is the participant record, EDX chooses slot0/1, and native stack values are localMode/context/packet. The middle context value is unread; child packet producers instead receive the selected slot. Return is numeric EAX. The network worker has the stable export for its `46f6d0` receive binding.

The coordinator's first loop retains native EBP across participants, so unrecognized nonzero launch states reuse the previous participant's age threshold. Exceeding the selected threshold breaks that entire first loop. It also carries live ECX from a first slot launch into the next launch's stack context. These are evidence-backed register/loop quirks, not independent gameplay assumptions; the current port retains them.

Completed branches have their own evidence-linked notes: `race-time-effect.md`, `vehicle-contact-colors.md`, `weapon-targeting.md`, `pickup-world-state.md`, and `terrain-wave.md`. Each reports interpreted native instructions against synthetic raw-memory fixtures, not original-process behavior. The connected proof establishes the bounded populated coordinator domain, while complete networking and a complete game reconstruction remain open.

The coordinator is implemented and connected-oracle validated in `race-weapon-stage.mjs`; its actual default is bound by the outer caller. See [race-weapon-stage-connected.md](race-weapon-stage-connected.md) for exact persistent-world counts, true caller-stack producer corrections and remaining physics/resource/network limits.

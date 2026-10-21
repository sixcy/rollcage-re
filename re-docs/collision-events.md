# Collision scheduling and static response

The JavaScript reference includes native event storage and ordering, acceptance callbacks, fractional pose advancement, and the static normal-impulse routine. Subsequent [response work](collision-response.md) adds the complete numeric dispatcher, body-pair/sliding response and runtime spatial lists. Contact generation and the complete race frame remain separate work. These components have been checked against retained x86 instructions interpreted in a bounded tool; the original game has not been executed.

`src/collision-events.mjs` implements `CollisionEventQueue`, insertion, acceptance filtering and event processing. `src/body-advancement.mjs` connects shared pose arithmetic to native frame clocks, attachment queues and explicit spatial registration handlers. `src/collision-response.mjs` supplies relative contact conversion, point velocity and static-body impact arithmetic. No reconstructed driver currently generates all original collision events for a race.

## Queue storage and ordering

The native structure at `0x902ba0` contains heap count, capacity, event-record pointer, heap pointer, free-stack pointer and free-stack top, in that order. The heap starts at index 1. Event records occupy 104 bytes. A key uses bits 20..31 for the record slot, bits 1..19 for the event's frame time, and bit 0 for terrain/static versus body-pair ordering. Only its low 20 bits participate in heap comparisons: pair keys have bit 0 clear and precede static keys at the same time.

Insertion stops at an equal-priority parent; downward sifting uses strict comparisons, checking the left child before the right child. This is not a stable chronological sort. Reset fills the free stack with ascending slot keys and leaves event and heap storage intact. Allocation pops the highest available free entry. Popping an event immediately returns its complete key to the free stack, before its acceptance callbacks and response. A later candidate refresh can reuse the same mutable record.

Insertion also has observable input mutations: the contact flags are reduced to their low byte, and an optional auxiliary vector is shifted left by8 in place. Subsequent tracing establishes that this vector is the relative contact-point velocity, not a secondary contact point. The API names it `auxiliaryVector`. An incoming `0x40` flag preserves damping bits `0xf00` in the event's short at `+0x5a`. If those bits are zero, the old short survives. A missing auxiliary vector likewise retains the old slot's values. A second body's negative collision-flags word at `+0x110` is cleared in full. The port preserves these behaviors instead of clearing recycled records.

The reference rejects exhausted pools, capacities above 4,096, and event times outside the key's nineteen-bit field. It does not emulate native memory corruption on invalid allocations or overflowing packed times.

## Event processing

The event loop in `0x4749e0` removes the heap root and returns its slot before decoding the record. It records both original body pointers and computes `eventTime - firstBody.frameTime`. `0x474b20` then calls the first body's optional function at `+0x148`, passing first body, second body and the mutable event record. A zero integer result removes that body. The second body's callback follows and sees the current first pointer.

If only the second body survives, it becomes the first, its second pointer is cleared, and the three normal components are negated with signed wrapping. The delta is adjusted by the bodies' saved clock difference. That difference reads the second clock after the first callback, so callback mutations matter. The event kind remains unchanged.

After response, `0x475630` invalidates queued events referencing either **original** body. It scans backwards, replaces each matching heap entry with the last entry, and sifts down that entry and every ancestor. The removed keys return to the free stack. Candidate refresh receives the surviving pointers captured after response, and is skipped when both are null. A negative adjusted delta still completes response, invalidation and refresh once, then terminates the loop. The final body-advancement pass always follows. The assembly's earlier comparison of the masked nineteen-bit time with `-1` cannot succeed; it is not used as an invented sentinel in the port.

`processCollisionEvents` requires explicit `respond`, `refresh` and `finish` functions. It implements this loop, not the preceding body-preparation and candidate-generation routines. `0x474bb0` is the response dispatcher, not a simple body integrator. Its numeric branches and body-pair handling are now available as `dispatchCollisionResponse`; runtime contact storage and object removal remain explicit boundaries. See [response details](collision-response.md).

## Pose advancement and registration

Runtime fields are object-relative:

| Offset | Recovered role |
| --- | --- |
| `+0x118` | Unscaled signed Q16 frame clock. |
| `+0x16a` | Unsigned attachment count; a nonzero count queues the body pointer. |
| `+0x148` | Optional collision acceptance callback. |
| `+0x110` | Collision flags/cache word, distinct from object flags at `+0`. |
| `+0x10c` | Signed byte used by response to gate angular impulse; broader meaning remains uncertain. |

`advanceBodyForCollision` follows `0x474950`: retain the position's three signed high bytes, advance pose through `0x479d20`, queue attached bodies, optionally add `normal >> 7` to position, increment the frame clock by the original delta, then compare those high bytes. A change calls spatial removal (`0x474850`) followed by insertion (`0x474600`). A boundary crossing caused solely by the normal nudge still triggers both calls. Special time scaling changes pose movement for eligible types but does not scale the frame clock.

`finishBodyAdvancement` follows `0x475450` over the null-terminated physical-body list. It computes wrapped `65536 - frameTime` and skips nonpositive remaining intervals. Ordinary bodies use the dynamic advancement path without a nudge. Bodies with flag `0x8000` use `0x4757a0`: translation and clock updates plus attachment queuing, without quaternion advancement, special time scaling or spatial callbacks.

Callers provide explicit `frameTimeQ16`, `attachmentCount`, an `attachmentQueue` when needed, and spatial removal/insertion handlers for dynamic boundary crossings. `src/body-spatial.mjs` now supplies those handlers using explicit pool offsets, runtime linked lists and the parsed spatial selector; allocation remains the caller's responsibility. `advanceBodyDelta` exposes the native signed32-bit delta domain while the earlier `advanceBody` API keeps its convenient 0..65536 frame-fraction contract.

## Static normal impulse

`prepareStaticContact` (`0x475890`) changes the world point from Q8 to a relative Q16 lever arm: `(point << 8) - position`, clearing each result's low byte. It also shifts the contact scalar left by 8. `collisionPointVelocity` (`0x47a4f0`) returns linear velocity plus the fixed-point cross product of angular velocity and that lever arm.

`resolveStaticContact` (`0x447dd0`) does nothing when the dot product of point velocity and the normal is nonnegative. For incoming motion it computes a normal impulse using body coefficient `+0xb0`, inverse mass, the contact lever arm and the cached world inverse inertia. The coefficient enters as `-(65536 + coefficient) * normalSpeed`. The rotational denominator uses the native intermediate `>> 8`; it is not interchangeable with a floating-point rigid-body formula.

The impulse changes linear momentum. Only a signed value above 1 in byte `+0x10c` also adds its lever-arm cross product to angular momentum. The angular term in the denominator is still present when this byte inhibits torque. The port exposes this uncertain field as `collisionCount10c`, without assigning a broader gameplay meaning.

Response refreshes linear velocity directly from momentum and inverse mass, **without** the general speed limiter. It retains the cached world inertia, computes angular velocity and quaternion derivative, and leaves pose and frame clock unchanged. `advectCollisionContact` (`0x475290`) separately adds post-response linear velocity times a signed delta to an already-relative contact point. Class-specific call order and side effects remain the dispatcher's responsibility.

## Retained evidence and checks

Evidence lives under `analysis/scene/results`, with the checkpoint ledger at `analysis/scene/collision-event-evidence-bundle.json`.

| Native anchor | Assembly result |
| --- | --- |
| `0x4749e0` | `278-physics-frame-assembly.json` |
| `0x440510`, `0x440550`, `0x4405a0` | `292-event-heap-build-assembly.json`, `299-event-heap-push-assembly.json`, `286-event-heap-sift-assembly.json` |
| `0x475500`, `0x475630` | `297-event-heap-insert-assembly.json`, `293-event-heap-invalidate-assembly.json` |
| `0x474b20`, `0x474950` | `285-event-filter-assembly.json`, `284-body-event-advance-assembly.json` |
| `0x475450`, `0x4757a0` | `281-final-body-advance-assembly.json`, `295-kinematic-body-advance-assembly.json` |
| `0x447dd0`, `0x47a4f0` | `312-static-contact-impulse-assembly.json`, `313-contact-point-velocity-assembly.json` |
| `0x475890`, `0x475290` | `317-contact-relative-point-assembly.json`, `318-contact-advect-assembly.json` |

`verify-collision-events-instructions.mjs` checks 443 retained instructions: 14,403 insertions and 4,797 invalidations across 600 pool fixtures, preserving complete heap/free storage and event bytes; 3,000 callback fixtures; and 1,500 whole-frame executions producing 3,333 events, including 255 negative-delta terminations. Acceptance callback implementations and nonqueue frame callees are explicit state-mutating mocks; the check establishes their calling order and data flow, not their physics.

`verify-body-advancement-instructions.mjs` checks 692 retained instructions: 8,000 individual advances and 1,500 completion batches, including both quaternion normalization paths, shared pose arithmetic, matrix conversion, root and division instructions. It compares every byte of 384-byte body regions, attachment queue entries and spatial-call observations. Only spatial removal/insertion are event mocks. The large-quaternion fixtures keep normalized root inputs in the supported nonnegative domain; an initially overbroad synthetic generator was corrected to avoid native overflow states outside that contract.

`verify-collision-response-instructions.mjs` checks 598 retained instructions on 5,000 static-contact fixtures, with no helper stubs: 20,000 calls covering point velocity, normal impulse, relative conversion and advection. All body/contact bytes match. Of these fixtures, 2,458 apply impulses and 1,026 enable angular impulses. Normals include oblique directions and inertia includes off-diagonal terms.

The focused tests include an analytic elastic bounce split at half-frame and an event-refill sequence that reuses the current record. They are declared synthetic inputs, not observed gameplay. The original game remains unchanged and unexecuted; full race equivalence and a rebuilt executable are still open.

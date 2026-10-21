# Body-pair response and collision dispatch

The reference now implements all numeric branches of the response dispatcher `0x474bb0`, including body-pair impulses, class8 sliding, overlap corrections and damping. It connects the existing event queue and pose advancement to runtime linked-body spatial lists. Contact storage and object removal still require explicit handlers. Detection of contact times, candidate regeneration, attachment processing and the complete race frame remain incomplete.

This work uses retained Ghidra assembly interpreted by bounded verification tools. The original game has not been executed, and these names are inferred descriptions rather than recovered source declarations.

## Components and boundaries

| Module | Reconstructed behavior |
| --- | --- |
| `src/collision-response.mjs` | Static and body-pair normal impulses, velocity splitting/exchange, contact conversion/advection and penetration correction vector. |
| `src/collision-sliding.mjs` | Tangential linear replacement, independent angular projections, support torque and slow-body clearing. |
| `src/collision-dispatch.mjs` | Complete response branch selection, native operation order, clock splitting, header updates and explicit lifecycle/storage calls. |
| `src/body-spatial.mjs` | Native doubly linked body lists, tagged outside references, and selection using the parsed level spatial index. |
| `src/physics-frame-state.mjs` | Collision clock/cache initialization and vehicle cooldown decay at `0x46e9b0`. |

`dispatchCollisionResponse(event, deltaQ16, options)` can be supplied to the existing queue processor. Its options accept `handlers`, explicit `gravityQ16` when a branch reads gravity, special-time context, and vehicle pair-response context. Runtime body fields include `collisionCounter168`, `collisionCache114`, `collisionState128`, `frameTimeQ16`, `attachmentCount` and the earlier numeric body fields. `storeContact(body, contact)` and `removeBody(body)` are required only on paths that call those original helpers. Spatial handlers can now come directly from `BodySpatialRegistry.handlers()`.

## Dispatcher branches

For a nonnull first body, entry decrements its counter byte `+0x168`; a nonnull second pointer decrements the **first counter again**, regardless of event kind or pointer aliasing. It clears collision flag `0x10000000` and sets cache `+0x114` to `-1`. The classification uses the low byte at event `+0x54`.

For event kind1, it clears body state `+0x128` and uses these exact classes:

| Class | Native operation order |
| --- | --- |
| `1` | Advance with normal nudge; prepare relative contact; measure point velocity; static impulse; type7 slow-body check; store contact. |
| `2` | Prepare contact; form/apply overlap position correction; measure point velocity; static impulse; type7 slow-body check; store contact. **No time advancement.** |
| `8` | Remove normal linear speed, then follow the signed tag branch below. |
| `16` | Call the explicit object-removal handler. |
| `64` | Advance without a normal nudge, then damp linear velocity and momentum. |
| other | Advance without a normal nudge. |

Class64 retains rounding of each separate arithmetic shift. Codes `0x100`, `0x200`, `0x400`, `0x800` use respectively `v>>1 + v>>2 + v>>3`, `v>>1 + v>>2`, `v>>1`, `v>>2 + v>>3`, with each term shifted before addition. For example, code `0x100` maps input `-1` to `-3`; multiplication by a floating-point fraction would differ. Other signed-short codes preserve the components.

The overlap correction helper negates the stored penetration scalar, then returns `normal * scalar + (normal >> 7)` with native Q16 products. Position correction checks high position bytes and updates spatial lists when needed, without changing the frame clock. The contact lever arm was prepared before this movement and remains as originally calculated.

## Class8 sliding and stopping

Class8 first projects linear velocity onto the normal and retains its tangential remainder. Momentum becomes mass times that remainder. It compares the **signed16** event tag with **signed8** body byte `+0x10c`, arithmetically shifted right1.

Above that threshold, it projects angular momentum and angular velocity independently onto the normal, advances without a nudge, prepares and advects the contact, then applies the slow-body test. This stopping test applies to every object type on this branch. At or below the threshold, it advances, prepares and advects, then adds support torque only if signed byte `+0x10c` exceeds1; this branch has no slow-body test.

Support magnitude is `((mass * gravity) * normal.y) >> 2` using separately rounded Q16 products. It forms an impulse along the normal and adds **impulse × leverArm** to angular momentum, then refreshes angular velocity through cached world inertia and `>>8`. Its quaternion derivative remains stale. Angular projection also preserves the old quaternion derivative.

Slow-body tests OR together the wrapping absolute values of each velocity lane and compare the resulting signed words against wrapped `2*gravity` and `5000`. This is not a vector-length comparison. Stopping sets the high collision-cache flag and clears linear/angular momentum, linear/angular velocity, force and torque. It leaves pose, time and quaternion derivative unchanged.

## Body-pair behavior

For kinds other than1, a missing second body clears first-body flag `0x2000` and advances the first body without a nudge. With two bodies, the dispatcher clears that flag on both, resets their collision caches/state, and saves the second normal as the negation of the original first normal. It retains the original world contact point for the second lever arm.

Pair class2 shifts the first contact scalar left7 before penetration correction, moves the first body by the correction and the second by its negation. Pair class8 instead shares half the relative normal **linear velocity**, subtracting it from the first and adding it to the second with arithmetic shifts. This sharing is independent of mass; each momentum is subsequently reconstructed as its own mass times velocity. There is no approaching-contact guard in that helper.

Let `d = wrap(firstClock - secondClock)`. If `d<0`, first advance delta is `wrap(inputDelta+d)`; otherwise it is the input delta. Second delta is `wrap(d+firstDelta)`. Zero deltas skip their advance calls, including the normal nudge and attachment queuing. Other signed values are preserved. Both lever arms are then formed as `(worldPoint<<8)-position`, **without** the static conversion's low-byte mask. Class8 advects both contacts with their respective deltas. Other pair classes call the normal-impulse routine.

`resolveBodyPairContact` uses the first body's restitution coefficient and an explicit relative contact-point velocity supplied by the event. It has no static routine's approaching-speed early return. Both inverse masses and rotational responses enter the denominator, with a native rounding asymmetry: the first body shifts its transformed inertia vector right8 before the next cross product; the second body takes that cross product first and shifts its result right8. The implementation preserves both expressions.

Vehicle type3 reads a signed field at `+0x3d00`; if the byte pointed to by `+0x6bc` equals1, its response class becomes3. Other types use class0. The higher-class body's impulse magnitude is arithmetically shifted by the wrapped class difference, masked to five bits. These classes and differences are not clamped or interpreted as a physical mass ratio. Explicit context exposes `field3d00` and `stateByte6bc`, with null representing the original `-1` pointer sentinel. Each body's signed `+0x10c` byte independently gates angular impulse.

The event vector at `+0x5c` was previously described as a secondary point. That interpretation is corrected: `0x422dc0` fills it from the difference between two cached contact-point velocities at cache `+0x14..+0x1c`, and `0x475500` shifts it from Q8 to Q16. Both lever arms are separately derived from the world contact point. The insertion API now names it `auxiliaryVector`; the pair response consumes it as relative velocity.

## Runtime spatial lists

`BodySpatialRegistry` takes explicit `{body, poolOffset}` entries and a bucket selector. Native IDs are `poolOffset/128+1` in an unsigned16 field. Offsets represent address units; they do not imply that a complete vehicle occupies128 bytes. Allocation and pool layout remain the caller's responsibility.

Each runtime bucket supplies mutable `headId`; bodies hold `spatialNextId`, `spatialPreviousId`, `spatialBucket` and `spatialOutside`. Insertion prepends, resets previous ID to zero, and updates the old head. Removal handles head/middle/tail links and clears both IDs, while retaining the tagged bucket reference and outside flag. The reference rejects invalid handles rather than reproducing invalid memory access.

`createBodySpatialSelector(parsedIndex, buckets)` uses the recovered level lookup, including height selection and outside fallback, to select caller-owned mutable buckets. Runtime buckets are separate from serialized level data. Pose and overlap correction can therefore use real registration handlers. This does not implement the later broad-phase grouping or narrow-phase collision queries.

Frame start (`beginPhysicsFrame`) resets all physical-body clocks and caches, including disabled bodies. For nonzero `+0x10c` and flag `0x8000` clear, it retains only the high collision flag and initializes counter `+0x168` to3 for types3/4/29 or1 for other types. A separate explicit vehicle list decays byte `+0x66f` by32, saturating at zero. Body preparation after this initializer still includes unported gravity/drag/effect paths and the `0x2000` scripted-motion interpreter.

## Verification and installed-data probe

| Tool | Retained instructions | Coverage |
| --- | ---: | --- |
| `verify-pair-response-instructions.mjs` | 897 | 5,000 fixtures /15,000 calls; full16,384-byte body regions and contact bytes. Includes2,497 nonapproaching cases, signed class differences, overrides, unequal masses and295 body aliases. No helper stubs. |
| `verify-collision-sliding-instructions.mjs` | 448 | 4,000 fixtures /16,000 calls; all384 body bytes, contact and input vectors. Full signed arithmetic and extreme gravity/mass; no helper stubs. |
| `verify-collision-dispatch-instructions.mjs` | 2,559 | 6,000 complete dispatcher executions; all branches, full body/event bytes, ordered spatial/storage/removal observations and attachment queues. Only those runtime handlers are mocked; numeric and advancement callees execute retained instructions. |
| `verify-body-spatial-instructions.mjs` | 85 | 600 fixtures /57,600 operations:30,313 insertions /27,287 removals; complete pool/bucket bytes, sparse IDs through65,535 and outside tags. Only bucket selection is mocked; actual parsed selection has separate tests. |
| `verify-physics-frame-state-instructions.mjs` | 51 | 2,000 batches /15,967 bodies /8,030 vehicle entries, complete1,792-byte regions; no helper stubs. |

Reports have corresponding names under `analysis`, ending in `-instruction-check.json`. Opcode interpretation now includes byte sign-extension and signed byte shifts required by class8's tag comparison. All20 earlier instruction-verification tools passed after that change. The focused suite has140 passing tests.

`node tools/probe-collision-response.mjs` connects frame initialization, queue processing, dispatcher, pose completion and actual spatial lists on all80 level packs. It samples authored terrain vertices and packed normals for1,220 static impacts,1,220 overlap corrections and1,220 pair impacts:3,660 scenarios /4,880 bodies. All finish, with121 spatial reinsertions,2,440 stored-contact observations and8,540 attachment queue entries. The report is `analysis/collision-response-probes.json`.

Event times, body profiles, pool offsets, initially empty runtime buckets and attachment state are explicitly synthetic. Candidate refresh is inert and contact storage is an observable copy, not the original cache mapper. This probe does not infer contact times, run the wheel stage, process queued attachments or establish race equivalence.

Retained evidence includes assembly 320..324, 329, 340, 348..351, 360..361; pseudocode 325..328 and 330..334 seeds the remaining preparation/generation work. The checkpoint ledger `analysis/scene/collision-dispatch-evidence-bundle.json` contains 351 records with zero unknowns. Full game reconstruction remains incomplete.

Subsequent work adds [sphere detection and candidate generation](body-pair-detection.md), including actual contact-cache storage, native grouping, refresh and static contact merging. The new pair probe computes event times from original vehicle sphere geometry and processes follow-up events; the older single-event response probe above retains its declared event inputs for comparison. The current focused suite has 172 tests and the instruction sweep has 35 passing tools.

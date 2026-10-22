# Special placed-model contact effects

`src/model-contact-effects.mjs` closes the actual class1 `48ec50` and class2
`4142a0` paths reached by the raw `423ab0` model query. Its native fragment bank
constructor `48e800`, emitter `48e900` and update `48edb0` are also reconstructed.
Evidence `1460..1477` is retained in `analysis/native-simulation/results`.
`44ef90` attachment release is the actual default from
`body-attachment-release.mjs`; the raw query now also uses that default for the
extra class4 action. Geometry/pointer mappings remain explicit, while these game
effects execute actual source algorithms rather than inert callbacks.

The class1 routine captures the16-byte metadata row selected by object WORD
`+190` from global`909294`. Byte`+6` bounds the shape loop and is reloaded after
each emitted shape. Descriptor centers are added directly to the object's Q16
position without applying yaw. The per-shape byte at
`909290 + 8*(object.u16(+18e)+shapeIndex)+3` supplies the fragment count/tag;
configuration type2 invokes `48e900` with size equal to that byte shifted right
once. Every visited shape emits actual sound code14, a particle burst and debris.
The routine then removes physical spatial membership, releases attachments and
sets the object class to5. It returns1 even when the shape count was zero.

Class2 captures `920800 + 16*object.byte(+19b)`, sets class5, removes spatial
membership and releases attachments. It then reloads model count and
configuration pointers while disabling every shape and marks captured row`+9`.
The outer raw query clears row WORD`+6` **before** calling this helper, matching
`423f20..423f35`. Attachment callbacks can mutate the index/model pointers;
capture/reload timing remains observable and is tested.

`initializeModelContactFragments({memory})` ports `48e800`. It reserves64
384-byte records from `902eec + (70dcf4 & ~3)`, increments the arena cursor by
`6000h`, initializes original type14/render fields from the material row selected
by `[90b990].u16(+2e)+4d`, and preserves unrelated bytes. The surrounding arena,
material table and resource loaders are caller-owned inputs.

`emitModelContactFragments(x,y,z,count,size,tag,{memory,scratchBase})` ports
`48e900`; scratchBase is its native entry ESP. Existing ring occupants are
spatially removed before reuse. Three original RNG draws choose independent
signed offsets, shifted by `(size.byte>>2)&31`; their wrapped position delta is
normalized with the native integer length/division. Each record receives byte
lifetime255, speed`5*size.byte`, deceleration10 and actual packed particle spatial
registration. The ring wraps at64, and the emitted-count global resets on every
invocation, including zero count. A zero generated direction follows the native
division fault rather than inventing a fallback.

`updateModelContactFragments({memory})` ports `48edb0`, a direct child of
`450e50`. It captures the arena base, decrements each active lifetime byte and
unlinks expired records inline. Expired records still receive that update's
position/deceleration/gravity step; subsequent calls skip them. Position advances
by `(direction>>1)*speed` with32-bit wrapping and vertical `48000h` acceleration.
The deceleration path uses signed comparisons and short decrement, while the
small-speed branch writes4. Spatial membership is not moved between expiry
updates, matching the target.

`verify-model-contact-effects-instructions.mjs` passes400 cases per entry and
six complete constructor→emit/reuse→256 updates→reactivation sequences:3,554
calls,16,244,218 interpreted steps,17,372 emitted fragments,147 occupied-ring
reuses,4,706 expirations,800 ordinary particles and12,000 debris records.
Every byte in native data memory`10000h..9fffffh` is compared after every
operation; private entry stack/low address space is outside the comparison.
Only compiler-cookie validation is admitted externally. Sound takes the real
absent-bank branch; no game-owned effect helper is mocked.

`verify-model-contact-connected-instructions.mjs` passes180 raw-query and180
full `4749e0` ordinary-body calls, with all three special classes present:
210 accepted model hits,133 processed events,156 class1 contacts,158 class2
contacts and374 actual attachment-release calls over9,682,521 interpreted steps.
It also compares **all** native data bytes above`10000h`, rather than a selected
list of anticipated stores. This exposed the ordinary cache's `429820` float
matrix publication, now supplied by the shared physics runtime at the original
calculation stage. Existing vehicle/script/world-effect parent coverage remains
separate; this checker does not imply those contexts are complete.

The metadata roots are not fabricated native producers: retained `44cac8` and
`44cad3` publish the relocated loaded header's`+7c/+80` fields to `909290/909294`.
The complete `44c2b0` resource loading/relocation lifecycle and object metadata
construction remain upstream work. These fixtures explicitly construct their
inputs and never execute the original game or modify installed resources.

The outer `runRaceUpdate` now defaults its direct `48edb0` call to
`updateModelContactFragments(context)`. The scoped binding inventory is retained
in `analysis/race-update-ownership-model-fragments.json`:25 of42 direct game
callees have source defaults at that checkpoint. This counts bindings, not
transitive closure or a reconstruction percentage.

`verify-race-model-fragments-connected-instructions.mjs` checks the actual
`450e50` caller and actual `48edb0` at its nested ESP−20 entry. Eight scenarios
each begin with actual `48e800` construction and `48e900` emission, retain the
bank across260 alternating intermediate/final substeps, expire all original
records after255 updates, execute an empty-bank update and emit new records with
the real producer. A declared earlier-stage speed mutation is consumed by the
fragment update in the same tick. Other41 direct game stages and the final audio
manager service are explicit contracts; this is not a whole-tick claim.

All data bytes`10000h..9fffffh` match after every producer/outer call:2,080 parent
calls,24 actual constructor/emitter calls,2,743,513 interpreted steps,283 expiry
events and24 still-active reemitted records. The focused outer test also proves
that this default runs between the neighboring stages on every substep, performs
the expired record's final movement, and leaves inactive positions unchanged.

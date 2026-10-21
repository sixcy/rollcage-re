# Connected vehicle contacts

`src/vehicle-contacts.mjs` connects the recovered terrain/model candidate builders, wheel ray selection and remembered-side preparation. `initializeVehicleContacts()` supplies the original common wheel geometry and aggregate body radius. `updateVehicleContacts(data, grid, modelContext, body, state, options)` updates wheel contacts and surface metadata; callers advance body state and apply suspension separately. This is a reference component, not a complete vehicle frame or playable game.

## Verified constructor data

The vehicle constructor `0x41dbb0` registers five 20-byte collision-shape records from `0x5ead60` via `0x428270`, then installs four 28-byte wheel descriptors from `0x5eac60` via `0x488220`. `node tools/recover-vehicle-contact-template.mjs` verifies both tables against retained Ghidra reads and the original executable's file-backed PE bytes. `src/vehicle-contact-template.json` records the target hash, addresses, file offsets and Evidence IDs.

Wheel positions in source units are `[-27,0,32]`, `[27,0,32]`, `[-27,0,-32]`, `[27,0,-32]`. Each local direction is `[0,1,0]`; positions and directions are stored as Q8 shorts. Native initialization assigns tags 0..3 and a Q8 range of 11,264 (44 units). The five body shapes have centers `[-16,0,25]`, `[16,0,25]`, `[-16,0,-25]`, `[16,0,-25]`, `[0,0,0]`, each with Q8 radius 4,864 (19 units), flags 1 and tags 0..4. The aggregate query tag is 5.

The original quantized root routine gives base radius 12,448 Q8 and wheel-extended radius 15,520 Q8. The maximum, 15,520 (60.625 source units), supplies both candidate builders. Preserve per-product signed 64-bit shifts, wrapped sums and lookup quantization rather than substituting a floating-point length.

`node tools/verify-wheel-initializer-instructions.mjs` interprets 149 retained wheel-initializer/root instructions with no helper stubs. Four initial-radius cases match every byte in the compared 1,024-byte region, including descriptor writes, tags, range and maximum-radius update. The report is `analysis/wheel-initializer-instruction-check.json`. This does not verify the full allocator/registration constructor or initialize the vehicle's unported gameplay fields.

## Model candidate generation

`src/model-candidates.mjs` ports `0x429360` with shape screen `0x429600` and plane filter `0x4292a0`. `createModelCollisionContext` resolves static placement lists, collision models and instance settings once. `buildModelCandidates` uses the body's original spatial registration; terrain's velocity-midpoint lookup does not select model lists. An optional `spatialState` supplies caller-maintained registration. Candidate order and repeated references are retained.

Parent body flags `0x200` or type 4 skip this stage; class-5 objects and configuration-type-5 shapes are skipped. Configuration is indexed by shape index here, while the later model hit query indexes by the shape's configuration slot. Polyhedron screening visits the first `faceCount-1` planes, deliberately omitting the last plane. Overlap override flag `0x80010000` retains the native approach/penetration rules.

Point/edge screens call their respective sphere helpers, then unconditionally overwrite the local output flags with 2. Therefore those shapes always pass candidate acceptance. The port reproduces that acceptance without their unused scratch calculations. This does not implement point/sphere or edge/sphere contact response elsewhere.

`node tools/verify-model-candidates-instructions.mjs` compares candidate counts, all 6,144 pool bytes and restored query bytes against 454 retained instructions on 3,000 synthetic fixtures: 11,772 candidates match. Point/edge helper outputs are varied mocks; their flags are overwritten by the retained caller. See `analysis/model-candidate-instruction-check.json` for scope and counts.

## Installed-data coverage

`node tools/probe-vehicle-contacts.mjs` exercises all 80 level packs with 7,188 declared stationary upright body states: 3,636 above sampled terrain cells and 3,552 aiming wheel zero above upward-facing model polygons. It retains actual spatial lookup and never forces the aimed model into the candidate list. All stages complete without failures: 42,864 terrain candidate references, 10,216 model candidate references, 7,812 terrain contacts and 1,044 model contacts. There are 719 sampled model-candidate instruction comparisons, all matching. Selected contacts then pass through suspension with signed-integer momentum checks.

These probes explicitly use an inert breakable-contact callback. They are synthetic states over installed data, not captured game states, valid spawn positions, or runtime-equivalence evidence. Misses and zero-distance overlaps are retained. The earlier terrain-only report uses a different synthetic wheel layout/radius and remains a separate experiment. Reports and representative mixed-contact samples are in `analysis/vehicle-contact-probes.json`.

The focused suite has 112 passing tests, including original wheel/radius initialization, model candidate filters/order/repetition, and a connected fixture with one wheel on a model roof and the other three on terrain. Native requests through `211` are checkpointed in `analysis/scene/vehicle-contact-evidence-bundle.json`.

## Remaining boundary

Damage/link/effect updates, nonzero-radius collision response, pose advancement and collision/race event scheduling remain open. [Drive preparation](wheel-drive.md) covers the common capacity/state routine and special surface classifier; [the connected wheel path](wheel-frame.md) adds steering, the drive caller and traction-force application, and [the vehicle frame stage](vehicle-frame.md) adds post-wheel assists and derivative refresh. The caller still owns mutable spatial registration and object lifetimes. The connected selector preserves the native shared-buffer quirk documented in [model queries](model-queries.md): a farther model can overwrite geometry fields while terrain flags/fraction are restored. No original game process has been run.

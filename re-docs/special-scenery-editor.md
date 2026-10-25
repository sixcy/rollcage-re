# Existing special-object editing

The editor preserves original object behavior while translating existing ordinary special scenery, scripted models and non-model particle emitters. It does not convert those objects to plain static substitutes. Plain compatible scenery retains its earlier add/import/duplicate/remove workflow.

## Operations and dependency ownership

src/scenery-editor.mjs separates editable transforms from importable, duplicable, removable and yawEditable capabilities. Native type-zero classes 0, 1, 2, 3, 4 and 7 use the original 44ccbc placement constructor. Existing flags, class, destruction configuration, geometry references, material indices and attachment handles remain intact. Packed/animated materials prohibit import when their closure is unavailable, but do not prevent moving an original instance while retaining its existing records.

The native +22 linkage flag chains to the previous grouped ordinary placement; a repeated destruction configuration ID alone does not join objects. Linked chains and shared positional attachments move together. The editor computes transforms from original inspected poses, avoiding accumulated rounding drift across repeated yaw edits. Tilted authored objects retain their tilt and support translation only. Ordinary collision memberships use the same bounded conservative spatial rebuilding as plain scenery.

Attachment type 1 identifies an authored 32-byte light row; types 3 and 4 identify authored 12-byte emitter rows. Their positions follow the object's transform, and shared targets require coherent owning-object transforms. Type-2 light particles are created from the original local model points by the native constructor. Type-5 script-trigger handles retain their original identifiers and control words.

Moved light positions receive fresh terrain ranges from the existing recovered 44d230 expansion, using the actual destination spatial bucket, region tables and sector dimensions. The editor rejects moves that would exceed the native eight-light terrain-band capacity. Original color, palette, timing and script selectors remain unchanged.

## Scripted models and particles

Native type-24 authored records select constructors through the retained 429c90 table. Existing model types 20, 24, 25, 29, 31 and 35 support complete-path translation. Type 32 has no model and is shown as an emitter marker. Original type-2 and type-13 render-particle records also support position edits with their numbering preserved.

src/scripted-scenery-editor.mjs decodes the known linear 476550 command progression. Absolute op-2 positions and op-3/op-7 curve control points translate in signed Q16 storage; op-0/op-1 velocities remain relative and unchanged. Curve speeds, actions, command words and offsets are preserved. Used op-4 restart positions translate in their signed-short table. Aliased script tails and shared restart points identify complete owner groups; conflicting edits reject before output. A byte-level write guard also protects opcode/control bytes and rejects partial coordinate/restart overlaps. Unknown command words remain locked rather than guessing a command length.

LEV10 placement 43 shares a script with a standalone authored light. Its capability notice explicitly says the shared light moves too. The compiler translates the common path and restart point, the light's authored origin and its terrain ranges together. Other unmodified metadata is preserved; a model-only override that conflicts with another owner rejects.

Scripted objects cannot currently rotate, duplicate, import or delete through the editor, because those operations require different closure and ownership rules. Plain scenery remains available for those operations. These are operation-specific restrictions, not an assertion that special behavior was removed.

## Viewer and project behavior

The static Models workspace uses original embedded materials and native authored matrices for scripted models. An immediate op-2 teleport is reflected in the initial preview when it executes before motion. The draft retains its actual BTP origin; both it and the preview translate by the same delta. Non-model emitters have markers, numeric coordinates and focus controls. Selected scripts display their control-point paths. Live Racing test continues to use the original recovered constructors and simulation rather than this static editor snapshot.

New projects retain the ordinary model-row shape: source library, template index, identity, position and yaw. Version-2/3 projects omitted nonordinary originals. Migration restores those missing originals in native order, preserving saved ordinary edits and imported rows. Version 4 does not silently restore an intentional unsupported deletion; it rejects that project. No-edit resources remain byte-identical.

## Evidence and acceptance

The implementation reuses existing native reconstruction rather than deriving semantics from names: 44c2b0 placement loading, 44ee60 attachment construction, 44f050 coordinate updates, 44f3a0 emitters, 44e220 light initialization, 44d230 terrain ranges, 429c90/429d60 scripted construction/startup, and 476550 script execution. The historical retained-instruction reports include analysis/track-runtime-placement-extraction-20261022.json (240 fixtures, 480 operations) and analysis/track-object-metadata-instruction-check.json (2,400 fixtures). They are interpreted-instruction evidence and do not independently establish edited-game export behavior.

- analysis/special-scenery-editor-corpus-20261025-v8.json covers all 40 LOW/HIGH variants, no-edit byte identity, original-plus-scripted textured scene decoding, finite bounds and representative every-present special-kind edits (226 compiled cases). All 3,846 inventoried originals across the two qualities are transformable subject to operation-time native capacity limits.
- analysis/special-scenery-editor-browser-20261025-v3/report.json covers actual special/linked/scripted/particle edits, capability controls, focus, history, v4 save/load, legacy v3 hydration, rejected partial groups and scripted yaw, fresh three-car testing, LEV10 shared-light translation, real drag return without stale preview matrices, and zero DOM mutations over 20 idle frames.
- Focused tests cover sparse/invalid input, preserved metadata, linked transforms, signed limits, shared emitters, static and scripted attached lights, the standalone shared-light case, script-coordinate/control-byte separation and project migration.

These source/browser checks do not claim continuous original-process special-object trajectory parity. Native export acceptance is recorded separately by the root validation workflow. New object types, arbitrary script creation, behavior rewiring and special-object imports remain unsupported.

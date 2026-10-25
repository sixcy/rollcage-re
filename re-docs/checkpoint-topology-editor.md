# Checkpoint topology editing

The editor now supports inserting a copied logical checkpoint, removing a checkpoint while retaining at least two, choosing a finish by rotating the cyclic order, and independently toggling timing feedback. Insertions clear the timing bit on every copied alternative plane. Removing the finish chooses the next remaining checkpoint as the new finish. Start positions stay unchanged; native starting orientation follows the first checkpoint direction, with the constructor's side-dependent reversal.

## Native reference audit

The audited file references are header byte `95` (logical count), dword `a0` (20-byte plane records) and dword `bc` (four byte-ID lanes per logical checkpoint). Loader `44c2b0` publishes these as runtime pack `44`, `70` and `90`. Plane `+01` contains its logical order and `+02` its unsigned progress fraction. ID `ff` is reserved; at most 255 distinct planes are representable. An alternative plane must retain the order of its owning logical checkpoint. The editor preserves lane relationships, raw `+0a` bytes, unknown flag bits at `+12`, byte `+13`, and all unrelated resource bytes.

Consumers audited in source and retained native evidence:

- `449d40` uses lane zero, record `20/21` logical stages and `22/23` plane IDs. It reads plane position, direction, sector, progress and flag bit0. Logical stage zero calls `449760` independently of that flag.
- `44a2e0` searches all four lanes and initializes logical stage from the selected plane's `+01` byte. `respawn-runtime.mjs` supplies those relocated views.
- `417210` / `449cd0` use selected plane direction to sign the road tangent; `44a1c0` also has hardcoded logical stage tests for native session modes11/12 (LEV12/13). Topology edits on those two levels are rejected when `{level}` is supplied. Moving planes and toggling timing remain allowed.
- `41dbb0` uses the first packed ID and that plane's direction/position to orient the starting cars. Per-slot XYZ is a separate table and is retained.
- `449760` updates lap state and race completion. `44a560` / `4459f0` handle split/lap-time display feedback; flag bit0 is not the sole lap counter.

Retained evidence includes `analysis/native-simulation/results/125-checkpoint-transition.json`, `126-checkpoint-transition-assembly.json`, `133-checkpoint-interpolation.json`, the checkpoint-progress evidence bundle, `analysis/scene/results/267-track-basis-axis.json`, `268-track-basis-axis-assembly.json`, `269-track-basis-route-sign.json`, and `271-track-basis-route-sign-assembly.json`. The source counterparts are `respawn-progress.mjs`, `track-basis.mjs`, `vehicle-construction.mjs`, `race-completion.mjs` and `lap-timing.mjs`. No speculative raw offset scan or guessed extra references are serialized.

## Serialization and identities

`createCheckpointTopologyDraft(data, legacySparseEdits)` hydrates existing sparse position/direction edits onto stable logical/plane string identities. Each logical row has four explicit plane lanes, including null sentinels. `sourceId` selects an original raw record as the template for opaque settings; it does not constrain the new native ID. `compileCheckpointTopology(data,draft,{level})` validates the entire operation before allocating output. No edit returns byte-identical data. Position/timing-only edits retain table locations, IDs, order and authored progress. Topology changes append rebuilt, aligned tables and publish the three header references, retaining old bytes as inactive data.

After topology changes, progress is `floor(logicalOrder * 65536 / count)` on every alternative plane. This is an explicit editor authoring policy, not a recovered original map compiler: infinite-plane anchors need not lie near the road, so their Euclidean distance is not track length. Unchanged topology retains authored progress exactly. New planes must actually intersect covered terrain through `raceLayoutCheckpointConstraint`; they cannot inherit an untouched original plane's exemption.

## Validation

`node --test tests/checkpoint-topology.test.mjs` covers no-edit identity, sparse hydration, alternatives, unknown flags, order/count/progress references, finish rotation/deletion, the reserved ID boundary, unsupported terrain and rejection atomicity. It runs actual reconstructed `transitionCheckpoint`, `finishRaceProgress` and `updateLapAdvance`, including reverse finish crossing and timing markers independently off/on.

`node tools/validate-checkpoint-topology.mjs NEW_REPORT.json [INSTALLATION]` checks all 40 LOW/HIGH variants, including LEV16/17. It inserts on covered terrain, rotates the finish, checks removal restores source identity, verifies starting slots, and runs three synthetic crossing cycles with every timing bit disabled/enabled. The final result is `analysis/checkpoint-topology-matrix-20261025-v2.json`. These are source-consumer checks over real data, not original-process captures or driven full-lap parity evidence.

The browser checks in `analysis/topology-editor-browser-20261025-v3/report.json` cover the actual route/checkpoint controls, disconnected-route preview plus strict Test rejection, connections, undo/redo, timing, finish rotation, removal, stable Camera selection, version5 project save/reload and a fresh reconstructed race. `analysis/race-layout-editor-v5-browser-20261025-v1/report.json` additionally validates numeric relocation, atomic rejection, real archive export, and browser/Node racing snapshots. Both contain screenshots.

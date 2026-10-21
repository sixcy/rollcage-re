# Race progression and ranking pass

`src/race-progress-pass.mjs` reconstructs the complete449640 parent for Rollcage Redux1.3.8.0. The default children are actual48da10 route selection and449d40 checkpoint transition, using the existing coherent native-memory views. Other source callers can override either child explicitly.

Evidence: `analysis/native-simulation/results/198-race-progress-pass.json`, pseudocode `ev_f375b51dcf4cc908a3d82dc2c7b89c94603510c94fbe623170cd783a6576a619`; assembly `199-race-progress-pass-assembly.json`, `ev_255742ceb7426477a454604795323fd22b147f084598308c1ed1eadd3f741a8a`. These are retained shipped-artifact observations. Validation uses interpreted x86; the original executable was not run.

## Actual order and ranking rule

The routine captures the byte participant count at the initial session+54d. It skips the pass when pack+44 is0 or session mode+551 is3/8. It first calls48da10 for every captured participant, then449d40(mode0) for every captured participant. Each record resides at909300+index*30c. Callback changes to the live session/count/pack do not change the parent loop bounds or trigger another mode gate.

After each checkpoint transition, the current rank byte+1d places that record pointer in native local storage. The source keeps this storage in caller-owned mapped bytes, preserving duplicate ranks, holes, stale pointers and overlaps. It then reads that rank order and stores signed32 scores from `(lapByte1c<<16)+progressDword24`.

Exactly one reverse adjacent sweep follows. A trailing record with a larger signed score swaps with the leading one, except when the leading record's finish byte+249 has bit0 set. A finished trailing record may still advance. Equal scores preserve order. Four ascending scores10/20/30/40 become rank order4/1/2/3 after this sweep. The routine does not repeatedly sweep to produce a fully sorted list.

Final rank bytes are written from the last local entry backward, assigning index+1. Duplicate pointers therefore retain native reverse-write ordering. A stale readable pointer can refer to a record outside the captured participant list, and that record can receive a rank update; no repaired permutation is inferred.

## API and integration

```js
const progression = createRespawnRuntime({
  memory, recordCount, bodyStorage,
  scratchBase:completionScratch,
  //Other reached bridge inputs remain explicitly supplied.
});

runRaceProgressPass({
  memory,
  scratchBase:rankingScratch,
  progression,
  checkpointOptions:{
    trackBasis,
    finishProgress:record => finishRaceProgress(record.address, {
      memory, scratchBase:completionScratch, handlers:completionHandlers
    })
  }
});
```

The default checkpoint transition requires `progression.recordAt(address)` and `progression.runtime.memory===memory`; this prevents accidental synchronization between separate byte stores. The whole object returned by `createRespawnRuntime` satisfies that contract. Track-basis417210 and reached completion449760 follow the existing checkpoint module's explicit contracts. Native lap advance44a560/formatting4459f0 remain the checkpoint module's actual defaults. Full race completion and its downstream effects can be connected as shown, with the reached completion handlers supplied by the caller.

`handlers.call48da10({memory,ecx,args:[]})` and `handlers.call449d40({memory,ecx,edx:0,args:[]})` optionally replace the respective default child. Using such an override moves that child's behavior outside the default equivalence claim. All rank reads occur after the transition callback, and all captured records still receive both calls even if a callback changes the global participant count.

For the six-participant fixture domain, rank pointers occupy scratch+0c..20 and scores occupy+24..38. The supplied scratch bytes are intentionally not cleared. Ranking and completion scratch should represent their actual distinct native stack lifetimes; deliberate aliases remain visible in raw memory. Counts/ranks that address outside supplied memory, or corrupt the native stack cookie, are outside the validated readable-memory domain. The reference does not clamp the participant byte or silently repair malformed ranks. The caller owns participant initialization, rank initialization, session/pack globals, body/record allocation and track-basis production.

## Validation

`node tools/verify-race-progress-pass-instructions.mjs` passes2400 fixtures against801 retained instructions, including all90 parent instructions:

- 1,200 fixtures execute actual48da10 route selection,449d40 checkpoint transition,41c990 interpolation and44a560/4459f0 timing through shared-memory views. Only the track basis and reached race-completion call are state-mutating boundaries.
- 1,200 additional fixtures replace both children with state-mutating callbacks to check full observer order, captured counts under session/pack replacement, duplicate ranks and readable stale scratch entries.

The check compares all six780-byte records, six complete16384-byte bodies, rank/score scratch, session/route/checkpoint tables, changed globals and boundary snapshots. It covers count0..6, skipped modes/checkpoints, signed score wrapping, finished-leading gates, stable ties and one sweep. It observes1858 track-basis calls and930 reached completion callbacks. Total:1,454,406 instruction steps, all matched; cookies are asserted. Report: `analysis/race-progress-pass-instruction-check.json`.

`node --test tests/race-progress-pass.test.mjs` passes eight focused tests, including the captured-count/two-pass order, partial sorting, finished-record asymmetry, signed wrapping, duplicate-rank stale pointers and a default-child negative-terrain early return.

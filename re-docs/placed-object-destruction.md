# Placed-object destruction —415230 /421f60

`src/placed-object-destruction.mjs` reconstructs the full415230 update stage called by450e50, its two-tick421f60 preparation, and mutable angle helpers492b50/492c00. It operates on shared native-addressed memory and calls the existing actual game references for all reached effects, fragments, attachments and spatial operations. Installed game files remain read-only; the original executable was not launched.

The target is Redux1.3.8.0, SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

## API and state ownership

```js
initializePlacedObjectDestructionState(memory); // Static image restoration only.
updatePlacedObjectDestruction({memory, scratchBase, soundRuntime});
```

`scratchBase` is the actual415230 entry ESP, not the outer race-update ESP. The parent's local frame begins at `scratchBase-0x134`. The source keeps consumed locals in that memory, including short writes that preserve old neighboring bytes. `soundRuntime` is optional and uses the existing native sound dispatcher contract; its memory must refer to the same runtime.

Static restoration sets DWORD5ea4dc to255 and DWORD6e6558 to0, matching original image reads3016 and3020. Call it when constructing an image, separately from the480760 runtime constructor. Neither415230 nor480760 resets an in-flight shared preparation. The6e6558 index remains a live read when selecting configuration bytes. Xref evidence3019 identifies its421f60 read; no separate direct runtime writer was found, so the reference does not invent one.

| Storage | Native producer and use |
| --- | --- |
|9205dc |480760 allocates four0xa8-byte controller rows. |
|Row+8c |480760 assigns each row an0x800-byte portion of its0x2000-byte workspace. |
|9205e0 /9205e4 |415190 queues placed-body pointers and dependency/status DWORDs in64 eight-byte slots. |
|9205d8 /9207e0 /9207e1 |Queue head/count/tail bytes; queue producer and consumer keep wrapping and byte overflow. |
|91f1a4 /91f1ac /91f1a8 |415230 publishes the single row/object/model currently being prepared. |
|5ea4dc |255 means ready for another object;0 copies vertices/matrix;1 builds configuration/workspace. |
|909290 /909294 |44c2b0 loads these runtime table pointers from relocated pack+7c/+80 respectively. They supply eight-byte fragment-tag rows and16-byte destruction configurations. |
|Placed body18e /190 /192 /194 |44c2b0 writes tag base, configuration index, placement ID, and live shape-configuration pointer. See068 loader assembly at44cd60/44cd79/44cdf7/44ce0f. |

This package uses the existing480760 implementation to allocate and initialize36 actual fragment bodies via4741c0→4798d0. The complete serialized level loader and allocation service remain distinct runtime construction responsibilities. The fixture's declared model, configuration, route-group and placement inputs are synthetic.

## Recovered behavior

An empty controller consumes the next queue slot and marks it254. When shared preparation is available, it publishes that object, marks its placed-object class5, and decrements nonzero authored-route group counters selected by object1a6/1a7. The preparation runs in the next two parent calls. Waiting controllers activate when their next dependency is255, propagating readiness backward through a linked destruction chain.

Preparation copies vertices forward, clears each copied vertex's flag short, redirects the object's vertex pointer, and retains its original orientation. Forward overlap is deliberate: earlier writes can alter later source reads. The second phase constructs face flags and per-vertex workspace, captures configuration words, calculates angle increments through the live575228 table, and initializes fragment/group state. Native quirks retained include clearing only the low byte of the face count and reading the same variant configuration byte for each shape. The main loop's row offset advances0xa8 while its flag offset advances0xa9; the reference preserves both strides.

Active objects release attachments, update their timer and short angles, move vertically with capped acceleration, and rebuild orientation except for classification3. Each move removes and reinserts the object in the actual spatial lists. Faces read live packed vertex IDs and copied vertex flags. Crossing the retained starting height marks vertices, emits particles/flash/persistent emitters on selected faces, activates configured fragments, adjusts terrain brightness, and publishes the original impulse/effect globals. A high fragment-tag bit gates activation through the live settings byte. Completed faces decrement the remaining count; finishing an object removes its spatial membership, clears its own queue status, and frees the controller.

All reached game callees use actual references:432680/433400/4334b0 matrix operations;44ef90 attachment release;474600/474850 spatial changes;435f20 particles;475a10 debris;437aa0 terrain brightness;436490 flashes;44f910 persistent emitters;480bf0 fragment activation;484bb0→40ea40 sound policy. The checker uses an empty sound bank, which follows the actual dispatch guard. It does not verify audible device playback in this graph; sound device services and their separate verifiers remain explicit.

## Consumed stack history

The connected constructor proof exposed a meaningful saved-register dependency. At the real492990 quaternion multiplication reached from4799f0,492998 pushes EDI containing `body+0xe4`. Its saved DWORD lies at the4799f0 entry ESP minus0xb4. The final480760 body initialization leaves it at the constructor entry ESP minus0xd4. A later415230 descriptor transition overwrites only three shorts of an eight-byte local, publishing the retained fourth short to91d3ea.

The fix occurs at that quaternion producer through an optional `nativeScratch.beforeQuaternionProduct` hook. `updateRawBodyDerived(body,{memory,scratchBase})` takes the4799f0 entry ESP; `initializeRawBody(body,configuration,{memory,scratchBase})` takes the4798d0 entry ESP and forwards minus16.480760 supplies its own entry minus16 to4798d0. Existing APIs retain their behavior when no scratch entry is supplied. Actual callers must pass their child entry, not the parent entry: the separate41dbb0 constructor integration was corrected to supply its4798d0 entry at parent ESP minus72. This is preserved memory, not a copied oracle value or an end-of-call scratch snapshot.

## Evidence and verification

Primary retained evidence is under `analysis/native-simulation/results/`:1201/1202 whole415230;3000/3001 whole421f60;3012–3015 angle helpers;3008–3011 queue/controller/phase xrefs;3016 static phase bytes;3017–3019 configuration/index xrefs;3020 original zero index. Existing727 assembly supplies480760. `analysis/scene/results/068-loader-assembly.json` identifies the table/body producers described above. The comparison report retains exact target/evidence digests.

`node tools/verify-placed-object-destruction-instructions.mjs` passes64 scenarios and3424 native calls:192 preparation calls,32 additional descriptor-history cases,64 actual constructors,64 queue producers and3072 persistent parent ticks. It compares **all mapped bytes0x10000..0x9fffff after every call**, including emitted objects, geometry, configuration, spatial/pool lists, RNG, scratch globals and aliases. Private stack is excluded, but consumed private values are produced and tested at their real write points. The graph executes8,458,418 interpreted instructions across3929 reached addresses and completes all160 queued objects. Variants include22 forward-overlap copies,8 face counts260,32 retained-fourth-short cases,32 four-object dependencies,16 wrapped queues, three live variant indices, six classifications, multiple group counts and high-bit fragment gates. Only CRTmalloc, CRTmemset and compiler cookie checking are external services.

The resulting report is `analysis/placed-object-destruction-instruction-check.json`. Seven focused destruction tests and20 related body/fragment tests pass. Existing raw-body construction native verification passes5600 fixtures, and world-fragment verification passes1800 pool scenarios plus2000 impact callbacks after the optional scratch propagation.

This proves the recovered algorithms and their shared-memory composition for declared mapped fixtures. Rendering/drawing the modified geometry, constructing a complete installed level runtime, real device playback, and original-process observation are outside this package. The450e50 default binding is owned by the outer race-update integration.

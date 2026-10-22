# Redux autonomous route connectivity

`src/autonomous-route-connectivity.mjs` reconstructs `47fc90`, `491330` and `47fc20` for Redux1.3.8.0. All claims here come from retained static x86 instructions and bounded interpretation; the original process was not run.

`canReachAutonomousRoute(targetGroup, sourceGroup, pointIndex, {memory, scratchBase})` implements `47fc90`. It checks whether the autonomous group is reachable from the progression point through the two packed links at point+12. Each link uses a5-bit group and9-bit point index, at bit positions0/5 and14/19. This independently confirms those Redux link fields in an actual AI consumer. It does not identify a preferred branch or reconstruct the strategic route scorer.

The current group and either direct linked group return success immediately, preserving old queue/scratch state. The comparison even accepts a zero link when target group is zero. Otherwise the routine initializes64 visited group words, seeds the two links and walks the original20-slot ring. The ring reserves one empty slot, wraps at20 and silently drops enqueues when full. A new group is marked visited before checking queue capacity, so a dropped group is not retried. The two initial neighbors are appended independently, including duplicates. Queued point indices select the next link record; this is not a scan over every point in a group.

`enqueueAutonomousRoute` implements the complete `491330` ring append, preserving stale slots on failure. `updateAutonomousRouteConsistency(body, {memory, scratchBase})` implements `47fc20`: success clears byte6d8; failure increments it with byte wrap. Above60 it copies the progression route/index to the body reloaded from the racer record. That registered body can differ from the body whose failure byte is updated. The fallback does not reset the failure byte.

`scratchBase` means native entry ESP. The visited array begins132 bytes below it. The reference preserves initialized visited bytes and ring/global state. Compiler security-cookie validation is a runtime boundary, not an omitted game algorithm. The caller supplies mapped runtime groups/point pointers, valid successful native memory and stack storage. These functions are now the default `47fc20` binding in `runAutonomousDispatch`.

Validation:

- `node tools/verify-autonomous-route-connectivity-instructions.mjs`:239 retained instructions,6000 fixtures,18624881 interpreted steps; all match. Complete body/group/point/record/ring/global regions and initialized visited storage are compared. Only compiler cookie validation is inert. Cases include chains, cycles, disconnected graphs, duplicate links, queue fullness/wrap, immediate returns, counter thresholds/wrap and distinct registered bodies.
- `node --test tests/autonomous-route-connectivity.test.mjs`:six focused tests, including both packed links, a disconnected cycle, queue drop/wrap and the61st-failure fallback.

Evidence: retained340 pseudocode and341 assembly for `47fc90` (`ev_0b695ec510b0ab407c5f30e62ee4815a335f64af3f85132eeae7d76483b2855c`),342 assembly for `47fc20` (`ev_132bf5bf2fe6291902c3cb99bd9ce0437fb4d0aff18fa7be5c3200c8b941e755`),343 assembly for `491330` (`ev_4d02ead804d43e41aa0d2b3b2bd0f7e0705aa9540ad7fa60950f4b5a4e07fd5d`). The historical decompiler signature omits register arguments and obscures the boolean return; the assembly defines both.

See [route control](autonomous-route-control.md), [dispatcher](autonomous-dispatch.md) and [the reconstruction scope](reconstruction-scope.md). Strategic planning, candidate scoring and weapon-use decisions remain separate requirements.

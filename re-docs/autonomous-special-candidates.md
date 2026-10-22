# Autonomous special-target candidates

`src/autonomous-special-candidates.mjs` reconstructs Redux 1.3.8.0 `434f80`, `434c60`, `434550`, plus their game-owned `420a10` and `435240` children. Numeric cost defaults use the independently recovered `411fa0/412070/4126d0/412870` in `autonomous-candidate-costs.mjs`; no game-owned callee is silently substituted.

## APIs and retained storage

The three append APIs are `appendPickupSpecialCandidates`, `appendObjectSpecialCandidates` and `appendMarkerSpecialCandidates`. Each takes `(bodyAddress, lowestFreeAddress, {memory, scratchBase, handlers})`. `lowestFreeAddress` points to the live signed index; `scratchBase` is native entry ESP. `scoreAutonomousSpecialCandidate(body, index, includeObstacle, context)` ports `420a10`; `specialCandidateRouteCost(target, distanceSquared, index, body, context)` ports `435240`. The default iteration budget is65,536; exceeding it throws rather than accepting an unbounded supplied-memory traversal.

The shared candidate arena is twenty52-byte rows at `91f1e0`. Each pass scans existing rows from the captured `lowestFree + 1` through19. It requires nonzero group word, row byte38 zero, and the appropriate authored point flag. Insertion writes into the live free row, retaining unrelated fields and adding to its existing scores. It writes three signed-short coordinates to an8-byte target slot at `91f600`, preserving the last two bytes, sets the destination point/index byte to the target slot, and sets row byte37 to the native special type. It increments global target index byte `6e650f`, stamps byte `91f1c0 + priorIndex` with31, and decrements the captured destination free index. Negative free indices or a full20-entry target table stop the pass.

## Three producer-specific passes

| Address / export | Body gate | Authored point flag | Source | Type / weight / minimum alignment |
| --- | --- | --- | --- | --- |
|`434f80` / pickup|`6ec & 4`, and either pickup slot68c/68d equalsff|`100`|Pointer array902020, signed count902024; source flags182 have bit80 and either low bit; route/point words18c/18e must match.|3 /31 /`f03c`|
|`434c60` / object|`6ec & 800`|`200`|Twenty-byte rows at resource90b990+ec, count82e904. Source state metadata low nibble5 is excluded; row route byte18 and point word16 must match.|4 /25 /`f03c`|
|`434550` / marker|`6ec & 8`|`400`|Twenty-byte rows from pack90b98c+8 resource pointer, table+e4/count byte+f5; route byte18 and point word16 must match.|5 /30 /`dcb4`|

The object pass also copies opaque metadata byte192 into destination byte3. Its value is retained without assigning an unsupported gameplay meaning.

Pickup/marker passes subtract the live body's full Q16 position, then use wrapped signed-short high-word deltas for squared distance. They require the unsigned range check `(squared - 90000) <= 20f580`, corresponding to300..1500 units in ordinary nonoverflowing coordinates. The object pass captures the body's signed-short position once at entry, wraps short coordinate differences, and only checks signed squared distance at most2250000. Zero distance in this latter pass reaches native division by zero; the reference throws rather than manufacturing an alignment.

All three use actual `432e70` lookup root and `41c910` dot arithmetic. The Q16 delta dotted with the existing row direction, divided by the integer root, supplies alignment. Accepted alignment is multiplied by the corresponding Q16 weight, then shifted to an integer score. If the lookup-root distance is above1000, the integer score loses `score >> 2`. Lookup-root approximation matters: geometric distance1001 can still produce root1000 and avoid this discount.

## Cost wrappers and ordering

`420a10` captures body speed668, radius from the body10 descriptor+32, and the body's high-word XYZ into retained short scratch. It evaluates body-distance cost to the selected target; nonzero obstacle flag additionally evaluates obstacle cost. Its first native stack argument, a candidate byte offset, is unused. The flag is read after the first cost returns, preserving caller-memory mutation. Parent passes add this result to the captured destination's base score+44.

`435240` overwrites its original caller body argument slot with the descriptor radius. If the preceding candidate has the same group, it evaluates cost from the special target to the current candidate's authored route point, then adds the preceding row's extra score+48. Otherwise it returns the current row's extra score unchanged. The parent adds that result to destination+48.

The free-row pointer, target index, original candidate index and destination score address have distinct native capture/reload points. The source preserves them, including post-cost target-index changes and destination capture before a cost callback changes the live free index. Object position remains captured for later source rows; pickup/marker positions remain live. Optional named overrides `call420a10`, `call435240`, `call411fa0` and `call4126d0` receive explicit native register/stack argument contracts for boundary probes. Production defaults execute recovered game logic.

## Evidence and validation

Parent pseudocode/assembly is retained in355/356,361/362 and365/366. Main assembly Evidence IDs are `ev_30399fd6855272509e3435c25a0144b34b379a937039985a504ec7aaa512846c`, `ev_64f7a853d1015b0464fcc1beb7069a699adf24861bf78f3881549b2098ebe166` and `ev_e788d8d2c37eeae103013444df735e6b13985b5673a60ce6de88ed131eabcc45`. Children540/541 and542/543 supply `420a10` and `435240`, assembly Evidence `ev_6136954b4fc9e6c97d4c45a84dfa02b879f989e371cb8dd296163b796c9a0b44` and `ev_a484a1e10592cca188510244556e4a4a7092c8edb3131a1412a18851cbd067d0`.

`node tools/verify-autonomous-special-candidates-instructions.mjs` passes1,396 retained instructions across10,000 fixtures and4,053,064 interpreted steps. Five thousand fixtures execute actual cost callees with coherent nearby-body distance tables and a valid zero-plane obstacle acceptance record, without mocked calls:5,174 position costs and2,135 obstacle costs. Another5,000 fixtures use explicit lower-cost hooks mutating body position, lowest-free index, target index and caller obstacle flag. The corpus produces5,273 target insertions. Full bodies, source/cost tables, candidate/target arenas, root scratch globals, returns and cost-call arguments/order agree. Report: `analysis/autonomous-special-candidates-instruction-check.json`.

`node --test tests/autonomous-special-candidates.test.mjs` passes10 focused tests for gates, exact appended type/metadata/stale row behavior, distance ranges, score discount, captured versus live position, division failure and wrapper ordering. These are synthetic static instruction comparisons. Original-process execution, source-table constructors and a complete autonomous race trajectory remain separate evidence requirements.

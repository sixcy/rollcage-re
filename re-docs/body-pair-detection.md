# Body collision detection and candidate generation

The reconstruction can now register the original vehicle sphere shapes, prepare their time-dependent caches, compute body-pair contacts, enqueue events and regenerate candidates after response. This is reference code for Redux 1.3.8.0, not a rebuilt game. All original artifacts remain read-only; no original process was executed.

## Recovered routines

| Address | Source | Behavior |
| --- | --- | --- |
| `0x428270` | `src/body-shape-registration.mjs` | Registers native 20-byte descriptors in an explicit 72-byte record pool and appends the physical body. |
| `0x429820`, `0x429ab0` | `src/body-shape-cache.mjs` | Transforms individual shapes and extrapolates their position/velocity to the requested frame time. |
| `0x475840` | `src/body-shape-cache.mjs` | Copies response contact fields into the aggregate cache without unit conversion. |
| `0x4225d0`, `0x422c70`, `0x4230a0`, `0x423360` | `src/sphere-collision.mjs` | Quantized quadratic root, float normal conversion, aggregate screening and sphere contact. |
| `0x422dc0` | `src/body-pair-query.mjs` | Coarse distance screening, shape traversal and body-pair result selection. |
| `0x428010`, `0x4279d0` | `src/body-pair-events.mjs` | Directional ownership exclusions and pair-event construction. |
| `0x46ea80` | `src/body-candidate-groups.mjs` | Builds reusable candidate groups from physical bodies and their spatial registration. |
| `0x427870`, `0x427910` | `src/collision-candidates.mjs` | Initial static/pair scheduling and candidate regeneration after response. |
| `0x427bd0` | `src/static-collision-candidates.mjs` | Marks eligible bodies, calls static queries, builds events and restores temporary type17 radii. |
| `0x424e20`, `0x4238b0` | `src/static-shape-queries.mjs` | Traverses terrain/model shape lists with explicit geometric-query callbacks. |
| `0x448570`, `0x492cc0` | `src/static-contact.mjs` | Merges selected static contacts and normalizes their summed normal. |

Subsequent work implements the [nonzero-radius terrain and model queries](static-sphere-contacts.md). The shape-list wrappers accept them through their geometric-query callbacks.

## Record layout and preserved behavior

Each shape record is 72 bytes. Body byte IDs begin at `+0x140`; the count at `+0x10c` is interpreted as signed by queries. `collisionIds[count]` selects the aggregate record.

| Record offset | Contents |
| --- | --- |
| `0x00..0x05` | Local signed-short Q8 center. |
| `0x08..0x13` | Cached world Q8 position. |
| `0x14..0x1f` | Cached Q8 velocity, including angular contribution for multiple shapes. |
| `0x20..0x2b` | Contact point. |
| `0x2c..0x37` | Contact normal. |
| `0x38`, `0x3c` | Contact metadata/time and scalar. |
| `0x40` | Signed Q8 radius. |
| `0x44`, `0x46` | Unsigned16 flags and shape tag. |

Registration copies the low signed short of each descriptor coordinate, computes the aggregate bound with the original lookup root and an unsigned maximum, and leaves unwritten pool bytes stale. In particular, aggregate contact time/scalar are retained. Type17 forces its aggregate radius to `0x5000`. A zero-shape registration still appends the body and retains flag `0x8000`. Pool free-ID order and allocation ownership are explicit inputs; native pool initialization/freeing is not inferred.

Cache preparation treats aggregate and individual records differently. The aggregate gets current body position/velocity shifted right8, with no extrapolation or special time scaling. Individual records run in descending order. Special time handling can scale both velocity and delta, producing a squared scale factor in displacement. Individual `+0x38` fields reset to `-1` only when both requested time and body time are zero. The body cache clock is `+0x114`.

The sphere solver quantizes future time to multiples of256 in Q16. A coarse AABB rejection can preserve the supplied result flags and payload. Other rejection paths clear only the low flag byte. Penetration updates scalar; ordinary future impacts leave scalar stale. The port retains the original near-contact/tolerance and negative-time branches rather than replacing them with a general intersection formula.

Normal conversion uses binary32 operations and an x87 integer conversion. The instruction oracle checks all four declared conversion modes: nearest-even, toward-zero, down and up. No original runtime floating-point control word has been observed. The connected probe explicitly chooses nearest-even and binary32 nearest rounding; this is a declared context, not a claim about the game's live settings.

Body-pair coarse rejection compares wrapped unsigned squared integer distance with `0x4000` (`128²`). Its inner loops retain the **last accepted shape time**, without tightening the time bound to an earlier hit. Initial penetration returns immediately. Active vehicle state at `+0x6bc` substitutes the aggregate for ordinary shapes in a pair query. The model shape-list wrapper instead adds the aggregate to its ordinary list. These paths intentionally differ.

Pair-event auxiliary velocity is the difference of the two selected cached Q8 velocities; queue insertion shifts it to Q16 in place. Pair ownership exclusions are directional, and the builder applies them in both directions.

## Groups, refresh and static contacts

The retained grouping instructions create a separate group for each eligible body, even for nearby bodies in the same bucket. The local octant scratch resets for each outer body. Eligibility includes flag `0x800`, absence of `0x8000`, type other than4, absence of collision flag `0x1000000`, and a nonempty runtime spatial list. Buckets use their existing `headId` at native `+8`. Group storage preserves unused body entries and writes a trailing empty sentinel.

Initial scheduling calls the static pass first, then same-group pairs for counts above1 and every later cross-group pair. Refresh rejects bodies whose counter byte `+0x168` is negative as signed8, promotes the second body if necessary, fills the reusable refresh group, runs static work, then visits nonempty groups unless the surviving first body's type is4. Initial scheduling captures group count; refresh reloads it after nonempty pair calls. The pair builder suppresses the reverse ordering of the two bodies in the refresh group.

Static scheduling alternates types7/21 using a local counter seeded from the supplied global value, without writing that global back. It changes type17 radii temporarily and restores both records to32000 even for ineligible type17 bodies. Terrain/model geometric queries remain explicit hooks. The terrain wrapper resets collision flags and the remaining-time bound for every listed body, then traverses marked bodies' shapes in descending order. Both wrappers retain ties, rotated32-bit shape masks, `best+1` tightening and tolerance-flag suppression.

The merger copies an aggregate hit directly when state bit `0x2000` is set. Otherwise it sums selected normals, normalizes only when more than one is selected, and averages selected points relative to the body's Q8 center using the native reciprocal/rounding order. Penetration is projected onto the merged normal; a zero projection requests removal. Sliding state counts selected shapes in the output tag. Per-record flag `0x100` is cleared or set at native points, including early exits. The merged contact flag word starts at zero and is ANDed, preserving the original zero result.

## Validation

Every tool below interprets retained x86 instructions. The tests execute reconstruction code and a bounded interpreter, not the original executable. Reports under `analysis` record Evidence IDs and exact mocking boundaries.

| Tool suffix after `verify-` | Instructions | Coverage |
| --- | ---: | --- |
| `body-shape-registration-instructions.mjs` | 217 | 1,000 fixtures,6,000 registrations,19,000 shapes; full pool/body/allocation tables; no stubs. |
| `body-shape-cache-instructions.mjs` | 372 | 2,500 fixtures,6,819 calls,41,090 shape updates; complete pool/body; no stubs. |
| `sphere-collision-instructions.mjs` | 1,018 | 8,000 fixtures,32,000 checks,all four integer conversion modes; no stubs. |
| `body-pair-query-instructions.mjs` | 1,251 | 4,000 fixtures,complete pool/body/output; no stubs. |
| `body-pair-events-instructions.mjs` | 221 | 1,600 fixtures,12,800 exclusion checks; cache/query/emission are explicit mocks. |
| `body-candidate-groups-instructions.mjs` | 125 | 1,600 fixtures,12,785 physical references; only security-cookie boundary mocked. |
| `collision-candidates-instructions.mjs` | 125 | 4,800 checks,18,812 pair calls; static/pair callees mocked for state/order. |
| `static-collision-candidates-instructions.mjs` | 295 | 1,600 fixtures,2,579 events; cache/terrain/model/merger mocked; inline native queue executes. |
| `static-shape-queries-instructions.mjs` | 269 | 1,600 fixtures,23,118 geometric-query calls; only low-level geometry mocked. |
| `static-contact-instructions.mjs` | 469 | 5,000 fixtures,full body/pool/contact/tag; no stubs. |

The complete focused suite has 172 passing tests. All 35 instruction tools pass after the interpreter's scalar float/x87 and ROL additions. `analysis/native-instruction-suite.json` records the latest sweep. Instruction counts overlap across tools and must not be summed as distinct recovered code.

Run `node tools/probe-body-pair-detection.mjs` for the connected installed-data probe. It covers all 80 level packs in 3,660 synthetic two-vehicle scenarios /7,320 bodies, using original five-sphere geometry and the wheel-extended aggregate radius. It registers 43,920 records and 7,320 candidate groups. Initial contact times/classes are computed: 1,220 future-impact cases, 1,220 overlaps and 1,220 separating misses. Initial events total 2,440; regeneration adds 3,660; all 6,100 events process and every body reaches Q16 time 65536. It checks spatial chain integrity and cleanup, with 327 reinsertions and 13,238 attachment queue entries.

Body positions, velocities, identity rotations, masses, response class rows, free-ID order, initial buckets, attachment counts and floating context are declared. Terrain/model candidate counts are explicitly zero, so the real static scheduling path executes without claiming geometric static contacts. The report records this boundary and distinguishes initial time histograms from all processed events. Wheel stages, queued attachment processing, progression/effects and complete ordinary/scripted body preparation remain outside this probe.

## Evidence preservation and next work

Older complete replies are under `analysis/scene/results`; new queries are under `analysis/native-simulation/results`. `analysis/native-evidence-index.json` records each file's hash and original Evidence ID. A provider session restored an older snapshot after the prior helper disappeared. The previous351-record ledger was imported into it; later individual replies were preserved separately, then restored using REA's own canonical bundle builder and public import validation. The final provider export is `analysis/native-simulation/collision-detection-complete-evidence-bundle.json`; its receipt records382 Evidence records and zero ledger unknowns. Zero ledger unknowns does not mean the reconstruction is complete.

An initial manually appended candidate bundle failed canonical manifest validation. That rejected file and response remain retained; the corrected restoration derives manifests with the installed REA bundle builder and leaves original Evidence objects unchanged. `tools/restore-native-evidence.mjs` records provenance and refuses to overwrite output.

The [next geometry checkpoint](static-sphere-contacts.md) recovers the nonzero-radius terrain path (`0x425f10` and callees of `0x424ff0`) and model path (`0x423ab0` /`0x424040`). Its connected probe computes static events on actual installed geometry. Ordinary preparation `0x47a8e0`, scripted motion `0x476550`, lifecycle/removal, queued attachments and original runtime effects remain required for a race simulation.

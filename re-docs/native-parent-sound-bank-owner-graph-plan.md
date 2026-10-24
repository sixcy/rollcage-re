# Bounded original sound-bank owner observation proposal

This is a read-only design, not an implemented capture feature. No original process was launched and no production helper, profile or source file was changed for this audit. The retained census is [native-parent-sound-bank-owner-graph-plan-20261024.json](../analysis/native-parent-sound-bank-owner-graph-plan-20261024.json), SHA256 `021205e3a14d09c9c64a175a9eb63f27fbd65ffd3c84271ba0f3412958b1ac49`.

The target remains Redux SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. The existing C# helper remains frozen at `bfc568c7edbe1407fd0c104f1d13c3e9fd4e3743acf52f061eb31066a2eb9f7a`.

## Actual evidence and the missing input

Both closed stock V5 and V6 have **64 used slots, 94 capacity slots, 64 distinct nonnull owner pointers** at each of their ten parent checkpoints. The audit independently checked the length and SHA256 of all twenty actual 12-byte header blobs and all twenty full-capacity storage blobs. The census retains their identities and every original-entry slot pointer. There were no nulls or duplicate owner identities in these observations; future observations must still support both.

At original V5 entry, raw range metadata contains complete owner extents for slots 1, 2, 11, 19 and 63. At V6 entry it contains complete extents for slots 2, 7, 19, 35, 36, 40, 42, 43, 44, 47, 48, 49, 50, 51, 52, 53, 55, 57, 58, 59, 60, 61, 62 and 63. This is **transport containment**, not automatic semantic admission or a new comparison claim. Most extra containment comes from unrelated broad heap transports.

The next genuine V6 first-loop producer at `4860db` requests code3. Its original owner is `282532144` (`0x10d71930`), absent as a complete owner extent from original-entry capture coverage. V6 code7 is `282527312`; V5 code7 was `147284296`. Capturing code7 alone therefore did not close the bank-wide initial-input gap.

Allocation extent is independently instruction-derived: retained `9083-audio-sample-lookup-assembly.json`, Evidence `ev_46bcabb10c7f22695d3aaf8697963cd496246d5cfed4b596a40f0b17737eb507`, has `40dee8 PUSH 490h`, `40deed CALL [56e220]`, and `40df02 CALL 40d7d0`. Dispatcher `40ea40` reads bank begin/end, bounds-checks the requested code, loads the corresponding owner pointer and checks null before accessing owner fields. Its retained151 Evidence is `ev_276e723742684068016129e93a54f6b66c48ae2564c6cbdd1d58fc0dd8998ee6`. Selection retained153 Evidence is `ev_e7b66afda8bc1259f35bae13abb5f5ad007af72d368288d98dca50fc8ee1e855`.

## Proposed exact optional contract

Add only `parentRttiObservation.soundBankOwnerGraph`, absent by default:

```json
{
  "rootRva": "0x2f2414",
  "headerRangeId": "sound-owner-vector-roots",
  "storageRangeId": "control-sound-bank-storage",
  "maxUsedSlots": 256,
  "ownerBytes": 1168,
  "breakpointIds": [
    "native-control-before", "native-control-after-ai", "native-control-after",
    "native-control-after-physics", "native-control-after-attachments",
    "native-control-after-recovery", "native-control-after-drive",
    "native-control-after-auxiliary", "native-control-after-cameras",
    "native-control-after-world-effects"
  ]
}
```

These fields are a purpose-specific whitelist, not user-adjustable pointer roots, lengths or bounds. New capability: `scoped-parent-sound-bank-owner-graph-v1`. A preparer boolean such as `soundBankOwners` / `--sound-bank-owners` may select this policy; old profiles and flags keep their exact defaults. Require the existing ordinary header descriptor and exact bank descriptor `{id:'control-sound-bank-storage',rva:'0x2f2414',vectorStorage:true,maxVectorBytes:65536}` at every listed checkpoint, with no graph rows at startup, CRT or counter sites. Existing code2/code7/code19 owner observations may remain; graph mode neither needs their pointees nor broadens their descriptors.

No breakpoint, activation window, instruction guard, thread policy or write is added. Preserve seventeen declared sites, twenty-one snapshots, ninety seconds, one million events, the original three startup actions and all ordinary capture budgets. No new API result or allocation answer is supplied. Existing deferred CRT/QPC activation is untouched: these are additional data rows at already admitted cold parent checkpoints.

## Host read, alias and budget rules

At each admitted owned-main-thread parent checkpoint, after existing parent admission and before the original instruction or any debug-event continuation:

1. Read the actual module-relative 12-byte vector header. Validate native32-bit arithmetic, null-header rules, `begin <= end <= capacity`, four-byte used/capacity alignment and existing capacity-byte bound65536. Derive `used=(end-begin)/4`; reject `used>256` before any owner reads. This is an **observation bound**, not a native logical maximum, allocation count or capacity assertion.
2. Preserve the existing entire `[begin,capacity)` storage row. Use its actual first `used*4` bytes to enumerate slots; do not enumerate capacity-only values. Header and pointer bytes used in the proof must exactly match the ordinary rows emitted in this same snapshot. If existing transport plumbing would reread them, compare the complete repeated bytes and fail on disagreement; preferably share the same captured objects.
3. Null pointer: emit its slot metadata with `ownerIndex:null` and `rangeId:null`, read nothing and grant no owner memory. Nonnull pointer, including a small invalid value such as16: require overflow-safe `pointer+490h<=2^32` and an exact successful490h read. Never convert unreadable nonnull storage into null, an omitted row or zero bytes.
4. Enumerate slots ascending, assign owner indices by first occurrence, and read each **distinct pointer** once per snapshot. Record every referring slot index. Exact pointer aliases reuse that row and actual address; no pointer rewriting or duplicate semantic owner is introduced. Distinct pointers with partially overlapping spans keep their separate exact extents and must have identical intersection bytes; do not infer disjoint allocations, truncate one row, or merge gaps. Likewise verify consistency with any overlapping existing owner2/7/19 rows.
5. Do not cache owners across checkpoints or require bank topology/owner contents to remain stable. Each stage is independently observed. No temporary graph read may resume any thread before all rows and proof for that event are captured. Fail the observation on any partial read, arithmetic overflow or budget exhaustion before publication.

The maximum **additional** owner transport is `256*490h = 299008` bytes per checkpoint, or `2990080` across all ten. The actual64-owner case adds74752 bytes/checkpoint. Existing header12 and bank capacity storage remain separately charged as before; pointer bytes are already within bank storage. Null/duplicate pointers reduce actual owner storage; do not claim savings for other rows whose buffers are still independently allocated. Reserve/check against existing byte budgets; no budget increase or checkpoint omission is proposed. Existing capture context/TLS and proof metadata accounting remains intact.

## Proposed proof and row schema

Emit marker `parent-sound-bank-owners-observed`, and attach the identical object to snapshot property `parentSoundBankOwnerGraph`. It carries existing parent proof identity (PID, owned TID, main module base, selected parentU/clock, checkpoint ID, debug-event and snapshot ordinals), plus:

```text
headerAddress, headerBytesHex, headerRangeId, headerSha256,
begin, end, capacity, usedSlots, capacitySlots,
storageRangeId, storageAddress, storageBytes, storageSha256,
maxUsedSlots:256, ownerBytes:1168, uniqueOwners, nullSlots,
slots:[{index,slotAddress,ownerAddress,ownerIndex,rangeId}],
owners:[{index,address,slotIndices,rangeId,bytes:1168,sha256}],
additionalOwnerBytes,
sameStoppedDebugEvent:true, afterParentAdmission:true,
beforeOriginalInstruction:true, completeUsedOwnerObservation:true
```

Dynamic rows use ID `parent-sound-bank-owner-<index>`, exact actual address/length/file/SHA256, `source:'parent-sound-bank-owner-graph'`, `graphRole:'owner'`, `ownerIndex` and `bankSlotIndices`. There is no null-owner blob and no descendant row. Marker emission follows successful byte capture and precedes annotated snapshot publication; incomplete reads never emit a positive marker. Optional completion metadata reports exactly ten successful checkpoint proofs and aggregate owner-row/byte counts. No new provenance field is emitted when the option is absent.

## Independent verifier and source admission

The JS verifier must bind policy to actual `configuration.json`, target/helper/capability identity and unchanged startup/site/budget contract. Independently parse the actual ordinary header and full-capacity storage, validate all existing vector metadata and hashes, derive used slots, deterministic alias grouping, exact rows/extents and all counts; reject missing, extra, duplicate, renamed, cross-snapshot or forged rows/proofs. Bind immediate marker to the identical snapshot annotation/owned event, raw context and existing selected-parent chronology. Expect all ten checkpoints, no graph claims elsewhere, no descendant grants. Actual bytes, rather than proof metadata, decide every pointer.

Only `native-control-before` supplies original reconstruction inputs. Later stages remain comparison observations. Graph transport **does not automatically admit or compare all owners**: preserve existing `createNativeFrameSoundBindings` callbacks, admitting the490h owner only when the genuine source `40ea40` dispatcher reaches its actual code/slot. An idle owner mutated by background audio must not become a mandatory mutable comparison merely because its bytes were transported. Existing bank-capacity comparison semantics remain unchanged. If a genuinely reached owner is absent at a later comparison boundary, report that missing dependency rather than substitute a later owner or zero object.

The490h owner includes channel-vector header at+4/+8/+c, inline descriptor bytes, dispatcher fields+464/+468/+46a/+46c/+46f, callable storage+470 (live pointer+480, corrected from the original proposal's+484), and maximum/cursor+488/+48c. Retained162's40eb4b reads callable+10h; see [the correction](native-control-audio-next-descendants.md). Numeric pointer bytes inside this extent do **not** admit their pointees: no channel backing/capacity, channel12B wrapper, source9a8, vtable target, waveform440B, external callable allocation or service outcome is granted. Alias field names must resolve to these same actual owner bytes; they are not independently initialized facades.

Selection can next reach round-robin channel slots or adaptive scans, source virtual methods and the fresh-channel allocation branch. In particular `40dc50`/`40dc56` request/return12B, manager virtual14 source construction, and append-vector growth are genuine possible missing observations. Neither recovery captures nor a positive maximum/cursor inferred from defaults can supply those results. Retain honest missing-dependency errors.

## Required implementation tests before a future capture

- Pure callback-driven C# reader: empty actual vector, allocated-but-unused capacity, null slots, all256 unique owners,257 used refusal before owner reads, duplicate pointer aliases, consistent partial overlap, small invalid nonnull pointer/read failure,32-bit end/owner overflow, malformed header/alignment and no capacity-only reads.
- Pure host-policy mutations: wrong root/header/storage ID, lengths/bounds/order, omitted/extra stage, startup/external graph range, broader startup action or new site; absent-option golden legacy behavior.
- Independent JS fixtures: exact recomputation, missing/extra/forged rows, descriptor swap, header/storage/slot tamper, owner SHA/address/length mutation, alias splitting, contradictory overlapping bytes, foreign TID/event/parent/snapshot provenance, annotation/marker disagreement and false completion counts.
- Semantic fixtures: unused owner changes are not admitted; genuine reached owner is admitted once despite slot aliases; null grants none; later-owner-only data cannot initialize entry; channel headers alone never grant backing or source descendants. Retained V5/V6 census remains evidence of the missing owner input, not evidence of a graph observer that has not run.

This proposal does not establish source counter consumption, complete audio playback, worker/main interleaving closure or full source/native parent equivalence.

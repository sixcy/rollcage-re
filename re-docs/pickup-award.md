# Weighted pickup award

`src/pickup-award.mjs` ports `47b920`, reached twice by the recovered lap/race
parent. The procedure selects a numbered pickup, checks availability, fills a
free vehicle slot and can construct an outgoing packet. It is not a generic
lap-score award, and this reconstruction does not assign unverified weapon
names to item IDs0..7.

## Evidence

The retained pseudocode is
`analysis/native-simulation/results/175-lap-award.json`, Evidence
`ev_20a568c2eb663ab026e5a024ace4c89593a9109520d792b8393f8e3694e1f805`.
The complete319-instruction assembly is `176-lap-award-assembly.json`, Evidence
`ev_fa6cbc43977b7122043d285a2ae77ad9f165a2eb0eb2976a02ccecb384da4069`.
The older reply filenames reflect the initial call-site label, not the final
understanding of the procedure.

`194-pickup-probability-tables.json` retains512 bytes starting574e80, Evidence
`ev_0a401cce2dac59e2d9c4a5fd4ef38a50477c02446091454d53980f26cf7a3a83`.
`195-pickup-switch-tables.json` retains both8-entry switch tables at47bdd8,
Evidence `ev_8c303adab87eae167e133c7ca31c5c2c57f822f60a856d5640a282dea7eab3c2`.
The probability bytes and their SHA-256 are packaged in
`src/pickup-probabilities.json`; the verifier checks them against that retained
Evidence. The surrounding bytes remain opaque. These are static binary
observations, with no original-process or network execution.

## Selection and random state

The procedure captures the body pointer from vehicle record+00 and subtracts
one from record byte+1d for its row index. It advances global5ec954 once using
`imul(seed,16807)&0x7fffffff`. The random bucket is
`((seed>>>15)*32767>>>16)%100`. Restrictions and retries do not consume more
random values, even when both vehicle slots are already occupied or authority
will later prevent a write.

Session mode byte+551 selects weights:

| Mode | Recovered table behavior |
| --- | --- |
|1,7|Force candidate4 with weight100|
|2|One of four8-byte rows at574ec0, chosen by signed lap/progress difference|
|3,8|Fixed row at574eb4: `[0,0,90,0,10,0,0,0]`|
|5,6|Row at574f10 indexed by `(recordByte1d-1)+6*global6e9f68`, or575030 for body byte718 equal8|
|Other values|Row at574ee0 indexed by `recordByte1d-1`, or575030 for body byte718 equal8|

Mode2 reads its comparison record at exactly
`90960c-bodyIndex65e*0x30c`. This selects the other record for indices0/1; it
must not be replaced by a generalized forward array lookup. Its signed32
delta is `(lap<<16)-(referenceLap<<16)-referenceProgress24+progress24`.
Rows0/1/2/3 cover `>32767`, `1..32767`, `-32766..0`, and `<=-32767`
respectively. Products, shifts, subtraction and addition retain native widths.

The selected weight must be **strictly greater** than the remaining random
bucket. Skipped or rejected weights are subtracted, clamping the bucket to0,
then the item index advances modulo8. Only an eligible choice rejected by its
availability rule increments the rejection counter. The ninth such rejection
forces item4. A zero-weight entry does not increment that counter. A malformed
all-zero table can therefore loop forever in the native function; the reference
has an explicit caller-visible iteration bound and throws instead of inventing
an award in that domain.

## Availability rules

The active vehicle count comes from session byte+54d. Records begin at909300
with0x30c stride; each supplies its own body pointer. The two stored pickup
bytes are body+68c/+68d.

| Item ID | Condition for acceptance |
| --- | --- |
|0|Global byte903502 plus every individual slot containing0 is less than2|
|1,4,5|Always accepted once selected|
|2|Global byte903501 plus vehicles with either slot containing2 is less than6; modes3/8 also reject an existing2 on the input record itself|
|3|Global90cb80 is0 and no active vehicle has a3 in either slot|
|6|Fewer than2 vehicles have a6 in either slot or a non-sentinel body+6bc pointer whose first byte equals1; the input record must not be one of them|
|7|Global byte903503 plus every individual slot containing7 is less than1|

Item2 and item6 count a matching vehicle once, even if both slots match. Items0
and7 count each matching slot. The own-record checks use pointer identity, not
body identity: a distinct record pointing to the same body is observably
different. An active pointer sentinel is the full wordffffffff, not null.

## Assignment and packet bits

When global6eafe0 has both bits0 and7, the captured body's unsigned index65e
must equal global6e9f70, with participant-1 interpreted as0. This authority
check happens after selection. The function prefers free slot68d, then68c;
only byteff means free. It leaves an occupied pair intact.

After a successful slot write, a packet is sent only when global flags have
bit0, any bit in mask6, and bit7, and the live body index65e is at most5.
It writes byte0=90 and dword+08 in a caller-owned12-byte scratch packet:

- Bits0..4 contain the body index.
- Bit5 is0 for slot68d and1 for slot68c.
- Bits6..9 are cleared.
- Bits10..14 contain the item ID.
- Bits15..31 retain the corresponding stale packet word bits.

Other packet bytes are untouched here. The primary-slot mask also retains
bit5 before forcing it to1. The outgoing call is exactly
`4a0420(ECX=1,EDX=packet,args=[12,18])`. The packet router may then edit its
header or forward it through its separately reconstructed transport services.

## Interface and storage

```js
initializePickupProbabilityTables(memory);
const diagnostic = awardWeightedPickup(recordAddress, {
  memory,
  packetAddress,                 // retained12-byte storage; needed only on send
  handlers: {call4a0420(request) {}},
  maxIterations: 100000
});
```

All addresses index the caller-owned Buffer. The initializer explicitly loads
the retained static bytes; selection then reads that memory, preserving valid
caller-supplied table overrides and raw record/global aliases. It does not
silently reset probability memory on each award. The outgoing handler receives
`{memory,ecx,edx,args}` and is required only if reached.

The native function returns void. The JavaScript result
`{item,random,rejectedChoices,iterations,slot,networkSent}` is diagnostic
information and is not presented as native EAX. `slot` is null when no
assignment occurs, otherwise68d or68c. Input producers for row/rank byte1d,
difficulty, global inventory counters, session state, item use/removal and
complete weapon behavior remain separate work. This module reconstructs the
award transaction, not the complete weapons subsystem.

## Verification

`node tools/verify-pickup-award-instructions.mjs` passes6,000 fixtures against
all319 retained instructions and both original switch tables. It executes
1,333,102 bounded instructions and compares selected item, weighted iteration
count, rejection count, all eight8192-byte bodies, the standard and backward
record region, an external record, relevant globals, the one RNG transition,
all12 retained packet bytes and every outgoing call argument.

Fixtures include original probability bytes plus462 declared one-hot table
overrides, all eight items, modes0..9/255, zero through8 active vehicles,
row bytes0..8, difficulty0..5, signed delta boundaries, external/shared-body
records, authority denial, occupied slots and stale packet bits. Results:
2,671 assignments (671 secondary,2,000 primary),1,056 outgoing packet calls,
1,329 authority denials,2,000 occupied pairs,3,502 restricted choices and175
nine-rejection fallbacks. Only4a0420 and the security-cookie check are fixtures;
there are no arithmetic or availability stubs. The report is
`analysis/pickup-award-instruction-check.json`.

`node --test tests/pickup-award.test.mjs` passes14 focused tests covering the
bucket boundary, one RNG step, retry/fallback rules, every restriction family,
record identity, signed mode2 thresholds, row/difficulty/body-mode addressing,
authority, both slot packet layouts and explicit malformed-row bounds.

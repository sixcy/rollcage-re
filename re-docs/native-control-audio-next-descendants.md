# Next sound descendants after the V6 owner input

This read-only review changes no source, helper, profile or capture. No native
process was launched. V6 still lacks code3 owner `10d71930`, so its maximum,
cursor, channel vector, callable and source state remain unknown. The new bank
owner observer can establish these values; this note does not predict them.

The current stopped result is
`analysis/native-parent-rtti-stock-surface-start-replay-v6-20261024/report.json`:
after-AI matches 5,108,613 unique bytes, then source `4860db → 484bb0 → 40ea40`
stops at the missing 490h owner. Its source arguments are
`[0,1200,0,9,510616,0,0]`, position `body+34h`, and old surface127.

## Allocation and owner type

Retained9083 (`ev_46bcabb10c7f22695d3aaf8697963cd496246d5cfed4b596a40f0b17737eb507`)
shows `40dee8 PUSH490h`, CRT allocation at40deed, null test40def6, constructor
`40df02 CALL40d7d0`, and pointer append `40df14 CALL40ec20`. This is the sound
bank producer's fixed owner extent, not a guessed containing allocation or a
claim that arbitrary pointers are valid owners. Null/unreadable/aliased slots
must retain their actual meanings. Descriptor and dispatcher offsets fit the
same 490h object; a wrapper is separately 12 bytes.

Retained9091 (`ev_f18d6c0c720b1350753777df9adc7cb6263bf208c231ed69ee0f222f9b1c837c`)
sets owner callable pointer **+480h**, maximum+488h and cursor+48ch. The callable
object starts+470h. Retained162
(`ev_45da8f1dd3adc1398294ba131336a38e35d7f19cfdc9f6b11297b91adc86a5bf`)
confirms `40eb4b MOV ECX,[EAX+10h]`: its input is owner+470h, hence +480h.
Owner+484h is not the live callable-pointer field on this path.

## Conditional input graph

Retained153 (`ev_e7b66afda8bc1259f35bae13abb5f5ad007af72d368288d98dca50fc8ee1e855`)
contains the whole selector40db20. The owner supplies all initial branch data:

| Reached condition | Next authentic input or producer |
| --- | --- |
| signed maximum+488h >0 | Pointer slot at `[owner+4]+4*signed(owner+48ch)`; cursor increments/wraps using actual maximum. A null selected wrapper returns0. No inferred16-slot limit. |
| maximum<=0 | Iterate actual live `[begin,end)` from+4/+8. Every visited slot supplies its original wrapper12B and source pointer/vtable. No null replacement for a source dereferenced by the original scan. |
| Existing adaptive wrapper | Source `+38(1)` at40dbf3; conditional `+38(0)` at40dc02, `+3c()` at40dc0f, `+48()` at40dc1c. Their order follows actual results. |
| Reusable existing wrapper | `+04(owner+10h)` at40dc34, then again through common40db88. Preserve both forward copies and their stack writes. |
| No reusable wrapper | Unsigned actual live count>=16 returns0. Otherwise operatorNew12 at40dc50/return40dc56; require genuine allocation result and requested-span preimage if reached. |
| New nonnull wrapper | Capture manager root714b08 before callable copy40eb10; actual manager virtual14 at40dc8a/return40dc8d runs genuine4a7710 and its selected factory branch. |
| Append | Real40ebc0 at40dcb5/return40dcba. Current header, capacity and any genuine growth allocator/memmove/delete outcomes are needed; recovery's observed four-byte growth is not universal. |

For the canonical sample vtable5d3f60, original hash-checked PE data maps source
methods38/3c/48 to4ad580/4ad570/**4ad500**. The last reads BYTE+45ch, confirmed
by retained12281 (`ev_b1330026b0afe29a6232a05b1876fc9fd5cd7ec0315d5102f03d7eb943ca2ec0`)
`MOV AL,[ECX+45ch];RET`. BYTE+463h/4ad5e0 is a different getter. Actual captured
vtable/targets still must be verified before binding any canonical child.

These queries and `+04 →4ad170` already have genuine source algorithms in
`audio-sample-controls.mjs`. Method04 copies460h bytes forward from the live
owner descriptor into sample+498h. It needs the complete source record9a8h and
actual vtable88h for the known canonical sample, not a fabricated method result.

## Positional common path is required for a nonnull V6 selection

The V6 source caller's position is nonzero `body+34h`, velocity0. Consequently,
if genuine selection returns a nonnull wrapper, common40db9b writes wrapper+4
to that position and wrapper+8 to zero, then calls40d6d0. This follows from
the caller arguments; it does not establish which wrapper is selected.

Retained158 (`ev_68fba529256ab88118f853edaded1d3d80b34bbf2f1de7a54480c1878785a3f8`)
proves40d6d0 converts the three signed coordinates with scalarSSE rounding,
sets the fourth vector component to zero, and calls virtual08 at40d735/return
40d738. Canonical target4ad730 writes source+8f8h..907h. The velocity branch
is skipped when the newly stored wrapper+8 remains zero; it must be retained
if genuine intervening game code changes that field. Required literals are
5ecdb4/5dc5b8 for position, and conditionally5ecdb0/5dc5d0/5dc5e8 for velocity.

Then40dbaa reserves a24-byte by-value std::function. It writes vtable5d0294,
captured wrapper at+4, and callable pointer+10h pointing at that inline object;
other private bytes remain carried. Virtual5c at40dbc5 returns40dbc8. The
original hash-checked PE sample vtable maps it to4ad420. Retained9266
(`ev_31d05f16d510c9f5c9a91cffb1da330fdb3c9802e5028afe3478f30ee629d5b2`)
proves its old callback destruction, incoming clone, incoming destruction and
`RET18h`; source+930h stores the callback object and source+940h its pointer.

Original PE vtable5d0294 has clone40f240, invoke40f270/40f280,
destroy40f2a0 and base40ee80. The current `audio-source-retirement.mjs`
callback adapter handles queued4ab790 and listener40f2c0 clones, not40f240.
That clone's genuine algorithm/retained instruction body and strict ASLR stack
binding are a concrete next source gap. No matching40f240/40f270/40f280 listing
was found in the retained native-simulation result search during this audit.
The callback's old source pointee/vtable, if nonnull, is a separate real input.

## Exact stack coordinates

For emitter entryE, let L=alignDown(E−4,16)−32, dispatcher entryD=L−20,
selector entryC=D−24 and selector steady frameF=C−44. These formulas are the
actual existing source layout, not native intermediate-state inputs.

| Actual call | Callee ESP and words |
| --- | --- |
| Selector common04 | F−8: return actual40db8b; F−4: owner+10h |
| Reusable adaptive04 | F−8: return actual40dc37; F−4: owner+10h |
| Position40d6d0 | F−4: return actual40dba8 |
| Position source08 | With G=alignDown(F−8,8)−24, entryG−8, return actual40d738, argumentG+8 |
| Callback source5c | F−28: return actual40dbc8; F−24..F−1: actual24B function value |
| Fresh wrapper new12 | F−8: actual40dc56; F−4:12; caller removes4 |
| Callable copy40eb10 | F−32: actual40dc82; F−28:owner+470h; destinationF−24; RET4 |
| Manager virtual14 | F−32: actual40dc8d; F−28:owner+10h; remaining24B function atF−24; factory consumes28 argument bytes |
| Pointer append40ebc0 | F−8: actual40dcba; F−4:pointer to source-produced wrapper localF+18h |

Adaptive existing-source activity calls use F−8 (one argument) or F−4 (none),
with actual returns40dbf5/40dc04/40dc11/40dc1e. Both selector branches restore
the genuine saved FS:[0] and end with RET8. Original TLS/cookie inputs remain
required; no private register saves are borrowed from a native after snapshot.

## Dispatcher remainder and existing binding limits

Retained151 (`ev_276e723742684068016129e93a54f6b66c48ae2564c6cbdd1d58fc0dd8998ee6`)
then calls source14 at40ead9 (return40eadc), source20 at40eae8 (return40eaeb)
when rate>=0, game40e5e0 at40eaf2 (return40eaf7), and source2c at40eb00
(return40eb03). Canonical targets are4ad6a0,4ad5f0 and4ad9e0. Rate conversion
may need waveform+964h and original sample-rate bytes. Reverb's actual6e6bd4,
source+9a0h/effect and installation branch cannot be forced off. Playback with
nonnull voice+97ch reaches real formatter/debugger/manager queue/Win32 locks;
this is deferred playback, not a direct COM Start or audible-output proof.

`native-effect-emitter.mjs` currently supports the shared-stack round-robin
null-wrapper result, then explicitly fails on a nonnull selection. Its numeric
`sound-dispatch.mjs` counterpart contains selection/position algorithms but
does not establish their private call frames or replace game source methods.
`createNativeRecoveryAdaptiveSoundBindings` is tied to an observed recovery
owner/allocator/service lineage, empty adaptive vector, empty callable and
zero position/velocity. It rejects the positional V6 call and cannot be reused
with a different owner or recovery's external outcomes. The new owner input
will identify the first honest next branch; it does not close these source or
external-service requirements.

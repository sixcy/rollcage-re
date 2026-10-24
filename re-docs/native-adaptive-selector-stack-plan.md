# Generic adaptive sound selector: source stack plan

Read-only review for the closed V7 input. No source, helper or capture changes,
no native launch, and no service results are supplied by this note.

## Actual original-entry input

`analysis/native-parent-rtti-stock-capture-v7-20261024`, parent snapshot4,
module base320000, contains code2 owner `08a15918`. The original-entry owner
has signed maximum+488h=0, cursor+48ch=0, callable+480h=0 and live vector
`[1795f6d8,1795f6e8)`, capacity1795f6e8: four genuine pointer slots.

| Slot | Wrapper | Original-entry coverage |
| --- | --- | --- |
|0|10e37e48|Pointer present; its12-byte wrapper is absent. This is the first genuine next input.|
|1|1794a160|Wrapper/source1795c5c0 incidentally covered; state3/pending4/loop0.|
|2|10e37ef0|Pointer present; its12-byte wrapper is absent.|
|3|1795ecf0|Wrapper/source1795ed18 incidentally covered; state3/pending4/loop0.|

The observed canonical source vtable at slots1/3 is actual4f3f60. Their covered
bytes are diagnostics, not permission to bypass slot0 or preselect a channel.
These are parent-entry fields, not an intermediate selected-wrapper or native
getter result. Source writes and true aliases remain live as execution proceeds.

## Source implementation boundary

Continue the real40db20 after its already implemented prologue. Retained153,
`ev_e7b66afda8bc1259f35bae13abb5f5ad007af72d368288d98dca50fc8ee1e855`,
matches original target SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
Let C be selector entry ESP and F=C−44, the steady selector frame. Incoming
nonvolatile registers have already been saved at F+16/+12/+8/+4, the original
FS:[0] at F+32, original handler at F+36, state−1 at F+40 and cookie at F.

Use actual vtable targets to invoke the existing genuine source algorithms.
There is no need for a game-query service or observed Boolean answer:

| Call site | Canonical target / source function | Callee stack |
| --- | --- | --- |
|40dbf3 virtual38(1)|4ad580 / queryGameAudioSampleActivity|ESP=F−8, return40dbf5, argument1 atF−4|
|40dc02 virtual38(0)|4ad580 / queryGameAudioSampleActivity|ESP=F−8, return40dc04, argument0 atF−4|
|40dc0f virtual3c()|4ad570 / isGameAudioSamplePending|ESP=F−4, return40dc11|
|40dc1c virtual48()|4ad500 / getGameAudioLoopFlag|ESP=F−4, return40dc1e|
|40dc34 virtual04(owner+10h)|4ad170 / copyGameAudioSampleState|ESP=F−8, return40dc37, descriptor atF−4|
|40db88 common virtual04(owner+10h)|4ad170 / copyGameAudioSampleState|ESP=F−8, return40db8b, descriptor atF−4|

The calls' live nonvolatile registers are EBX=owner, EBP=incoming EBP,
ESI=current vector-slot address and EDI=current wrapper. For common04 after a
fresh allocation, ESI instead retains the genuine manager loaded at40dc6b.
Pass those actual values into child ports so4ad170's saved ESI/EDI words are
faithful. The child sees ECX=the source currently loaded from `[wrapper]`.
Re-read this pointer before each actual call, as the original does.

Selection policy is exactly: first38(1) AL0 means reusable. Otherwise query
38(0); only AL1 permits3c(), and only its AL0 permits48(). Only48 AL0 then
means reusable. All other outcomes advance ESI by4 and compare against the
live owner+8. A reusable channel receives04 at40dc34 **and again** at40db88.
Do not deduplicate these real forward copies, whose aliases can matter.

Existing controls preserve native argument stores and widths:38 returns full
state upper24bits with a Boolean AL,3c clears EAX,48 reads BYTEsource+45ch.
Only AL is tested by the selector. Do not reinterpret48 as4ad5e0/+463h.
The latter is a different method. Complete source CPU-register return parity
is a separate claim from these consumed AL values and shared-memory writes.

## Allocation branch remains genuine

Only after scanning to the live end, count=`signed32(end−begin)>>2` is compared
unsigned with16 at40dc49. Count>=16 returns0 without allocating. This is not a
general16-slot backing capacity or a reason to clamp an observed vector.

Otherwise publish12 atF−4 and return40dc56 atF−8, then call the real external
operatorNew. Admit only its actual requested12-byte preimage at the validated
allocator return. A null result still reaches the actual pointer append,
including any real vector growth; it is not an early-return shortcut.

For a nonnull wrapper, source loads manager714b08 before40eb10. Copying its
owner+470h callable reads live owner+480h; empty callable0 avoids a clone but
still has its own SEH/cookie/shared-stack writes. The manager virtual14 call
at40dc8a has entryF−32, return40dc8d, descriptor atF−28 and the24-byte function
argument atF−24. It must run genuine4a7710/factory code with its real reached
CRT/OS/COM boundaries. Publish wrapper source/+4/+8 only from computed child
results. Append40ebc0 entryF−8/return40dcba receives pointer to localF+18h.
Do not borrow recovery's allocator addresses/preimages or empty-vector path.

## Common positional tail and return

The code2 tyre caller is positional (`body+34h`), velocity0. Any nonnull
selection therefore writes those two values into wrapper+4/+8, calls40d6d0
atF−4/return40dba8, and installs its real by-value callback through virtual5c.
The algorithm exists in `sound-dispatch.mjs`, but its temporary Buffer does
not by itself publish native private stack words. Retained158,
`ev_68fba529256ab88118f853edaded1d3d80b34bbf2f1de7a54480c1878785a3f8`,
gives G=alignDown(F−8,8)−24 for40d6d0's frame. The position vector atG+8 is
three independently rounded SSE float components plus explicit fourth0;
virtual08 entryG−8 has argumentG+8 and return40d738. Use genuine4ad730 and
verify its actual relocated target. Velocity12 remains conditional on the
live wrapper+8, not an assumed permanent zero.

Virtual5c entersF−28/returns40dbc8 with the24-byte function atF−24. Only
vtableactual5d0294, wrapper at+4 and inline callable pointer at+10h are written;
private gaps remain carried. Its canonical source target4ad420 consumes24
argument bytes. The real old callback,40f240 clone and destruction must run;
unsupported targets remain explicit. See the separate
[next-descendants audit](native-control-audio-next-descendants.md) for these
currently missing generic callback bindings.

All successful/null/count-limit exits use40dbca: load saved FS:[0] fromF+32,
restore it, then POP ECX/EDI/ESI/EBP/EBX, ADD ESP18h, RET8. Pops do not clear
their memory slots. There is no final security-cookie call in this listing;
do not invent one. A continuation must restore nativeTls.sehWord to the saved
word before returning its computed wrapper to40ea40. A reached failure should
retain the genuine partial source state, not fabricate a restored success.

## Integration and verification

A generic source continuation can be added at the existing
`selectAdaptiveSoundChannelOnStack` boundary and share a common nonnull
round-robin tail. Reuse the existing audio controls with explicit actual
callee frames and actual vtable checks. Keep fresh allocation, positional
callback and unsupported source types as distinct genuine boundaries until
their code and inputs are supplied. The recovery adapter remains tied to its
observed empty owner/vector, allocator/service lineage and zero position.

Constructed retained-instruction tests should cover each AL path, upper state
bits, reuse versus live-end exhaustion, null wrapper slots only where original
code checks them, count16 rejection, duplicate04 copies with overlap, live
end/source aliases, both alignments, PE relocation, saved-register words,
FS:[0] restoration and RET8. Actual V7 can initially prove the next strict
12-byte wrapper miss; completing an artificial source query is not a substitute
for the absent original wrapper. No original audio/physics completion is
established by this plan.

## Implemented component review

Root subsequently added the generic source continuation in
`src/native-sound-selection.mjs`, with source-reached input admissions in the
frame sound binding. Independent
`tests/native-adaptive-sound-selection.test.mjs` passes6/6 tests with no skips.
It compares all declared owner, vector, wrapper,9a8h source, actual vtable,
cookie and640-byte shared-stack spans against the full retained40db20 and
real4ad170/4ad580/4ad570/4ad500 instructions. FS:[0] is checked separately.
Forty successful reuse cases use both preferred400000 and actual PE relocated
320000 images at four stack alignments. Native return value, pre-RET ESP and
restored nonvolatile registers are checked; this does not claim that the
source API exposes a complete CPU-register result.

Other comparisons cover all16 active/pending/loop channels, a real overlapping
descriptor copy that changes live owner begin/end and produces an unsigned
negative-count rejection, exact unbound operatorNew/position entry states,
an unknown target with its actual CALL word, and a missing first wrapper that
cannot be skipped. No implementation defect was found in this tested scope.
The first missing-wrapper read is its first4-byte source-pointer word; its
logical12-byte wrapper extent is a later requirement rather than a reason to
pretend all12 bytes were already read. These are synthetic instruction proofs,
not a new original-process playback or joined-parent match.

# Sound 19 selector input audit

The saved `parent-late-v3-20261023` parent entry still stops at the actual
code-19 bank slot `10939bec`: those four bytes were not captured. The bank
header reports 64 entries, but neither a nonnull owner nor its channel policy
has been established for this sound. This is a static next-input audit, not
an observation that a channel was selected or allocated.

Retained `153-sound-channel-selection-assembly.json`, evidence
`ev_e7b66afda8bc1259f35bae13abb5f5ad007af72d368288d98dca50fc8ee1e855`,
matches executable SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
Its complete `40db20` body establishes the following next reads.

| Actual branch | Required input | Useful observation boundary |
| --- | --- | --- |
| Bank entry exists and is nonnull | Owner `490h` bytes; includes vector header `+4/+8/+c`, descriptor `+10`, callable `+470/+480`, signed maximum `+488`, signed index `+48c` | Guarded bank slot 19 owner |
| Maximum is positive | Exactly `begin + index*4`, then the selected nonnull wrapper/source if present | `40db80`, reached only after `TEST EDI` succeeds |
| Maximum is zero or negative | Actual live `[begin,end)` wrapper-pointer sequence; each examined wrapper/source | `40dbec`, after `EDI=[ESI]`, before the first source query |
| No reusable channel and unsigned live count below 16 | Actual 12-byte wrapper allocation result and preimage | `40dc50` call / `40dc56` return |
| Wrapper allocation succeeds | Callable copy, actual manager virtual `+14`, then its real factory children | `40dc8a` call / `40dc8d` return |
| New wrapper is appended | Actual vector header/storage and reached reserve allocation | `40dcb5` call / `40dcba` return |

The full bank pointer vector can be observed through its actual header at
preferred `6f2414`. A 64 KiB maximum is an observation bound, not a recovered
allocation capacity. The guarded code-19 owner follows that header's begin,
then slot offset `4ch`. Observing the owner's containing readable heap region
is transport only; it does not establish the lifetime or semantic extent of
neighboring allocations.

The owner header should be read before deciding whether to observe channel
storage. An empty adaptive vector is legitimate. A fixed channel slot may
legitimately contain null, in which case selection returns zero. Chasing a
source through either null would make the capture itself fail before the
game's branch can be established. Conversely, adaptive scanning dereferences
its wrapper/source without a null guard; a genuinely reached missing input
must remain a strict replay failure.

At `40db80` and `40dbec`, EDI identifies the wrapper. Minimal event-local
ranges are EDI/12, `[EDI]`/`9a8h`, and `[[EDI]]`/`88h` for a concrete XAudio
sample and its full known vtable. Verify the actual vtable targets before
dispatching ports. Those ranges supply activity `+948/+94c` and policy
`+463` for virtual `+38/+3c/+48`. Virtual `+04` copies the real `460h`-byte
owner descriptor to source `+498`; the source object already covers its
destination. No waveform, voice, COM result, or allocation return is needed
merely to perform these selector queries. Position/callback and playback
children remain later genuine obligations.

The adaptive scan calls `+38(1)`, possibly `+38(0)`, then `+3c` and `+48` in
the retained conditional order. A reusable source receives `+04` at `40dc34`
and again through the common `40db88` path. The count check at `40dc49` runs
only after scanning to the live end. Sixteen is an allocation rejection
threshold, not proof that an existing vector has at most sixteen elements.
Observe actual live storage with an explicit bound; do not replace it with
sixteen guessed slots or skip existing channels.

If allocation is reached, `40dc6b` reads manager `714b08` before copying the
callable at owner `+470`. Manager virtual `+14` at `40dc8a` targets the real
outer factory `4a7710`, not directly `4a7460`. Retained `9126`, evidence
`ev_3b6aa9508493dfa2e72ff1c5df28088a44a1920717c4dd70570180019922b7db`,
matches the same executable hash and shows the nested call `4a7902` to
`4a7460`. The latter allocates `9a8h`, constructs the sample, resolves its
actual descriptor path, looks up waveform/mixer inputs, and reaches genuine
file/COM/thread/lock services as required by its branches.

The append executes even when the wrapper allocation returned null. The
empty-vector append's observed recovery path requests four bytes at
`40f07f`/`40f085`, but that is one proven growth path, not a universal reserve
size. Existing recovery sound-43 capture helpers expose useful allocation,
factory, cache, mixer and external-boundary schemas. Their recorded addresses,
return values and preimages must not be reused as sound-19 answers. Likewise,
the separate worker/critical-section reconstruction does not supply an
unobserved sound-19 manager state.

`native-effect-emitter.mjs` currently stops explicitly at unbound adaptive
selection or a selected nonnull source's virtual/position/callback frame.
`sound-dispatch.mjs` has the genuine selection policy and declared services;
it does not by itself prove the missing shared-stack frames. The next capture
can establish which obligation is actually reached while preserving those
failures. This audit changes no source, profile, capture, or retained report.

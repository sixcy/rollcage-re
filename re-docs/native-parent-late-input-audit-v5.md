# Late parent input audit after sound-19 V5

`parent-late-v5-sound19-tls-20261023` supports the source parent through
attachments, recovery and drive. The next source read, `475e67`'s DWORD at
preferred `5ec9b0`, is physically absent. It is not another alias-only case.
The metadata batch in `native-parent-late-inputs.mjs` adds these consumer
domains for the next observation:

| Preferred address | Bytes | Consumer |
| --- | ---: | --- |
| `5ec9b0` | 4 | `475e50` original debris blend input |
| `6f9730` | 16 | Four camera motion flags |
| `6f9740` | 48 | Four camera motion XYZ vectors |
| `5ea4f4` | 12 | Original default camera up vector |
| `5dc664`, `5dc75c` | 4 each | `406c70` viewport smoothing inputs |
| `6e6560` | 4 | `426e20` clip flag output |
| `80de00` | 216 | `496830` extra participant pose, produced by `41bf40` |
| `6fb954` | 6 | `435ba0` three retirement position WORDs |

All nine spans, totaling 314 bytes, are absent from the original V5 entry's
captured union. All nine remain unadmitted in replay. The exact coverage
result is retained in
`analysis/native-parent-late-input-audit-v5-20261023.json`.
Descriptors contain addresses and extents, never replacement input bytes.
Read-only scalar metadata does not assert that every conditional consumer ran.

The audit reviewed the animation/light, debris, camera/pose/projection,
weather update/screen/volume and placed-model effect source graph. The broad
literal inventory also traverses dormant imported construction/network paths;
`native-parent-late-static-input-candidates-v5-20261023.json` is explicitly a
candidate list, not capture authorization or a claim those paths ran.
Existing animation RNG, light publication, shared debris scratch, weather
brightness/RNG, projection tables, screen state, participant data and world
effect globals already have physical observations. The `5d025c` name-tail
read is one BYTE and is already covered by the nine-byte player-name span;
a four-byte candidate scan would incorrectly call it missing.

The batch is supported by target-matching retained instructions/data:
`291` (`475e67`, then store `475e6d`), `3515` (`406d28/406d35`), `3587`
(`426ee2/426ef1`), `653` (three WORD stores), `9001` (explicit 12-byte up
vector), `4053/4074/5097` (camera motion vector addressing), `5372/5639`
(camera motion flags), and `3603/3624` (`80de00` caller and exact 54-DWORD
pose copy). They identify the original executable SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
The four-camera bounds come from the recovered stage-count domain already
used by the existing camera-record descriptors.

Nullable renderer/map/viewport graphs and the external RTTI boundary remain
separate obligations. Preferred `6e213c/6e20a4` are known module argument
identities for the dynamic-cast call; this audit does not invent arbitrary
type-descriptor extents, a returned application object, map records, CRT
results or allocation answers. The fallback empty-name literal is conditional
on a null name, whereas the current caller supplies its actual formatted
name. Weather's minus-one volume sentinel still cannot be followed by a
plain nonzero pointer guard.

The type-1 attachment transport domain is independently bounded by retained
`1165` (`44d7a0`): light address is `80f520 + index*64`, rejected when it
reaches `8106e0`. Under the original first-search index invariant, usable
indices are 1 through 70. Retained `1161` starts the queued-position flag
cursor at `90b68e`, equivalent to `90b688 + (index-1)*8 + 6`, and advances
eight bytes per light. Thus an optional capture-only observation can cover
`90b688`/560 bytes. This is not added to default semantic comparisons: the
existing source-queue-derived admission continues to require only actual
reached eight-byte slots. The V5 three-slot proof remains 24 bytes.

Validation:

`node --test tests/native-parent-late-inputs.test.mjs tests/native-parent-tail.test.mjs`

All 12 tests pass without skips. They preserve the existing drive proof and
old strict failures, check independent retained accesses, and reject partial
spans at preferred and relocated addresses. No new native process ran.

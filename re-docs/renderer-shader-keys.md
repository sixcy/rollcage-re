# Material shader keys and alias lookup

`src/renderer-shader-keys.mjs` reconstructs `525ea0` key selection, `4c40e0` unsigned UTF16 comparison and `5278d0/527450` alias-tree lower-bound/find. Evidence: retained `13398/13399`, original key switch `13441`, and `13494`–`13497`, all bound to Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

A material marked registered returns its signed ID word when nonzero. Otherwise the original complete attribute mask selects a legacy code, with flags `4` and `2` becoming its low two bits. Unknown masks return zero. The mapping includes the zero mask and x86-wrapped attribute shifts; it is not based on material kind alone.

The comparison clamps the native object's metadata length to the supplied maximum and compares unsigned UTF16 units, retaining embedded zero units rather than applying a host string comparator. Alias lookup walks original links/sentinel bytes, scans live key strings for its lookup lengths, then performs the original final candidate comparison. It returns/writes the exact node or header identity; alias insertion, mapping construction and shader compilation are separate algorithms.

`node tools/verify-renderer-shader-keys-instructions.mjs` passes **2,400 worlds, 9,600 entry calls, 223 reached instructions and 1,299,311 steps**, comparing all mapped bytes at and above `10000h`, return values and restored FS. Cases include signed registered IDs, zero-ID fallback, all legacy masks/flags and unknown masks, SSO/heap/embedded-NUL/case-sensitive comparisons and populated/empty three-node alias trees. Four focused tests cover signed IDs, complete masks, embedded units and sentinel identity. No game callee is mocked and no original process is run.

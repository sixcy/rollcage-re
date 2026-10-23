# Sparse native input packet execution

The source `433200` packet transform formerly used `memory.fill`, which the
strict captured-memory facade does not expose. Its `471250` parent also
published the preferred `6e7edc + participant*67c` literal into the body,
even when the executable was relocated. The current six-AI native capture
reads existing packets without polling, so these defects were latent future
physical-input branches, not the cause of its missing captured packet byte.

`src/vehicle-input-packets.mjs` now preserves the actual initialization order:
the original `43321f` and `433223` repeated zero `MOVQ` stores become repeated
low/high DWORD pairs, then `433227` clears the final DWORD and `43322e`
publishes `ffff4100`. Controls and the participant mask are captured before
these stores as in the native instructions. Bytes after the twelve-byte
packet are untouched. There is no replacement packet or default input.

Before the genuine transform, the source resolves the known image packet
address through its explicit native ownership/alias map. Both the transform
and final pointer publication use that actual address. Ordinary Buffer
callers retain their preferred identity; opaque configuration/status pointers
are not relocated. Missing packet storage still fails.

The new `tests/vehicle-input-packets-native-memory.test.mjs` compares actual
retained `471250` and `433200` execution over fourteen constructed cases:
preferred and relocated images, zero samples, local samples, out-of-local
indices, current network samples, stamped history, selected-input suppression
and the fallback flag. It executes the real transform child, with no game-call
callbacks. Retained code labels and an explicit list of known image literals
are relocated; arbitrary integers and heap pointers are not. Every supplied
data span, produced packet, status and pointer word is compared. A separate
test checks the repeated DWORD store order and untouched trailing bytes.

Evidence: native-simulation request461,
`ev_8d6a18530198ebfa7c65f7f3a8562df4e31e15fac2bb9b8e595b124c12d98b0d`,
and request465,
`ev_6e08e32b709ae96520d08b55f267f0bb5b7e1a7d22b27daadcf0aad913fb7371`.
Both identify original target
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

```powershell
node --test tests/vehicle-input-packets-native-memory.test.mjs tests/vehicle-input-packets.test.mjs tests/native-control-input-regions.test.mjs
```

All eighteen focused tests pass. This is retained-instruction/synthetic
evidence, not an original-process physical-input capture or host-device
polling proof. Analog lazy initialization, replay and network services retain
their separate runtime/input requirements.

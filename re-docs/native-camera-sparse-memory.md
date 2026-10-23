# Late camera and weather memory bindings

The late-parent replay now keeps the original block-copy and memset operations
on explicitly owned sparse spans. The affected ports are `camera-update`,
`camera-pose-helpers`, `weather-volumes`, `weather-screen`, `weather-viewport`,
and `race-phase-audio`. Copies still snapshot each original block separately;
they do not become an aggregate bulk copy. Retained `498030` and `40ac40`
pass exactly 251 bytes to CRT memset for player-name padding. `484880`
passes exactly 76 bytes for its listener descriptor. Ordinary Buffer callers
retain the same bytes and ordering.

Three source pointer-publication defects were independently reproduced with
the SHA-verified original PE loaded at preferred base `400000` and relocated
base `6e0000`, using actual PE HIGHLOW relocation entries:

- `417720` published preferred `9205a0` or a preferred `91f6c0` observer row.
  Native instructions publish the actual module address. Both fallback and
  selected paths now resolve only the known module storage identity. The
  selected-path test executes the real spatial lookup and sector predicate.
- `417ee0` published a preferred authored-trigger row into the caller output.
  Its relocated test executes the real nearest-participant, line-distance,
  and fixed-root descendants.
- `4180a0` placed a preferred `909300` participant-record pointer in its
  numeric frame before formatting the player name. The test observes the
  actual CRT formatter boundary and compares that stored pointer.

The tests first failed with the original preferred pointer values under
relocation. Resolving these literal module references changes no heap pointer,
selection algorithm, body math, or weapon policy. The target remains
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
These are constructed PE / interpreted-instruction proofs, not new original
process camera trajectories.

`formatNativeParentCameraName` implements the reached `%d Player` CRT
operation from its actual observed format bytes and signed integer input.
It writes only the resulting string. It provides no camera pose or viewport
object and does not supply a game child result.

The `402d10` wrapper still needs its genuine external CRT RTTI conversion.
Its original `402d86` CALL targets the `56932a` thunk for
`MSVCR120!__RTDynamicCast`; `402d8b` is the return site. At both observation
sites ESP is wrapper entry ESP minus 40. The five DWORD arguments are actual
application pointer, 0, actual `6e213c`, actual `6e20a4`, and 0. The virtual
callee entry ESP is wrapper entry ESP minus 44. A future typed external-CRT
binding must validate ordered arguments, same-thread/caller lineage, and
returned pointer coverage. It must resolve the current semantic API's
preferred RTTI literals explicitly; returning a guessed application pointer
is unsupported. No such native RTTI boundary observation is claimed here.

The late input metadata now includes `5ed008`, the actual animation RNG word.
The original v2 late capture physically lacks those four bytes. Its source
replay therefore retains that dependency failure, with no default RNG seed.
Sibling animation-light module state and queue spans were actually captured;
their immutable audit is
`analysis/native-parent-late-animation-input-audit-v2-20261023.json`.

Validation: 55 focused tests pass with no skips, including native parent
drive preservation, preferred/relocated sparse-memory checks, and four
pointer-publication instruction comparisons. The four existing weather
instruction checkers (`verifyWeatherUpdate`, `verifyWeatherViewport`,
`verifyWeatherScreen`, `verifyWeatherVolumes`) also each pass eight fixtures
with `output:null`, preserving earlier reports. Late native parent return,
continuous racing, broader camera modes, and the private CPU/CRT ABI remain
separate fidelity work.

The later V3 capture does not establish a joined camera/world replay: its
actual physics-entry state replays independently, while the genuine parent
prefix reaches an unbound sound-creation branch. The physics return ECX
correction is documented separately in [native-physics-return-local.md](native-physics-return-local.md).
No external RTTI outcome or viewport object has been supplied as a default.

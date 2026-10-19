# Recovered body dynamics

This is a JavaScript reference reconstruction of shared rigid-body arithmetic in Rollcage Redux.exe 1.3.8.0, SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. Source declarations and descriptive names are inferred. Evidence is static Ghidra output and original PE bytes; the original game has not been executed for comparison.

`src/fixed-integer.mjs` implements the recovered signed fixed-point operations. `src/body-physics.mjs` implements initial body configuration, force application, derived velocity/inertia state and fractional-frame position/orientation advancement. This is shared arithmetic used by vehicles and other physical objects. The wheel solver, contact detection, collision event queue, collision response, input, race scheduling and complete vehicle behavior remain to be reconstructed.

## State layout

The common body starts at object `+0x34`. Entries below use object-relative offsets, matching retained assembly. Vectors and quaternion components are signed 32-bit Q16; the rotation matrix is signed 16-bit Q12. Units are the game's internal units, not established SI quantities.

| Object offset | Recovered role |
| --- | --- |
| `0x34..0x3c` | Position, three components. |
| `0x40..0x48` | Linear momentum. |
| `0x4c..0x54` | Angular momentum. |
| `0x58..0x64` | Orientation quaternion in w,x,y,z order. |
| `0x68..0x70` | Derived linear velocity. |
| `0x74..0x7c` | Accumulated linear increments, applied once by `0x479ed0`. |
| `0x80..0x88` | Accumulated angular increments. |
| `0x8c..0x98` | Quaternion derivative. |
| `0x9c..0xa4` | Three principal inverse-inertia values. |
| `0xa8`, `0xac` | Mass and inverse mass. |
| `0xb0` | Copied configuration coefficient; broader meaning not established. |
| `0xb8..0xc0` | Derived angular velocity. |
| `0xc4..0xd4` | Row-major rotation matrix, nine signed Q12 shorts. |
| `0xe4..0x104` | World inverse-inertia matrix, nine Q16 words. |
| `0x108` | Integration flags; bit 0 inhibits orientation advancement. |

The 128-byte initializer begins with position, linear momentum, angular momentum and quaternion at offsets 0,12,24,36. It supplies inverse inertia at `+0x68`, mass at `+0x74`, inverse mass at `+0x78` and another coefficient at `+0x7c`. Runtime setup also involves model pointers, spatial registration and vehicle/wheel data; `initializeBody` covers the arithmetic fields.

## Arithmetic behavior

Multiplication uses a signed 64-bit product, arithmetic shift by 16, then the low signed 32 bits. Division shifts the signed numerator left by 16 and truncates toward zero; division by zero and x86 signed-quotient overflow are explicit errors. Vector/quaternion operations keep native integer wrapping and product-rounding order.

Two square-root paths are distinct. `0x41ca60` normalizes its argument, walks 16 root bits and shifts the result back, losing some low precision. `0x432e70` normalizes to a 192-entry u16 lookup table at `0x5eb290`. These are not interchangeable with `Math.sqrt`. For example, Q16 square root of 2 returns 92,680 in the first path. The lookup path returns integer 362 from input 131,072. The corresponding normalization length is 362 shifted left by 8. Supported mathematical inputs are nonnegative signed 32-bit values; impossible or corrupt states that would index outside native tables are not emulated as arbitrary memory reads.

Linear velocity is momentum times inverse mass, with an identity shortcut for inverse mass 65,536. The native limiter first checks for a component above `0x490000` in magnitude. It then evaluates the reduced vector length; only a length above the 128-unit limit causes rescaling. Corrected momentum is mass times the limited velocity. The limit is in internal per-frame units; no conversion to km/h or seconds has been established.

The derived-state routine constructs `R * diag(inverseInertia) * transpose(R)` with the native fixed-point product ordering. It multiplies that tensor by angular momentum and shifts the resulting angular velocity right by 8. Quaternion derivative is half the product `(0, angularVelocity) * orientation`. The cached rotation matrix is an input to this routine; advancement refreshes it after quaternion normalization.

Force application adds each accumulator to its momentum component, retaining the native near-overflow guard, then clears every accumulator. Advancement adds velocity times the frame fraction to position. Unless orientation is frozen, it adds quaternion derivative times that fraction, normalizes the quaternion and rebuilds the matrix. Large quaternions use a separate normalization path that first truncates components to integer units. The optional special time scaling applies only to eligible object types 3,7,21 and excludes one designated object. The port exposes this context explicitly through options. Runtime attachment queues and broad-phase updates remain the caller's responsibility.

## Evidence and verification

All result paths below are under `analysis/scene/results`; the exported ledger is `analysis/scene/physics-evidence-bundle.json`.

| Anchor | Retained observation |
| --- | --- |
| `0x4798d0` | `092-vehicle-tuning-build.json`, `110-body-init-assembly.json`: shared body initialization and body pointer at object `+0x34`. |
| `0x41dbb0` | `134-vehicle-init-assembly.json`: passes template `0x5eab18` after writing spawn position. |
| `0x479b30` | `099-body-angular-state.json`, `111-body-velocity-assembly.json`: momentum-to-velocity conversion and speed limit. The first filename reflects the earlier hypothesis. |
| `0x4799f0` | `095-body-integrator.json`, `100-body-dynamics-assembly.json`: derived inertia, angular velocity and quaternion derivative. The first filename predates its final classification. |
| `0x492280`, `0x4921d0`, `0x4920a0` | `107-body-inertia-transform.json`, `108-matrix-multiply.json`, `102-body-vector-transform.json`. |
| `0x492990`, `0x491f40` | `103-quaternion-multiply.json`, `109-quaternion-cross.json`. |
| `0x41ca60`, `0x41c990` | `112-fixed-sqrt.json`, `113-fixed-inverse.json`: normalized bitwise root and fixed division. |
| `0x479d20` | `123-integrate-body.json`, `135-body-advance-assembly.json`: fractional advancement. |
| `0x479ed0` | `124-apply-body-forces.json`: accumulator application/clearing. |
| `0x492510`, `0x492610` | `126-normalize-quaternion-small.json` through `129-normalize-large-assembly.json`. Assembly is needed because decompilation omits important operations. |
| `0x432e70` | `130-vector-length.json`, `131-sqrt-lookup-table.json`, `132-sqrt-leading-zeros.json`, `133-sqrt-lookup-assembly.json`: integer lookup root. |
| `0x4749e0` | `116-physics-frame.json`: frame orchestration, body preparation, collision event processing and finish stage. |

`tools/recover-trig-table.mjs sqrt` verifies all 384 lookup bytes against both Ghidra memory and the original executable before generating `src/sqrt-table.json`. `tools/recover-body-template.mjs` verifies the complete 128-byte template at original file offset 2,005,784 and writes `analysis/body-template.json`. The immutable template has mass/inverse mass 65,536, inverse inertia `[21671,17762,31930]` and quaternion `[0,0,65536,0]`; spawn and per-vehicle setup can change it later. The cosine lookup was already verified separately.

The focused suite has 30 passing tests, including signed rounding/wrapping, native root quantization, quaternion handedness, body configuration bounds, force guard/clearing, speed limiting and momentum correction, anisotropic inertia rotation, and fractional/frozen/specially-scaled advancement. These are mathematical fixtures tied to the static evidence, not differential tests against an original running process. `tools/probe-body-physics.mjs` adds stationary, analytic constant-velocity and angular-motion sequences using the recovered template with declared synthetic inputs.

## Remaining simulation work

`0x47ab30` orchestrates vehicle force stages, including `0x41d680`, `0x488910`, `0x488370` and `0x41c080`. Retained results `115` through `119` expose the call chain and some wheel/contact/drive calculations, but those stages are not ported yet. `0x4749e0` manages collision events; `0x474bb0` dispatches collision response rather than being the simple advancement routine its request filename originally suggested.

The constructor stores callback `0x41e080`, but Ghidra does not recognize a containing function there. Result `090` confirms decoded code, and `097` retains the initial bytes. Its observed object-type and relative-motion handling makes it a collision-callback candidate, not an established per-frame update. A later pass must recover its boundary and remaining body before porting it. No native analysis repair or original executable change was made.

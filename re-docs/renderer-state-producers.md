# Renderer and viewport producer recovery

Target Redux 1.3.8.0 SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. This package traces actual producers behind camera projection inputs. It does **not** yet close renderer startup or rendering.

Exact instruction inspection of every retained xref establishes these writers:

| State | Actual producer |
|---|---|
| Renderer singleton 6e6388 | 519df0 bootstrap publishes the 517720 manager result and clears failures; 51a050 teardown clears it |
| Current viewport 6efb3c | 50e9f0, 50eb00 and 50eb90 set it before active viewport processing and clear it afterward |
| Camera caches at 9200a0/9200b0 plus index×184h | 416180 clears all four camera records; 417e80 and the 4180a0 parent's 41a036–41a059 blocks update or restore them |

Other singleton/current-viewport xrefs inspected in 11000–11061 are reads. Bootstrap 519df0, manager constructor 517720, target/scene/viewport construction and frame wrappers have retained pseudo/assembly in 11064 onward. The renderer device at 714ae8 is game-owned: 50f510 constructs `librazor::Visual::D3D9VisualManager` and writes vtable 5db278. Its virtual methods must not be described as direct OS imports before their adapters are recovered.

`src/renderer-state-producers.mjs` currently implements:

- 516a10 `constructRendererTarget`: raw name, enabled flags, packed clear state and caller tag.
- 50e370 `constructRendererViewport`: actual two string fields, listener container, two inline frustums, near/far/FOV and flags. Actual 51a650 registration now runs by default when UI manager 714b44 is nonzero; see renderer-overlay-registration.md.
- 50ec10 `constructRendererListeners`: actual allocated eight-byte sentinel and backlink.
- 50dff0 `constructRendererFrustum`: six zero planes and actual inline cursor.
- 517ce0 `findRendererScene`: scene-name vector at manager+20h; names start at scene+0, unlike target/viewport names at +14h. Reuses the existing actual byte comparator.
- 50ee00 `resetRendererBatches`: three queue pointers, signed active-count guards and live metadata reload after memset.
- 50e2e0 `dispatchRendererViewportEvent`: original event value, list-index selection, std::function binding and live vector length after callbacks. Empty function bindings throw the native library failure. Actual callback targets remain caller-owned explicit interfaces.
- 50e160 `transformRendererFrustum`: sequential float32 plane/point transformations, count/cursor writes and overlapping source/output behavior.
- 50e660 `updateRendererViewportFrustum`: actual aspect/FOV ratios and six planes, original literal bytes, real 4020e0/4020c0/402100 temporary writes and float32 rounding.
- 50e950 `prepareRendererViewport`: actual rectangle/view-matrix request order, independent 16-byte snapshots of camera matrix, renderer pointer reloads and actual frustum transform.

All use caller-owned raw memory and native entry ESP. String allocation/free is the existing actual string adapter with genuine CRT services. `services.rendererMath(operation,value,precision,runtime)` is genuine tan/atan binary64 and sin/cos binary32. `services.rendererCallback(object,8,args,runtime)` represents std::function invocation; callbacks can change listener vectors. `services.rendererDevice(object,method,args,runtime)` currently represents a remaining game-owned renderer-device contract, **not a recovered Direct3D adapter**. This limitation is explicit even though the surrounding numeric game algorithms execute fully.

Validation reports, with overlapping child counts:

| Report | Cases | Reached instructions / steps |
|---|---:|---:|
| `renderer-state-producers-boundaries-instruction-check.json` | 2,100 | 539 / 261,300 |
| `renderer-frustum-numeric-instruction-check.json` | 2,400 | 315 / 1,083,192 |
| `camera-cache-producer-instruction-check.json` | 128 persistent scenarios; 2,304 calls | 1,469 / 1,712,640 |

The first report includes 800 CRT allocations, heap/inline names, actual constructors and 525 ordered std::function invocations, including growing/shrinking live listener vectors. The numeric report includes 1,600 transforms, 1,600 frustum builds, 800 setup calls, 11,200 math requests, 2,400 renderer-device requests and 320 overlap cases. Source, device and camera pointer mutation is compared. All mapped bytes at or above 10000h, defined EAX and ordered interface requests match.

The cache report runs actual 416180 and every reached body/shape/spatial child, then fallback → publish → restore through 417e80/4167f0 for all four views. A second real constructor clears every populated cache before another fallback. There are 256 constructors, 2,048 cache calls and 256 literal 610h-byte clears. Private stack persists throughout. No game callbacks are mocked in this cache proof; only compiler cookie and CRT memset are services.

The numeric corpus keeps derived normal planes finite, including signed/zero widths and infinite projection ratios. Raw NaN payload/sign propagation is unvalidated: JavaScript JIT operand selection in the existing scalar interpreter makes that domain unsuitable for byte-level proof. It is not patched to arbitrary expected values. Height-zero/FOV combinations producing NaN planes remain outside this report. Genuine libm implementations and floating exception state are supplied interface behavior, not original-process measurements.

Narrow interpreter support now models FS:[0] as explicit `machine.fs0`, separate from flat memory. It must be initialized after reset; unknown offsets, widths or GS forms fail. Normal compiler SEH links/unlinks preserve the synthetic chain. MOVUPS preserves all 128 bits at unaligned addresses; CVTSD2SS preserves known destination upper bits and rejects invented full-vector provenance. Dedicated tests cover nested links, float rounding, signed zero, raw NaN move payloads and invalid lane use.

Manager 517720 and scene/node constructors plus their actual transform, bounds and vector descendants are now implemented and verified in renderer-scene-nodes.mjs; see [renderer-scene-nodes.md](renderer-scene-nodes.md). Its separate 3,000-case report reaches 1,335 instructions and 1,488,250 steps with UI manager 714b44 explicitly zero; counts overlap this package. Remaining work is full 519df0 bootstrap/51a050 teardown, device initialization 510080 and its actual virtual adapters, and active viewport wrapper traversal. No original process/device execution or installed writes were used.

# Weather startup: real renderer dependencies

The dry-weather startup omission is confirmed, but a faithful installed-session
adapter cannot yet be assembled solely from the existing complete source ports.
The missing input is an initialized game renderer/device graph. JPEG decoding is
available through the actual host GDI+ boundary. This audit adds no replacement
seed calculation, fabricated decoding failure, renderer ID or game callback.

## Original producer and timing

Retained startup2457 establishes this order:

| Site | Original operation |
| --- | --- |
|`47eab4/47eaba`|Read captured session+618 and publish shared5ec954.|
|`47ebea`|Actual44c2b0 track loading and placements.|
|`47ec00`|Actual44a5c0 point construction captures bases and advances its RNG.|
|`47ec05`|Actual494c80 deformation construction.|
|`47ecef`|Actual46a420 projectile/wormhole construction.|
|`47eda2`|Actual469ec0 periodic-body construction, gated by session554.|
|Participant loop|Each41dbb0 vehicle,416180 camera and410060 AI initialization.|
|After loop|41e850 model normals,487410 overlays and494060 wheel histories.|
|`47f2ba`|Actual496290 weather construction.|
|`47f2bf`|Actual485250 audio construction.|
|`47f2c4`|Actual42a670 input initialization.|

`initializeWeather` always calls `initializeWeatherScreen`, including session
weather-kind553 equal to zero. The original `497f34 IMUL` and `497f48 MOV`
advance shared5ec954 once in that dry-weather branch. This is after point and
participant construction; moving it earlier changes their initialization.
Subsequent scripted-release/object-collision torque and other real consumers
read this stream. Current LOW/LEV1 and LOW/LEV8 source observations for1100
updates did not themselves reach another5ec954 write, so that observation does
not establish a changed trajectory in those windows.

The separate weather RNG is5ed2bc. `498bc0` seeds it with the actual489cd0
microsecond clock divided by1000. Per-update weather advances that private
stream; it is not the5ec954 stream. QPC/frequency and its lazy clock origin
remain genuine platform inputs, not the nominal30Hz racing tick counter.

## Complete existing source graph

| Original entry | Existing source/default |
| --- | --- |
|496290|`weather-initialization.mjs`: `initializeWeather`|
|497ed0|Same: `initializeWeatherScreen`|
|498bc0|Same: `initializeWeatherEnvironment`|
|401b70/401be0|Same: `loadWeatherTexture`|
|4895d0/414dc0|`game-bitmap-images.mjs`: `loadGameBitmap`, `loadGamePlatformImage`|
|408680|`game-texture-construction.mjs`: `constructGameTexture`|
|4bbf40/4bbfe0/4c4a60|`game-image-startup.mjs`: library, worker-pool and gamma initialization|
|5208d0|`renderer-texture-ownership.mjs`: `obtainRendererTextureIndex`|
|520940/51ff30|`renderer-texture-upload.mjs`: `uploadRendererTexture`, `uploadRendererTextureLevels`|
|51fa00|`renderer-texture-formats.mjs`: `enumerateRendererTextureFormats`|
|50f510/514800|`renderer-device-construction.mjs`: D3D9/base manager constructors|
|510d40/5110b0|`renderer-adapters.mjs`: actual adapter/mode enumeration and selection|
|512740|`renderer-device-selection.mjs`: `selectRendererAdapter`|
|5120e0|`renderer-presentation.mjs`: `configureRendererPresentation`|
|512a30|`renderer-device-creation.mjs`: `createRendererDevice`|

Game image storage, conversions, row workers, copying, resampling and mipmaps
also have real source defaults. Worker scheduling/future state remains an
explicit STL boundary, with actual game workers executed by their captured
`execute` functions. That boundary may be serialized explicitly, but a fixture
future object or arbitrary callback stack is not evidence of native concurrent
thread/TLS state.

The active source texture constructor dispatches real renderer virtuals when
the manager vtable contains5208d0 at+78 and520940 at+88. It then runs actual
resource ownership, category/format choice, surface creation, conversion,
locking/copying/unlocking and retirement. Only Direct3D COM operations are
external at that point. Installing a `services.rendererCall` that invents the
ID and accepts the upload bypasses those game-owned producers.

## Exact overrides in existing proofs

`verify-weather-startup-connected-instructions.mjs` uses an explicit synthetic
renderer at2b0000 with a synthetic vtable at2c0000, virtual+78/+88 targets592000
and592010, a manually populated descriptor at2d0000, and synthetic GDI+ pixels.
Its+78 service writes consecutive IDs starting300. Its+88 service copies image
levels into an observation list, writes output-byte1 and returns1. Those are
declared interface fixtures in the existing proof, not real5208d0/520940.

`probe-weather-texture-construction.mjs` replaces GDI+ pixels with genuinely
decoded installed JPEG pixels, but retains the renderer-ID/upload overrides
and injected descriptor. Its success proves the bitmap/image pipeline through
that interface, not original renderer resource creation or a ready production
bootstrap. `prepareRaceTextureFixture` has the same intentional boundary.

The image fixture's `openFailure:true` selects the original JPEG fallback.
This is distinct from forcing the complete bitmap decode to fail. The shipped
name is `Raindrop1.jpg` at56fe4c; the actual fallback prefix at5d358c is
`..\\IDXData\\Redux\\`. A real file service must resolve the attempted paths
under the declared working directory and let their actual existence select the
branch. It must not reject an existing file merely to reach a desired fallback.

Current Racing test constructs517720, the scene/target/viewport manager at
6e6388. That object is distinct from the D3D9VisualManager at714ae8. The former
does not provide the latter's device, selected adapter, texture-format vector
or category descriptor+444. The current portable RTTI adapter also supports its
camera target, rather than the separate WindowsApplication cast used by device
setup. A new renderer pointer/descriptor cannot be substituted for that missing
construction and initialization graph.

## Smallest complete next parent scope

The immediate source parent to close is full510080, with a genuine50f510
constructed manager as input. Original assembly11325 shows:

1.405010 settings and actual virtual0c=5125d0 command-line settings.
2.Direct3DCreate9 and510d40 adapter enumeration.
3.Actual Application readiness/adapter selection,50d9a0 window creation,
  512740 selection,5120e0 presentation and512a30 device creation.
4.51fa00 format enumeration, actual virtual44=511380 viewport and four
  virtual20=529030 clear / virtual24=5290c0 presentation passes.
5.The real white-image texture, state caches, index/vertex buffers, material
  copying, shader setup and AspectRatio property publication before return.

Most leaf ports in the first four phases already exist. A bounded source search
still finds no implementation of the whole510080 parent, whole51e320 parent,
510920 reload/font/shader policy, or5252d0/525f70 shader generation/compilation.
510080 calls510920 at5106ae and virtualBC=5252d0 at5106f6 unconditionally on its
successful path. Existing shader-program ports start with an already created
effect COM object; they do not replace the game source-path generation and
compile parent. Therefore full510080 is not closed merely by composing the
current ports.406940 is an additional small retained getter needed by its adapter
policy. A prefix stopping after51fa00 would be an explicitly incomplete owned
section, not a completed successful initializer suitable for continuing startup.

The next containing parent is51e320: real51de80 draw queues, actual manager
virtual0=510080, then530480 worker state and51a460 UI ownership.519df0 supplies
the broader manager allocations/publications, application transitions and
input/audio bootstrap. No optional failure branch or omitted child should be
used to turn these into a claimed successful renderer.

An eventual weather component can accept an already genuinely initialized
renderer as an explicit admission contract, execute actual496290/497ed0 and
expose observations. The present viewer has not met that admission contract.
Adding a wrapper around the existing `initializeWeather` alone would not solve
the missing producer, so this audit adds no misleading partial runtime helper.

## Actual external inputs still required

- Real resource/disk reads and path resolution; real installed JPEG decoding
  through GDI+ or an explicitly supplied platform-decoded pixel buffer. Descriptor
  allocation/row copying remains the actual414dc0 game code.
- Bounded CRT new/malloc/free/copy/string/libm services and truthful ownership.
- Actual critical-section/mutex/event/affinity and STL scheduling contracts;
  workers execute their original algorithms, with explicit thread/stack context.
- Actual QueryPerformanceCounter/Frequency semantics for489cd0.
- A declared Direct3D device service with genuine capability/format query
  answers and owned texture/surface storage, lock buffers and lifetime. It must
  not answer game-owned renderer virtuals or supply invented manager fields.
- For full510080, real window/application command/RTTI ownership and the missing
  game shader/reload parents. A future portable graphics backend may implement
  device services, but its capabilities and observable limits must be explicit.

The host decoder was exercised read-only on2026-10-23 without launching the
game. Installed `IDXData/Redux/Raindrop1.jpg` has1437 bytes,64x64 dimensions,
256-byte GDI+ stride, file SHA256
`ec3cff22c3a99dcbe9408c88273caec52baae93cd7fe9f91509912cf54139bb0`
and decoded BGRA-buffer SHA256
`42a4e95a2eed831e7bfaa4458cf3f65a896a3259ddf43e4faaa5a6ef882625cd`.
This confirms a usable genuine decoder input; it does not execute496290 or its
renderer graph. No installed data/report was overwritten and no production
source, viewer or canonical fidelity note was changed.

## Target-bound evidence

All records below identify Redux SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

| Reply/entry | Evidence ID |
| --- | --- |
|2457/47ea40|`ev_c39a69909451efe663de2dd317d58d4a778c39999a2060dea599e1d088aa0884`|
|3640/496290|`ev_4c38f87f80403096f446d7184dea6c163801401f12a2ed5243b9ba97d818f237`|
|3661/497ed0|`ev_833b06d51dcf1d2f5781d6543cdb8d2447661e8cb45956f25bbb0f01ff746067`|
|3667/401b70|`ev_d62785022ed9f91c8afe417e9aab9e8563c51f78036ffb028611c51a737448cc`|
|3681/4895d0|`ev_7f46c402b9f6cbad0e392bc43b51f95e0df80a6cf133bbdf35db69a1cc8666b1`|
|3741/414dc0|`ev_ecf9118ca39706781bccf56859b9387f4df2785110dff4813399882b11881d0f`|
|3683/408680|`ev_bb8210961e6b9054993f0c93cf500834ab6be72367b19ddb15ce9a1c74b4dc57`|
|11149/50f510|`ev_6aab413912468e4fd5dcdf6973e7a9ebeb17a50e58d84cabf0105e5f43a594e8`|
|11325/510080|`ev_ad65e9314883fd4fad90f56a1e78953ff31508b735d4a448fa06e6d74bbbaf8e`|
|13243/51fa00|`ev_cd3b2ef256d1c1cddde8b82088d2dda6b7b0b18939ee7a23eb7b2375f1974124`|
|13278/510920|`ev_225b7f1f9e19627c9aaeed21268f6834d9e3e40dfb2fdd5153e67fe46713f844`|
|13284/5252d0|`ev_49e376a9099c7d80888f93041db14e3e7b9cb453fe83855dc90c3f579dbb9f40`|
|13401/525f70|`ev_927abab152c07126772409b8ba075def39cd0664cb5506383e48075f513dd381`|
|13058/51e320|`ev_412a091f6c2838d1e77765c306594150442527ee6ef905e7c72b9f47223e9038`|

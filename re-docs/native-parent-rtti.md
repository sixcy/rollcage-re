# Typed parent camera RTTI boundary

The original V6 parent replay matches through auxiliary state and then reaches
`4180a0`'s common viewport-reset tail. `402d10` calls the imported
MSVCR120 `__RTDynamicCast` thunk `56932a`. This is an external CRT outcome,
not permission to substitute an application/map getter or a guessed base offset.

Let U be `450e50` entry ESP and S=U−20 the recovered shared child entry.
The original `451102` calls `4180a0` with its index in ECX. Its prologue
allocates `bch` and saves four registers, giving camera frame F=S−204.
At `41a0b9` the name is F+`a4h`=S−40. `41a0c0` pushes mode1,
`41a0c2` pushes the name, and `41a0c3` calls `402d10`, returning to `41a0c8`.
Thus wrapper entry R=F−12=U−236. The wrapper pushes 20 bytes of local/SEH
state, then five CRT arguments. Both pre-CALL `402d86` and first post-CALL
`402d8b` have ESP Q=R−40=U−276; actual CRT entry is Q−4.

The five actual arguments are:

`[sourceApplication, 0, actual(6e213c), actual(6e20a4), 0]`.

`tools/lib/native-parent-rtti.mjs` exports two observer sites,
`nativeParentRttiObservationRanges()`, target-evidence verification and
`createNativeParentRttiBindings({capture,pair,memory,initialSpan,moduleBaseAddress})`.
The observer contract is:

| Range | Location | Length |
| --- | --- | ---: |
| `native-parent-rtti-context` | Q | 52 |
| `native-parent-rtti-camera-return` | Q+256=S | 4 |
| `native-parent-rtti-clock` | actual `90a548` | 4 |

Context Q..Q+19 holds the five external arguments. Context+40 is the wrapper
return `actual(41a0c8)`; +44 holds the original formatted name pointer S−40
and +48 holds mode1. Equivalently, wrapper R+4 is NAME and R+8 is MODE1:
the last PUSH before CALL supplies the first stack argument. The separate
camera return must be `actual(451107)`.
Capture those exact pre/post sites with original thread/environment metadata
inside the selected parent observation; bound the observation count. Unfiltered
early-frame RTTI events must not exhaust a later selected frame's budget.
Posthoc admission requires the same TID, clock and enclosing auxiliary/camera
checkpoint event order. Source frame depth is derived above, never read from
an intermediate native stack to repair replay.

The binding authenticates ordered call/return events, actual code addresses,
ESP, all five type arguments, unchanged arguments across the CRT call,
enclosing returns and source application's live singleton identity. The observed
EAX must identify at least `84h` bytes of **initial parent input storage**.
It supplies only that external EAX. It does not copy the observed object,
viewport records, map nodes or CRT scratch into carried source memory.
The legacy source's preferred type tokens are explicitly converted into actual
module arguments at this boundary.

The source singleton and recovered NAME/MODE stack arguments are validated
before checking whether an authenticated CRT outcome exists. Missing evidence
therefore cannot hide a reversed caller stack. The prior adapter and constructed
fixtures had those two caller arguments reversed; retained4513/4543 prove the
correction independently. Constructed positive fixtures now publish the caller
words in actual PUSHmode, PUSHname, CALLreturn order. Preferred and relocated
negative cases reject the swapped order in both captured context and carried
source, including when no external records exist. The original V6 regression
also asserts the reached source R+4 name and R+8 mode words before reporting
the first missing external outcome.

The adapter publishes only the proven five argument PUSH words and the CRT
CALL return at Q−4. The original wrapper's saved ECX, complete SEH publication
and CRT private scratch remain outside this typed adapter's proof. No full
private-stack equality is claimed. Other camera/weather callers have different
depths and remain unsupported rather than inheriting this common-tail ABI.

Use the explicit binding order because `bindNativeParentTail` creates a new
carried memory identity:

```js
const bound = bindNativeParentTail(source, {snapshot: pair.before, includeLateInputs: true});
const rtti = createNativeParentRttiBindings({capture, pair, memory: bound.memory,
  initialSpan: originalParentInput.span});
executeNativeParentTail(bound, {through: 'cameras', crtDynamicCast: rtti.crtDynamicCast});
rtti.assertComplete();
```

Only `executeNativeParentTail` gains this named opt-in CRT service. It accepts
the authenticated factory's function and rejects arbitrary game handler
overrides. Its default behavior and `continueNativeParentTail` remain unchanged.
The caller must validate all selected outcomes were consumed after the camera
stage, including when later stages fail.

Retained `310`, `3507`, `3650`, and isolated `4482/4513/4543/4571` verify
the executable SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
`verifyNativeParentRttiEvidence()` returns their seven Evidence IDs.
It also checks the frozen original-file PE import audit
`analysis/native-parent-rtti-import-identity-20261023.json`: CALL402d86
targets56932a, whose `ff25c4e45600` thunk names IAT56e4c4. The original
import descriptor identifies `MSVCR120.dll!__RTDynamicCast`, hint381.
The accompanying read-only analysis checker reproduces the file offsets,
bytes and names. This establishes the static import identity; runtime DLL
version, resolution and behavior remain separate from this file audit.

`node --test tests/native-parent-rtti.test.mjs tests/native-parent-tail.test.mjs`

All 16 tests pass without skips. Preferred/relocated constructed records test
the typed adapter and reject corruption, wrong lineage and unobserved results.
They are not original-process CRT evidence. A retained V6 regression reaches
the proven common-tail source frame after matching earlier stages and still
fails for missing authenticated CRT records. V6 has no CRT call/return pair;
no successful native cast or camera/whole-parent parity is claimed here.

The separate initial-map audit is retained in
`analysis/native-parent-rtti-initial-map-audit-v6-head16-20261023.json` (the
earlier audit is preserved). With module
base `006e0000`, V6's actual singleton is `009f5470`, its captured vptr is
`00850308`, and its candidate map header at `009f54ec` reports sentinel
`013ef2c8` and three elements. None of the sentinel's first byte, 14-byte
link/nil header, or complete 100-byte allocation is captured. Therefore
the aligned 16-byte semantic header is also absent. Actual non-nil node
addresses and inline/heap key choices remain unresolved.
These are singleton candidate fields, not an assumed CRT cast result.

Retained `3717` proves the sentinel constructor `405dd0` requests exactly
100 bytes and publishes three self-links and nil/color `0101h`; `3687`
proves normal nodes also request 100 bytes. A next fixed guarded observation
can follow root RVA `2efb38`, offsets `[0,7c]`, and capture 100 bytes. Semantic
sentinel admission should remain 16 bytes for links/color/nil until actual
accesses require more; the constructor's allocation size does not justify
comparing its unconsumed value storage. Any
optional containing readable-region transport needs its own declared bound
and nonnull lifecycle admission. It must not silently admit all neighboring
heap allocations. Once actual links are available, compare/admit only the
traversed nodes and keys. A node's key is inline at +16 when capacity +36 is
below16; otherwise +16 holds its heap pointer. Length is at +32. Observe the
actual length plus terminating NUL and preserve a strict failure for missing
storage. Do not blindly follow an inline key as a pointer or infer three node
addresses from the logical count.

The opt-in preparer is
`tools/prepare-native-parent-rtti-capture.mjs`; it exports
`createNativeParentRttiCaptureConfig` and `prepareNativeParentRttiCapture`.
Existing parent-tail profiles retain their original 13 snapshots. The new
profile has one parent through world effects, at most four CRT pairs/eight
additional snapshots, a total bound of 21 snapshots, and the existing 90-second
and one-million-event bounds. It returns `preparedOnly` and
`launchBlockedUntilHelperCapability`, requiring native helper capability
`scoped-parent-rtti-and-singleton-map-preflight-v1`. JS configuration success
does not establish that this native helper capability has been implemented.

`tools/lib/native-parent-rtti-capture.mjs` exports
`verifyNativeParentRttiCaptureConfiguration`. Its purpose-specific
`parentRttiObservation` policy binds the selected parent entry, auxiliary
window start, camera window end and two external CRT sites. It includes
`singletonMapPreflight` with actual root RVA `2efb38`, offsets `[0,7c]`, the
fixed-head/region range IDs, a 16 MiB transport bound, and exactly these
preflight points: parent entry, after cameras, after world effects.

The native helper must check nonnull APP/head on the owned main thread
**before resolving any snapshot ranges**, latch actual identities at the
selected entry, and require stable identities at both later points. There
must be no thread resume between that check and its reads. A fixed guarded
100-byte head observation independently proves its dereference chain. The
separate readable-region row uses the existing nonnullable range mode only
under this explicit preflight; it does not combine unsupported guarded and
readable-region modes. Earlier physics/tail checkpoints do not duplicate this
map transport. Later map data is comparison-only, with semantic admission
restricted to actual reached head/node/key domains after the cast/source
accesses. It never supplies native after bytes to replay.

The verifier enforces the exact ordered 15-site profile, original three
startup breakpoint/action policies from `createReduxCaptureConfig`, owned
window/isolation defaults, and TLS capture. Extra observation sites, phase
writes, worker/held/service policies, altered type/stack windows, unsupported
map guards and enlarged bounds are rejected. No configuration was written or
process launched during the JS profile implementation.

`node --test tests/native-parent-rtti-capture.test.mjs tests/native-parent-rtti.test.mjs tests/native-parent-tail-capture.test.mjs`

All 19 tests pass without skips, including preserved V5/V6 original-process
replays and the strict V6 missing-CRT boundary. The new profile itself has no
original-process runtime evidence yet.

# Guarded optional pointer observations

This opt-in fixed-length capture mode observes native pointer guards before
chasing optional vehicle audio graphs. It records channel sentinels such as127
or a null source/waveform without reading their pointees. An unreadable nonnull
pointer remains an observation failure. No pointee bytes are invented or filled
with zeros, and existing range modes and capture profiles stay unchanged.

`MemoryRange.dereferenceMinimumValues` is a parallel integer array alongside
`dereferenceOffsets`. It selects guarded-pointer mode. The first version admits
only one RVA or absolute root, offset0, fixed length1..64MiB, and1..8 pointer
steps. It excludes register roots, readable-region and vector-storage modes.
Each minimum is1, except257 is additionally allowed at index0. The root and
every DWORD read/output extent must fit native32-bit address bounds.

For a separately verified module-global channel slot, the graph descriptors
are:

| Range | Dereference offsets | Minimums | Bytes |
| --- | --- | --- | ---: |
| channel wrapper | `[0]` | `[257]` | 12 |
| source | `[0,0]` | `[257,1]` | `9a8` hex |
| source vtable | `[0,0,0]` | `[257,1,1]` | `88` hex |
| waveform | `[0,0,964h]` | `[257,1,1]` | `440` hex |

The profile supplies the actual verified channel-slot RVA; this component does
not choose a vehicle or guess heap addresses. The source vehicle sound facade
at `src/vehicle-sound-controls.mjs` retains the original unsigned channel>256
guard and then null-source test. Minimum257 therefore means the native branch
channel>256, not a general assumption that low pointer values are null. A value16
in a later pointer slot passes minimum1 and must be read normally; its failure
cannot become a skip. Value16 in the initial channel slot is explicitly below
the native257 threshold, with that actual value retained in the proof.

`ResolveGuardedPointerRange(range,moduleBase,readDword)` is the pure C# callback
resolver used by both immediate and buffered capture paths. It reads each
original DWORD and stops only at the first value below its declared minimum.
Failed reads throw, with partial successfully observed steps retained in error
details. It never translates an unreadable pointer into zero. Buffered
reservation includes actual output bytes plus4 bytes for every guard DWORD
actually read, including the failing native guard. Existing global/frame/byte
bounds are unchanged.

Both successful and stopped rows preserve the original descriptor root,
offsets, module base and these additional fields:

- `rangeMode:'guarded-pointer'`
- `guardedRootAddress`: actual static root before pointer chasing
- `guardedDeclaredLength`: original fixed requested extent
- `dereferenceMinimumValues`: declared parallel minimums
- `guardedStopIndex`: first false step, ornull after a complete chain
- `guardedPointerSteps`: actual `{index,readAddress,value,bytesHex,minimumValue}`
- `guardedPointerReadBytes`: exactly four times the observed step count

A false branch writes an actual empty blob, `address:0,length:0`. Its metadata
does not grant even one readable byte at0,127, or any unobserved pointee. A full
chain writes only the exact actual resolved fixed-length extent. Diagnostic
proof bytes are metadata, never surrogate pointer slots.

`validateCapturedGuardedPointerRanges(rows,{expectedDescriptors})` is exported
by `tools/lib/captured-guarded-pointer-ranges.mjs`. It returns a Set containing
only legitimately empty guarded rows. It validates empty and full proofs
against actual pointer bytes from **other** same-snapshot captured spans.
Only independent unguarded spans are initially trusted. Proved wrapper outputs
can then establish source-pointer bytes, and proved source outputs can establish
waveform/vtable-pointer bytes. Input order does not matter; self-certification,
cycles, unavailable dependencies, changed roots/steps/thresholds, first-false
mismatches and overflow fail explicitly. The memory facade maps proven full
outputs and excludes genuine empty outputs. It grants no memory from proof hex.

The hash-checking capture loader performs this structural/byte validation after
loading a snapshot's blobs. It does not currently load configuration, so a
native checker must additionally pass the actual declared global and current
breakpoint range descriptors in `expectedDescriptors`. This verifies IDs,
root kind/value, offsets, minimums and declared extent, and rejects missing,
undeclared or downgraded guarded ranges. In particular, an allowed minimum1
cannot replace the configured257. Expected configuration must never be
manufactured from the observed rows themselves.

```js
validateCapturedGuardedPointerRanges([...snapshot.ranges.values()], {
  expectedDescriptors: [...configuration.ranges, ...breakpoint.ranges],
});
```

`tests/native-guarded-pointer-range.test.mjs` covers pure C# resolution and exact
pending-byte boundary checks without native fixture execution; synthetic sparse
vehicle sound facade inputs; source16 failure; independently proved full and
127/null graphs; malformed/self/cyclic/unobserved/forged proof; explicit
configuration threshold/root/extent checks; and loader preservation/rejection.
Legacy captured-memory/loader tests and retained V12–V15 profiles also pass.
These tests do not establish a new original-process guarded-range observation
or faithful complete physics. No game, native fixture, or security-setting
change was used to implement this mode. Only the root capture owner prepares
the separately verified complete audio graph profile and decides any native run.

## Retained original control-prefix v3

The root capture owner subsequently completed
`analysis/native-physics-local/startup-20261022/control-prefix-v3-20261023`.
The guarded regression independently reloads the original target-hash-checked
snapshot blobs and the actual configuration, then runs
`pairNativeControlSnapshots`. The actual pair is entry4 → after-AI5 → exit6,
thread34624, module base `6e0000`, logical clock288, iteration0/total1.
Native completion is6 snapshots/events2854 at45348ms; successful owned process
cleanup is45399ms.

Each of the three snapshots declares36 graphs: surface/road/engine/special/boost
for each of six vehicles, plus each vehicle's horn. All pointer roots have
independent original bytes in the336-byte
`control-vehicle-audio-and-horn-records` range. The profile additionally observes
an optional20-byte effect object through source+9a0 under the same pointer
guards. That makes180 guarded rows per snapshot, with this actual coverage:

| Actual guarded branch | Rows per snapshot |
| --- | ---: |
| Full12-byte wrapper | 13 |
| Full9a8-byte source | 13 |
| Full440h-byte waveform | 13 |
| Full88h-byte source vtable | 13 |
| Initial channel127, stop at index0 | 115 |
| Null effect pointer, stop at index2 | 13 |

The13 live channel graphs are all six road and six engine slots plus vehicle3's
surface slot. The other23 graphs are sentinel127; all five rows for each retain
that actual failed first guard. All13 live sources have a null observed effect
pointer. No effect-object pointee is granted, and this capture does not validate
a nonnull effect-object body or any null-source/null-waveform runtime branch.

Each snapshot performs1084 actual guard-read bytes and records48204 bytes in
full output blobs, including intentional repeated observations of shared
objects. Sparse memory admission yields36028 unique bytes for this graph plus
its336-byte independent root span. The actual pointees are13 unique wrappers,
13 unique sources, three shared waveforms, and one shared source vtable. Empty
rows grant no readable bytes at0 or127.

The current control pairer invokes the expected-descriptor validator at all
three boundaries using the real configuration globals and that breakpoint's
ranges. Retained tamper tests replace a live channel's257 threshold with the
otherwise structurally valid1, downgrade its positive row to unguarded metadata,
or change the configured threshold; each fails the configuration-bound check
at entry, after-AI and exit. Removing the independent root span fails the
other-byte dependency check. Altering original empty/nonempty blob lengths or
bytes fails the recorded native descriptor hashes.

This is positive original-process optional-graph input coverage. It is not a
complete source prefix or physics comparison. The retained report
`analysis/native-frame-control-prefix-v3-20261023/report.json` records a matching
after-AI checkpoint across4994515 bytes, followed by a later uncaptured byte at
`9c7edd`, with `sourceComplete:false`. The graph guard does not substitute a
zero/default value for that separate dependency. No original process was
launched by this regression/checkpoint; production guarded files remain frozen.

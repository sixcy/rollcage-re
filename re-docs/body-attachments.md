# Runtime body attachments

`src/body-attachments.mjs` reconstructs attachment processing **0x44f050** and point transform **0x432080**. It consumes an explicit queue of bodies, transforms up to five runtime model points, updates three handle-selected target tables, and conditionally refreshes type-2 spatial registration. Target meanings and runtime point/handle producers remain unresolved.

Evidence under `analysis/native-simulation/results`:

- `080-attachment-consumer2.json`: pseudocode, Evidence `ev_4e42c63b7864aca9528f67ebb42c5ed4fcfe7c54384ff71f2ed6adeee1ff1377`.
- `084-attachment-update-assembly.json`: complete processor, `ev_4502f565cb85fa0e089f28625c9dbeca4c74d6daec4887fb4b753378fa3580aa`.
- `085-attachment-transform.json` and `086-attachment-transform-assembly.json`: actual transform, assembly Evidence `ev_4f11390a164e680ba1a045c162466cf9d6cf45d3f937cf146a50973151aa1984`.

## API and runtime storage

Call `updateBodyAttachments(queue,{pointsFor,type1Records,type2Objects,type4Records,scratch,roundingMode,handlers})`:

| Input | Contract |
| --- | --- |
| `queue` | `{entries,count}` representing pointers at 0x902040 and unsigned count at 0x6e6ba0; entries retain unused slots. |
| Queued body | Existing signed Q16 `position`, nine signed Q12 `rotation` shorts, explicit `rotationPaddingD6`, and at least five unsigned `attachmentHandles` starting at native +0x16a. |
| `pointsFor(body)` | Explicit Buffer containing eight-byte runtime point records: signed x/y/z shorts and a fourth retained short. Read once per queued body; its Buffer remains live during the five-point pass. |
| `type1Records` | Raw table beginning at 0x90b688, eight-byte stride. |
| `type2Objects` | Indexed objects `{bytes:Buffer,...callerState}` corresponding to pointer table 0x80e660. Coordinates are signed shorts at +0x10/+0x12/+0x14. |
| `type4Records` | Raw table selected through 0x90b990 +0x10c, twelve-byte stride. |
| `scratch` | Retained Buffer covering 0x91cdb0 through 0x91d453, length **0x6a4 / 1,700 bytes**. Constants `ATTACHMENT_SCRATCH_BASE` and `ATTACHMENT_SCRATCH_LENGTH` are exported. |
| `roundingMode` | Explicit `nearest-even`, `toward-zero`, `down`, or `up` for native integer conversion. |

The model point pointer in the routine comes from the body model pointer at +0x10 plus a word read from its +0x4c. This does **not** establish an authored attachment array in raw installed model resources: inspected +0x4c values can point to the next model header. Until the runtime producer is recovered, `pointsFor` stays explicit and the validation points are synthetic. No asset reader is inferred here.

The field at body **+0x16a is the first handle**, followed by four more words. Earlier advancement code named that first word `attachmentCount`; it is not a recovered attachment count. Canonical advancement can use `attachmentHandles[0]` to decide whether to enqueue the body, while retaining the historical alias for compatibility. A first handle with nonzero low bits but zero high nibble can enqueue the body and then terminate this processor's point pass immediately.

## Processing and preserved state

For every queued body, the processor copies **20 bytes** at +0xc4 through +0xd7 into scratch 0x91d360. The first nine shorts form the matrix; the tenth short at +0xd6 is copied padding and must be explicit. It writes the nine matrix floats at 0x91cdc0 with sixteen-byte row stride, leaving each fourth float untouched. The body's arithmetic `position >>16` values are stored as dwords at 0x91d374 and exact floats at 0x91cdb0. This happens even when its first handle terminates the point pass. An initial queue count of zero leaves all scratch bytes untouched.

Each handle's high nibble is its type, and its low twelve bits are its target index. A zero high nibble terminates before copying or transforming that point. Other types, including unsupported ones, copy all eight point bytes to 0x91d3e4 and execute the transform. At most five points are processed.

The transform computes matrix/4096 times the three signed point shorts plus integer body translation. Native output stores occur in z/x/y order at 0x91d450/448/44c; full signed dwords remain in scratch. Target coordinates receive only their low shorts:

- **Type 1:** Write x/y/z into its eight-byte record and set the word at +6 to **1**.
- **Type 2:** Write x/y/z at target +0x10. If any coordinate's high byte changes, call `handlers.removeTarget(target)` and then `handlers.insertTarget(target,positionQ16)`. Both callbacks are required only when reached. Removal sees the newly written position. The insertion coordinates are reread from the same target record **after removal**, so removal mutations remain observable.
- **Type 4:** Write x/y/z into its twelve-byte record, preserving its six trailing bytes.
- **Other nonzero types:** Retain transformed scratch outputs without writing a target table.

Low-byte-only type-2 movement does not invoke either spatial callback. All table padding, unrelated target bytes and unused scratch bytes survive. Callbacks can mutate future handles, point storage, scratch values, target entries and queue state; subsequent reads use the live values. Queued bodies added during callbacks are processed if the live count reaches them. Shrinking the count affects the next outer iteration, while remaining handles of the current body still execute. The final count is cleared to zero and queued entries are retained.

The returned counters are reconstruction observations: `processedBodies`, `transformedPoints`, `type1Writes`, `type2Writes`, `type4Writes`, `spatialMoves`. `transformAttachmentPoint(scratch,roundingMode)` is also exported for the same retained transform state.

## Numeric scope and validation

The matrix floats are exact signed-short/Q12 dyadics, translations are exact signed-short integers, and input points are signed shorts. Products and sums in this domain fit exactly within binary64 precision before final integer rounding. The port and bounded x87 stack therefore preserve these exact values and the four declared rounding modes; this is not a general 80-bit x87 equivalence claim. The original runtime control word has not been observed.

```powershell
node tools/verify-body-attachments-instructions.mjs
node --test tests/body-attachments.test.mjs
```

The structured instruction checker executes the complete **229 instructions** of both routines across **4,000 fixtures**, **2,919,509 interpreted steps**, **8,767 queued bodies**, and **25,813 transformed points**. It compares complete body/model-point/target-table bytes and all **1,700 scratch bytes**, including stale gaps and copied padding. There are **5,057 type-1 writes**, **5,581 type-2 writes**, **5,096 type-4 writes**, and **5,048 spatial callback pairs**. State-mutating callback fixtures exercise **1,149 queue appends**, **213 queue shrinks**, **739 scratch mutations**, future-handle changes and coordinate rereads. Only the two spatial routines are mocked in this checker; all transform arithmetic executes its retained x87 instructions. Report: `analysis/body-attachments-instruction-check.json`.

Ten focused tests additionally cover empty queues, padding/tag copying, zero high-nibble termination, unsupported types, the five-point limit, half-coordinate rounding, target short truncation, spatial thresholds, queue growth/shrink and live scratch. The original executable has not been run. Actual runtime point/handle creation and target allocation remain separate reconstruction work.

## Raw connected default

`updateRawBodyAttachments({memory,roundingMode})` reads the live native queue, body/model pointers, model-relative point offset, handles and target tables directly from the same memory. It captures the matrix scale once, copies matrix/point DWORDs forward, preserves copied padding, resolves the type4 table at each reached handle and rereads the unsigned queue count after every body. Native spatial removal4748d0 and insertion474670 are actual defaults, including4286e0 bucket lookup/4746f0 fallback. No game callbacks remain in this raw processor. `runRaceUpdate` binds it at44f050.

`tools/verify-body-attachments-connected-instructions.mjs` compares the raw processor and spatial callees against536 unique retained instructions over1600 populated fixtures, with allfour explicit rounding modes. It compares body/model/target/linked-spatial/pointer storage and full1700-byte scratch; aliased targets exercise the live queue count. The report `analysis/body-attachments-connected-instruction-check.json` retains counts and Evidence IDs. Four additional tests cover empty scratch preservation, linked-list integrity after real target moves, live model offsets and queue-count aliases.

The supplied runtime queue/model/target/spatial tables are explicit synthetic inputs. This closes the consumer and reached spatial algorithms, without claiming authored point/handle discovery, native constructors, recovered x87 control-word initialization or a complete race tick.

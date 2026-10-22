# Raw camera pose, query and cached orientation helpers

`src/camera-pose-helpers.mjs` ports four actual Redux functions and binds their real existing game children. Public APIs:

- `queryCameraBodyPose(bodyAddress, poseAddress, runtime)` — 417d70.
- `publishCachedCameraMatrix(directionAddress, otherAddress, outputAddress, cameraIndex, runtime)` — 417e80.
- `buildCameraBodyPose(bodyAddress, outputPoseAddress, directionAddress, positiveOffset, runtime)` — 417b50.
- `reduceRawCameraDirection(vectorAddress, runtime)` — 417610.

Runtime memory is a coherent caller-owned Buffer. The first three helpers require actual native entry ESP as `runtime.scratchBase`. The query also uses the ordinary raw respawn views/grid/models/pointer mapping; it does not invent a map or pool constructor. All functions return actual EAX, including the direction reducer's nonzero `9 − CLZ(sum)` on the shift branch.

417d70 first copies 384 body bytes forward to 6f9a20, then copies 216 pose bytes forward to 6f9a54. Forward overlap is intentional. The position pointer remains EDX while REP advances ESI. It calls actual 47d040 with body 6f9a20, original pose pointer, no quaternion, rotation workspace 6f9a00, mode 2 and the private output at entry ESP−4. The raw query enters at ESP−32. Original source type 3 retains the actual larger clone-copy behavior; additional global bytes are caller-owned input. Geometry/model/physical rejection and accepted queries both execute their real game children.

417e80 invokes actual 4167f0 at entry ESP−16. Successful publication copies two independently snapshotted 16-byte blocks to camera record `91ff80 + index×184h + 120h`; failure restores the same 32 bytes to the output. Fourteen bytes beyond the nine signed shorts are preserved as actual padding. Overlap between output, directions and cache is retained. Cache initialization is the owning camera constructor's responsibility, not an implicit identity matrix.

417b50 retains the native five-argument stack layout: its public wrapper publishes consumed args 3/4/5 at ESP+12/+16/+20. It initializes a packed offset `[0, ±10, 20]`, preserving the uninitialized high halfword beside short 20. The three local direction DWORDs come from the signed body-matrix column, with the actual sign selection. It copies body matrix scratch, writes float32 matrix rows with their original gaps, and executes actual 4334b0 short multiplication. Its FILD temporary overwrites stack arg 5. It captures the transformed offset, loads the output pointer late, performs the 216-byte forward body-pose copy, loads direction late, adds the offset in Q16 and calls actual 4167f0 at final-frame−8. Tests include output overlapping body pose and global matrix scratch.

417610 is a raw-memory implementation rather than a snapshot wrapper around the existing pure reducer. It reads initial x/z/y before writing reduction globals 91d45c/91d460, then reloads vector lanes after those writes. Input can alias either global. The shift branch performs sequential live arithmetic shifts; the tiny-direction fallback retains its original Z subtraction by 20000h. Signed extrema and wrapped absolute sums are included.

Validation: `node tools/verify-camera-pose-helpers-instructions.mjs` and `node --test tests/camera-pose-helpers.test.mjs`. The final boundaries report compares 1,600 cases, 227 own / 3,038 reached instructions and 8,195,472 steps. It includes 400 actual 47d040 queries with 23 accepted, 800 actual 4167f0 calls, 400 4334b0 transforms, 240 matrix publications, 160 cache fallbacks and 735 alias cases. The checker compares every mapped byte at or above 10000h and EAX. Signed-short minimum/maximum matrix components are explicit fixtures. Five focused tests pass.

The preceding `camera-pose-helpers-connected-instruction-check.json` remains retained as narrower matrix evidence: 3,038 reached instructions and 8,195,349 steps. The initial `camera-pose-helpers-instruction-check.json` is narrower still and had only rejected query positions. Use `camera-pose-helpers-boundaries-instruction-check.json` for the final signed-boundary corpus. No game callback mocks are present; compiler cookies are the only admitted service, with none reached in this corpus. These are synthetic coherent producer inputs and interpreted native-instruction comparisons, not installed camera startup, original runtime capture or full parent camera-mode proof.

Evidence: retained 3521/3522, 3523/3524, 3527/3528 and 082 assembly. Target Redux 1.3.8.0 SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

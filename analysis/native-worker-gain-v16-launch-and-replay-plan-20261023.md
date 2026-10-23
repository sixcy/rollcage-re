# Worker gain V16: prepared, not launched

Config: `analysis/native-physics-local/startup-20261022/controlled-recovery-worker-gain-config-v16-20261023.json`

Output: `analysis/native-physics-local/startup-20261022/controlled-recovery-worker-gain-v16-20261023`

The output directory does not exist at preparation. The complete config
passed the direct typed C# `NativeDebugger.Validate` API. No game, native
fixture, PowerShell script file or security-setting change was run. The
frozen optional pair policy and helper are unchanged.

## Input audit

Both worker endpoints capture the exact `714b08` manager root, manager
d74h (including the actual +854 lock), manager table64h, worker80/TID,
source9a8/table88h, mixer object header12/capacity-bounded storage64KiB,
actual phase/clock/session roots and raw x86 CONTEXT716. Stack input is
`[entryESP-432, entryESP+12)`. Known literal DWORDs are `5dc774`, `5dcaac`,
`5dc5fc`, `5dca78`, `5dca70`, `5dcab8`, `5e8890`.

Entry is original `4b12d0`, normal exit `4b1990`; `4b1919` is reject-only.
The policy retains one actual owned worker call, source binding before
FSTP overwrites argument4, original caller/force contract, normal RET8,
worker PC53 context and the original90s/350/115/128MiB budgets.

No additional waveform/decoder/voice or mixer-object pointees are admitted.
Their source pointers are nullable. The existing guarded pointer transport
accepts global roots, not ESP/ESI roots; the strict pair policy also rejects
extra register pointees. A mixer pointer slot in observed capacity does not
prove a live count or allocation at that index. Adding those descriptors
would therefore require a distinct reviewed policy, not silent reuse of
the current mode. Entry/exit pointer fields are retained unchanged so their
actual branches remain visible.

## Exact launch command for the root operator

**Not executed during preparation.** Root announces and owns any run.
This uses the existing typed C# capture API directly. It changes no script
execution policy and does not execute a script file that the machine denied.
The JSON itself has already passed the strict JavaScript profile validator.

```powershell
$workerGainV16Launch = @'
$ErrorActionPreference='Stop'
Add-Type -Path 'tools/lib/native-physics-debugger.cs'
Add-Type -AssemblyName System.Web.Extensions
$workerGainV16Config='analysis/native-physics-local/startup-20261022/controlled-recovery-worker-gain-config-v16-20261023.json'
$workerGainV16Bytes=[IO.File]::ReadAllBytes($workerGainV16Config)
$workerGainV16Reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
$workerGainV16Options=$workerGainV16Reader.Deserialize([Text.Encoding]::UTF8.GetString($workerGainV16Bytes),[RollcageCapture.Options])
[RollcageCapture.NativeDebugger]::Validate($workerGainV16Options)
$workerGainV16Result=[RollcageCapture.NativeDebugger]::Run($workerGainV16Options,$workerGainV16Bytes,$true)
if($workerGainV16Result -ne 0){throw "Worker gain V16 capture failed with code $workerGainV16Result; preserve raw trace."}
'@
powershell.exe -NoProfile -Command $workerGainV16Launch *> 'analysis/native-physics-local/startup-20261022/controlled-recovery-worker-gain-console-v16-20261023.log'
```

After a terminal capture and owned cleanup, the strict observation checker
would be:

```text
node tools/check-native-worker-gain-pair-capture.mjs analysis/native-physics-local/startup-20261022/controlled-recovery-worker-gain-v16-20261023 analysis/physics-native-worker-gain-pair-v16-20261023.json
```

The checker is not run before original blobs exist. Open/absent/spatial,
wrong-thread/source/caller, raw-context and budget failures remain failures.

## Initial source read and replay sequence

1. Validate terminal capture status, original/context/blob hashes, genuine
   parent pairing, guards/activation, owned CREATE_THREAD identity, both
   endpoint ABI checks and preserved source/nonvolatile identities. Keep
   before and after rows temporally distinct.
2. Build strict sparse memory from the actual gain **entry** rows. Preserve
   the entry stack preimage, source, manager/vector/lock and worker numerical
   context. No normal-exit source fields, overwritten argument4 or volatile
   register outputs become initial inputs.
3. Call genuine `updateAudioSourceParameters` with entry manager ECX,
   original `[ESP+4]` source, `[ESP+8]` force, native ESP, uppercase incoming
   register map, actual module base and actual worker numerical mode.
4. The first expected unbound boundary is real `4a79f0` mixer lookup's
   `EnterCriticalSection` call at `4a79ff`. Missing actual worker Win32
   outcomes must fail explicitly. Do not reuse a main-thread factory lock
   trace, treat concurrent LockCount changes as API output, or substitute
   native mixer/game-child return values.
5. If authentic services later permit progress, execute the real mixer
   scan/getters and continue until the first actual missing mixer,
   waveform/decoder, voice, COM or CRT input. Request only the reached
   authentic boundary. Full gain/private ABI/interleaving flags remain false
   until genuine source execution and separate original-output comparison.

Capturing a complete endpoint pair supplies a previously missing call
boundary; it does not by itself close the worker algorithm, external
services, concurrent scheduling or audible rendering.

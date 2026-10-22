# Native capture input audit

**Pause keyboard/mouse activity only during announced native captures.** Hidden windows and the foreground-query adapter do not establish physical-input isolation. This read-only audit launched no game process and installed no input hooks.

The installed executable SHA-256 was rechecked: `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. Exact imports, mapped bytes, vtables and retained REA assembly are in [the audit report](../analysis/physics-input-audit-20261022/report.json). Reproduce it with `node tools/audit-native-input.mjs NEW_REPORT_DIRECTORY`; installed files remain read-only.

## Established input channels

| Channel | Evidence | Limit |
| --- | --- | --- |
| DirectInput keyboard/mouse | Imported `DirectInput8Create`, IAT `56e02c`; retained `518570` creates GUID_SysKeyboard/GUID_SysMouse devices, sets formats and acquires registered devices. Evidence `ev_9e1aa118a7a0e934be253c750335a3ed0841281c78f4432875cc45a4242ac957`. | Device setup is independent of visibility. |
| Polling | Retained `518890` visits registered devices and calls each poll virtual before connection/status handling. Evidence `ev_83ed7f2a394dacd5ef1424a768199ec5496c748a1d54b232c805d6cf6006a809`. Mapped keyboard/mouse vtables lead to `52eb00`/`52e8e0`; bytes contain GetDeviceState and retry-Acquire calls. | Neither HRESULTs nor successful background reads were captured. |
| Cooperative level | Mapped keyboard setter `52ec00` passes flags6; mouse setter `52eab0` tries5 for fullscreen and6 for windowed/fallback. These short routines were manually interpreted from exact PE bytes. | Both request **foreground** access; windowed uses `NONEXCLUSIVE|FOREGROUND`. This is manual decoding, not fresh Ghidra or runtime evidence. |
| Win32 state query | Imported `GetKeyState`, IAT `56e518`; one executable-section `FF15` byte candidate at `45b3d4`, preceded by `PUSH 14h` (Caps Lock). | Caller boundaries/consequences remain unconfirmed. |
| Keyboard messages | Retained `50d640` → `403570` forwards `WM_KEYDOWN` to `4416a0`; history patterns can change gravity/configuration/session flags. See [window messages](renderer-window-messages.md). | This path is separate from AI steering and is not filtered by the hidden policy. |
| Controllers | `518570` also enumerates attached game-controller devices and acquires enabled registered devices. | Their cooperative settings and menu/demo-abort effects remain unresolved. |

No direct main-EXE imports named `GetAsyncKeyState`, `GetKeyboardState`, `GetCursorPos`, `GetRawInputData` or `RegisterRawInputDevices` were found. This does not exclude dynamic calls or dependency input paths.

The game's substituted `GetForegroundWindow` result changes its scheduling observation; it does not establish DirectInput acquisition conditions. Keyboard/mouse reads may fail and native code may clear their state while another application has OS focus, but this audit did not observe that result. Microsoft documents these distinct [DirectInput cooperative levels](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee416848(v=vs.85)). Also, [GetKeyState](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getkeystate) follows a thread's consumed key messages; it must not be described as universal asynchronous global polling.

## AI driving versus outer input effects

The [guarded hidden idle capture](../analysis/physics-native-hidden-idle-20261022/report.json) established six mode8 participants and attract1. In retained/reconstructed `450e50`, mode8 uses `410220` autonomous dispatch and `431750` route control. `42a6e0` polls physical packets for modes9/10 and uses autonomous digital controls for mode8.

That distinguishes the steering/throttle producer. It does not prove that desktop activity cannot affect frontend idle timing, pause/demo-abort/menu behavior, key-history commands, renderer controls or controller callbacks surrounding an AI frame. A body-stage replay from captured inputs therefore does not establish input-isolated end-to-end trajectory equivalence. Host activity was not logged in earlier captures.

## Minimal isolation work if required

1. Observe each active device's type, exact format/cooperative flags, GetDeviceState/Acquire results and game-visible state around a bounded AI frame. Trace controllers and outer abort/menu consumers. Keep the validated hidden/windowed policies; do not acquire OS focus for this observation.
2. Make any neutral-input policy explicit and process-local. Preserve native creation/polling/calibration and HRESULTs; replace successful state outputs with verified neutral data before game consumption, and remove buffered events if GetDeviceData is reached. Controller neutrality depends on its format/calibration: all-zero axes/POV is not a justified default. Log all replacements.
3. Separately filter owned-process keyboard/mouse/raw-input/hotkey messages at their proven delivery boundary while preserving lifecycle, paint and timer messages. Give reached state-query consumers an explicit stable value if required. Do not block system-wide devices or alter other applications.
4. Validate synthetic device/message cases and bounded native comparisons, including acquisition failures, reconnects, previous-state transitions and buffered events, before permitting normal desktop input during clean captures.

No input-neutralization policy was implemented. Until one is validated, announce capture start/completion and ask for keyboard/mouse quiet only during those bounded intervals; ordinary source work and tests require no pause.

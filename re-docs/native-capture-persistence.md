# Original-process capture: persistence paths

Static audit target: Redux executable SHA-256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
No game process was launched during this audit. The normal PE import inventory,
path literals and byte-reference candidates are retained in
`analysis/native-capture-persistence-pe-20261022.json`. Fresh REA pseudocode and
selected decoded assembly are retained as requests/results `100..121` in
`analysis/physics-clock-elevated-20261022`.

## Personal folders and temporary files

The original image has exactly three absolute operand references to the normal
`SHGetFolderPathA` IAT slot `56e4f4`. The candidate byte scan is corroborated by
the recovered caller code:

| Caller / instruction | Folder request | Use |
| --- | --- | --- |
| `415060` / `41508d` | CSIDL 5, Documents | Creates `Rollcage Redux\Screen Shots`, searches for an unused `Shot %04d.jpg`, and invokes the screenshot writer. |
| `46ec40` / `46ed1b` | CSIDL 5, Documents | Reads `Rollcage Redux\Music Tracks\Music.m3u`; if absent, builds a playlist path from the current directory. Sends this path to the music player. |
| `489b80` / `489bd4` | CSIDL 5, Documents | Copies `Rollcage Diagnostics - Last.txt` to `Previous.txt` with replacement allowed, truncates Last, then appends diagnostics. This happens on the first log, including startup errors. |

Redirecting only `SHGetFolderPathA` is insufficient. Application callback
`4030c0`, installed at startup before file/audio initialization, also calls:

| Instructions | Imported API | Request / result consumer |
| --- | --- | --- |
| `40323b`, then `40324d` | `SHGetSpecialFolderLocation`, then `SHGetPathFromIDListA` | CSIDL 5, Documents; lazily cached base and `\Rollcage Redux` application folder. |
| `403399`, then `4033ab` | Same pair | CSIDL 26 (`0x1a`), Roaming AppData; appends `\Psygnosis\Rollcage\System` for the resource cache. |

Their IAT slots are `56e4fc` and `56e500`. Canonical recovered source is
`src/game-audio-file-paths.mjs`; retained `11662/11663` establish this callback,
its cache guards and allocation/retention behavior. These are genuine file
paths consumed by wide file APIs, including `CreateFileW`; ANSI-only file hooks
do not cover this path. A capture folder adapter must cover both shell methods
and preserve the matching PIDL-to-path result.

The image also imports and uses `GetTempPathA/W` and `GetTempFileNameA/W`.
Game-side ANSI candidates include `42b86f/42bc5d/486a4f/499210`; library wide
candidates include `4a8450/4c9c0d`. Give the child process workspace-owned TEMP
and TMP values, or adapt these APIs explicitly. Changing Documents does not
change the temporary directory.

## Registry persistence

The complete normal import list contains these mutation APIs:

| API / IAT | Direct call candidates | Established game use |
| --- | --- | --- |
| `RegCreateKeyExA` / `56e018` | `480224` | `4801d0` creates/opens HKCU `Software\Psygnosis\Rollcage\BootSys`, with requested access `0xf003f`. |
| `RegSetValueExA` / `56e004` | `4806a6`, `486970` | Generic binary value writer `480670`; configuration writer `4868d0` saves `DataPC` (`0x1854` bytes) and then a session value (`0xaa0` bytes). |
| `RegDeleteValueA` / `56e000` | `480715` | Value deletion wrapper `4806f0`, reached in the installation/restart branch. |
| `RegUnLoadKeyA` / `56e010` | `48028c` | `480250` targets HKCU `Software\Psygnosis\Rollcage`. |

The registry path exists independently of the copied executable or working
directory. Deny these actual mutators or redirect the registry namespace.
`RegCreateKeyExA` also acquires handles used for reading existing configuration:
denying it forces failure/default branches. Record that intervention in a
capture; do not describe such a session as using unchanged user configuration.
An optional narrower adapter can open an existing key with `KEY_READ`, preserve
real query results, and continue to deny mutations.

`RegOpenKeyExA` / `56e014` is called through `480160`; `RegQueryValueExA`
supplies the read wrappers. The installer key is
`Software\Psygnosis\Rollcage\Installer`, with value `Source`. Startup
`440690` consults it only if local `rollcage.img` is unavailable. The resulting
fallback builds an archive path ending in `Rollcage\IDXData\rollcage.img`.
This audited branch opens the archive as a resource; no write to the installer
path was established here.

## Working directory, module paths and child processes

The image has no normal `SetCurrentDirectoryA/W` import, but does use CRT
`_chdir` (`56e268`). `440690` first caches its initial directory via
`487370`/`_getcwd`, then normalizes the original literal `..\IDXData\` and
calls `_chdir`. Exit helper `486cc0` similarly switches to `..\Direct3D\`.
A copied executable alone does not preserve this layout: launch from the
copied `Direct3D` directory with the copied `IDXData` sibling populated. Keep
the initial and post-switch directories within the isolated installation copy.
Local archives also avoid the installer-registry fallback.

`GetModuleFileNameA` / `56e0f0` has one direct candidate, `48716b` in termination
routine `487090`. It supplies a restart executable path after configuration
save, then invokes `486d60`. The wide variant is also imported and has a library
candidate at `4b0c7e`; this audit does not classify every third-party/library
consumer. Neither occurrence establishes an additional original-installation
file write by itself.

Three game-side `CreateProcessA` calls require separate treatment:

- `46ecd8`: starts `..\Direct3D\Rollcage Player.exe` for music. The process
  then opens `\\.\mailslot\Rollcage Player` and sends its playlist and
  playback commands. A previously running player can also receive these
  commands if opening the mailslot succeeds.
- `486e63`: `486d60` starts an executable with `/FRONTEND` and a retained
  working-directory path, allowing termination/restart chaining.
- `486fea`: `486e90` starts the registry-selected installation program after
  optional settings deletion/unload and a confirmation dialogue.

An uninstrumented child does not inherit the debugger's in-process shell-folder
or registry adapters. Deny these child launches for physics captures, or apply
the same isolation before any child runs. Also prevent music IPC with an
already running original player; denying child creation alone does not stop
the subsequent mailslot open/write. Record this as an audio/lifecycle service
intervention, with API arguments and result. The normal import inventory also
contains `CreateProcessW`, used by library code at candidate `4b0e1c`; classify
or deny it if reached.

`4797a0` root-name discovery probes `ROOTNAME.TXT`, `\ROOTNAME.TXT`, then
`C:\ROOTNAME.TXT`. The recovered open uses `GENERIC_READ` and `OPEN_EXISTING`;
these are read paths, not an observed additional persistence mechanism.

## Capture boundary

For the actual audited persistence paths, an isolated full installation copy,
workspace Documents and Roaming AppData results, workspace TEMP/TMP, registry
write protection, and suppressed/uninstrumented-child/ music-IPC handling cover
the concrete escape routes identified above. Install these adapters before the
first application instruction capable of diagnostics, path-cache construction
or registry access. Retain every intervention and preserve original bytes
separately.

This is a static audit of the selected executable and recovered callers, not
OS-enforced filesystem containment. Normal import coverage does not establish
all delayed/dynamic imports or loaded-DLL behavior. File-open modes, final paths
and reached adapters still need runtime capture evidence; unexpected paths or
API variants must remain explicit findings. No original-process persistence
isolation or physics equivalence is claimed by these notes.

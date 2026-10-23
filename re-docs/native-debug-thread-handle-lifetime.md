# Debugger-owned thread handle lifetime

The broad regression log
`analysis/physics-fidelity-broad-regression-20261023-v1.txt` retains one supported
two-thread activation-fixture failure among2340 tests: `suspend-peer-thread`
failed for owned TID6160 while a zero-time wait returned258 (not signaled).
That result was correctly rejected as unproved termination. The fixture's
temporary trace was removed by its cleanup, so the original Win32 failure code
and exit status were unavailable. Nine bounded narrow reruns passed before the
ownership correction; those passes do not identify the exact original cause.

Source review found a separate concrete lifetime defect. The helper manually
closed a CREATE_THREAD debug-event handle while processing EXIT_THREAD, before
calling ContinueDebugEvent; it also closed the borrowed CREATE_PROCESS process
handle at creation. Microsoft's
[ContinueDebugEvent contract](https://learn.microsoft.com/windows/win32/api/debugapi/nf-debugapi-continuedebugevent)
assigns closing the event thread handle to exit-event continuation, and closing
event process/thread handles to process-exit continuation. Manually closing
those handles beforehand can make a later system close act on a reused handle
value. This defect is corrected without inferring that it caused the retained
failure.

The debugger now duplicates each actual CREATE_PROCESS/CREATE_THREAD event's
thread handle with `DUPLICATE_SAME_ACCESS`, without inheritance. Its tracked
dictionary contains these distinct owned copies. The system retains ownership
of the original event handles; the debugger closes only its own tracking copy
after an actual thread-exit event, or at final cleanup. PROCESS_INFORMATION
handles remain separately owned unless they alias an actual system-owned event
handle, in which case the helper avoids closing the borrowed alias. Image-file
debug handles retain their documented separate manual-close behavior.

Actual copy/close records include PID/TID and distinct source/tracking handle
values. The correction preserves original observation/action/hit/snapshot
counters, breakpoint deferral/replay and suspend-count bookkeeping. It adds no
retry, sleep, thread-state guess, foreign-thread lookup or access escalation.
An unsignaled live access denial remains fatal. Exit code259 alone still proves
nothing; only an actual signaled zero-time thread-object wait admits a failed
suspend/resume as termination. Fatal diagnostics now include the original Win32
error and observed exit status. Future failures of the supported two-thread
fixture preserve lifecycle records in a new exclusive JSON report before its
temporary directory is removed.

The owned native host-thread regression proves that a same-access tracking copy
remains usable after its fixture-owned original source handle closes; an actual
native ExitThread returns259 and signals that copied handle. A restricted copy
retains access denial and cannot acquire suspend rights. Existing tests verify
invalid-handle rejection, live259 rejection and restoration of exactly the
adapter's own suspend increments. The supported two-thread activation fixture
also checks distinct tracking copies for actual creation events and matching
owned-copy closes for actual exit events, while retaining all preactivation,
main-thread-only observation and original-instruction count assertions.

Validation uses `tests/native-observation-activation.test.mjs` and
`tests/native-thread-lifecycle.test.mjs`. The separately Defender-rejected
`native-deferred-breakpoint` fixture was not rerun, rebuilt or changed; no
security setting or original-game capture was involved. The earlier broad
failure remains retained evidence, not rewritten as a passing observation.

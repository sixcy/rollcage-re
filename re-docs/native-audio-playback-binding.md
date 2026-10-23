# Playback request and debugger address bindings

The recovery-sound playback dependency now uses explicit actual image addresses
for its known literal arguments, vtable stores, SEH handlers and native CALL
return words. The changed ports are `audio-sample-playback-requests.mjs`,
`game-string-buffer.mjs`, `application-debugger-records.mjs` and only the debugger
prefix of `application-bootstrap.mjs`. Application and viewport functions after
402a20h are outside this change. Default preferred-base execution remains
400000h; runtime image addresses use `nativeCodeAddress`.

Heap pointers, COM pointers, counters, flags and imported function pointer values
are never relocated by numeric range. Reads and writes to known global storage
use declared preferred-address aliases. Arguments to external services and
stored native image pointers use actual module addresses. The debugger's
16-byte constant copy and two separate 16-byte clears now use explicit bounded
spans, preserving strict sparse captured memory without an implicit backing
buffer.

## Constructed instruction comparison

`tests/audio-playback-debugger-aslr.test.mjs` runs the retained game chain
4ad9e0h → 4a2b40h → 405310h/405860h → 4a2290h/4a0e90h →
4a1840h/4a23a0h/4a2670h → 40ebc0h at image base 6e0000h. The shared
`tools/lib/relocated-audio-fixtures.mjs` verifies the installed executable's
SHA256, maps its PE sections and applies its actual HIGHLOW relocations.
Retained direct relative targets move with their instruction origins; reached
instructions with unresolved relocations are rejected. This helper was
extracted from the preceding factory/path ASLR test without changing the
factory/path source ports.

The source executes against sparse declared globals, heap and private-stack
spans. The comparison checks every declared span, including 24KiB of private
stack, ordered CRT/Win32 arguments, service entry ESP and actual return words.
It checks the reference's preserved registers and restored abstract TLS head.
Cases include warm/cold category registration, the actual cold debugger
constructor, record-vector growth and deletion, string allocation and deletion,
a manager root replaced during an external call, and a null voice which reaches
no external services. The original source manager remains captured across that
replacement, as the retained instructions require.

External CRT allocation, formatting, copying and deletion are explicit fixture
interfaces. Win32 critical-section outcomes use declared marker bytes in the
first 24 bytes; these are constructed service outcomes, not observed Windows
lock bytes. The game instructions own the following depth/owner fields.
Game children run their retained algorithms; final source output is never used
as an interpreter seed or a child-call answer. The pending-source vector has
spare capacity in this fixture; its growth branch is not covered under ASLR.

Validation on 2026-10-23:

- Three new relocated playback/debugger tests pass.
- Preferred-base playback comparison: 1,200 fixtures match, with 960 queued
  requests and actual string/debugger/queue descendants. Retained report:
  `analysis/audio-playback-debugger-default-20261023.json`.
- Preferred-base string comparison: 1,200 fixtures match, including 756
  allocations, 108 service-time mutations and 193 self assignments. Report:
  `analysis/game-string-buffer-aslr-default-20261023.json`.
- Debugger wrapper/singleton/constructor comparison: 2,400 fixtures match,
  including 833 constructors. Report:
  `analysis/application-debugger-aslr-default-20261023.json`.
- Category/record comparison: 2,400 fixtures match, including actual aliased
  append, allocation/copy/delete and constructor descendants. Report:
  `analysis/audio-debugger-records-aslr-default-20261023.json`.

These are constructed instruction comparisons, not original-process replay.

## Original-process obligations still open

The native formatter's surviving volatile ECX is still an explicit gap. The
current source formatter uses the existing nonclobbering CRT fixture convention;
the native caller immediately saves that ECX on entry to 4a2290h. Arbitrary CRT
register clobbers are not supplied or inferred. A full original-process private
stack comparison requires the genuine surviving register value or a complete
evidence-backed CRT register model.

The formatted recovery string can exceed its 15-byte inline capacity. Its
operator-new CALL at 4058e1h and return at 4058e7h require the actual allocation
result and allocation preimage. Capturing the wrapper's 12-byte allocation and
source's 9a8h-byte allocation does not establish this separate allocation.
The new tests supply an explicit constructed CRT allocation interface only.

Binding the captured critical-section/COM outcomes, the complete factory/file/decoder
descendants and genuine concurrent producers into a complete original-process/source
recovery-parent comparison remains required. The earlier native v7 attempt was duration-bound without a complete
parent pair; these offline checks do not turn that attempt into positive parent
evidence. Pending-source-vector growth in `game-image-storage.mjs` and aliased
substring descendants in `game-audio-strings.mjs` retain separate ASLR binding
obligations. Neither is replaced by a cached answer here.

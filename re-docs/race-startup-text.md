# Startup text queues (477000 / 48b7d0)

`src/race-startup-text.mjs` recovers the whole 477000 startup text stage and its 48b7d0 enqueue child. Their only game child is actual 40ab70 viewport lookup, imported from weather-viewport; its application bootstrap, strings and map operations remain actual. Font glyphs and localized strings are live native inputs produced by existing HUD font/localization modules.

## APIs and storage

- `initializeNetworkStartupText(mode,runtime)`: 477000, mode in native ECX.
- `enqueueRaceText(message,state,x,y,flags,timer,queue,runtime)`: 48b7d0, ECX message/EDX state and five stack arguments; returns native slot index or −1.
- `runtime={memory,scratchBase,entryRegisters?,handlers?,services?}`; scratchBase is native entry ESP. Optional incoming saved registers publish original stack producers. Viewport handlers use the existing CRT allocation/free/dynamicCast contract. Optional libraryCall handles actual memset, with an exact memory fallback. securityCookie is optional, with an actual value check as fallback.

Ordinary queue 82dfa4 has 28 records of 80 bytes; queue 1 at 9028e4 has eight. Active is byte +8, text starts +16, state +0, xy low words +4/+6, count +8, style +9, width +10, timer +12, scale +14. Queue 1 also writes 902b68[index] and increments 902b64. These remain shared memory, including message/destination overlap.

Mode 1 captures the session, writes participant bytes to 8 while rereading count byte +54d, and sets countdown +58e=1800. It copies message index 39 through its inline queue path and places it at viewport center plus scale*60/256 in Y. A full queue still retains participant/countdown writes. Other modes set countdown 99 and enqueue indices 41/42 at scale*60/256 and scale*82/256; scale reloads between calls.

The copy loop executes at least once, even for an empty source, stops by looking at the next byte and limits to 64 copied bytes. It adds no terminator. Width uses font charmap +101c, unsigned glyph widths, signed slot scale, wrapping 32-bit multiplies and arithmetic shifts. Unsupported glyph 255 adds no width. The inline 477000 space branch uses a captured scale refreshed after nonspace characters; 48b7d0 reads live scale. Overlap also sees the scale write before the first source read.

Flags preserve native order: 200h scale override, 100h timer, 4 center (queue 0 uses real viewport; others use logical-halved 9020ac/b0), 40h center X/full-height Y, 8 viewport-based X then 2 half-width or 10h full-width alignment. Style retains only the low byte. Flags/arguments reload from stack after child calls where native does so.

## Native proof

Evidence: 9015/9016 (477000), 12051/12052 (48b7d0), existing 40ab70 application/map evidence. Target SHA256 c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5.

`node tools/verify-race-startup-text-instructions.mjs` passes 1,800 synthetic fixtures, 360 startup parents, 1,800 enqueues, 2,808 actual viewport queries, 4,968 native cookie checks, 793 reached instructions and 2,196,228 interpreted steps. It compares all mapped bytes ≥10000h, complete 260-byte parent viewport-name buffers, cookies and enqueue return values. Cases cover both queues, full pools, modes, alignment combinations, negative/overflow scales/dimensions, unsupported glyphs, empty/long text and source/destination overlap. Synthetic glyph/session/viewport input is declared.

`node tools/verify-race-startup-text-connected-instructions.mjs` passes a persistent installed-data chain: actual 48b750→439150→44fbc0 using installed FONT_BMP resource 9 and real bitmap/image algorithms, actual 439090→401160→GT20 loading/preprocessing installed resource 8, actual 479420 English/French message production, then actual 477000 mode 1 and mode 0→48b7d0 placement. Seven additional operations execute 117,321,687 steps/1,275 reached instructions, 86 actual 439780 lookups and 12 viewport queries; font/bootstrap contributes 19,150,800 steps/eight operations. Every operation compares all mapped memory. Existing font checks compare allocation/free order, image workers and complete uploaded levels; the new check also compares raw file requests. Its optional afterFixture hook leaves default font checks unchanged.

Installed resource 8 decoded SHA256 2c121109cc7e5a8f63f0012ffa87c34dd0751478874bac3b26380cea9a9bf604 (95,426 bytes). FONT_BMP decoded SHA256 e5d0bea767bc757f61a979dec53f2471966323f0c141efc61bf68b84516d465b (384,972 bytes, 5200×74). Installed files remain read-only.

`node --test tests/race-startup-text.test.mjs` passes five focused tests, including a smaller native graph comparison. Reports: analysis/race-startup-text-instruction-check.json and analysis/race-startup-text-connected-instruction-check.json.

## Limits

These checks interpret retained instructions, without running the original process. The installed font chain uses existing explicit renderer virtual 78/88 adapters and deterministic serialized library services; it proves game-side glyph/bitmap/texture algorithms and queue consumers, not renderer backend closure or concurrent execution. CRT allocation, file I/O, RTTI and compiler guards are services. The connected fixture explicitly supplies viewport application/map and session state. Its installed font cache producer remains declared in the HUD proof. Full UI scheduling and queue draw/expiry consumers are separate scopes.

Parent scratch fields, argument slots and CALL return producers used here are written at their actual points. Imported viewport/string implementations do not publish every private saved-register/CRT-internal frame byte; arbitrary pointers into those private frames are outside the proof domain. No end-of-call synchronization or copied font/body state is used.

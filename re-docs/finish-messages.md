# Finish messages, localization lookup and notification routing

`src/finish-messages.mjs` reconstructs4579e0 racer-name selection,472700 phrase expansion,4a0620 notification history/packet creation and the complete439850→439780→439610→439580 localization lookup chain. `src/notification-transport.mjs` reconstructs4a0420's participant/mode dispatch and packet-header decisions. The broader network protocol and processed-text producer remain separate inputs; these limits apply to every integration claim below.

## Retained evidence and original data

| Procedure | Assembly reply under `analysis/native-simulation/results/` | Evidence |
| --- | --- | --- |
|4579e0|`166-racer-name-assembly.json`|`ev_aaab3de1dbcfb26ea351f49bd557da6629b22544d04019861adfc25ffe5f08b9`|
|472700|`168-finish-phrase-assembly.json`|`ev_9e3062ecfdaa260174ad8614453c4ea2bbde0ff694d80f34d791b653f33b0977`|
|4a0620|`170-notification-queue-assembly.json`|`ev_43764f7f023c079c0e8cccb102d111c4ba0d8ed944a59d6c75c3190ffec2d516`|
|439850|`172-localization-lookup-assembly.json`|`ev_33919d2258885780091666486150d041db0c14f9c812e740985dd9b68eb13239`|
|4a0420|`174-notification-send-assembly.json`|`ev_37d6815f5472b8662e134b509efdbf56e5567922f4c6040cf9d4fc3a5dc718ee`|
|439780|`183-localization-block-assembly.json`|`ev_22bb645d36515977ce2ef6fb9c78fc9ec76c07a5a3349d1d87b5e991e767c3ba`|
|439610|`188-localization-key-assembly.json`|`ev_d25ae277dc2b1eaac0acbbcc65be0082035cd1500793c307296bc24d0e36a597`|
|439580|`191-localization-search-assembly.json`|`ev_a626cb5448b3425c339f25452ac330eedfb83c11377f4e9e8adf9f964b04b0e8`|

Corresponding pseudocode165/167/169/171/173/182/187/190 remains retained. `src/finish-message-constants.json` preserves the original80-byte driver-key block5d2560,80-byte language/diagnostic block5d0698 and20-byte language switch43976c. `tools/recover-finish-message-data.mjs` checked all180 bytes against REA184/192/193 and the installed executable SHA256, recording addresses and file offsets. Source algorithms read caller-mapped constant bytes at those addresses.

The same tool retained original decoded archive resource8 as `analysis/finish-message-resource8-original.bin`:95,426 bytes, SHA256 `2c121109cc7e5a8f63f0012ffa87c34dd0751478874bac3b26380cea9a9bf604`. Its entry metadata is preserved alongside it. The tool refuses to overwrite these outputs.

`tools/index-finish-message-source-rows.mjs` builds a byte-preserving **research index** in `analysis/finish-message-source-rows.json`, retaining source offsets and hex for295 rows across five languages:105 driver names/countries/colors and190 network-message rows. Each language has seven entries per driver family and38 network rows. The first eight network rows use ordinary printf strings; the next30 contain1/2 message markers. English rows8/9 supply the finish phrases used by449760's random choice0/1. Mapping rows8..37 into runtime slots at settings+104e is a declared fixture input until its native producer is reconstructed.

The raw resource uses literal`~~` row delimiters. The runtime lookup consumes preprocessed NUL/optional-tilde delimiters, byte1 markers and bracket structure. This work preserves both representations and keeps the producer between them explicitly open. The research index is not presented as that producer.

## Recovered text behavior

`generateRacerName(destination,driver,{memory,scratchBase,handlers})` first clears output. Unsigned driver IDs above6 return immediately. Settings pointer5ecefc byte+05 chooses the original`PC_MENU_DRIVER_NAMES`, `PC_MENU_DRIVER_COUNTRIES` or `PC_MENU_DRIVER_COLORS` key. The selected driver's row is looked up with capacity512, then copied to the caller's destination. The default path uses all recovered lookup functions; `handlers.call439850` can explicitly override that boundary.

`findLocalizationBlock(key,{memory})` captures processed-data pointer6e65f4, appends the original`)` suffix to the key and searches with439580's byte algorithm. Offset0 represents both a match at the first byte and failure;439610 treats it as failure. Searches try every candidate offset below6e65e4, and may compare a pattern into readable tail bytes beyond that logical size. Language word6e65f0 chooses English/French/German/Italian/Spanish/Japanese, with other values using English. It scans onward for the language marker and a following`[`, then skips control bytes<=31 and returns the first printable byte. Missing/invalid native-readable pointer domains are outside valid fixtures.

`readLocalizationBlock(destination,key,{memory,handlers})` decodes that selected block. Byte1 is skipped. NUL advances past an optional`~`; trailing whitespace before`]` terminates the block without adding a row separator. Other NUL transitions append CR. Output is limited to2047 bytes plus NUL, while the returned count includes excess decoded bytes. A tab reaches named diagnostic handler`call401300` before processing continues with live memory. A missing block returns-1. The optional`call439610` override moves key selection outside the default reference path.

`lookupLocalizedRow(destination,capacity,key,row,{memory,scratchBase,handlers})` extracts one CR-separated row. Capacity-1 is unlimited. Nonpositive other capacities disable destination writes; a null destination likewise disables output. Positive destinations are initially cleared. Truncation retains at most capacity-1 bytes, and the return is the **full** selected length. Out-of-range rows return-1. `call439780` can override block decoding explicitly.

`formatFinishPhrase(phrase,name,firstName,destination,{memory,scratchBase,handlers})` reads a C string from settings+104e+phrase*64. It converts a unique`1` marker to the first name argument, and a unique`2` to the second. Marker order determines printf argument order. A duplicate of either marker aborts, preserving the destination. It then calls the supplied CRT`sprintf` interface and truncates the rendered result at127 bytes before a forward C-string copy. This reference retains byte semantics; no Unicode conversion is implicit.

The required `handlers.sprintf({memory,destination,format,args})` represents the C runtime, including any format-string behavior present in supplied configuration. The validation adapter admits the actual `%s`/`%%` patterns exercised by the fixtures. It does not claim a full standalone printf implementation. The caller provides scratch storage distinct from live input:0x1400 bytes for generated names/default nested lookup,0x1000 for row lookup, and0x214 for phrase expansion in the valid native-readable domain.

## History and transport

`enqueueFinishNotification(message,{memory,scratchBase,handlers})` truncates the supplied message in place to64 bytes even when networking is disabled. Network flag6eafe0 bit0 enables a four-slot,65-byte-per-slot history at6eaedc. Existing strings shift backward through three forward C-string copies. The new message becomes slot0; bytes after each NUL remain stale.

An ae-tagged packet is constructed before the history shifts. Its text begins at byte8, and header bytes1..7 remain stale until a later protocol helper fills them. If network flag bit2 is set, it calls `handlers.call4a0420({memory,ecx:2,edx:packet,args:[liveTextLength+9,0]})`. The text length is read again after history mutation, preserving native aliases. The function returns1 regardless of the lower send result. No message expiration or rendering occurs in this routine.

`sendNotificationPacket(mode,packet,length,flags,{memory,scratchBase,handlers})` owns4a0420's parent behavior:

- It validates local participant6e9f70, treating-1 as0, and checks the active field in the six participant records.
- Mode2 with flags&3 iterates active recipients and stops at the first lower send returning0. Other mode2 messages require length>=8 and a live interface, probe471820, optionally call4a01d0, writeffff at header+02, increment the byte sequence at6e65db and obtain header+04 through4a0180.
- The probe's **returned ECX/EDX** matter. Its CL controls the optional flush and one send flag, until a flush restores the original flags/length. The source requires explicit returned registers rather than substituting the incoming flags.
- Address data comes from6e9f74/78 plusffff. The vtable pointer is captured before the address constructor; the receiver pointer is loaded again afterward. A callback can therefore relink the interface while the original vtable still supplies the function.
- Mode1 preserves host/client flag gates, selected-peer capture,46ffd0 status handling and global6e1e78 writes. Other modes return0 after participant validation.

Lower game protocol helpers remain named callbacks: `call471820`, `call4a01d0`, `call4a0180`, `call4a0210`, `call46ffd0`. These receive `{memory,ecx,edx,args}`. Numeric-return helpers require explicit EAX; successful471820 additionally supplies `{eax,ecx,edx}`. They are separate unreconstructed algorithms, not silent success mocks in production.

The platform boundary comprises `constructAddress49ea00({memory,ecx,args:[valuesPointer]})` and `sendInterface({memory,ecx,functionAddress,args,address,addressFlags})`. `args` contains packet,length,inverted original bit5,inverted live routing bit3,0; `address` points to the40-byte address value and `addressFlags` is[1,0]. Constructor and send return contracts are exercised by explicit adapters in the oracle. No actual network connection or original-process execution was requested or performed.

## Validation

`node tools/verify-finish-messages-instructions.mjs` checks471 retained instructions on3200 fixtures with declared deeper-call boundaries;1,046,693 steps matched. It checks buffer contents, input truncation, history slots, packet gaps, callback arguments, return values and cookies.

`node tools/verify-finish-messages-instructions.mjs --localization` runs the actual complete lookup chain:661 retained instructions,3200 fixtures,14,363,531 steps,6272 cookie checks and256 packet-send boundaries, all matched. Synthetic inputs cover language selection, name families, marker order/duplicates, literal percent, long/empty output, row capacity and processed delimiters.

`node tools/verify-finish-messages-instructions.mjs --source-rows` uses all295 preserved resource8 rows and all150 language/phrase combinations in3200 retained-instruction fixtures:8,883,621 steps matched. Fixtures explicitly construct processed rows and settings slots; this does not validate the still-unported producer. One French source phrase has64 bytes and is retained across the next readable slot byte in that fixture, rather than inventing the producer's truncation rule.

`node tools/verify-notification-transport-instructions.mjs` checks the complete157-instruction4a0420 parent on3000 fixtures:87,499 steps,86 probes,583 recipient sends and75 interface sends, all matched. Named lower protocol helpers and platform calls are state-mutating boundary adapters. Packet/header/global bytes, routing decisions, argument order, address values and cached/live interface behavior are compared.

`node --test tests/finish-messages.test.mjs tests/notification-transport.test.mjs` passes12 focused tests. Reports are retained under `analysis/finish-messages-*-instruction-check.json` and `analysis/notification-transport-instruction-check.json`.

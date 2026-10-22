# Wormhole reconstruction: current bounded packages

Target: Redux1.3.8.0, SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. Evidence is retained Ghidra assembly/bytes in native-simulation3100–3199 and3400 onward. This is interpreted native-instruction comparison, not original-process runtime evidence.

`src/wormhole-visuals.mjs` ports407190 color scaling,46b070 orientation,49cc60/49cde0 ring placement,49cf60/49cfd0 spark generation/update,49d310 mesh geometry,4901d0 render allocation,49d180 material initialization,49bf10 pool construction,49c190 activation,49c930 update and49c790 removal. Color scaling carries high product bits between AL replacements; independent channel multiplication is incorrect. Mesh phase341 is signed and reads the live256-byte prefix before5ed030. Source initializers map original table bytes without resetting runtime cursors or that mutable prefix. The actual5+10+32 pool and arena/spatial links remain caller-owned storage.

`src/wormhole-targeting.mjs` ports49af70 emergence,49b220 chase,49b3f0 capture,49aaa0 progression target selection,49bdf0 target prediction,49beb0 lane clamp,49bd50 captured basis and41c9c0/41ca60 vector/root arithmetic. Defaults use actual sound, direction blending and fixed arithmetic. The no-forward-target sentinel is1; expiry goes to state4. Capture reaches state80 after60ticks. Native source ownership of positions, progression/session records and physical velocity remains explicit input, not an invented simulation constructor.

`src/wormhole-construction.mjs` ports49a6f0 actual2a80-byte body allocation/configuration/registration and47 visual records, and49a820 local/received96-byte activation. Actual raw-body dynamics, spatial registration, inclusive shape allocation, light queue and sound defaults are bound. Only384 bytes are filledFF. Native slot channel initially255 differs from the later127 stopped sentinel. The received packet's57h tag must be7. Diagnostics and outgoing packet producers now use actual game adapters from the companion modules.

The light payload is three DWORDs but49a820 initializes only the first. For connected49a6f0→49a820 calls, the other two words are produced by the final4901d0→474670 call: allocator entryESP-40 is saved EDI (advanced arena offset), entryESP-44 is the outside-output pointer argument (entryESP-28). Source publishes those exact values and supplies the true49bf10 child entry. The connected checker preserves the private stack between constructor, activation and busy rejection; no native stack is imported into JavaScript. Other upstream caller histories still own their actual stale stack values.

Validation reports (counts are nested and must not be added as unique coverage):

| Report | Compared cases | Native work |
|---|---:|---:|
| wormhole-visuals-instruction-check.json |2400 leaf cases,160 aliases,4rounding modes |641 own/1045 reached,3,302,142steps |
| wormhole-effect-lifecycle-instruction-check.json |96 pool→activation→64frames→cleanup scenarios,6432 calls |1213 own/1880 reached,117,223,689steps |
| wormhole-targeting-instruction-check.json |3500 mixed cases |591 own/916 reached,741,299steps |
| wormhole-construction-connected-instruction-check.json |240 constructor→activation→busy scenarios,720 calls |229 own/3358 reached,8,599,136steps |

Every checker compares all mapped data at/above10000h after each stage. Scratch below10000h is private ABI memory but any words later copied into mapped state must have their actual producers. The earlier `wormhole-construction-instruction-check.json` preserves the narrower fresh-stack leaf proof; use the connected report for the stronger current claim.

The complete local state and failed-peer extension are now implemented; see [wormhole-state-current.md](wormhole-state-current.md) for the current APIs, connected validation and explicit remaining network domains. Root owns outer race-update integration.

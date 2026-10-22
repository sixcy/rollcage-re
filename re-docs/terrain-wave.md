# Terrain-wave weapon

`src/terrain-wave.mjs` reconstructs activation `446d90`, ordinary update `447050`, row-cache toggle `447740`, palette remapping `447850`, adjacent-sector lookup `447920`, and progress-dependent contact-score feedback `41f670`. The shared-memory entry points are `activateTerrainWave(record,localMode,unused,packet,transportContext,runtime)` and `updateTerrainWave(runtime)`; runtime supplies native entry `scratchBase`. Local activation defaults to the actual shared `4710f0` packet producer.

Activation clears the2,048-byte palette-index map and captures the body's live track-progress pointer. Its receive path consumes the packet's direction DWORD; its local path derives direction from the nearby authored vertices, body orientation and held reverse bit. Native contact-score feedback selects the opposite driver mode in the wrapped301..2499 progress interval and neighboring sector IDs.

The update grows the wave, holds it, releases the weapon slot, retracts it and clears its final state. It builds alternating raw row streams, compares full DWORD row identities, toggles added/removed rows, merges adjacent dirty ranges and appends the native64-entry dirty queue with consecutive-duplicate suppression. Row records retain their signed sector byte and WORD row index. No inferred row-array cap is introduced.

Palette remapping allocates descending reserved color slots, saturates the original byte channels and preserves the vertex's low six flag bits. Toggling an existing cached row restores its saved WORD colors and swap-removes its88-byte cache entry. Adjacent-sector matching compares both consecutive XYZ vertices within100 units. The update also maintains the two shared endpoint markers and emits actual `436630` particles from the first active row; its moving endpoints use the last active row.

Validation:

- `node tools/verify-terrain-wave-instructions.mjs`:2,400 mixed entry fixtures plus24 full240-tick activation-to-expiry sequences;8,184 calls,1,544 reached instructions,7,507,356 steps. Actual calls include2,010 row toggles,16,250 palette updates,5,027 neighbor searches,386 score additions,125 score subtractions and5,911 particles. All mapped bytes at/above `10000h` compare after each call. The only supplied service is compiler-cookie checking; sound storage is explicitly empty and local packet calls exercise the disabled-network guard.
- `node tools/verify-terrain-wave-rows-instructions.mjs`:3,000 mixed row/palette/neighbor fixtures,4,000 calls,369 reached instructions,1,782,581 steps. Widths0..63, add/restore, repeated palette IDs, exhausted reservation and100/101 geometric cutoffs are included.
- `node tools/verify-weapon-network-connected-instructions.mjs`:600 successful nonhost launch/award sends,1,174 reached instructions,568,879 steps. Actual launch→router→peer/pending/accounting/clock paths compare all mapped bytes and ordered virtual-network/performance requests. These are explicit imported services, not game callback replacements.
- Eight focused tests pass with `node --test tests/terrain-wave.test.mjs`.

Reports use the corresponding filenames under `analysis/`. Terrain/palette/session/spatial/particle storage and received packets are synthetic inputs, not observed original-process state. No installed data was changed and no original process or real network was executed. Host receiver, disconnected-peer retirement and blocking protocol branches remain separate network scopes. Complete world loading and the palette-map allocation producer are not established by these tick comparisons; the larger `48d7c0` coordinator/projectile graph remains unfinished.

Retained assembly is for Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`:

- 3205 (`447050`), `ev_85da114100d7fa94b116cd66b8e47bf11bb379257a5869cc6d6e3449d0956717`.
- 3241 (`446d90`), `ev_aa4440f0aeea5d6f75854d6aec2d84128403084bacfdf155b2c3ef23009b31ea`.
- 3239 (`447740`), `ev_83bfcffc24b949a2f195a12cf8a947b28e82d3622b165729ae3d1d4ac7693a33`.
- 3259 (`447850`), `ev_cf3a17dc496468f0acf016bd638940ad3bb96c4144a9b359bf22f62517c5ec2d`.
- 3237 (`447920`), `ev_b5c3279f8e013bd0ab10b06b2b0c1713fde1932b11161f7f922fb61e162e1759`.
- 3303 (`41f670`), `ev_e2b6d724463e4102fa2601d682a1494e5c942082b0b50349416e3c723da663b2`.

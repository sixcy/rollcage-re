import {updateWorldPickups} from './pickup-world-state.mjs';
import {updateActiveProjectiles} from './projectile-world-state.mjs';
import {updateTerrainWave} from './terrain-wave.mjs';
import {updateRaceTimeEffect} from './race-time-effect.mjs';
import {updateWeaponTargets} from './weapon-targeting.mjs';
import {launchVehicleWeapon, requestHeldVehicleRecovery} from './vehicle-weapon-launch.mjs';
import {applyRaceLaunchImpulse} from './race-launch-state.mjs';
import {updateVehicleContactColors} from './vehicle-contact-colors.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);

//48d7c0. Ordered world/weapon stage and two live-count participant passes.
//The age threshold is native EBP and persists across participant iterations;
//expiring one launch state breaks the entire first pass, but not the second.
export function updateRaceWeaponStage(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 28, child = {...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, EBP: -1}};
  updateWorldPickups(child); updateActiveProjectiles(child); updateTerrainWave(child); updateRaceTimeEffect(child); updateWeaponTargets(child);
  let threshold = -1; put(m, frame + 0x14, 0);
  for (let i = 0; i < m[ptr(m, 0x5ecb1c) + 0x54d]; i++) {
    const record = 0x909300 + i * 0x30c, body = ptr(m, record); if (m[body + 0x699]) m[body + 0x699]--;
    const live = ptr(m, record), edges = get(m, live + 0x714), held = get(m, live + 0x710); put(m, frame + 0x18, held);
    if (edges & 4) launchVehicleWeapon(record, 0, 1, held, 0, {...runtime, scratchBase: frame - 16, entryRegisters: {...runtime.entryRegisters, EBX: edges, EBP: threshold}});
    //47be20 always finishes with cookie ECX. Its context stack argument is
    //unread, but preserve the original first/second-call value here.
    if (edges & 8) launchVehicleWeapon(record, 1, 1, edges & 4 ? get(m, 0x5e8890) : held, 0, {...runtime, scratchBase: frame - 16, entryRegisters: {...runtime.entryRegisters, EBX: edges, EBP: threshold}});
    if (m[frame + 0x18] & 32) requestHeldVehicleRecovery(ptr(m, record), child);
    const value = get(m, body + 0x6a8), base = get(m, body + 0x6ac); put(m, body + 0x6a8, value < base ? base : value - 1024);
    const cap = m[ptr(m, 0x5ecb1c) + 0x587] ? 0xe0000 : 0xd0000; if (get(m, body + 0x6a8) > cap) put(m, body + 0x6a8, cap); if (base > cap) put(m, body + 0x6ac, cap);
    const state = m.readInt16LE(body + 0x6a0);
    if (state) {
      if (state === 1) {threshold = 90; if (m.readInt16LE(body + 0x6a2) < 3 && !(get(m, ptr(m, record) + 0x710) & m.readInt16LE(body + 0x6a4))) m.writeUInt16LE(2, body + 0x6a0);}
      else if (state === 2) threshold = 150;
      m.writeUInt16LE((m.readUInt16LE(body + 0x6a2) + 1) & 65535, body + 0x6a2); const age = m.readInt16LE(body + 0x6a2);
      if (age > threshold) {put(m, body + 0x6ac, 0x60000); put(m, body + 0x6a0, 0); break;}
      if (age === 14) m[body + 0x6a7] = m[ptr(m, record) + 0x709];
      else if (age === 15) {const input = m[ptr(m, record) + 0x709]; if (input > m[body + 0x6a7] || input > 200) applyRaceLaunchImpulse(body, 20, child);}
    }
    put(m, frame + 0x14, i + 1);
  }
  for (let i = 0; i < m[ptr(m, 0x5ecb1c) + 0x54d]; i++) {
    const record = 0x909300 + i * 0x30c, controller = ptr(m, ptr(m, record) + 0x6bc); if (controller !== 0xffffffff && m[controller]) updateVehicleContactColors(record, child);
  }
}

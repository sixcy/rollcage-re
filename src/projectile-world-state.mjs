import {updateHomingProjectile} from './projectile-flight.mjs';
import {updateGroundProjectile} from './projectile-ground.mjs';
import {updateSatelliteProjectile} from './projectile-satellites.mjs';
import {lowerProjectileTrail} from './projectile-trails.mjs';

//46a7f0. A fixed24-slot scan with live pointer loads; the same captured body
//gets the lower-trail pass even if its tick deactivates it or replaces a slot.
export function updateActiveProjectiles(runtime) {
  const {memory: m, scratchBase} = runtime;
  for (let i = 0; i < 24; i++) {
    const child = {...runtime, scratchBase: scratchBase - 16, entryRegisters: {...runtime.entryRegisters, EBX: 0x9034a0 + i * 4, EDI: 24 - i}};
    const body = m.readUInt32LE(0x9034a0 + i * 4); if (!m.readInt32LE(body + 0x188)) continue;
    const kind = m.readInt32LE(body + 0x184);
    if (kind === 0) updateGroundProjectile(body, child); else if (kind === 1) updateHomingProjectile(body, child); else if (kind === 2) updateSatelliteProjectile(body, child);
    lowerProjectileTrail(body, child);
  }
}

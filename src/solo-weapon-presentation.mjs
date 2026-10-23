import {buildSoloCarMesh} from './solo-car-mesh.mjs';

//Read-only presentation of bodies constructed by47b580/46a420. Gameplay,
//collection radii, respawn timers, projectile states and awards stay native.
export function createSoloWeaponPresentation({memory: m, data, textureData, base, enabled}) {
  const ptr = p => m.readUInt32LE(p);
  const count = ptr(0x902024), list = ptr(0x902020);
  const rows = enabled ? [
    ...Array.from({length: count}, (_, index) => ({kind: 'pickup', index, address: ptr(list + index * 4)})),
    ...Array.from({length: 24}, (_, index) => ({kind: 'projectile', index, address: ptr(0x9034a0 + index * 4)}))
  ] : [];
  const mesh = enabled ? buildSoloCarMesh(data, textureData, rows.map(row => ptr(row.address + 0x10) - base)) : null;
  const pose = address => ({
    position: Object.freeze([0,4,8].map(offset => m.readInt32LE(address + 0x34 + offset) / 65536)),
    rotation: Object.freeze(Array.from({length: 9}, (_, i) => m.readInt16LE(address + 0xc4 + i * 2) / 4096))
  });
  return Object.freeze({
    assets: mesh && Object.freeze({...mesh, modelIndices: Object.freeze(mesh.modelIndices),
      spawnPositions: Object.freeze(Array.from({length: count}, (_, index) => Object.freeze([0,2,4].map(offset => m.readInt16LE(ptr(0x9092a8) + index * 12 + offset)))))}),
    snapshot() {
      const objects = Object.freeze(rows.map((row, instance) => {
        const {address, kind} = row;
        const state = kind === 'pickup' ? m.readUInt16LE(address + 0x182) : m.readInt32LE(address + 0x188);
        const visible = kind === 'pickup' ? Boolean(state & 0x80) && [1,3].includes(state & 0x7f) : state !== 0 && state !== 16;
        const authored = ptr(0x9092a8) + row.index * 12;
        return Object.freeze({...row, instance, modelIndex: mesh.modelIndices[instance], state, visible, ...pose(address),
          ...(kind === 'pickup' ? {authoredPosition: Object.freeze([0,2,4].map(offset => m.readInt16LE(authored + offset)))}
            : {projectileKind: m.readInt32LE(address + 0x184), ownerAddress: ptr(address + 0x194)})});
      }));
      return Object.freeze({objects, pickups: Object.freeze(objects.filter(row => row.kind === 'pickup')), projectiles: Object.freeze(objects.filter(row => row.kind === 'projectile'))});
    }
  });
}

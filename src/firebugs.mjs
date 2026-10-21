import { decodeFirebugsScene } from './firebugs-scene.mjs';

const knownIndex = 'f020b8f8b6ebc4e2a29261450ec732bd71cc9038551e71bfe39846b9ba9a6147';
const knownImage = 'b24e781e33c915e9c9ef87c2789a85d05b76ea7c1ecd30405bff954cc6199531';
async function digest(bytes) {
  if (!globalThis.crypto?.subtle) return null;
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
}

export const firebugsGame = Object.freeze({
  id: 'firebugs', label: 'Firebugs', tracks: Object.freeze([]),
  async listTracks(archive) {
    const tracks = [];
    for (const entry of archive.entries) {
      const resource = await archive.readResource(entry.index);
      if (resource.data.toString('ascii', 0, 4) !== 'GFXM' || resource.data.length < 0x140 || resource.data.readUInt32LE(0x10) === 0) continue;
      const vramIndex = entry.index + 1, btxIndex = entry.index + 2;
      const vram = await archive.readResource(vramIndex), btx = await archive.readResource(btxIndex);
      if (vram.data.toString('ascii', 0, 4) !== 'VRAM' || btx.data.toString('ascii', 0, 4) !== 'BTX ') throw new Error(`Firebugs resource ${entry.index} has no matching VRAM/BTX resources.`);
      tracks.push(Object.freeze({ game:'firebugs', gameLabel:'Firebugs', index:entry.index, vramIndex, btxIndex, textureIndex:btxIndex,
        name:`RESOURCE-${entry.index}`, label:`Firebugs / Resource ${entry.index}`, category:'Disc environments' }));
    }
    return Object.freeze(tracks);
  },
  async loadTrack(archive, track) {
    if (track.game !== 'firebugs' || !archive.tracks?.includes(track)) throw new Error('Track does not belong to the selected Firebugs disc.');
    const geometry = await archive.readResource(track.index), vram = await archive.readResource(track.vramIndex), btx = await archive.readResource(track.btxIndex);
    const scene = decodeFirebugsScene(geometry.data, vram.data, btx.data);
    scene.source = { identity:archive.identity, verified:archive.verified, geometryResource:track.index, vramResource:track.vramIndex, btxResource:track.btxIndex,
      coordinates:'X,-Y,-Z (Y up); source units retained',
      scope:'Static terrain and ordinary scenery at initial poses. Effects, special objects, overlays, animation, original lighting, visibility/LOD and simulation are not included. PS1 semitransparency uses cutout transparency.' };
    return scene;
  }
});

export async function identifyFirebugs(archive, requested='auto') {
  if (requested !== 'auto' && requested !== 'firebugs') throw new Error('This disc belongs to Firebugs. Choose Automatic or Firebugs.');
  if (archive.game !== 'firebugs') throw new Error('Select a Firebugs disc ZIP.');
  const indexSHA256 = await digest(archive.indexData), imageSHA256 = await digest(archive.imageData);
  const known = indexSHA256 === knownIndex;
  if (known && imageSHA256 !== knownImage) throw new Error('The Firebugs image does not match its index, or its data is damaged.');
  const verified = known && imageSHA256 === knownImage
    && archive.identity?.volumeId === 'FIREBUGS' && archive.identity?.bootExecutable?.toUpperCase() === 'SCES_038.84';
  if (!verified && requested === 'auto') throw new Error('Unrecognized Firebugs release. Choose Firebugs explicitly to attempt unverified compatibility.');
  archive.tracks = await firebugsGame.listTracks(archive);
  if (!archive.tracks.length) throw new Error('No Firebugs track environments were found.');
  archive.verified = verified;
  archive.identity = { ...archive.identity, indexSHA256, imageSHA256 };
  return { game:firebugsGame, tracks:archive.tracks, verified, identity:archive.identity, indexSHA256 };
}

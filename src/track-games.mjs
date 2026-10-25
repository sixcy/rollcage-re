import { resourceMappings, normalizeResourceName, findResourceIndex } from './resource-names.mjs';
import stage2Map from './stage2-resource-map.json' with { type: 'json' };
import { decodeTrackScene } from './track-scene.mjs';
import { parseStage2Placements } from './stage2-placements.mjs';
import { buildStage2PlacedMeshes } from './stage2-placed-meshes.mjs';
import { firebugsGame, identifyFirebugs } from './firebugs.mjs';
import {recoverEditedRollcageIndex, originalRollcageView} from './edited-rollcage-index.mjs';
import {parseScene} from './scene.mjs';

// Exact index identities plus decoded sentinel resources bind auto-detection to
// the supplied archives, including a check that the IMG belongs to that IDX.
// Unknown releases require an explicit choice and remain unverified.
const fingerprints = {
  rollcage: {
    index: '28c30b94d5612b98cc9d68540982f40bc1ae6f05df3113cb964c6b2eccf02377',
    geometry: '405fc2c8262a3040c444e00594ba22459232da53b19b13e1c92b5da956e70502',
    texture: '225f08e8e03700090b3841304befbc337cdb07315b8f2dc0770a965686b06732'
  },
  stage2: {
    index: '54e06749a8a5ad23467f85c8f996f732c53065987467a3b0f9931c8592c71f75',
    geometry: '648cd8a6496fe9ea63fe16e981ddc221537b89f209e8cdb13c9cee3a18f50c2e',
    texture: '532b30150bfe5abf4e649cd0465014a82b06e8f8a6565fbb94f7dc02a96bf20b'
  }
};

function createGame(id, label, definitions, decode, resolveName, headerFlags) {
  const tracks = definitions.map(track => Object.freeze({
    ...track, game: id, gameLabel: label,
    label: `${label} / ${track.category ? track.category + ' / ' : ''}${track.name.replace(/\.BLP$/i, '').replace('/', ' / ')}`
  }));
  return Object.freeze({ id, label, headerFlags, tracks: Object.freeze(tracks),
    installation: `C:\\Program Files (x86)\\Psygnosis\\${id === 'stage2' ? 'Rollcage Stage II' : 'Rollcage'}`,
    findResourceIndex: resolveName, decodeTrack: decode,
    listTracks: archive => tracks.filter(track => archive.entries[track.index] && archive.entries[track.textureIndex]),
    async loadTrack(archive, track) {
      if (!tracks.includes(track)) throw new Error('Track does not belong to the selected game.');
      const geometry = await archive.readResource(track.index);
      const texture = await archive.readResource(track.textureIndex);
      return decode(geometry.data, texture.data);
    }
  });
}

const stage2Lookup = new Map(stage2Map.mappings.map(({ name, index }) => [normalizeResourceName(name), index]));
// PC catalogs are fixed. Firebugs discovers its catalog from the selected disc
// and participates through getGame/identifyGame below.
export const games = Object.freeze([
  createGame('rollcage', 'Rollcage', resourceMappings
    .map(({ name, index }) => ({ name: normalizeResourceName(name), index, textureIndex: index + 1 }))
    .filter(({ name }) => /^(LOW|HIGH)\/LEV\d+\.BLP$/.test(name)),
  decodeTrackScene, findResourceIndex, [1]),
  createGame('stage2', 'Rollcage Stage II', stage2Map.tracks,
    (data, texture) => decodeTrackScene(data, texture, { pathConnectivity:false,parseScene:data=>parseScene(data,{texturePageMode:'legacy'}),parsePlacements: parseStage2Placements, buildPlacedMeshes: buildStage2PlacedMeshes }),
    name => stage2Lookup.get(normalizeResourceName(name)) ?? -1, [4, 12])
]);

export function getGame(id) {
  if (id === 'firebugs') return firebugsGame;
  const game = games.find(game => game.id === id);
  if (!game) throw new Error(`Unknown game: ${id}. Choose rollcage, stage2 or firebugs.`);
  return game;
}

async function digest(bytes) {
  if (!globalThis.crypto?.subtle) return null;
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function identifyGame(archive, requested = 'auto') {
  if (archive.game === 'firebugs' || requested === 'firebugs') return identifyFirebugs(archive, requested);
  const indexHash = archive.indexData ? await digest(archive.indexData) : null;
  let known = games.find(game => fingerprints[game.id].index === indexHash), modified=false;
  if(!known){
    const edited=recoverEditedRollcageIndex(archive.indexData);
    if(edited&&await digest(edited.indexData)===edited.expectedIndexSha256){
      const original=originalRollcageView(archive,edited.indexData),rollcage=getGame('rollcage'),sentinel=rollcage.tracks[0];
      const geometry=await original.readResource(sentinel.index),texture=await original.readResource(sentinel.textureIndex);
      if(await digest(geometry.data)!==fingerprints.rollcage.geometry||await digest(texture.data)!==fingerprints.rollcage.texture)throw Error('The edited IDX does not match the original IMG data retained by the editor. Select its matching IMG and IDX files.');
      known=rollcage;modified=true;
    }
  }
  if (requested !== 'auto' && known && known.id !== requested) {
    throw new Error(`These files belong to ${known.label}. Choose Automatic or ${known.label}.`);
  }
  const game = requested === 'auto' ? known : getGame(requested);
  if (!game) throw new Error('Unrecognized archive. Choose a game explicitly to try an unverified release, or select its matching IMG and IDX files.');
  const tracks = game.listTracks(archive);
  if (!tracks.length || tracks[0] !== game.tracks[0]) throw new Error(`No supported ${game.label} tracks were found in this archive.`);
  const sentinel = tracks[0];
  const geometry = await archive.readResource(sentinel.index), texture = await archive.readResource(sentinel.textureIndex);
  if (geometry.data.toString('ascii', 0, 4) !== 'GFXM' || geometry.data.length < 0x120 || !game.headerFlags.includes(geometry.data.readUInt16LE(4)) ||
      texture.data.toString('ascii', 0, 4) !== 'BTP ') {
    throw new Error(`Invalid GFXM/BTP data for ${game.label}. Select the matching IMG and IDX files.`);
  }
  if (known && !modified && (await digest(geometry.data) !== fingerprints[game.id].geometry || await digest(texture.data) !== fingerprints[game.id].texture)) {
    throw new Error('The selected IMG does not match this IDX, or its track data is damaged. Select the matching files.');
  }
  return { game, tracks, verified: Boolean(known), modified, indexSHA256: indexHash };
}

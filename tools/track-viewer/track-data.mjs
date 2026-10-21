import { resourceMappings, normalizeResourceName } from '../../src/resource-names.mjs';
import { parseScene } from '../../src/scene.mjs';
import { parseGFXM } from '../../src/gfxm.mjs';
import { parsePlacements } from '../../src/placements.mjs';
import { buildPlacedMeshes } from '../../src/placed-meshes.mjs';
import { parseBTP, decodeBTPTexture } from '../../src/btp.mjs';
import { buildSceneExport } from '../../src/scene-export.mjs';

export const tracks = resourceMappings.map(({ name, index }) => ({ name: normalizeResourceName(name), index }))
  .filter(({ name }) => /^(LOW|HIGH)\/LEV\d+\.BLP$/.test(name))
  .map(track => ({ ...track, label: track.name.replace('/', ' / ').replace('.BLP', '') }));

export function decodeTrack(data, textureData) {
  const terrain = parseScene(data), gfxm = parseGFXM(data), btp = parseBTP(textureData);
  if (!terrain.segments.length) throw new Error('This resource has no track geometry.');
  const placements = parsePlacements(textureData, gfxm.models), meshes = buildPlacedMeshes(data, gfxm, placements);
  const textures = new Map();
  for (const page of new Set([...terrain.segments, ...meshes].flatMap(mesh => mesh.faces.map(face => face.page)))) textures.set(page, decodeBTPTexture(btp, page));
  const output = buildSceneExport(terrain, textures, meshes);
  if (!output.bounds.flat().every(Number.isFinite)) throw new Error('Invalid track bounds.');
  return { ...output, segments: terrain.segments.length, instances: meshes.length, textures };
}

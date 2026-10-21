import { parseScene } from './scene.mjs';
import { parseGFXM } from './gfxm.mjs';
import { parsePlacements } from './placements.mjs';
import { buildPlacedMeshes } from './placed-meshes.mjs';
import { parseBTP, decodeBTPTexture } from './btp.mjs';
import { buildSceneExport } from './scene-export.mjs';

// Both host and standalone browser use this boundary. Format-specific readers
// supply ordinary objects; rendering and OBJ generation share the same meshes.
export function decodeTrackScene(data, textureData, readers = {}) {
  const terrain = (readers.parseScene ?? parseScene)(data);
  const gfxm = parseGFXM(data), btp = parseBTP(textureData);
  if (!terrain.segments.length) throw new Error('This resource has no track geometry.');
  const placements = (readers.parsePlacements ?? parsePlacements)(textureData, gfxm.models);
  const meshes = (readers.buildPlacedMeshes ?? buildPlacedMeshes)(data, gfxm, placements);
  const textures = new Map();
  for (const page of new Set([...terrain.segments, ...meshes].flatMap(mesh => mesh.faces.map(face => face.page)))) {
    textures.set(page, (readers.decodeBTPTexture ?? decodeBTPTexture)(btp, page));
  }
  const output = buildSceneExport(terrain, textures, meshes);
  if (!output.bounds.flat().every(Number.isFinite)) throw new Error('Invalid track bounds.');
  return { ...output, segments: terrain.segments.length, instances: meshes.length, textures,
    placementTypes: placements.records.reduce((types, record) => {
      types[record.type] = (types[record.type] ?? 0) + 1;
      return types;
    }, {}) };
}

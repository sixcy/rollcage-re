import { readStage2ModelMaterials } from './stage2-model-materials.mjs';
import { transformPlacedVertex } from './fixed-math.mjs';

// Preserve the same static base-pass scope as Rollcage: ordinary type-zero
// placements at their initial poses; special constructors remain inventoried.
export function buildStage2PlacedMeshes(data, gfxm, placements) {
  return placements.records.filter(record => record.type === 0 && (record.flags & 0x400)).map(record => {
    const model = gfxm.models[record.modelIndex];
    return { index: record.index, modelIndex: record.modelIndex,
      vertices: model.vertices.map(vertex => transformPlacedVertex(vertex, record.matrix, record.position)),
      faces: readStage2ModelMaterials(data, model).map(face => ({ ...face, uv: face.uv.slice(0, face.indices.length) })) };
  });
}

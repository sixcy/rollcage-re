import {readModelMaterials} from './model-materials.mjs';
import {transformPlacedVertex} from './fixed-math.mjs';
// Ordinary type-zero models at their loader-initialized poses. Other placement
// types use separate constructors and are deliberately retained in the inventory.
export function buildPlacedMeshes(data,gfxm,placements) {
 return placements.records.filter(record=>record.type===0&&(record.flags&0x400)).map(record=>{
  const model=gfxm.models[record.modelIndex];
  return {index:record.index,modelIndex:record.modelIndex,
   vertices:model.vertices.map(vertex=>transformPlacedVertex(vertex,record.matrix,record.position)),
   faces:readModelMaterials(data,model,record.uvStarts[0]).map(face=>({...face,uv:face.uv.slice(0,face.indices.length)}))};
 });
}

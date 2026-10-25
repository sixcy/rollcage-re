import {instantiateSceneryAssembly} from './scenery-assemblies.mjs';
import {parseGFXM} from './gfxm.mjs';
import {parsePlacements} from './placements.mjs';
import {placementMatrix} from './fixed-math.mjs';
import {buildPlacedMeshes} from './placed-meshes.mjs';
import {parseBTP,decodeBTPTexture} from './btp.mjs';
import {buildSceneExport} from './scene-export.mjs';

// One local textured preview for the complete ownership closure. The selected
// member is the origin and yaw0; the viewer applies its world transform once.
export function buildSceneryAssemblyPreview(source,selectedIndex) {
  const gfxm=parseGFXM(source.geometry),placements=parsePlacements(source.texture,gfxm.models),baseline=instantiateSceneryAssembly(source,selectedIndex,{id:'assembly-preview',level:1,position:[0,0,0]}),worldOrientation=!baseline.dependencyPlan.yawEditable,instance=worldOrientation?baseline:instantiateSceneryAssembly(source,selectedIndex,{id:'assembly-preview',level:1,position:[0,0,0],yaw:0}),records=instance.members.map(row=>{const p=placements.records[row.templateIndex],angles=[...p.angles];angles[1]=row.yaw;return {...p,position:row.position,angles,matrix:placementMatrix(angles)};}),meshes=buildPlacedMeshes(source.geometry,gfxm,{records}),textures=new Map(),btp=parseBTP(source.texture);
  for(const face of meshes.flatMap(m=>m.faces))if(!textures.has(face.page))textures.set(face.page,decodeBTPTexture(btp,face.page));
  return {...buildSceneExport({segments:[]},textures,meshes),textures,meshes,instances:meshes.length,assembly:instance.dependencyPlan,worldOrientation};
}

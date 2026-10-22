import {parseGFXM} from './gfxm.mjs';
import {parseBTP, decodeBTPTexture} from './btp.mjs';
import {readDefaultModelMaterials} from './model-materials.mjs';
import {buildSceneExport} from './scene-export.mjs';

export function buildSoloCarMesh(data, textureData, modelOffsets) {
  const models = parseGFXM(data).models, btp = parseBTP(textureData), textures = new Map();
  const parts = modelOffsets.map((offset, index) => {
    const model = models.find(value => value?.offset === offset);
    if (!model) throw Error('Solo car model is absent from the selected track.');
    const faces = readDefaultModelMaterials(data, model);
    for (const face of faces) if (!textures.has(face.page)) textures.set(face.page, decodeBTPTexture(btp, face.page));
    return {index, vertices: model.vertices, faces};
  });
  const mesh = buildSceneExport({segments: []}, textures, parts);
  return {groups: mesh.groups, textures, modelIndices: modelOffsets.map(offset => models.find(value => value?.offset === offset).index)};
}

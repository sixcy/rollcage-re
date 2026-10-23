import {getGame} from './track-games.mjs';
import {parseGFXM} from './gfxm.mjs';
import {parsePlacements} from './placements.mjs';
import {parseStage2Placements} from './stage2-placements.mjs';
import {readModelMaterials, readDefaultModelMaterials} from './model-materials.mjs';
import {readStage2ModelMaterials} from './stage2-model-materials.mjs';
import {parseBTP, decodeBTPTexture} from './btp.mjs';
import {parseFirebugsModels, parseFirebugsPlacements, readFirebugsMaterial, decodeFirebugsTexture} from './firebugs-scene.mjs';
import {buildSceneExport} from './scene-export.mjs';
import vehicleTables from './vehicle-construction-tables.json' with {type: 'json'};
import {buildObjectCarAssembly} from './object-car-assembly.mjs';
import {parseCollisionGrid} from './collision-grid.mjs';

const gameFor = game => typeof game === 'string' ? getGame(game) : game;
const boundsCheck = (data, offset, bytes, label) => {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(bytes) || offset < 0 || bytes < 0 || offset + bytes > data.length) throw Error(`Object ${label} exceeds resource bounds.`);
};
const scopes = {
  rollcage: 'Primary local geometry; ordinary placement material variants, separate vehicle parts, and recovered neutral primary-body/four-wheel assemblies. Separate linked animation, runtime LODs, lighting and physics are outside this static preview.',
  stage2: 'Primary local geometry with ordinary type-zero scenery material context only. Special constructors, cars, runtime material changes and LODs are not reconstructed here.',
  firebugs: 'Primary local geometry with ordinary type-zero scenery material context only. Special objects, cars, animation and LODs are not reconstructed here. PS1 semitransparency is represented as cutout alpha.'
};

//Use already identified tracks when supplied: selecting a resource never scans
//and decodes every environment again, particularly on the Firebugs disc.
export async function listObjectResources(archive, game, identifiedTracks) {
  game = gameFor(game);
  if (!game || !scopes[game.id] || !archive || typeof archive.readResource !== 'function') throw Error('Object inventory requires a supported game and archive.');
  const tracks = identifiedTracks ?? archive.tracks ?? await game.listTracks(archive);
  if (!Array.isArray(tracks)) throw Error('Object resource inventory requires identified track descriptors.');
  return Object.freeze(tracks.map(track => {
    if (!Number.isInteger(track.index) || track.index < 0 || !Number.isInteger(track.textureIndex)) throw Error('Invalid object resource identity.');
    if (track.game && track.game !== game.id) throw Error('Object resource belongs to another game.');
    return Object.freeze({...track, game: game.id, id: `${game.id}:${track.index}`, label: track.label ?? `${game.label} / ${track.name ?? track.index}`});
  }));
}

function originalVehicleWord(address) {
  const table = vehicleTables.find(row => address >= Number(row.address) && address + 2 <= Number(row.address) + row.bytesHex.length / 2);
  if (!table) throw Error('Recovered vehicle model selector is unavailable.');
  return Buffer.from(table.bytesHex, 'hex').readUInt16LE(address - Number(table.address));
}

//The constructor41dbb0 selects body and linked models from these actual image
//WORDs, and ordinary wheel geometry from metadata+16. No car names/poses are
//inferred. Embedded packets are the same reader used by solo-car-mesh.mjs.
function vehicleParts(data, models) {
  const metadata = data.readUInt32LE(0x84), parts = new Map();
  const add = (modelIndex, kind, type) => {
    if (!models[modelIndex]) return;
    const key = `${kind}:${modelIndex}`;
    if (!parts.has(key)) parts.set(key, {modelIndex, kind, vehicleTypes: []});
    parts.get(key).vehicleTypes.push(type);
  };
  for (let type = 0; type < 7; type++) {
    for (const [table, kind] of [[0x5eadc4, 'vehicle-body'], [0x5ead50, 'vehicle-linked']]) {
      const offset = metadata + originalVehicleWord(table + type * 2) * 2;
      boundsCheck(data, offset, 2, 'vehicle metadata'); add(data.readInt16LE(offset), kind, type);
    }
    boundsCheck(data, metadata + 16, 2, 'wheel metadata'); add(data.readInt16LE(metadata + 16), 'vehicle-wheel', type);
  }
  return [...parts.values()];
}

export async function loadObjectCollection(archive, game, resource) {
  game = gameFor(game);
  if (!game || !scopes[game.id] || resource?.game !== game.id || !Number.isInteger(resource.index) || !Number.isInteger(resource.textureIndex)) throw Error('Object collection requires a matching game/resource descriptor.');
  const indices = game.id === 'firebugs' ? [resource.index, resource.vramIndex, resource.btxIndex ?? resource.textureIndex] : [resource.index, resource.textureIndex];
  if (indices.some(value => !Number.isInteger(value) || value < 0)) throw Error('Object collection has an invalid paired resource index.');
  const resources = await Promise.all(indices.map(index => archive.readResource(index)));
  return decodeObjectCollection(resources[0].data, resources[1].data, {
    game: game.id, resource, btxData: resources[2]?.data
  });
}

//Synchronous byte boundary shared by Node/browser validation. The PC pair is
//GFXM/BTP; Firebugs uses GFXM/VRAM plus btxData. Only selected texture pages
//are decoded, and source bytes are privately copied before lazy loading.
export function decodeObjectCollection(geometryData, textureData, {game = 'rollcage', resource = {}, btxData} = {}) {
  game = gameFor(game);
  if (!game || !scopes[game.id]) throw Error('Unsupported object game.');
  if (!ArrayBuffer.isView(geometryData) || !ArrayBuffer.isView(textureData)) throw Error('Object collection requires decoded resource bytes.');
  const data = Buffer.from(geometryData), texture = Buffer.from(textureData), firebugs = game.id === 'firebugs';
  if (resource.game && resource.game !== game.id) throw Error('Object resource belongs to another game.');
  if (firebugs && !ArrayBuffer.isView(btxData)) throw Error('Firebugs objects require the matching BTX resource.');
  const btx = firebugs ? Buffer.from(btxData) : null;
  const models = firebugs ? parseFirebugsModels(data) : parseGFXM(data).models;
  const placements = firebugs ? parseFirebugsPlacements(btx, models) : (game.id === 'stage2' ? parseStage2Placements : parsePlacements)(texture, models);
  const btp = firebugs ? null : parseBTP(texture), textures = new Map(), details = new Map(), entries = [];
  const source = Object.freeze({game: game.id, gameLabel: game.label, resourceId: resource.id ?? `${game.id}:${resource.index ?? 'bytes'}`,
    resourceName: resource.name ?? `RESOURCE-${resource.index ?? 'bytes'}`, geometryResource: resource.index ?? null,
    textureResource: resource.textureIndex ?? null, ...(firebugs ? {vramResource: resource.vramIndex ?? null, btxResource: resource.btxIndex ?? resource.textureIndex ?? null} : {}),
    coordinates: 'X,-Y,-Z (Y up); source units retained', geometrySpace: 'original model-local coordinates', scope: scopes[game.id]});
  const limits = Object.freeze([scopes[game.id], 'Flat triangle normals are reconstructed for display; original runtime lighting, visibility and transparency ordering are not reproduced.']);
  const materialFaces = (model, uvStart) => {
    if (game.id === 'rollcage') return readModelMaterials(data, model, uvStart);
    if (game.id === 'stage2') return readStage2ModelMaterials(data, model);
    boundsCheck(data, model.keys, model.faces.length * 2, 'Firebugs material keys');
    return model.faces.map((face, index) => ({...face, ...readFirebugsMaterial(data, model.materials + data.readUInt16LE(model.keys + index * 2))}));
  };
  const add = ({model, kind = 'scenery', variant, label, placementIndices = [], vehicleTypes = [], facesFor, reason}) => {
    const id = `${source.resourceId}:model:${model.index}:${variant}`;
    if (details.has(id)) throw Error('Duplicate object material identity.');
    let faces;
    if (!reason) try {
      if (!model.vertices.length || !model.faces.length) throw Error('Model has no renderable primary faces.');
      faces = facesFor().map(face => ({...face, uv: face.uv.slice(0, face.indices.length)}));
      for (const face of faces) {
        if (![3, 4].includes(face.indices.length) || face.uv.length !== face.indices.length || face.indices.some(index => !Number.isInteger(index) || index < 0 || index >= model.vertices.length)) throw Error('Model face references invalid local geometry.');
        if (!firebugs && (!btp.textures[face.page] || btp.textures[face.page].empty)) throw Error(`Texture page ${face.page} is absent or empty.`);
      }
    } catch (error) {reason = error.message;}
    const entry = Object.freeze({id, label: label ?? `Model ${model.index} / ${variant}`, modelIndex: model.index, modelOffset: model.offset,
      kind, status: reason ? 'unsupported' : 'supported', ...(reason ? {reason} : {}), materialVariant: variant,
      vertexCount: model.vertices.length, faceCount: model.faces.length, placementIndices: Object.freeze([...placementIndices]), vehicleTypes: Object.freeze([...vehicleTypes]),
      source, ...(faces ? {texturePages: Object.freeze([...new Set(faces.map(face => face.page))])} : {})});
    entries.push(entry); details.set(id, {entry, model, faces});
  };
  const ordinary = placements.records.filter(row => row.type === 0 && (row.flags & 0x400));
  const contexts = new Map();
  for (const row of ordinary) {
    const variant = game.id === 'rollcage' ? `placement-uv-${row.uvStarts[0]}` : 'ordinary-primary';
    const key = `${row.modelIndex}:${variant}`;
    if (!contexts.has(key)) contexts.set(key, {model: models[row.modelIndex], variant, uvStart: row.uvStarts?.[0], placementIndices: []});
    contexts.get(key).placementIndices.push(row.index);
  }
  for (const value of contexts.values()) add({...value, facesFor: () => materialFaces(value.model, value.uvStart)});
  if (game.id === 'rollcage') for (const part of vehicleParts(data, models)) {
    const model = models[part.modelIndex], names = part.vehicleTypes.map(type => type + 1).join(', ');
    add({...part, model, variant: `embedded-${part.kind}`, label: `${part.kind.replace('vehicle-', 'Car ')} / types ${names} / model ${model.index}`,
      facesFor: () => readDefaultModelMaterials(data, model)});
  }
  if (game.id === 'rollcage') {
    const parts = vehicleParts(data, models), spatial = parseCollisionGrid(data);
    for (let type = 0; type < 7; type++) {
      const body = parts.find(part => part.kind === 'vehicle-body' && part.vehicleTypes.includes(type)), wheel = parts.find(part => part.kind === 'vehicle-wheel' && part.vehicleTypes.includes(type));
      const components = [body,wheel].filter(Boolean).map(part => details.get(`${source.resourceId}:model:${part.modelIndex}:embedded-${part.kind}`));
      const reason = !body || !wheel ? 'Missing authored body or wheel model.' : !spatial.available ? 'Car assembly requires its genuine spatial registration grid.' : components.find(part => part.entry.status !== 'supported')?.entry.reason;
      const id = `${source.resourceId}:car:${type}`, model = models[body?.modelIndex];
      const entry = Object.freeze({id,label:`Complete car / type ${type + 1}`,modelIndex:body?.modelIndex ?? -1,modelOffset:model?.offset ?? null,
        kind:'vehicle-assembled',status:reason?'unsupported':'supported',...(reason?{reason}:{}),materialVariant:'embedded-neutral-assembly',
        vertexCount:components.reduce((sum,part,index)=>sum+part.entry.vertexCount*(index?4:1),0),faceCount:components.reduce((sum,part,index)=>sum+part.entry.faceCount*(index?4:1),0),
        placementIndices:Object.freeze([]),vehicleTypes:Object.freeze([type]),vehicleType:type,source,
        texturePages:Object.freeze([...new Set(components.flatMap(part=>part.entry.texturePages??[]))])});
      entries.push(entry);details.set(id,{entry,assembledType:type});
    }
  }
  const represented = new Set(entries.map(row => row.modelIndex));
  for (const model of models) if (model && !represented.has(model.index)) add({model, kind: 'unresolved', variant: 'unresolved',
    reason: 'No supported ordinary placement or recovered vehicle material context. Special constructors/material setup are not inferred.'});
  entries.sort((a, b) => Number(b.kind === 'vehicle-assembled') - Number(a.kind === 'vehicle-assembled') || (a.kind === 'vehicle-assembled' ? a.vehicleType - b.vehicleType : a.modelIndex - b.modelIndex) || a.id.localeCompare(b.id));
  const frozen = Object.freeze(entries), counts = Object.freeze({modelSlots: models.length, models: models.filter(Boolean).length,
    entries: entries.length, supported: entries.filter(row => row.status === 'supported').length, unsupported: entries.filter(row => row.status !== 'supported').length,
    ordinaryPlacements: ordinary.length, specialPlacements: placements.records.filter(row => row.type !== 0).length,
    vehicleParts: entries.filter(row => row.kind.startsWith('vehicle-') && row.kind !== 'vehicle-assembled').length,
    assembledCars: entries.filter(row => row.kind === 'vehicle-assembled').length});
  return Object.freeze({entries: frozen, counts, source, limits,
    load(selected) {
      const id = typeof selected === 'string' ? selected : selected?.id, value = details.get(id);
      if (!value || typeof selected === 'object' && selected !== value.entry) throw Error('Object entry does not belong to this collection.');
      const {entry, model, faces} = value;
      if (entry.status !== 'supported') throw Error(entry.reason);
      const built = value.assembledType === undefined ? null : buildObjectCarAssembly(data,value.assembledType);
      const meshes = built?.meshes ?? [{index: model.index, modelIndex: model.index, vertices: model.vertices.map(v => v.slice(0, 3)), faces}];
      const used = new Map();
      for (const face of meshes.flatMap(mesh=>mesh.faces)) {
        if (!textures.has(face.page)) textures.set(face.page, firebugs ? decodeFirebugsTexture(texture, face.tpage, face.clut) : decodeBTPTexture(btp, face.page));
        used.set(face.page, textures.get(face.page));
      }
      const scene = buildSceneExport({segments: []}, used, meshes);
      if (!scene.bounds.flat().every(Number.isFinite)) throw Error('Object has invalid local bounds.');
      return {...scene, textures: used, segments: 0, instances: meshes.length, meshes, ...(built?{assembly:built.assembly}:{}), entry, source, limits};
    }
  });
}

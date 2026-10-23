import constants from './solo-runtime-constants.json' with {type: 'json'};
import {parseGFXM} from './gfxm.mjs';
import {parseCollisionGrid} from './collision-grid.mjs';
import {relocateRaceTrackPointers} from './track-relocation.mjs';
import {initializeWorldPhysicsConstants, initializeRawShapePools, initializeRawBodyArena} from './world-physics-pools.mjs';
import {initializeVehicleConstructionTables, initializeRawVehicleDescriptors} from './vehicle-construction.mjs';
import {createRawBody, initializeRawBody, registerRawBodyShapes} from './raw-body-construction.mjs';
import {createVehicleWheels} from './vehicle-wheel-construction.mjs';
import {prepareVehicleWheelRender} from './wheel-render-state.mjs';
import {readDefaultModelMaterials} from './model-materials.mjs';

//Static preview of the genuine41dbb0 body/wheel construction subgraph. The
//original5eab18 template supplies its explicit neutral pose; route,
//controller, race and animated-effect constructors are not needed for it.
export function createObjectCarAssemblyRuntime(geometryData, vehicleType) {
  if (!ArrayBuffer.isView(geometryData) || !Number.isInteger(vehicleType) || vehicleType < 0 || vehicleType > 6) throw Error('Car assembly requires geometry bytes and vehicle type0 through6.');
  const data = Buffer.from(geometryData);
  if (data.length < 0x120 || data.toString('ascii', 0, 4) !== 'GFXM') throw Error('Car assembly requires Rollcage GFXM geometry.');
  const models = parseGFXM(data).models, grid = parseCollisionGrid(data);
  if (!grid.available) throw Error('Car assembly requires its genuine spatial registration grid.');
  const memory = Buffer.alloc(32 * 1024 * 1024), put = (p,v) => memory.writeInt32LE(v | 0,p), ptr = p => memory.readUInt32LE(p);
  let cursor = 0xa00000;
  const allocate = size => {
    if (!Number.isInteger(size) || size < 0 || cursor + size > memory.length) throw Error('Car assembly exhausted its private CRT storage.');
    const address = cursor; cursor += (size + 127) & ~127; return address;
  };
  for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address));
  initializeWorldPhysicsConstants(memory); initializeVehicleConstructionTables(memory);
  const base = allocate(data.length); data.copy(memory, base);
  const runtime = {memory, scratchBase: 0x9000, allocate, handlers: {allocate}, roundingMode: 'nearest-even', x87PrecisionBits: 24};
  put(0x90b970, base); put(0x90b990, base);
  relocateRaceTrackPointers(base, base, runtime);
  put(0x909258, ptr(base + 0x18));
  for (const row of grid.spatial.rows) put(base + row.offset + 12, row.firstIndex ? base + row.mapPointer : 0);
  for (const node of grid.spatial.nodes) put(base + node.offset + 8, 0);
  put(0x709808, data.readInt16LE(0x11e));
  initializeRawShapePools(runtime); initializeRawBodyArena(runtime);
  const metadata = data.readUInt32LE(0x84), bodySlot = memory.readUInt16LE(0x5eadc4 + vehicleType * 2);
  if (metadata + Math.max(bodySlot * 2, 16) + 2 > data.length) throw Error('Car assembly model selectors exceed resource bounds.');
  const modelIndices = [data.readInt16LE(metadata + bodySlot * 2), data.readInt16LE(metadata + 16)];
  if (modelIndices.some(index => !models[index])) throw Error('Car assembly references a missing body or wheel model.');
  const body = createRawBody(base + models[modelIndices[0]].offset, 0x1c03, 0x3e78, 0, runtime);
  initializeRawBody(body, 0x5eab18, runtime);
  registerRawBodyShapes(body, 5, 0x5ead60, runtime);
  initializeRawVehicleDescriptors(body, runtime);
  createVehicleWheels(body, base + models[modelIndices[1]].offset, 0, runtime);
  //41caf0 first prepares transient offsets, then writes the authored ones.
  //The subsequent real41d2b0 is essential to publish the intended pose.
  prepareVehicleWheelRender(body, runtime);
  const readParts = () => [body, ...Array.from({length: 4}, (_,i) => ptr(body + 0x390 + i * 200))].map((address,index) => ({
    index, name: index ? `wheel-${index}` : 'body', modelIndex: modelIndices[index ? 1 : 0],
    positionQ16: Array.from({length: 3}, (_,axis) => memory.readInt32LE(address + 0x34 + axis * 4)),
    rotationQ12: Array.from({length: 9}, (_,lane) => memory.readInt16LE(address + 0xc4 + lane * 2)), scale: 1
  }));
  return {runtime, memory, body, models, data, readParts};
}

export function buildObjectCarAssembly(geometryData, vehicleType) {
  const state = createObjectCarAssemblyRuntime(geometryData, vehicleType), parts = state.readParts();
  const meshes = parts.map(part => {
    const model = state.models[part.modelIndex];
    const vertices = model.vertices.map(vertex => Array.from({length:3}, (_,row) =>
      (part.rotationQ12[row * 3] * vertex[0] + part.rotationQ12[row * 3 + 1] * vertex[1] + part.rotationQ12[row * 3 + 2] * vertex[2]) / 4096 + part.positionQ16[row] / 65536));
    return {index: part.index, modelIndex: part.modelIndex, part: part.name, vertices, faces: readDefaultModelMaterials(state.data, model)};
  });
  return {meshes, assembly: {vehicleType, pose: 'neutral', coordinates: 'Source model-local X,Y,Z; transforms Q12/Q16; scale1', parts,
    scope: 'Recovered primary body and four wheels in the original neutral pose. Separate animated linked effects and runtime LODs are outside this static assembly.'}};
}

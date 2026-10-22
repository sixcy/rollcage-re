import {createModelContactEffectFixture} from './model-contact-effect-fixtures.mjs';
import {initializeWorldFragments} from '../../src/world-fragment-registry.mjs';
import {registerRawBodySpatial} from '../../src/raw-body-construction.mjs';
import {initializePlacedObjectDestructionState} from '../../src/placed-object-destruction.mjs';

export const destructionAddresses = {registry: 0x60000, auxiliary: 0x60200, workspace: 0x61000, indices: 0x64000, models: 0x64100, sourceVertices: 0x280000, sourceFaces: 0x290000};
export function createPlacedDestructionFixture(program, fixture = 0, {initialize = true} = {}) {
  const f = createModelContactEffectFixture(program, fixture), {memory, put, word} = f, a = destructionAddresses;
  const pack = memory.readUInt32LE(0x90b98c); put(pack + 0x18, a.models); put(pack + 0x58, a.indices);
  for (let index = 0; index < 3; index++) {put(a.models + index * 4, 0x200000 + index * 0x5000); word(a.indices + index * 2 + 2, index);}
  for (const configuration of [0x5ecc00, 0x5eccd8, 0x5ecb28]) {
    memory.fill(0, configuration, configuration + 0x80); put(configuration + 0x24, 65536);
    for (const offset of [0x68, 0x6c, 0x70, 0x74, 0x78]) put(configuration + offset, 65536);
    put(configuration + 0x7c, 32768);
  }
  put(0x70dcf4, 0x2f0000); put(0x56e258, 0x5a000); initializePlacedObjectDestructionState(memory); put(0x5ecefc, 0x65000); memory[0x6502e] = fixture & 1;
  const variant = fixture % 3;
  put(0x6f2414, 0); put(0x6f2418, 0); put(0x6e6558, variant); put(0x5eb500, 32); put(0x6fbb14, 0); put(0x810920, 0);
  const allocate = () => {let index = 0; return size => {const sizes = [0x120, 0x2a0, 0x2000], addresses = [a.registry, a.auxiliary, a.workspace]; if (size !== sizes[index]) throw Error('Unexpected destruction fixture allocation.'); return addresses[index++];};};
  if (initialize) initializeWorldFragments({memory, scratchBase: 0x9000, allocate: allocate()});
  for (let index = 0; index < 3; index++) {
    const object = 0x250000 + index * 0x1000, model = 0x200000 + index * 0x5000, vertices = a.sourceVertices + index * 0x1000, faces = a.sourceFaces + index * 0x1000;
    const faceCount = 4 + (fixture + index) % 2 * 4, vertexCount = faceCount * 4;
    word(model + 4, vertexCount); word(model + 6, faceCount); memory[model + 0x27] = faceCount / 4; word(model + 0x32, 40); word(model + 0x34, 0x100);
    put(object + 0x24, vertices); put(object + 0x28, faces); word(object + 0x192, index + 10); memory[object + 0x1a6] = 1; memory[object + 0x1a7] = 2;
    word(object + 0x16a, 0); word(object + 0x16c, 0); put(object + 0x19c, 0); put(object + 0x1b0, 0);
    for (let vertex = 0; vertex < vertexCount; vertex++) {word(vertices + vertex * 8, vertex % 4 * 3); word(vertices + vertex * 8 + 2, fixture % 3 === 0 ? -((vertex / 4 | 0) + 1) * 5 : (fixture % 3) - 1); word(vertices + vertex * 8 + 4, (vertex / 4 | 0) * 2); word(vertices + vertex * 8 + 6, fixture % 4 === 0 ? 1 : 0);}
    for (let face = 0; face < faceCount; face++) put(faces + face * 8, ((face * 4 + 4) << 24) | ((face * 4 + 3) << 16) | ((face * 4 + 2) << 8) | (face * 4 + 1));
    for (let group = 0; group < faceCount / 4; group++) {
      const descriptor = model + 0x100 + group * 20; word(descriptor, group * 2); word(descriptor + 2, 0); word(descriptor + 4, group * 3); memory[descriptor + 8] = group * 4; memory[descriptor + 9] = group * 4 + 4;
      const configuration = memory.readUInt32LE(object + 0x194) + group * 4; put(configuration, fixture % 6 << 24);
      memory[f.effectAddresses.mesh + (index * 4 + group) * 8 + 3] = [0, 1, 2, 3, 0x81][(fixture + group) % 5];
    }
    put(memory.readUInt32LE(object + 0x194) + variant * 4, fixture % 6 << 24);
    const configuration = f.effectAddresses.groups + index * 16;
    for (const [offset, value] of [[0, 17], [2, (fixture * 73) & 65535], [8, 256], [10, 8192], [14, 3]]) word(configuration + offset, value);
  }
  //Fourth explicit placed-object input for four-controller dependency chains.
  memory.copy(memory, 0x253000, 0x250000, 0x250200);
  const extraVertices = a.sourceVertices + 0x3000, extraFaces = a.sourceFaces + 0x3000, vertexCount = memory.readUInt16LE(0x200004), faceCount = memory.readUInt16LE(0x200006);
  memory.copy(memory, extraVertices, a.sourceVertices, a.sourceVertices + vertexCount * 8); memory.copy(memory, extraFaces, a.sourceFaces, a.sourceFaces + faceCount * 8);
  put(0x253024, extraVertices); put(0x253028, extraFaces); put(0x253004, 0); put(0x25300c, 0); put(0x25319c, 0); registerRawBodySpatial(0x253000, {memory});
  const groups = 0x66000; put(pack + 0x60, groups); memory[pack + 0x46] = 4; for (let index = 0; index < 4; index++) memory[groups + index * 12 + 3] = 3;
  return {...f, destructionAddresses: a, allocate};
}

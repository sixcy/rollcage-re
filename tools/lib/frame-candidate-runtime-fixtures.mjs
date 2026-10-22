import {parseSpatialIndex} from '../../src/spatial-index.mjs';
import {createPhysicsRuntimeViews} from '../../src/physics-runtime-views.mjs';
import {unpackCollisionNormal} from '../../src/collision-grid.mjs';
import {boxCollision} from './model-query-fixtures.mjs';

export const frameCandidateAddresses = {bodies: [0x10000, 0x15000, 0x1a000, 0x1f000], list: 0x30000, records: 0x40000, arena: 0x60000, sectors: 0x80000, header: 0x80100, normals: 0x81000, vertices: 0x82000, packets: 0x84000, borders: 0x86000, regions: 0x87000, rows: 0x88000, map: 0x8a000, nodes: 0x8b000, links: 0x8c000};
const packedNormal = ([x, y, z]) => (((x & 1023) << 20) | ((y & 1023) << 10) | (z & 1023)) >>> 0;

//Declared coherent native storage, authored geometry/model forms and dynamic
//settings. This constructs fixture inputs, not the unported resource loader.
export function createConnectedFrameCandidateFixture(fixture = 0, {memory = Buffer.alloc(0xa00000)} = {}) {
  const a = frameCandidateAddresses;
  let seed = (0x4287f0ab ^ fixture) | 0;
  const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;}, put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p), vector = (p, v) => v.forEach((value, index) => put(p + index * 4, value));
  //Same authored packed spatial structures feed the actual parsed lookup and
  //the native relocated globals. Most rows share one explicit short map.
  const spatialBytes = Buffer.alloc(0x1600); spatialBytes.write('GFXM'); spatialBytes.writeUInt32LE(1, 0x10); spatialBytes.writeUInt32LE(3, 12); spatialBytes.writeUInt32LE(0x200, 0x68); spatialBytes.writeUInt32LE(0x400, 0x24); spatialBytes.writeUInt32LE(0x1500, 0x6c);
  for (let index = 0; index < 3; index++) {
    const bounds = (index * 3 << 22) | (3 << 19) | (32 << 13), reference = (index === 0 && fixture % 3 === 0 ? 0x80000000 : 0) | (index * 2 << 16);
    spatialBytes.writeUInt32LE(bounds >>> 0, 0x200 + index * 12); spatialBytes.writeUInt32LE(reference >>> 0, 0x204 + index * 12);
  }
  for (let row = 0; row < 256; row++) {const p = 0x400 + row * 16; spatialBytes.writeUInt16LE(126 | 129 << 8, p); spatialBytes.writeUInt16LE(255, p + 2); spatialBytes.writeUInt32LE(1, p + 12);}
  [0, 24, 0, 12].forEach((value, index) => spatialBytes.writeUInt16LE(value, 0x1500 + index * 2));
  if (fixture % 11 === 0) {spatialBytes.writeUInt16LE(255, 0x400 + 128 * 16); spatialBytes.writeUInt32LE(0, 0x400 + 128 * 16 + 12);}
  const spatial = parseSpatialIndex(spatialBytes);
  spatialBytes.copy(memory, a.nodes, 0x200, 0x224); spatialBytes.copy(memory, a.map, 0x1500, 0x1508);
  for (let row = 0; row < 256; row++) {spatialBytes.copy(memory, a.rows + row * 16, 0x400 + row * 16, 0x410 + row * 16); put(a.rows + row * 16 + 12, spatial.rows[row].firstIndex ? a.map : 0);}
  put(0x909254, a.rows); put(0x909278, a.nodes); put(0x9092bc, a.links);
  const columns = fixture % 17 === 0 ? 12 : 2 + fixture % 3, rows = fixture % 17 === 0 ? 12 : 2 + (fixture >>> 2) % 3, step = fixture % 17 === 0 ? 4 : 24;
  const normals = [[0, -256, 0], [0, -256, 0], [256, 0, 0], [-256, 0, 0], [16, -256, 0], [0, -256, 16]].map(value => ({packed: packedNormal(value), components: value}));
  const vertices = [];
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) vertices.push([column * step - (columns * step >> 1), fixture % 5 === 0 ? row - column : 0, row * step - (rows * step >> 1), 0]);
  const cells = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const top = row * (columns + 1) + column, form = (row + column + fixture) % 3, normal = fixture % 7 ? 0 : (row + column) % 5;
    vertices[top + columns + 2][3] = form === 0 ? 0 : form === 1 ? 2 : 6;
    cells.push({forms: form === 0 ? [{type: 0, normal, point: null}] : form === 1 ? [{type: 5, normal, point: top + 1}, {type: 4, normal: normal + 1, point: top + columns + 1}] : [{type: 2, normal, point: top}, {type: 3, normal: normal + 1, point: top + columns + 2}]});
    word(a.packets + (row * columns + column) * 8 + 2, normal);
  }
  const borders = Array.from({length: rows}, () => ({left: {type: 6, column: 0, normal: 2}, right: {type: 7, column: columns, normal: 3}}));
  const sector = {index: 0, columns, rows, vertices, cells, borders, flags: fixture % 3 === 0 ? 0 : 1, left: 0, right: columns};
  put(a.sectors, a.header); put(0x909240, a.sectors); put(0x90925c, a.normals); put(0x9092c0, a.regions); put(a.header + 4, sector.flags); put(a.header + 8, columns); put(a.header + 0x20, a.vertices); put(a.header + 0x38, a.borders); put(a.header + 0x50, a.packets); memory[a.header + 0x26] = 0; memory[a.header + 0x27] = 0;
  normals.forEach((normal, index) => put(a.normals + index * 4, normal.packed)); vertices.forEach((vertex, index) => vertex.forEach((value, axis) => word(a.vertices + index * 8 + axis * 2, value)));
  borders.forEach((border, row) => {word(a.borders + row * 4, border.left.normal); word(a.borders + row * 4 + 2, border.right.normal);});
  const regions = Array.from({length: 6}, (_, index) => ({index, sector: 0, row: 0, column: 0, rows, columns, padding: 120}));
  regions.forEach(region => {const p = a.regions + region.index * 6; word(p, 0); word(p + 2, region.index % 2 === 0 ? 1 << 9 : 0); word(p + 4, columns << 12 | rows << 8 | region.padding);});
  const grid = {available: true, sectors: [sector], normals, regions, zones: Array.from({length: 3}, (_, index) => ({root: index * 2, regions: [index * 2, index * 2 + 1]})), spatial};
  const instances = new Map(), objectFor = new Map(), candidateFor = new Map();
  for (let index = 0; index < 3; index++) {
    const collision = boxCollision({triangles: !!(fixture & 1), radius: 16 + index * 8}), model = 0x200000 + index * 0x5000, object = 0x250000 + index * 0x1000, shapeBase = model + 0x100, recordBase = model + 0x800, edgeBase = model + 0x1200, vertexBase = model + 0x1800, faceBase = model + 0x2000, config = object + 0x200;
    const edge = Buffer.alloc(8); edge.writeUInt32LE(packedNormal([256, 0, 0])); edge[4] = 1; edge[5] = 2; collision.edges = [{index: 0, raw: edge}];
    for (const faceCount of [1, 2, 0]) {const shape = {...collision.shapes[0], index: collision.shapes.length, slot: collision.shapes.length, faceCount, raw: Buffer.from(collision.shapes[0].raw)}; shape.raw.writeUInt32LE(shape.slot, 12); shape.raw.writeUInt32LE(faceCount << 16, 16); collision.shapes.push(shape);}
    const settings = {placementIndex: index, position: [index * 12 - 12, 0, index * 9 - 9], yaw: fixture % 8 === 0 ? 0 : (index * 73 + fixture * 11) & 255, class: fixture % 13 === 0 && index === 2 ? 5 : 0, configurations: collision.shapes.map(shape => {const type = fixture % 19 === 0 && shape.index === 1 ? 5 : 0; return {type, flags: type << 24};})};
    instances.set(index, {collision, settings}); objectFor.set(settings, {object, shapeBase});
    put(object + 0x10, model); put(object + 0x2c, faceBase); put(object + 0x194, config); memory[object + 0x199] = settings.yaw; memory[object + 0x19a] = settings.class; vector(object + 0x34, settings.position.map(value => value << 16)); settings.configurations.forEach((value, slot) => put(config + slot * 4, value.flags));
    memory[model + 0x27] = collision.shapes.length; word(model + 0x34, shapeBase - model); word(model + 0x38, recordBase - model); word(model + 0x3a, edgeBase - model); put(model + 0x40, vertexBase);
    collision.shapes.forEach((shape, slot) => {shape.raw.copy(memory, shapeBase + slot * 20); candidateFor.set(`${object}:${shapeBase + slot * 20}`, {collision, shape, settings});});
    collision.vertices.forEach((vertex, slot) => vertex.forEach((value, axis) => word(vertexBase + slot * 8 + axis * 2, value))); collision.faces.forEach((face, slot) => {Buffer.from(face.indices).copy(memory, faceBase + slot * 8); put(faceBase + slot * 8 + 4, face.packedNormal);}); collision.faceRecords.forEach(record => record.raw.copy(memory, recordBase + record.index * 9)); edge.copy(memory, edgeBase);
  }
  const links = {nodes: spatial.nodes.map((node, index) => ({placementIndices: [index % 3, (index + 1) % 3, (index + 2) % 3]}))};
  links.nodes.forEach((list, node) => list.placementIndices.forEach((placement, index) => put(a.links + (node * 3 + index + 1) * 4, objectFor.get(instances.get(placement).settings).object)));
  const models = {spatial, links, instances}, count = fixture % 5;
  put(0x902bc0, a.list); word(0x902bc4, count); put(0x91e79c, a.records); put(0x91e788, a.arena); put(0x5e8890, 0x36d4c921);
  memory.fill(0xa5, a.arena, a.arena + 2048 * 16);
  a.bodies.forEach((body, index) => {memory.fill(0x69, body, body + 0x4000); put(a.list + index * 4, body); const type = [3, 7, 17, 4][index]; put(body, type | (fixture % 23 === 0 && index === 3 ? 0x200 : 0)); put(body + 0x110, fixture % 29 === 0 && index === 2 ? 0x80000000 : 0); memory[body + 0x10c] = fixture % 31 === 0 ? 255 : 1; memory[body + 0x13f] = index * 3 + 2; memory[body + 0x140] = index * 3; memory[body + 0x141] = index * 3 + 1;
    const far = fixture % 7 === 1 && index === 0, outside = fixture % 9 === 0 && index === 1;
    vector(body + 0x34, [far ? 800 << 16 : index * 8 << 16, (-5 - index * 3) << 16, index * 7 << 16]); vector(body + 0x68, [random(8 * 65536) - 4 * 65536, (fixture % 4 ? 0 : 2 * 65536), random(8 * 65536) - 4 * 65536]);
    put(body + 12, a.nodes + (index % 3) * 12 | (outside ? 1 : 0)); put(body + 0x120, 0x7fffffff); put(body + 0x11c, 0x12345678); put(body + 0x128, 7);
    for (let slot = 0; slot < 3; slot++) put(a.records + (index * 3 + slot) * 72 + 0x40, (fixture % 17 === 0 ? 1024 : 24 + index * 4) * 256);
  });
  const byBucket = new Map(spatial.nodes.map((node, index) => [a.nodes + index * 12, node]));
  const bucketAt = address => ({...byBucket.get(address)});
  const candidateMapping = {terrainVerticesFor: sector => sector === 0 ? a.vertices : undefined, modelPointersFor: candidate => {const mapped = objectFor.get(candidate.settings); return mapped && {object: mapped.object, shape: mapped.shapeBase + candidate.shape.index * 20};}, modelForPointers: (object, shape) => candidateFor.get(`${object}:${shape}`)};
  const views = createPhysicsRuntimeViews({memory, bodyStorage: a.bodies.map(address => ({address, length: 0x4000})), bodyLists: [{address: a.list, capacity: 8}], bucketAt, candidateCapacity: 2048, candidateMapping});
  return {memory, views, grid, models, bucketAt, candidateMapping, nodeForAddress: address => byBucket.get(address), bodies: views.physicalGroup.bodies.slice(0, count), arena: views.candidateArena, count, addresses: a, options: {records: views.records, grid, models, arena: views.candidateArena}};
}

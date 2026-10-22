// Native, relocated geometry consumed by 4287f0 / 429360 / 424040.
// This is deliberately independent of installed BLP/BTP files. Counts come
// from captured headers or explicit allocation bounds; no pointer scanning.
import {nativeMemorySpan,nativeMemoryAddress} from '../../src/native-memory-spans.mjs';
import {unpackCollisionNormal} from '../../src/collision-grid.mjs';

// Admission ceilings only. Header counts/pointer ownership remain mandatory;
// these numbers never assert that an allocation or an uncaptured row exists.
export const nativeFrameGeometryLimits = Object.freeze({sectors: 256, sectorColumns: 65535, sectorRows: 65535, sectorVertices: 0x800000, nodes: 65536, normals: 65536, regions: 65536, modelLinks: 65535, models: 65536, shapes: 255, modelDeclaredVertices: 65535, vertexCount: 255, faceCount: 256, faceRecordCount: 286, edgeCount: 256});

function createComparisonLedger(memory) {
  const spans=new Map();
  function span(address,length) {
    const bytes=nativeMemorySpan(memory,address,length);
    if(length){const actual=nativeMemoryAddress(memory,bytes);if(actual===null)throw Error('Geometry comparison span lacks native ownership.');spans.set(actual,Math.max(length,spans.get(actual)??0));}
    return bytes;
  }
  function regions() {
    const merged=[];
    for(const[address,length]of[...spans].sort((a,b)=>a[0]-b[0])) {
      const last=merged.at(-1);
      if(last&&address<=last.address+last.length)last.length=Math.max(last.address+last.length,address+length)-last.address;
      else merged.push({address,length});
    }
    return Object.freeze(merged.map(row=>Object.freeze({id:`native-geometry-${row.address.toString(16)}`,...row,comparison:'mutable',evidence:'Captured native geometry span validated from loader/header/index fields or a reached geometry row; no inferred allocation.'})));
  }
  return {span,regions};
}

const numeric = key => typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key);
function liveArray(length, read) {
  return new Proxy(new Array(length), {get(target, key, receiver) {
    if (numeric(key)) {const index = Number(key); return index < length ? read(index) : undefined;}
    return Reflect.get(target, key, receiver);
  }, has(target, key) {return numeric(key) ? Number(key) < length : Reflect.has(target, key);}});
}
function fields(object, readers) {
  Object.defineProperties(object, Object.fromEntries(Object.entries(readers).map(([key, get]) => [key, {enumerable: true, get}])));
  return object;
}
function bounded(value, maximum, label) {
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw Error(`Explicit native geometry ${label} bound is required.`);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw Error(`Native geometry ${label} exceeds its explicit bound.`);
  return value;
}

// Sector-only binding also supports query captures lacking the complete grid.
// sectorCount must be observed, not inferred from candidate indices.
export function createNativeTerrainSectorViews({memory, sectorTable, sectorCount, bounds, onSpan}) {
  const span=(address,length)=>{const bytes=nativeMemorySpan(memory,address,length);onSpan?.(address,length);return bytes;};
  bounded(sectorCount, bounds?.sectors, 'sectors');
  span(sectorTable, sectorCount * 4);
  const sectors = Array.from({length: sectorCount}, (_, index) => {
    const address = memory.readUInt32LE(sectorTable + index * 4);
    span(address, 0x60);
    const columns = memory.readUInt32LE(address + 8), rows = memory.readUInt32LE(address + 12);
    bounded(columns, bounds.sectorColumns, 'sectorColumns'); bounded(rows, bounds.sectorRows, 'sectorRows');
    const count = bounded((columns + 1) * (rows + 1), bounds.sectorVertices, 'sectorVertices');
    const vertexAddress = memory.readUInt32LE(address + 0x20), packetAddress = memory.readUInt32LE(address + 0x50);
    span(vertexAddress, count * 8);
    const vertices = liveArray(count, vertex => [0,2,4,6].map(delta => memory.readInt16LE(vertexAddress + vertex * 8 + delta)));
    return fields({index, address, offset: address, columns, rows, vertexAddress, verticesOffset: vertexAddress, packetAddress, packetsOffset: packetAddress, vertices}, {
      flags: () => memory.readUInt32LE(address + 4), left: () => memory[address + 0x26], right: () => columns - memory[address + 0x27]
    });
  });
  return sectors;
}

function nativeSpatial(memory, pack, header, bounds, span) {
  const nodeCount = bounded(memory.readUInt32LE(header + 12), bounds.nodes, 'nodes');
  const nodeBase = memory.readUInt32LE(pack + 0x38), rowTable = memory.readUInt32LE(pack + 0x14);
  span(nodeBase, nodeCount * 12); span(rowTable, 4096);
  const nodes = Array.from({length: nodeCount}, (_, index) => {
    const address = nodeBase + index * 12;
    return fields({index, address, offset: address}, {
      boundsWord: () => memory.readUInt32LE(address), referenceWord: () => memory.readUInt32LE(address + 4), linksWord: () => memory.readUInt32LE(address + 8),
      zone: () => memory.readUInt32LE(address + 4) >>> 16 & 0x3fff,
      continues: () => !!(memory.readUInt32LE(address + 4) & 0x80000000), heightThreshold: () => memory.readUInt32LE(address) >>> 13 & 63
    });
  });
  function nodeForAddress(address) {
    const index = (address - nodeBase) / 12;
    if (!Number.isInteger(index) || index < 0 || index >= nodes.length) throw Error('Native spatial pointer is outside its declared node array.');
    return nodes[index];
  }
  const rows = Array.from({length: 256}, (_, index) => {
    const offset = rowTable + index * 16, mapPointer = memory.readUInt32LE(offset + 12), ranges = [];
    let cells = 0, sentinel = false;
    for (let i = 0; i < 6; i++) {
      const word = memory.readUInt16LE(offset + i * 2); if (word === 255) {sentinel = true; break;}
      const start = word & 255, end = word >>> 8;
      if (end < start || (ranges.length && start <= ranges.at(-1).end)) throw Error('Native spatial row has invalid spans.');
      ranges.push({start, end, cellStart: cells}); cells += end - start + 1;
    }
    if (ranges.length) {
      if (!mapPointer) throw Error('Native spatial row lacks its relocated map.');
      span(mapPointer, (cells + (sentinel ? 0 : 1)) * 2);
    }
    return {index, offset, mapPointer, ranges, cells, sentinel};
  });
  const nodeAtMap = pointer => nodeForAddress(nodeBase + memory.readUInt16LE(pointer));
  for (const row of rows) for (let i = 0; i < row.cells + (row.ranges.length && !row.sentinel ? 1 : 0); i++) nodeAtMap(row.mapPointer + i * 2);
  for (const node of nodes) if (node.continues && node.index + 1 === nodes.length) throw Error('Native spatial height chain exceeds node array.');
  function direct(x, z) {
    const row = rows[z];
    for (const range of row.ranges) {if (x < range.start) return null; if (x <= range.end) return {pointer: row.mapPointer + (range.cellStart + x - range.start) * 2, row: z, column: x};}
    return row.ranges.length && !row.sentinel ? {pointer: row.mapPointer + row.cells * 2, row: z, column: x} : null;
  }
  function fallback(x, z) {
    let distance = 255, best = null;
    for (let attempt = 1; attempt <= 510; attempt++) {
      const delta = attempt >> 1, index = attempt & 1 ? z + delta : z - delta;
      if (index >= 0 && index < 256) for (const range of rows[index].ranges) {
        const select = column => ({pointer: rows[index].mapPointer + (range.cellStart + column - range.start) * 2, row: index, column});
        if (x >= range.start && x <= range.end) return select(x);
        for (const column of [range.start, range.end]) if (Math.abs(column - x) < distance) {distance = Math.abs(column - x); best = select(column); if (distance === 1) return best;}
      }
      if (distance * 2 <= attempt + 1) return best;
    }
    return best;
  }
  function lookup(position) {
    if (!Array.isArray(position) || position.length !== 3 || position.some(v => !Number.isInteger(v) || v < -2147483648 || v > 2147483647)) throw Error('Native spatial position requires three signed Q16 integers.');
    const bins = [(position[0] >> 24) + 128, ((position[1] >> 24) + 32) & 65535, (position[2] >> 24) + 128];
    let selected = direct(bins[0], bins[2]), outside = false;
    if (!selected) {outside = true; selected = fallback(bins[0], bins[2]);}
    if (!selected) return {found: false, outside, bins, reason: 'no_populated_cell'};
    let node = nodeAtMap(selected.pointer), layers = 0;
    while (node.continues && bins[1] <= nodes[node.index + 1].heightThreshold) {node = nodes[node.index + 1]; layers++;}
    return {found: true, outside, bins, selected: {row: selected.row, column: selected.column, mapPointer: selected.pointer}, node, layers};
  }
  return {spatial: {available: true, nodeCount, nodeBase, rowTable, nodes, rows, lookup}, nodeForAddress};
}

function nativeModel(memory, object, bounds, span) {
  span(object, 0x1b4);
  const model = memory.readUInt32LE(object + 0x10), faceBase = memory.readUInt32LE(object + 0x2c);
  span(model, 0x50);
  // These default ceilings are source index domains, NOT allocation claims:
  // faces/edges/vertices use bytes; faceStart is a byte plus at most31 rows.
  // Every reachable row is still admitted by an exact captured-span read.
  const allocation = bounds.modelBoundsFor?.({object, model, faceBase}) ?? {vertexCount: 255, faceCount: 256, faceRecordCount: 286, edgeCount: 256};
  for (const key of ['vertexCount','faceCount','faceRecordCount','edgeCount']) bounded(allocation[key], bounds[key] ?? ({vertexCount:255,faceCount:256,faceRecordCount:286,edgeCount:256})[key], key);
  const count = bounded(memory[model + 0x27], bounds.shapes, 'shapes'), shapeBase = model + memory.readUInt16LE(model + 0x34), faceRecordBase = model + memory.readUInt16LE(model + 0x38), edgeBase = model + memory.readUInt16LE(model + 0x3a), vertexBase = memory.readUInt32LE(model + 0x40), configurationBase = memory.readUInt32LE(object + 0x194);
  if (count) {span(shapeBase, count * 20); span(configurationBase, count * 4);}
  //421f60 copies exactly model WORD+4 eight-byte vertices (object+24 render
  //array); the relocated model+40 is the original primary vertex allocation.
  //Capture this declared extent independently from byte-index collision rows.
  const declaredVertices=bounded(memory.readUInt16LE(model+4),bounds.modelDeclaredVertices??65535,'modelDeclaredVertices');
  if(declaredVertices) {
    span(vertexBase,declaredVertices*8);
    const renderVertices=memory.readUInt32LE(object+0x24);
    if(renderVertices)span(renderVertices,declaredVertices*8);
  }
  const vertices = liveArray(allocation.vertexCount, index => {const row = span(vertexBase + index * 8, 8); return [0,2,4,6].map(delta => row.readInt16LE(delta));});
  const faces = new Array(allocation.faceCount), records = new Map(), edges = new Map();
  const checkedVertex = value => {if (!value || value > allocation.vertexCount) throw Error('Native model references an out-of-bounds vertex.'); vertices[value - 1]; return value;};
  function face(index) {
    if (index >= allocation.faceCount) throw Error('Native model references an out-of-bounds face.');
    if (!faces[index]) {
      const address = faceBase + index * 8; span(address, 8);
      const indices = [...span(address, 4)]; indices.slice(0, indices[3] ? 4 : 3).forEach(checkedVertex);
      faces[index] = fields({index, offset: address}, {indices: () => [...span(address, 4)], triangle: () => memory[address + 3] === 0, packedNormal: () => memory.readUInt32LE(address + 4), normalQ8: () => unpackCollisionNormal(memory.readUInt32LE(address + 4))});
    }
    return faces[index];
  }
  function edge(index) {
    if (index >= allocation.edgeCount) throw Error('Native model references an out-of-bounds edge.');
    if (!edges.has(index)) {
      const address = edgeBase + index * 8, raw = span(address, 8); checkedVertex(raw[4]); checkedVertex(raw[5]);
      edges.set(index, fields({index, offset: address, raw}, {indices: () => [memory[address + 4], memory[address + 5]], packedNormal: () => memory.readUInt32LE(address), normalQ8: () => unpackCollisionNormal(memory.readUInt32LE(address))}));
    }
  }
  const shapes = Array.from({length: count}, (_, index) => {
    const offset = shapeBase + index * 20, raw = span(offset, 20), control = raw.readUInt32LE(16), faceCount = control >>> 16 & 31, faceStart = control & 255, shapeRecords = [];
    for (let i = 0; i < (faceCount < 2 ? 0 : faceCount === 2 ? 1 : faceCount); i++) {
      const recordIndex = faceStart + i;
      if (recordIndex >= allocation.faceRecordCount) throw Error('Native model references an out-of-bounds face record.');
      const address = faceRecordBase + recordIndex * 9, recordRaw = span(address, 9); shapeRecords.push(recordIndex);
      if (faceCount === 2) {edge(recordRaw[0]); records.set(recordIndex, {...records.get(recordIndex), index: recordIndex, offset: address, edgeIndex: recordRaw[0], raw: recordRaw});}
      else {const faceIndex = recordRaw[8], polygon = face(faceIndex), edgeIndices = [...recordRaw.subarray(0, polygon.triangle ? 3 : 4)]; edgeIndices.forEach(edge); records.set(recordIndex, {...records.get(recordIndex), index: recordIndex, offset: address, faceIndex, edgeIndices, raw: recordRaw});}
    }
    return fields({index, offset, nativeAddress: offset, raw, control, faceStart, faceCount, records: shapeRecords, kind: faceCount === 0 ? 'disabled' : faceCount === 1 ? 'point' : faceCount === 2 ? 'edge' : 'polyhedron'}, {center: () => [0,2,4].map(delta => raw.readInt16LE(delta)), slot: () => raw.readUInt32LE(12) & 15});
  });
  const collision = {available: !!count, modelAddress: model, shapeBase, faceRecordBase, edgeBase, faceBase, shapes, faces, faceRecords: [...records.values()], edges: [...edges.values()], vertices};
  const configurations = Array.from({length: count}, (_, index) => fields({index, offset: configurationBase + index * 4, raw: span(configurationBase + index * 4, 4)}, {type: () => memory[configurationBase + index * 4 + 3] & 15, flags: () => memory.readUInt32LE(configurationBase + index * 4)}));
  const settings = fields({objectAddress: object, configurationBase, configurations}, {placementIndex: () => memory.readUInt16LE(object + 0x192), stateByte198: () => memory[object + 0x198], class: () => memory[object + 0x19a], yaw: () => memory[object + 0x199], position: () => [0,4,8].map(delta => memory.readInt32LE(object + 0x34 + delta) >> 16)});
  return {collision, settings};
}

export function createNativeFrameGeometry({memory, bounds = nativeFrameGeometryLimits, packAddress = memory?.readUInt32LE(0x90b98c), headerAddress = memory?.readUInt32LE(0x90b990)} = {}) {
  if (!Buffer.isBuffer(memory) || !bounds) throw Error('Native geometry requires captured memory and explicit bounds.');
  const ledger=createComparisonLedger(memory),span=ledger.span;
  span(packAddress, 0xa0); span(headerAddress, 0x120);
  const {spatial, nodeForAddress} = nativeSpatial(memory, packAddress, headerAddress, bounds, span);
  const sectors = createNativeTerrainSectorViews({memory, sectorTable: memory.readUInt32LE(packAddress), sectorCount: memory.readUInt32LE(packAddress + 0x10), bounds, onSpan:span});
  const normalBase = memory.readUInt32LE(packAddress + 0x1c), normalCount = bounded(memory.readUInt32LE(packAddress + 0x20), bounds.normals, 'normals');
  span(normalBase, normalCount * 4);
  const normals = liveArray(normalCount, index => {const packed = memory.readUInt32LE(normalBase + index * 4); return {packed, components: unpackCollisionNormal(packed)};});
  const zoneBase = memory.readUInt32LE(packAddress + 0x80), regions = new Map(), zones = [];
  for (const root of new Set(spatial.nodes.map(node => node.zone))) {
    bounded(root, bounds.regions - 1, 'zone root');
    const count = (memory.readUInt16LE(zoneBase + root * 6 + 2) >>> 9) + 1, indices = [];
    bounded(root + count, bounds.regions, 'regions'); span(zoneBase + root * 6, count * 6);
    for (let index = root; index < root + count; index++) {
      const offset = zoneBase + index * 6, a = memory.readUInt16LE(offset), b = memory.readUInt16LE(offset + 2), c = memory.readUInt16LE(offset + 4);
      const region = {index, offset, sector: b & 127, row: a & 1023, column: a >>> 10, rows: c >>> 8 & 15, columns: c >>> 12, padding: c & 255, control: b}, sector = sectors[region.sector];
      if (!sector || region.row + region.rows > sector.rows || region.column + region.columns > sector.columns) throw Error('Native collision region exceeds its sector.');
      regions.set(index, region); indices.push(index);
    }
    zones.push({root, regions: indices});
  }
  const checkNormal = index => {if (index >= normalCount) throw Error('Native terrain normal exceeds captured table.'); return index;};
  for (const sector of sectors) {
    span(sector.packetAddress, sector.columns * sector.rows * 8);
    sector.cells = liveArray(sector.columns * sector.rows, index => {
      const row = Math.floor(index / sector.columns), column = index % sector.columns, top = row * (sector.columns + 1) + column, vertexFlags = sector.vertices[top + sector.columns + 2][3], rawNormalIndex = memory.readUInt16LE(sector.packetAddress + index * 8 + 2);
      const covered = [...regions.values()].some(r => r.sector === sector.index && row >= r.row && row < r.row + r.rows && column >= r.column && column < r.column + r.columns);
      const normal = covered ? checkNormal(rawNormalIndex) : rawNormalIndex;
      const forms = !covered ? [] : !(vertexFlags & 2) ? [{type: 0, normal, point: null}] : vertexFlags & 4 ? [{type: 2, normal, point: top}, {type: 3, normal: checkNormal(normal + 1), point: top + sector.columns + 2}] : [{type: 5, normal, point: top + 1}, {type: 4, normal: checkNormal(normal + 1), point: top + sector.columns + 1}];
      return {index, row, column, vertexFlags, rawNormalIndex, covered, forms};
    });
    sector.borders = [];
    if (!(sector.flags & 1)) {
      if (sector.left > sector.columns || sector.right < sector.left) throw Error('Native terrain border columns are invalid.');
      const borderBase = memory.readUInt32LE(sector.address + 0x38); span(borderBase, sector.rows * 4);
      sector.borders = liveArray(sector.rows, row => Object.fromEntries([['left',6,sector.left,0],['right',7,sector.right,2]].map(([side,type,column,delta]) => {
        const rawNormalIndex = memory.readUInt16LE(borderBase + row * 4 + delta), covered = [...regions.values()].some(r => r.sector === sector.index && row >= r.row && row < r.row + r.rows && (side === 'left' ? r.column === column : r.column + r.columns === column));
        return [side, {type, column, covered, rawNormalIndex, normal: covered && rawNormalIndex !== 65535 ? checkNormal(rawNormalIndex) : null}];
      })));
    }
  }
  const linkBase = memory.readUInt32LE(packAddress + 0x7c), linkCount = bounded(memory.readUInt16LE(headerAddress + 0x96), bounds.modelLinks, 'modelLinks');
  if (linkCount) span(linkBase, linkCount * 4);
  const instances = new Map(), byShape = new Map(), links = {available: true, table: linkBase, count: linkCount, nodes: spatial.nodes.map(node => {
    const length = node.boundsWord >>> 19 & 7, start = node.boundsWord >>> 22, placementIndices = [];
    if (length && start + length >= linkCount) throw Error('Native model links exceed captured table.');
    for (let i = 1; i <= length; i++) {
      const object = memory.readUInt32LE(linkBase + (start + i) * 4); if (!object) throw Error('Native model link has a null object pointer.');
      if (!instances.has(object)) {
        bounded(instances.size + 1, bounds.models, 'models');
        const instance = nativeModel(memory, object, bounds, span); instances.set(object, instance);
        for (const shape of instance.collision.shapes) byShape.set(`${object}:${shape.nativeAddress}`, {...instance, shape});
      }
      placementIndices.push(object);
    }
    return {node: node.index, start, placementIndices};
  })};
  const candidateMapping = {
    terrainVerticesFor: index => {if (!sectors[index]) throw Error('Native candidate sector is unavailable.'); return sectors[index].vertexAddress;},
    modelPointersFor: candidate => {
      const object = candidate.settings.objectAddress, known = byShape.get(`${object}:${candidate.shape.nativeAddress}`);
      if (!known || known.collision !== candidate.collision || known.settings !== candidate.settings || known.shape !== candidate.shape) throw Error('Native candidate has no exact object/shape binding.');
      return {object, shape: candidate.shape.nativeAddress};
    },
    modelForPointers: (object, shape) => {const known = byShape.get(`${object}:${shape}`); if (!known) throw Error('Native model candidate pointers are not a captured linked object/shape pair.'); return known;}
  };
  const grid = {available: true, spatial, scene: {segments: sectors}, sectors, normals, normalBase, normalCount, zoneBase, zones, regions: [...regions.values()].sort((a,b) => a.index - b.index)};
  return fields({grid, modelContext: {spatial, links, instances}, candidateMapping, nodeForAddress}, {comparisonRegions:ledger.regions});
}

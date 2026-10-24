// Bounded494c80/494f60 composition. This does not create camera/controller
// handles or alter91ce90: those belong to416180/4180a0 and41a170.
import {nativeGlobalAddress} from './native-global-address.mjs';
import {initializeTrackDeformation, updateTrackDeformation} from './track-deformation.mjs';
import {nativeMemorySpan} from './native-memory-spans.mjs';
import {createRawTerrainGrid} from './raw-terrain-query.mjs';

export function initializeSoloTerrainRuntime(runtime) {
  const {memory} = runtime ?? {};
  if (!Buffer.isBuffer(memory)) throw Error('Solo terrain requires shared native memory.');
  const u32 = address => nativeMemorySpan(memory, address, 4).readUInt32LE();
  const u16 = address => nativeMemorySpan(memory, address, 2).readUInt16LE();
  const s16 = address => nativeMemorySpan(memory, address, 2).readInt16LE();
  const count = () => {
    const value = u32(u32(0x90b98c) + 16);
    if (value > 256) throw Error('Solo terrain sector count exceeds the native sector-byte domain.');
    return value;
  };
  const sectorAt = index => {
    if (!Number.isInteger(index) || index < 0 || index >= count()) throw Error('Solo terrain sector index exceeds the loaded pack.');
    const sector = u32(u32(u32(0x90b98c)) + index * 4);
    nativeMemorySpan(memory, sector, 0x60);
    return sector;
  };
  const geometryFor = index => {
    const sector = sectorAt(index), columns = u32(sector + 8), rows = u32(sector + 12);
    const vertexCount = (columns + 1) * (rows + 1), address = u32(sector + 32);
    if (!Number.isSafeInteger(vertexCount) || vertexCount > 0x800000) throw Error('Solo terrain vertices exceed the explicit geometry admission bound.');
    nativeMemorySpan(memory, address, vertexCount * 8);
    return {index, columns, rows, vertexCount, address};
  };
  // Validate real authored spans before the constructor mutates vertices. The
  // caller already owns relocation, palette/yaw/math bytes and CRT allocation.
  for (let index = 0; index < count(); index++) geometryFor(index);
  initializeTrackDeformation(runtime);

  //41c6c0 selects surface mode from the live packed vertex flag/material
  //word, not the original archive copy retained for ordinary asset decoding.
  const surfaceModeFor = vehicle => {
    const cell = vehicle?.registeredCellRef;
    if (!Number.isInteger(cell)) throw Error('Solo terrain surface mode requires a native registered cell.');
    if ((cell >>> 0) === 0xffffffff) return 0;
    const index = cell & 255, row = cell >> 16, column = cell << 16 >> 24, geometry = geometryFor(index);
    if (row < 0 || row > geometry.rows || column < 0 || column > geometry.columns) throw Error('Solo terrain surface vertex exceeds the loaded grid.');
    const code = u32(geometry.address + (row * (geometry.columns + 1) + column) * 8 + 4) >>> 22;
    return code >= u16(0x90929c) && code < 0x3f0 ? code < 0x3d0 ? 1 : 2 : 0;
  };

  const bindCollisionGrid = grid => {
    if (!Array.isArray(grid?.sectors) || grid.sectors.length !== count()) throw Error('Solo terrain collision grid must describe the loaded sectors.');
    const raw = createRawTerrainGrid(grid, index => geometryFor(index).address, {memory});
    const normal = index => {
      if (!Number.isInteger(index) || index < 0 || !grid.normals?.[index]) throw Error('Solo terrain cell normal exceeds the loaded normal table.');
      return index;
    };
    const sectors = raw.sectors.map(sector => {
      const geometry = geometryFor(sector.index);
      if (sector.columns !== geometry.columns || sector.rows !== geometry.rows || sector.cells.length !== geometry.columns * geometry.rows) throw Error('Solo terrain collision topology differs from the loaded sector.');
      const cells = sector.cells.map((cell, index) => {
        const row = Math.floor(index / sector.columns), column = index % sector.columns, top = row * (sector.columns + 1) + column;
        const flags = () => u16(geometryFor(sector.index).address + (top + sector.columns + 2) * 8 + 6);
        const normalIndex = () => u16(u32(sectorAt(sector.index) + 0x50) + index * 8 + 2);
        return Object.defineProperties({...cell}, {
          vertexFlags: {enumerable: true, get: flags},
          rawNormalIndex: {enumerable: true, get: normalIndex},
          forms: {enumerable: true, get: () => {
            if (!cell.covered) return [];
            const plane = normal(normalIndex()), vertexFlags = flags(), tl = top, tr = top + 1, bl = top + sector.columns + 1, br = bl + 1;
            if (!(vertexFlags & 2)) return [{type: 0, normal: plane, point: null, indices: [tl, tr, br, bl]}];
            if (vertexFlags & 4) return [{type: 2, normal: plane, point: tl, indices: [tl, tr, bl]}, {type: 3, normal: normal(plane + 1), point: br, indices: [tr, br, bl]}];
            return [{type: 5, normal: plane, point: tr, indices: [tl, tr, br]}, {type: 4, normal: normal(plane + 1), point: bl, indices: [tl, br, bl]}];
          }}
        });
      });
      sector.cells = cells;
      return sector;
    });
    return {...raw, sectors};
  };

  return Object.freeze({
    step() {updateTrackDeformation(runtime);},
    bindCollisionGrid,
    surfaceModeFor,
    terrainVerticesFor(index) {return geometryFor(index).address;},
    get snapshot() {
      const rowCount = u32(nativeGlobalAddress(memory, 0x80df00)), base = u32(nativeGlobalAddress(memory, 0x80df04));
      if (rowCount > count()) throw Error('Solo terrain row count exceeds the constructed sector count.');
      nativeMemorySpan(memory, base, rowCount * 28);
      const rows = [], segments = [], seen = new Set();
      for (let index = 0; index < rowCount; index++) {
        const address = base + index * 28, sector = u16(address), geometry = geometryFor(sector);
        rows.push(Object.freeze({address, sector, phase: u16(address + 2), width: u16(address + 4), height: u16(address + 6)}));
        if (!seen.has(sector)) {
          seen.add(sector);
          const vertices = Array.from({length: geometry.vertexCount}, (_, vertex) => {
            const p = geometry.address + vertex * 8;
            return Object.freeze([s16(p), s16(p + 2), s16(p + 4), u16(p + 6)]);
          });
          segments.push(Object.freeze({index: sector, columns: geometry.columns, rows: geometry.rows, vertices: Object.freeze(vertices)}));
        }
      }
      return Object.freeze({animationUnconditional: Boolean(nativeMemorySpan(memory, nativeGlobalAddress(memory, 0x91ce90), 1)[0] & 2),
        rows: Object.freeze(rows), segments: Object.freeze(segments)});
    }
  });
}

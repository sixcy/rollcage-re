import {add32, subtract32, signedShort} from './fixed-integer.mjs';
import {unpackCollisionNormal} from './collision-grid.mjs';
import {acceptsCollisionPlane} from './terrain-candidates.mjs';

const dot32 = (a, b) => a.reduce((sum, value, i) => add32(sum, Math.imul(value, b[i])), 0);
const cellId = (sector, row, column) => ((sector & 255) | ((column & 255) << 8) | ((row & 65535) << 16)) >>> 0;
const decodeId = id => ({sector: id & 255, row: id >>> 16, column: (id >>> 8) & 255});

function vertexMetric(vertex, center) {
  const delta = vertex.slice(0, 3).map((value, i) => subtract32(value, center[i]));
  const metric = dot32(delta, delta) >> 6;
  return metric & 0xffff0000 ? 65535 : metric;
}

function cornerPruned(sector, top, corner, center) {
  const x = corner & 1, y = corner >> 1, vertex = sector.vertices[top + x + y * (sector.columns + 1)];
  const relative = center.map((value, i) => subtract32(value, vertex[i]));
  const first = ((y - 1) & 1) + (x ? sector.columns + 1 : 0);
  const second = y + (x ? 0 : sector.columns + 1);
  const edge = index => sector.vertices[top + index].slice(0, 3).map((value, i) => subtract32(value, vertex[i]));
  return dot32(edge(first), relative) < 0 && dot32(edge(second), relative) < 0;
}

// FUN_0047d9c0. This uses retained slots, not a freshly initialized list:
// byte 0's high nibble and byte 2 survive every write. Only the final count is
// truncated to u16. In particular this variant has no ordinary builder's 64 cap.
// scratch supplies the otherwise uninitialized nearest local
// for a zero-dimensional region; values are required only if consumed.
export function appendRespawnRegionCandidates(grid, region, query, centerS16, radiusSquared, state) {
  if (!Number.isInteger(state.count) || state.count < 0 || state.count > 65535) {
    throw Error('Respawn candidate count must be an unsigned 16-bit integer.');
  }
  const sector = grid.sectors[region.sector], center = centerS16.map(signedShort);
  const previousCount = state.count, previous = state.candidates.slice(0, previousCount);
  const threshold = add32(Math.imul(region.padding, region.padding), radiusSquared) >> 6;
  let count = previousCount, closestMetric = 0x7fffffff, closestId;
  let lastAccepted = false;
  const metrics = Array.from({length: region.rows + 1}, (_, r) =>
    Array.from({length: region.columns + 1}, (_, c) =>
      vertexMetric(sector.vertices[(region.row + r) * (sector.columns + 1) + region.column + c], center)));
  const write = (row, column, type, planeNormalIndex, packedNormal, vertexBase, pointOffset) => {
    let slot = state.candidates[count];
    if (!slot && state.createSlot) state.candidates[count] = slot = state.createSlot(count);
    if (!slot || !Number.isInteger(slot.flagsByte0) || !Number.isInteger(slot.byte2)) {
      throw Error(`Respawn candidate slot ${count} requires retained flagsByte0 and byte2.`);
    }
    const flagsByte0 = (slot.flagsByte0 & 0xf0) | (type & 15);
    Object.assign(slot, {
      flagsByte0, type: type & 15, id: cellId(sector.index, row, column),
      sector: sector.index, row, column, columns: sector.columns & 255,
      planeNormalIndex, normalIndex: planeNormalIndex, packedNormal: packedNormal >>> 0,
      normalQ8: unpackCollisionNormal(packedNormal), vertexBase, pointOffset: pointOffset & 255,
    });
    count++;
  };

  for (let r = 0; r < region.rows; r++) {
    let lastPacked = 0xffffffff;
    for (let c = 0; c < region.columns; c++) {
      const row = region.row + r, column = region.column + c;
      const top = row * (sector.columns + 1) + column;
      const distances = [metrics[r][c], metrics[r][c + 1], metrics[r + 1][c], metrics[r + 1][c + 1]];
      let nearest = 0;
      for (let i = 1; i < 4; i++) if (distances[i] < distances[nearest]) nearest = i;
      const metric = distances[nearest];
      if (metric < closestMetric) {
        closestMetric = metric;
        closestId = cellId(sector.index, row + (nearest >> 1), column + (nearest & 1));
      }
      if (metric > threshold) continue;
      for (const form of sector.cells[row * sector.columns + column].forms) {
        const packed = grid.normals[form.normal].packed;
        if (packed !== lastPacked) {
          lastAccepted = acceptsCollisionPlane(query, packed, sector.vertices[form.point ?? top], 0x80000000);
        }
        lastPacked = packed;
        if (!lastAccepted) continue;
        const id = cellId(sector.index, row, column);
        if (previousCount && previous.some(entry => entry.id === id && ((entry.flagsByte0 ?? entry.type) & 15) === form.type)) continue;
        if (metric > (radiusSquared >> 6) && cornerPruned(sector, top, nearest, center)) continue;
        const pointOffset = form.point === null ? (nearest & 1) + (nearest >> 1) * (sector.columns + 1) : form.point - top;
        write(row, column, form.type, form.normal, packed, top, pointOffset);
      }
    }
  }
  if (!(sector.flags & 1)) for (const side of ['left', 'right']) {
    if (side === 'left' ? region.column !== 0 : region.column + region.columns !== sector.columns) continue;
    for (let row = region.row; row < region.row + region.rows; row++) {
      const border = sector.borders[row][side];
      if (border.normal === null) continue;
      const column = side === 'left' ? 0 : sector.columns;
      const vertexBase = (row + (side === 'left' ? 1 : 0)) * (sector.columns + 1) + column;
      const point = sector.vertices[vertexBase], difference = subtract32(center[1], point[1]);
      if (difference > 0 && (Math.imul(difference, difference) >> 6) > threshold) continue;
      if (!acceptsCollisionPlane(query, grid.normals[border.normal].packed, point, 0x80000000)) continue;
      const packedNormal = grid.normals[border.normal].packed;
      write(row, column, side === 'left' ? 6 : 7, border.normal, packedNormal, vertexBase, 0);
    }
  }
  state.count = count & 65535;
  const distanceSquared = closestMetric << 6;
  if (distanceSquared < state.closestDistanceSquared) {
    const id = closestId ?? state.scratch?.nearestId;
    if (!Number.isInteger(id)) throw Error('Empty respawn region requires its uninitialized nearestId when selected.');
    state.closestId = id >>> 0;
    state.closest = decodeId(id);
    state.closestDistanceSquared = distanceSquared;
  }
  return state;
}

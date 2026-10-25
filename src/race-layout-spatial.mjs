// Editor-side geometry and route-map maintenance. These algorithms are not a
// reconstruction of the original authoring tool. The serialized consumers are
// native 48da10 (first route word) and 429360 (following model words).
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const sub = (a, b) => a.map((n, i) => n - b[i]);
const add = (a, b, scale) => a.map((n, i) => n + b[i] * scale);
const squared = (a, b) => dot(sub(a, b), sub(a, b));
const same = (a, b) => a.every((n, i) => n === b[i]);

function closestSegment(point, a, b) {
  const d = sub(b, a), length = dot(d, d), t = length ? Math.max(0, Math.min(1, dot(sub(point, a), d) / length)) : 0;
  return add(a, d, t);
}

function closestTriangle(point, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(point, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(point, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, ab, d1 / (d1 - d3));
  const cp = sub(point, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const sum = va + vb + vc;
  if (!sum) return [closestSegment(point, a, b), closestSegment(point, b, c), closestSegment(point, c, a)].sort((p, q) => squared(point, p) - squared(point, q))[0];
  return add(add(a, ab, vb / sum), ac, vc / sum);
}

export function findRaceLayoutTerrainSupport(info, position, lookup = info.spatial.lookup(position.map(n => n * 65536))) {
  if (!info.grid.available || !lookup.found || lookup.outside) return null;
  info.supportCells ??= new Map();
  let cells = info.supportCells.get(lookup.node.zone);
  if (!cells) {
    const zone = info.grid.zones.find(z => z.root === lookup.node.zone), ids = new Set(); cells = [];
    for (const id of zone?.regions ?? []) {
      const region = info.grid.regions.find(r => r.index === id), sector = info.grid.sectors[region.sector];
      for (let row = region.row; row < region.row + region.rows; row++) for (let column = region.column; column < region.column + region.columns; column++) {
        const index = row * sector.columns + column, key = `${sector.index}:${index}`; if (ids.has(key)) continue; ids.add(key);
        const face = info.scene.segments[sector.index].faces[index];
        if (sector.cells[index].covered) cells.push({sector: sector.index, cell: index, face, vertices: sector.vertices});
      }
    }
    info.supportCells.set(lookup.node.zone, cells);
  }
  let best = null;
  for (const cell of cells) {
    const [tl, tr, bl, br] = cell.face.gridIndices.map(i => cell.vertices[i].slice(0, 3));
    const triangles = cell.face.vertexFlags & 4 ? [[tl, tr, bl], [tr, br, bl]] : [[tl, tr, br], [tl, br, bl]];
    for (const triangle of triangles) {
      const point = closestTriangle(position, ...triangle), distanceSquared = squared(position, point);
      if (!best || distanceSquared < best.distanceSquared) best = {sector: cell.sector, cell: cell.cell, point, distanceSquared};
    }
  }
  return best;
}

export function findRaceLayoutCheckpointSector(info, originalSector, position, direction) {
  if (!info.grid.available) return null;
  info.checkpointPlanes ??= new Map();
  const cacheKey = `${originalSector}:${position.join(',')}:${direction.join(',')}`;
  if (info.checkpointPlanes.has(cacheKey)) return info.checkpointPlanes.get(cacheKey);
  const retain = result => {info.checkpointPlanes.set(cacheKey, result); if (info.checkpointPlanes.size > 128) info.checkpointPlanes.delete(info.checkpointPlanes.keys().next().value); return result;};
  const projection = vertex => direction.reduce((sum, n, axis) => (sum + (Math.imul(n, vertex[axis] - position[axis]) >> 6)) | 0, 0);
  const inSector = sector => {
    let best = null; const segments = [];
    for (const cell of sector.cells) {
      if (!cell.covered) continue;
      const face = info.scene.segments[sector.index].faces[cell.index], [tl, tr, bl, br] = face.gridIndices.map(i => sector.vertices[i].slice(0, 3));
      const triangles = face.vertexFlags & 4 ? [[tl, tr, bl], [tr, br, bl]] : [[tl, tr, br], [tl, br, bl]];
      for (const triangle of triangles) {
        const values = triangle.map(projection); if (Math.min(...values) > 0 || Math.max(...values) < 0) continue;
        const points = [];
        for (let i = 0; i < 3; i++) {
          const next = (i + 1) % 3, a = values[i], b = values[next];
          if (!a) points.push(triangle[i]);
          if (a < 0 && b > 0 || a > 0 && b < 0) points.push(add(triangle[i], sub(triangle[next], triangle[i]), a / (a - b)));
        }
        const candidates = values.every(n => n === 0) ? [closestTriangle(position, ...triangle)] : points.length === 1 ? points
          : points.flatMap((a, i) => points.slice(i + 1).map(b => closestSegment(position, a, b)));
        if (values.every(n => n === 0)) for (let i = 0; i < 3; i++) segments.push([triangle[i], triangle[(i + 1) % 3]]);
        else if (points.length === 1) segments.push([points[0], points[0]]);
        else if (points.length > 1) {
          let ends = [points[0], points[1]], length = squared(...ends);
          for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) if (squared(points[i], points[j]) > length) {ends = [points[i], points[j]]; length = squared(...ends);}
          segments.push(ends);
        }
        for (const point of candidates) {
          const distanceSquared = squared(position, point);
          if (!best || distanceSquared < best.distanceSquared) best = {sector: sector.index, cell: cell.index, point, distanceSquared};
        }
      }
    }
    return best ? {...best, segments} : null;
  };
  // 449d40 uses an infinite plane. The anchor can lie outside populated road
  // cells. Preserve its authored sector whenever that plane still cuts covered
  // terrain there, instead of treating the anchor as a point to snap to ground.
  const original = info.grid.sectors[originalSector]; if (original) {const found = inSector(original); if (found) return retain(found);}
  let best = null;
  for (const sector of info.grid.sectors) {
    if (sector.index === originalSector || sector.index > 255) continue;
    const found = inSector(sector); if (found && (!best || found.distanceSquared < best.distanceSquared)) best = found;
  }
  return retain(best);
}

export function inspectRaceLayoutFallback(data, spatial, groups) {
  if (!spatial.available || !groups.some(g => g.count)) return {available: false, table: 0, count: 0, entries: [], nodes: []};
  const table = data.readUInt32LE(0xac), count = data.readUInt16LE(0x96);
  if (table + count * 4 > data.length) throw Error('Race fallback/model-link table exceeds resource bounds.');
  const entries = Array.from({length: count}, (_, i) => data.readUInt32LE(table + i * 4));
  const nodes = spatial.nodes.map(node => {
    const start = node.boundsWord >>> 22, length = node.boundsWord >>> 19 & 7;
    if (start + length >= count) throw Error('Race fallback/model-link group exceeds resource bounds.');
    const word = entries[start], group = word >>> 16, point = word & 65535;
    if (!groups[group]?.points[point]) throw Error('Race fallback references a missing authored route point.');
    return {node: node.index, start, length, word, group, point, models: entries.slice(start + 1, start + length + 1)};
  });
  return {available: true, table, count, entries, nodes};
}

function nodeFootprints(data, spatial) {
  const result = spatial.nodes.map(() => []), intervalCache = new Map();
  const intervals = (lower, upper) => {
    const key = `${lower}:${upper}`; if (intervalCache.has(key)) return intervalCache.get(key);
    const ranges = [];
    // 4286e0 maps signed Q16 coordinates to 256-unit Y bins, with a +32
    // unsigned-word bias. Preserve that wrap for the editor's layer domains.
    for (let k = -128; k < 128; k++) {
      const bin = (k + 32) & 65535; if (bin <= lower || bin > upper) continue;
      const a = k * 256, b = k * 256 + 255;
      if (ranges.length && ranges.at(-1)[1] + 1 === a) ranges.at(-1)[1] = b; else ranges.push([a, b]);
    }
    intervalCache.set(key, ranges); return ranges;
  };
  for (const row of spatial.rows) for (const range of row.ranges) for (let column = range.start; column <= range.end; column++) {
    let index = data.readUInt16LE(row.mapPointer + (range.cellStart + column - range.start) * 2) / 12, upper = 65535;
    for (;;) {
      const node = spatial.nodes[index], lower = node.continues ? spatial.nodes[index + 1].heightThreshold : -1;
      result[index].push({x0: (column - 128) * 256, x1: (column - 128) * 256 + 255,
        z0: (row.index - 128) * 256, z1: (row.index - 128) * 256 + 255, intervals: intervals(lower, upper)});
      if (!node.continues) break; upper = Math.min(upper, lower); index++;
    }
  }
  return result;
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function closestHeight(value, intervals) {
  let best = null;
  for (const [a, b] of intervals) {const y = clamp(value, a, b); if (best === null || Math.abs(value - y) < Math.abs(value - best)) best = y;}
  return best;
}
function footprintScore(point, footprints, anchorY) {
  let maximum = 0, total = 0;
  for (const cell of footprints) {
    const y = closestHeight(point[1], cell.intervals), centerY = closestHeight(anchorY, cell.intervals);
    if (y === null || centerY === null) continue;
    const nearest = [clamp(point[0], cell.x0, cell.x1), y, clamp(point[2], cell.z0, cell.z1)], distance = squared(point, nearest);
    maximum = Math.max(maximum, distance); total += squared(point, [(cell.x0 + cell.x1) / 2, centerY, (cell.z0 + cell.z1) / 2]);
  }
  return [maximum, total];
}
const better = (a, b) => a[0] < b[0] || a[0] === b[0] && a[1] < b[1];

export function rebuildRaceLayoutFallback(source, edited, info) {
  const moved = new Map(), current = new Map();
  for (const route of info.routes) {
    const position = [0, 2, 4].map(n => edited.readInt16LE(route.offset + n)); current.set(`${route.group}:${route.point}`, position);
    if (!same(position, route.position)) {if (!moved.has(route.group)) moved.set(route.group, new Set()); moved.get(route.group).add(route.point);}
  }
  if (!moved.size) return {data: edited, changedNodes: [], tableWords: info.fallback.count};
  if (!info.fallback.available) throw Error('Route movement requires the native spatial fallback map.');
  const footprints = nodeFootprints(source, info.spatial), replacements = new Map(), changes = [];
  for (const row of info.fallback.nodes) {
    if (!moved.has(row.group) || !footprints[row.node].length) continue;
    const group = info.groups[row.group], anchorY = group.points[row.point].position[1];
    let selected = row.point, score = footprintScore(current.get(`${row.group}:${selected}`), footprints[row.node], anchorY);
    // Preserve authored group choice. If its chosen point moved, reconsider all
    // existing points of that group. Otherwise only an improved moved point may
    // displace the authored choice; unrelated authored nearest-map policy stays.
    const candidates = moved.get(row.group).has(row.point) ? group.points.map(p => p.point) : [...moved.get(row.group)];
    for (const index of candidates) {
      const candidate = footprintScore(current.get(`${row.group}:${index}`), footprints[row.node], anchorY);
      if (!moved.get(row.group).has(row.point)) {
        const prior = footprintScore(group.points[index].position, footprints[row.node], anchorY);
        if (!better(candidate, prior)) continue;
      }
      if (better(candidate, score)) {selected = index; score = candidate;}
    }
    if (selected !== row.point) {
      const word = (row.group * 65536 + selected) >>> 0; replacements.set(row.node, word);
      changes.push({node: row.node, group: row.group, previousPoint: row.point, point: selected, aliasedCells: footprints[row.node].length});
    }
  }
  if (!changes.length) return {data: edited, changedNodes: [], tableWords: info.fallback.count};
  const words = [], groups = new Map(), starts = [];
  for (const row of info.fallback.nodes) {
    const values = [replacements.get(row.node) ?? row.word, ...row.models], signature = values.join(','); let start = groups.get(signature);
    if (start === undefined) {start = words.length; groups.set(signature, start); words.push(...values);}
    if (start > 1023 || words.length > 65535) throw Error('Route fallback rebuild exceeds the native shared model-link table capacity. Reduce the changed route area.');
    starts.push(start);
  }
  const offset = Math.ceil(edited.length / 4) * 4, out = Buffer.alloc(offset + words.length * 4);
  if (out.length > 128 * 1024 * 1024) throw Error('Race-layout resource exceeds 128 MiB.');
  out.set(edited); words.forEach((word, i) => out.writeUInt32LE(word, offset + i * 4)); out.writeUInt32LE(offset, 0xac); out.writeUInt16LE(words.length, 0x96);
  for (const [index, start] of starts.entries()) out.writeUInt32LE(((info.spatial.nodes[index].boundsWord & 0x3fffff) | start << 22) >>> 0, info.spatial.nodes[index].offset);
  return {data: out, changedNodes: changes, tableWords: words.length};
}

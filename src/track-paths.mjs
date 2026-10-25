import { parseRespawnRoutes } from './respawn-routes.mjs';
import { displayPosition } from './scene-export.mjs';
import {buildTrackPathConnectivity} from './track-path-connectivity.mjs';

// Shared authored table: PC 44c2b0 / Stage II 42f250 / Firebugs 80061328.
// Plain adjacency remains the shared display convention. Recovered branch and
// direction semantics are opt-in for Rollcage only. Firebugs' 16-byte XYZ point
// interpretation remains provisional; see the feasibility note.
export function decodeTrackPaths(data, experimental = false, {connectivity=false}={}) {
  const note = 'Segments follow stored point order; AI route choice is not established.';
  const caveat = experimental ? ' Experimental: point interpretation is provisional.' : '';
  try {
    const routes = parseRespawnRoutes(data);
    const groups = routes.groups.filter(group => group.count > 0).map(group => ({
      index: group.index, offset: group.offset,
      positions: group.points.map(point => displayPosition(point.position))
    }));
    const graph=connectivity&&!experimental?buildTrackPathConnectivity(routes):null;
    return { status: groups.length ? 'available' : 'empty', experimental, groups,
      ...(graph?{graph}:{}),
      message: (groups.length ? (graph?'Arrows show stored travel directions and branch connections; runtime AI choices depend on race conditions.':note) : 'No stored path points.') + caveat + (graph?.invalidLinks.length?` ${graph.invalidLinks.length} invalid stored branch target(s) are omitted.`:'') };
  } catch (error) {
    return { status: 'unavailable', experimental, groups: [],
      message: `Path data unavailable: ${error.message ?? String(error)}${caveat}` };
  }
}

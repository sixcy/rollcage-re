import { parseRespawnRoutes } from './respawn-routes.mjs';
import { displayPosition } from './scene-export.mjs';

// Shared authored table: PC 44c2b0 / Stage II 42f250 / Firebugs 80061328.
// Adjacency is a display convention, not recovered AI connectivity. Firebugs'
// 16-byte XYZ point interpretation remains provisional; see the feasibility note.
export function decodeTrackPaths(data, experimental = false) {
  const note = 'Segments follow stored point order; AI route choice is not established.';
  const caveat = experimental ? ' Experimental: point interpretation is provisional.' : '';
  try {
    const routes = parseRespawnRoutes(data);
    const groups = routes.groups.filter(group => group.count > 0).map(group => ({
      index: group.index, offset: group.offset,
      positions: group.points.map(point => displayPosition(point.position))
    }));
    return { status: groups.length ? 'available' : 'empty', experimental, groups,
      message: (groups.length ? note : 'No stored path points.') + caveat };
  } catch (error) {
    return { status: 'unavailable', experimental, groups: [],
      message: `Path data unavailable: ${error.message ?? String(error)}${caveat}` };
  }
}

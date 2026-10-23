//A display mesh from the simulation's real primary vertices and palette.
//It never supplies collision normals, flags or coordinates back to physics.
export function buildRacingTerrainGroups(template, segment, palette, textures) {
  if (template.index !== segment.index || template.columns !== segment.columns || template.rows !== segment.rows) throw Error('Racing terrain topology differs from its authored template.');
  const groups = new Map();
  for (const face of template.faces) {
    const image = textures.get(face.page);
    if (!Number.isInteger(image?.width) || image.width < 1 || !Number.isInteger(image.height) || image.height < 1) throw Error('Racing terrain texture page dimensions are unavailable.');
    const grid = face.gridIndices, flags = segment.vertices[grid[3]][3];
    const indices = flags & 4 ? grid : [grid[1], grid[3], grid[0], grid[2]];
    const values = groups.get(face.page) ?? [];
    groups.set(face.page, values);
    for (const order of [[0,1,2], [1,3,2]]) {
      const vertices = order.map(corner => segment.vertices[indices[corner]]);
      const positions = vertices.map(([x,y,z]) => [x, -y, -z]);
      const a = positions[1].map((value, axis) => value - positions[0][axis]), b = positions[2].map((value, axis) => value - positions[0][axis]);
      const n = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]], length = Math.hypot(...n) || 1;
      for (let corner = 0; corner < 3; corner++) {
        const uv = face.uv[order[corner]], color = palette[vertices[corner][3] >>> 6];
        if (!color) throw Error('Racing terrain vertex palette index exceeds the live palette.');
        values.push(...positions[corner], (uv[0] + 0.5) / image.width, (uv[1] + 0.5) / image.height, ...n.map(value => value / length), ...color.slice(0, 3).map(value => value / 255));
      }
    }
  }
  return [...groups].map(([page, values]) => ({page, segment: segment.index, vertices: values.length / 11, data: new Float32Array(values)}));
}

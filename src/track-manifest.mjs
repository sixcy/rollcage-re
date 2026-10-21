export function buildTrackManifest(scene, track) {
  return {
    game: track.game ?? 'rollcage', name: track.name, resource: track.index,
    textureResource: track.textureIndex ?? track.index + 1,
    segments: scene.segments, instances: scene.instances,
    vertices: scene.vertices, quads: scene.quads, triangles: scene.triangles,
    placementTypes: scene.placementTypes, bounds: scene.bounds,
    pages: [...scene.textures].map(([page, { width, height }]) => ({ page, width, height })),
    coordinates: 'X,-Y,-Z (Y up); source units retained',
    scope: 'Complete finest-grid terrain and ordinary objects at initial poses. Animated UVs use their serialized frame. Effects, overlays, special objects, visibility/LOD, original lighting and game simulation are not included.'
  };
}

export function buildTrackManifest(scene, track) {
  const source = scene.source ?? {};
  return {
    game: track.game ?? 'rollcage', name: track.name, resource: track.index,
    textureResource: track.textureIndex ?? track.index + 1,
    ...(track.vramIndex === undefined ? {} : { vramResource: track.vramIndex }),
    ...(track.btxIndex === undefined ? {} : { btxResource: track.btxIndex }),
    segments: scene.segments, instances: scene.instances,
    vertices: scene.vertices, quads: scene.quads, triangles: scene.triangles,
    placementTypes: scene.placementTypes, bounds: scene.bounds,
    pages: [...scene.textures].map(([page, { width, height }]) => ({ page, width, height })),
    coordinates: source.coordinates ?? 'X,-Y,-Z (Y up); source units retained',
    scope: source.scope ?? 'Complete finest-grid terrain and ordinary objects at initial poses. Animated UVs use their serialized frame. Effects, overlays, special objects, visibility/LOD, original lighting and game simulation are not included.',
    ...(Object.keys(source).length ? { source } : {})
  };
}

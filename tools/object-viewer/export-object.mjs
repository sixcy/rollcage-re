import {createZIP} from '../track-viewer/zip.mjs';
import {encodeTexturePNG as browserEncodeTexturePNG} from '../track-viewer/export-track.mjs';

function jsonMetadata(value, label) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => {
      if (typeof item === 'number' && !Number.isFinite(item) || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint' || item instanceof Map || item instanceof Set || item instanceof ArrayBuffer || ArrayBuffer.isView(item)) throw Error('Non-JSON metadata.');
      return item;
    }));
  } catch {throw Error(`Object ${label} must contain serializable metadata only.`);}
}

function filenamePart(value, fallback) {
  const text = String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 72);
  return text || fallback;
}
const textLine = value => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ');

function inspectObject(scene) {
  if (!scene || typeof scene.obj !== 'string' || !scene.obj.trim() || !(scene.textures instanceof Map) || !scene.entry || scene.entry.status !== 'supported') throw Error('Select a supported loaded object before exporting.');
  if (scene.obj.includes('\0')) throw Error('Object OBJ contains invalid text.');
  const lines = scene.obj.split(/\r?\n/), materials = new Set();
  let vertices = 0, triangles = 0;
  for (const line of lines) {
    if (/^v\s/.test(line)) {
      const values = line.trim().split(/\s+/).slice(1).map(Number);
      if (values.length !== 3 || values.some(value => !Number.isFinite(value))) throw Error('Object OBJ contains invalid positions.');
      vertices++;
    }
    if (/^f\s/.test(line)) {
      if (line.trim().split(/\s+/).length !== 4) throw Error('Object OBJ must contain the decoded triangular faces.');
      triangles++;
    }
    if (/^usemtl\b/.test(line)) {
      const match = /^usemtl\s+(page_(\d+))\s*$/.exec(line);
      if (!match) throw Error('Object OBJ contains an unsupported material name.');
      materials.add(match[1]);
    }
  }
  if (!vertices || !triangles || !materials.size) throw Error('The selected object has no textured geometry to export.');
  if (scene.vertices !== vertices || scene.triangles !== triangles) throw Error('Object OBJ counts differ from the loaded model.');
  if (!Array.isArray(scene.bounds) || scene.bounds.length !== 3 || scene.bounds.some(pair => !Array.isArray(pair) || pair.length !== 2 || pair.some(value => !Number.isFinite(value)) || pair[0] > pair[1])) throw Error('Object bounds are invalid.');
  const pages = [], names = new Set();
  for (const [page, image] of scene.textures) {
    if (!Number.isSafeInteger(page) || page < 0 || page > 0xffffffff) throw Error('Object texture page identity must be an unsigned integer.');
    const material = `page_${page}`;
    if (!materials.has(material)) continue;
    const filename = `texture-${page}.png`;
    if (names.has(material)) throw Error('Object texture page identity is ambiguous.');
    names.add(material);
    if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1 || !Number.isSafeInteger(image.width * image.height * 4) || !(image.rgba instanceof Uint8Array) || image.rgba.length !== image.width * image.height * 4) throw Error(`Object texture page ${page} has invalid RGBA pixels.`);
    let hasAlpha = false;
    for (let index = 3; index < image.rgba.length; index += 4) if (image.rgba[index] !== 255) {hasAlpha = true; break;}
    pages.push({page, material, filename, width: image.width, height: image.height, hasAlpha, image});
  }
  for (const material of materials) if (!names.has(material)) throw Error(`Object texture ${material} is unavailable; no replacement image is exported.`);
  pages.sort((a, b) => a.page - b.page);
  const obj = ['mtllib object.mtl', ...lines.filter(line => !/^mtllib\b/.test(line))].join('\n').replace(/\n*$/, '\n');
  return {obj, pages};
}

function manifestFor(scene, pages) {
  const assembled = scene.entry.kind === 'vehicle-assembled';
  if (assembled && (!scene.assembly || !Array.isArray(scene.meshes) || scene.meshes.length !== 5 || scene.obj.match(/^g\s+/gm)?.length !== 5)) throw Error('Assembled car export requires its assembly metadata and body plus four wheel meshes.');
  const assembly = assembled ? jsonMetadata(scene.assembly, 'assembly') : null;
  if (assembled) {
    if (assembly.pose !== 'neutral' || !Array.isArray(assembly.parts) || assembly.parts.length !== 5) throw Error('Assembled car export requires five neutral part transforms.');
    const groups = [...scene.obj.matchAll(/^g\s+(\S+)\s*$/gm)].map(match => match[1]);
    for (const [index, part] of assembly.parts.entries()) {
      const mesh = scene.meshes[index], name = index === 0 ? 'body' : `wheel-${index}`;
      if (part.index !== index || part.name !== name || !Number.isInteger(part.modelIndex) || part.modelIndex < 0 || mesh.index !== index || mesh.modelIndex !== part.modelIndex || mesh.part !== name || groups[index] !== `object_${index}` || !Array.isArray(part.positionQ16) || part.positionQ16.length !== 3 || !Array.isArray(part.rotationQ12) || part.rotationQ12.length !== 9 || [...part.positionQ16, ...part.rotationQ12].some(value => !Number.isSafeInteger(value)) || !Number.isFinite(part.scale) || part.scale <= 0) throw Error('Assembled car part identity/transform differs from its exported mesh group.');
    }
  }
  return {
    schemaVersion: 1, kind: assembled ? 'selected-static-vehicle-assembly' : 'selected-static-object',
    entry: jsonMetadata(scene.entry, 'entry'), source: jsonMetadata(scene.source ?? {}, 'source'),
    ...(assembled ? {assembly, meshCount: scene.meshes.length} : {}),
    limits: jsonMetadata(scene.limits ?? [], 'limits'),
    coordinates: scene.source?.coordinates ?? 'X,-Y,-Z (Y up); source units retained',
    scope: assembled ? 'One assembled Rollcage car in its recovered neutral pose: body and four wheels, with part transforms baked into vehicle-local geometry.' : 'One selected decoded model and material variant, in local coordinates; no inferred assembly or runtime animation.',
    vertices: scene.vertices, triangles: scene.triangles, quads: scene.quads ?? 0, bounds: scene.bounds.map(pair => pair.slice()),
    files: {obj: 'object.obj', mtl: 'object.mtl', textures: pages.map(({image: _image, ...page}) => page)},
    exportLimits: ['PNG RGBA alpha is preserved; importer transparency settings may need adjustment.', 'MTL uses diffuse texture and alpha maps; original lighting, blending and runtime effects are not reconstructed.', 'The selected model is exported independently of viewer camera, lighting, grid and display toggles.'],
  };
}

export function buildObjectManifest(scene) {
  return manifestFor(scene, inspectObject(scene).pages);
}

function verifyPNG(bytes, image, page) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 33 || [137, 80, 78, 71, 13, 10, 26, 10].some((value, index) => bytes[index] !== value) || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw Error(`Texture page ${page} did not encode as a PNG.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(16) !== image.width || view.getUint32(20) !== image.height) throw Error(`Texture page ${page} PNG dimensions differ from the loaded pixels.`);
}

export async function buildObjectDownload(scene, {encodeTexturePNG = browserEncodeTexturePNG} = {}) {
  if (typeof encodeTexturePNG !== 'function') throw Error('Object export requires a PNG encoder.');
  const {obj, pages} = inspectObject(scene), manifest = manifestFor(scene, pages);
  const files = [{name: 'object.obj', data: obj}], materials = [];
  for (const page of pages) {
    let bytes;
    try {bytes = await encodeTexturePNG(page.image);} catch (error) {throw Error(`Texture page ${page.page} PNG encoding failed: ${error.message ?? error}`);}
    verifyPNG(bytes, page.image, page.page);
    files.push({name: page.filename, data: bytes});
    materials.push(`newmtl ${page.material}\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nd 1\nillum 1\nmap_Kd ${page.filename}\nmap_d ${page.filename}\n`);
  }
  files.push({name: 'object.mtl', data: materials.join('\n')}, {name: 'manifest.json', data: `${JSON.stringify(manifest, null, 2)}\n`},
    {name: 'README.txt', data: [
      `Selected object: ${textLine(scene.entry.label ?? scene.entry.id)}`, '',
      'Extract every file into one folder, then import object.obj into Blender or another OBJ viewer.',
      'Keep object.mtl and texture-*.png beside object.obj. Enable Material Preview to see the textures.',
      'Textures retain RGBA alpha. Enable transparency in your importer/material settings if needed.', '',
      manifest.scope, `Coordinates: ${textLine(manifest.coordinates)}.`,
      'Resource, model slot and material-variant provenance and reconstruction limits are in manifest.json.',
      ...(manifest.assembly ? ['Part/model identities and neutral transforms are in manifest.json. Geometry is already baked; do not apply those transforms a second time.', 'OBJ groups object_0 through object_4 correspond to assembly.parts indices 0 through 4.'] : []),
      manifest.assembly ? 'This ZIP contains the selected assembled car and its referenced texture pages; it is not a complete game asset archive.' : 'This ZIP contains only the selected model and its referenced texture pages; it is not a complete game asset archive.', '',
    ].join('\n')});
  const game = scene.source?.game?.id ?? scene.source?.game ?? scene.entry.source?.game ?? 'game';
  const id = scene.entry.id ?? `model-${scene.entry.modelIndex ?? 0}`;
  return {filename: `object-${filenamePart(game, 'game')}-${filenamePart(id, 'selected')}.zip`, blob: createZIP(files), manifest};
}

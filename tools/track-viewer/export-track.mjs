import { createZIP } from './zip.mjs';

export function encodeTexturePNG(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('This browser could not create a texture image.'));
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.rgba); context.putImageData(pixels, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) { reject(new Error('A texture could not be encoded as PNG.')); return; }
      try { resolve(new Uint8Array(await blob.arrayBuffer())); }
      catch (error) { reject(error); }
    }, 'image/png');
  });
}

export async function buildTrackDownload(scene, track) {
  const files = [{ name: 'scene.obj', data: scene.obj }], materials = [];
  for (const [page, image] of scene.textures) {
    const filename = `texture-${page}.png`;
    files.push({ name: filename, data: await encodeTexturePNG(image) });
    materials.push(`newmtl page_${page}\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nd 1\nillum 1\nmap_Kd ${filename}\nmap_d ${filename}\n`);
  }
  files.push({ name: 'scene.mtl', data: materials.join('\n') });
  files.push({ name: 'README.txt', data: [
    `Rollcage track: ${track.name}`, '',
    'Extract every file in this ZIP into the same folder.',
    'In Blender, import scene.obj using the OBJ importer.',
    'Switch the viewport to Material Preview to see the textures.',
    'Keep scene.mtl and all texture PNGs beside scene.obj.', '',
    'The export contains the complete track and ordinary objects at their initial poses.',
    'Viewer camera positions, sector selection and display toggles do not affect the export.',
    'Effects, overlays, special objects, original lighting and game simulation are not included.',
    'Geometry maps source X,Y,Z to X,-Y,-Z (Y up), preserving handedness and original game units.', ''
  ].join('\n') });
  return { filename: `${track.name.replace(/\.BLP$/i, '').replace(/[^a-z0-9-]/gi, '-')}.zip`, blob: createZIP(files) };
}

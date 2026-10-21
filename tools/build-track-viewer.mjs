import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildViewerBundle } from './lib/track-viewer-bundle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = await readFile(path.join(root, 'tools/track-viewer/viewer.html'), 'utf8');
const bundle = (await buildViewerBundle()).replace(/<\/script/gi, '<\\/script');
const destination = path.join(root, 'docs');
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, 'track-viewer.html'), template.replace('__VIEWER_BUNDLE__', () => bundle));
console.log('Built docs/track-viewer.html (no game assets embedded).');

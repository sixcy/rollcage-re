import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildViewerBundle} from './lib/track-viewer-bundle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = await readFile(path.join(root, 'tools/object-viewer/viewer.html'), 'utf8');
const bundle = (await buildViewerBundle('tools/object-viewer/app.mjs')).replace(/<\/script/gi, '<\\/script');
await mkdir(path.join(root, 'docs'), {recursive: true});
await writeFile(path.join(root, 'docs/object-viewer.html'), template.replace('__VIEWER_BUNDLE__', () => bundle));
console.log('Built docs/object-viewer.html (no game assets embedded).');

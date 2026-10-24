import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {buildChangelog,buildTrackViewerPage} from './lib/viewer-page.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'docs');
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, 'track-viewer.html'), await buildTrackViewerPage());
await writeFile(path.join(destination,'changelog/index.html'),(await buildChangelog()).history);
console.log('Built docs/track-viewer.html (no game assets embedded).');

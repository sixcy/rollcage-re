// Refresh generated HTML after a viewer-template change; keep scene data intact.
import {readFile,writeFile}from'node:fs/promises';
import path from'node:path';
import {fileURLToPath}from'node:url';
const directory=process.argv[2];if(!directory)throw new Error('Pass a generated scene directory.');
const destination=path.join(directory,'viewer.html'),html=await readFile(destination,'utf8');
const match=html.match(/^const scene=(.*);$/m);if(!match)throw new Error('Generated scene payload not found.');
const scene=JSON.parse(match[1]),template=await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'templates','scene-viewer.html'),'utf8');
await writeFile(destination,template.replace('__SCENE_DATA__',()=>JSON.stringify(scene).replace(/</g,'\\u003c')));

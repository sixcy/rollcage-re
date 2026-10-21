import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RollcageArchive } from '../src/archive.mjs';
import { FirebugsArchive } from '../src/firebugs-archive.mjs';
import { openFirebugsZip } from './lib/firebugs-disc.mjs';
import { encodePNG } from '../src/png.mjs';
import { buildTrackManifest } from '../src/track-manifest.mjs';
import { identifyGame } from '../src/track-games.mjs';
import { parseGameOptions } from './lib/game-options.mjs';
const {game,positional,installation}=parseGameOptions(process.argv.slice(2));
const [name,directory]=positional;
if(!name||!directory||positional.length>3||(game.id==='firebugs'&&!positional[2]))throw new Error('Usage: node tools/export-scene.mjs [--game rollcage|stage2] <BLP-name-or-ID> <new-output-directory> [installation-directory]\n       node tools/export-scene.mjs --game firebugs <track-id> <new-output-directory> <disc.zip>');
let disc;
const archive=game.id==='firebugs'
 ? await FirebugsArchive.open(disc=await openFirebugsZip(positional[2]))
 : await RollcageArchive.open(installation);
try {
 const identified=await identifyGame(archive,game.id);
 const index=/^\d+$/.test(name)?Number(name):game.findResourceIndex?.(name);
 const track=identified.tracks.find(track=>track.index===index||track.name===name||track.id===name);
 if(!track)throw new Error(`Resource ${name} is not a supported ${game.label} track.${game.id==='firebugs'?' Run tools/list-firebugs-tracks.mjs to list track IDs.':''}`);
 const output=await game.loadTrack(archive,track),textures=output.textures,images=[];
 const template=await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'templates','scene-viewer.html'),'utf8');
 await mkdir(directory,{recursive:false});
 const mtl=[];
 for(const [page,image]of textures) {
  const png=encodePNG(image),filename=`texture-${page}.png`;
  await writeFile(path.join(directory,filename),png,{flag:'wx'});
  images.push({page,width:image.width,height:image.height,url:'data:image/png;base64,'+png.toString('base64')});
  mtl.push(`newmtl page_${page}\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nd 1\nillum 1\nmap_Kd ${filename}\nmap_d ${filename}\n`);
 }
 const manifest=buildTrackManifest(output,track);
 const payload={...manifest,groups:output.groups,images};
 await writeFile(path.join(directory,'scene.obj'),output.obj,{flag:'wx'});
 await writeFile(path.join(directory,'scene.mtl'),mtl.join('\n'),{flag:'wx'});
 await writeFile(path.join(directory,'scene.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 await writeFile(path.join(directory,'viewer.html'),template.replace('__SCENE_DATA__',()=>JSON.stringify(payload).replace(/</g,'\\u003c')),{flag:'wx'});
 console.log(JSON.stringify(manifest));
}finally{await archive.close?.();await disc?.close?.();}

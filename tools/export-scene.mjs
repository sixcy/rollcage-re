import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RollcageArchive } from '../src/archive.mjs';
import { findResourceIndex } from '../src/resource-names.mjs';
import { parseScene } from '../src/scene.mjs';
import { parseBTP,decodeBTPTexture } from '../src/btp.mjs';
import { encodePNG } from '../src/png.mjs';
import { buildSceneExport } from '../src/scene-export.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {buildPlacedMeshes} from '../src/placed-meshes.mjs';
const [name,directory,installation='C:\\Program Files (x86)\\Psygnosis\\Rollcage']=process.argv.slice(2);
if(!name||!directory)throw new Error('Usage: node tools/export-scene.mjs <BLP-name-or-ID> <new-output-directory> [installation-directory]');
const index=/^\d+$/.test(name)?Number(name):findResourceIndex(name);
if(index<0)throw new Error(`Unknown resource: ${name}`);
const archive=await RollcageArchive.open(installation);
try {
 const {data}=await archive.readResource(index),scene=parseScene(data);
 if(!scene.segments.length)throw new Error('Resource has no SEGM geometry.');
 const pair=await archive.readResource(index+1),btp=parseBTP(pair.data);
 const gfxm=parseGFXM(data),placements=parsePlacements(pair.data,gfxm.models),placedMeshes=buildPlacedMeshes(data,gfxm,placements);
 const textures=new Map();
 for(const page of new Set([...scene.segments,...placedMeshes].flatMap(s=>s.faces.map(f=>f.page))))textures.set(page,decodeBTPTexture(btp,page));
 const output=buildSceneExport(scene,textures,placedMeshes),images=[];
 const template=await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'templates','scene-viewer.html'),'utf8');
 await mkdir(directory,{recursive:false});
 const mtl=[];
 for(const [page,image]of textures) {
  const png=encodePNG(image),filename=`texture-${page}.png`;
  await writeFile(path.join(directory,filename),png,{flag:'wx'});
  images.push({page,width:image.width,height:image.height,url:'data:image/png;base64,'+png.toString('base64')});
  mtl.push(`newmtl page_${page}\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nd 1\nillum 1\nmap_Kd ${filename}\n`);
 }
 const manifest={name,resource:index,textureResource:index+1,segments:scene.segments.length,instances:placedMeshes.length,
  placementTypes:placements.records.reduce((m,r)=>(m[r.type]=(m[r.type]??0)+1,m),{}),
  vertices:output.vertices,quads:output.quads,triangles:output.triangles,
  pages:images.map(({url,...image})=>image),bounds:output.bounds,coordinates:'X,-Y,-Z (Y up); source units retained',
  scope:'Finest-grid SEGM base pass plus ordinary type-zero model instances at loader-initialized poses. Animated model UVs use the serialized frame. Other placement types, overlays, visibility/LOD and runtime lighting are not included.'};
 const payload={...manifest,groups:output.groups,images};
 await writeFile(path.join(directory,'scene.obj'),output.obj,{flag:'wx'});
 await writeFile(path.join(directory,'scene.mtl'),mtl.join('\n'),{flag:'wx'});
 await writeFile(path.join(directory,'scene.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 await writeFile(path.join(directory,'viewer.html'),template.replace('__SCENE_DATA__',()=>JSON.stringify(payload).replace(/</g,'\\u003c')),{flag:'wx'});
 console.log(JSON.stringify(manifest));
}finally{await archive.close();}

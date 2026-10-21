// Installed disc remains read-only. JSON output refuses overwrites.
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { openFirebugsZip } from './lib/firebugs-disc.mjs';
import { FirebugsArchive } from '../src/firebugs-archive.mjs';
import { identifyFirebugs } from '../src/firebugs.mjs';
import { buildTrackManifest } from '../src/track-manifest.mjs';

const [filename, output, ...extra] = process.argv.slice(2);
if (!filename || extra.length) throw new Error('Usage: node tools/validate-firebugs.mjs <disc.zip> [new-report.json]');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const disc=await openFirebugsZip(filename), archive=await FirebugsArchive.open(disc);
try {
  const identified=await identifyFirebugs(archive,'firebugs');
  const resources=[];
  for(const entry of archive.entries) {
    const {data}=await archive.readResource(entry.index);
    resources.push({index:entry.index,magic:data.toString('ascii',0,4),bytes:data.length,sha256:hash(data)});
  }
  const tracks=[];
  for(const track of identified.tracks) {
    const scene=await identified.game.loadTrack(archive,track);
    const vertices=[],uvs=[];
    let faces=0;
    for(const line of scene.obj.split('\n')) {
      if(line.startsWith('v ')) { const values=line.slice(2).split(' ').map(Number); if(values.length!==3||!values.every(Number.isFinite))throw new Error('Invalid OBJ vertex.'); vertices.push(values); }
      if(line.startsWith('vt ')) uvs.push(line);
      if(line.startsWith('f ')) {
        for(const corner of line.slice(2).split(' ')) {
          const [vertex,uv]=corner.split('/').map(Number);
          if(!Number.isInteger(vertex)||vertex<1||vertex>vertices.length||!Number.isInteger(uv)||uv<1||uv>uvs.length) throw new Error('Invalid OBJ face reference.');
        }
        faces++;
      }
    }
    if(faces!==scene.triangles||vertices.length!==scene.vertices)throw new Error('OBJ scene counts differ.');
    if(scene.groups.reduce((n,g)=>n+g.vertices/3,0)!==faces)throw new Error('Renderer triangle count differs.');
    for(const match of scene.obj.matchAll(/^usemtl page_(\d+)$/gm)) if(!scene.textures.has(Number(match[1]))) throw new Error('OBJ material is missing.');
    for(const image of scene.textures.values()) if(image.rgba.length!==image.width*image.height*4)throw new Error('Invalid texture storage.');
    tracks.push({...buildTrackManifest(scene,track),objSHA256:hash(scene.obj),groupsSHA256:hash(JSON.stringify(scene.groups))});
  }
  const report={identity:identified.identity,verified:identified.verified,resources,tracks};
  if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({verified:identified.verified,resources:resources.length,environments:tracks.length,triangles:tracks.reduce((n,t)=>n+t.triangles,0),ordinaryObjects:tracks.reduce((n,t)=>n+t.instances,0),output:output??null}));
}finally {await archive.close();await disc.close?.();}

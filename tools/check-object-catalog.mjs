import assert from 'node:assert/strict';
import {open, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {RollcageArchive} from '../src/archive.mjs';
import {FirebugsArchive} from '../src/firebugs-archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {listObjectResources, loadObjectCollection} from '../src/object-catalog.mjs';
import {openFirebugsZip} from './lib/firebugs-disc.mjs';
import {buildViewerBundle} from './lib/track-viewer-bundle.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const summarize = scene => ({objHash: hash(scene.obj), groupsHash: hash(JSON.stringify(scene.groups)), bounds: scene.bounds,
  vertices: scene.vertices, triangles: scene.triangles, ...(scene.assembly?{assembly:scene.assembly}:{}), textures: [...scene.textures].map(([page, image]) => ({page,width:image.width,height:image.height,hash:hash(image.rgba)}))});

export async function checkObjectCatalog({output = `analysis/object-catalog-installed-${Date.now()}.json`, firebugsZip,
  installations = {rollcage:getGame('rollcage').installation,stage2:getGame('stage2').installation}} = {}) {
  if (!firebugsZip) throw Error('Supply the installed Firebugs disc ZIP to check all three games.');
  await mkdir(path.dirname(path.resolve(output)), {recursive:true});
  const handle = await open(output, 'wx'), report = {method:'Actual decoded archive resources; every supported object scene loaded with source-local geometry and paired decoded textures; selected full bundled-byte parity. No game/native process.', games:[], matched:false};
  try {
    const browser = runInNewContext(await buildViewerBundle('src/object-catalog.mjs'),{btoa,atob,TextEncoder,TextDecoder});
    for (const gameId of ['rollcage','stage2','firebugs']) {
      const game=getGame(gameId), disc=gameId==='firebugs'?await openFirebugsZip(firebugsZip):null;
      const archive=gameId==='firebugs'?await FirebugsArchive.open(disc):await RollcageArchive.open(installations[gameId]);
      const result={game:gameId,resources:[],models:0,supportedEntries:0,unsupportedEntries:0,vehicleParts:0,assembledCars:0,checkedScenes:0,browserScenes:0,triangles:0};
      try {
        const tracks=await game.listTracks(archive), resources=await listObjectResources(archive,game,tracks);
        for (const resource of resources) {
          const native=await loadObjectCollection(archive,game,resource), bundled=await browser.loadObjectCollection(archive,game,resource);
          assert.equal(JSON.stringify(bundled.entries),JSON.stringify(native.entries),`${gameId}/${resource.index} catalog parity`);
          const supported=native.entries.filter(e=>e.status==='supported'), selected=new Set([supported[0]?.id,supported.at(-1)?.id,...supported.filter(e=>e.kind.startsWith('vehicle-')).map(e=>e.id)]);
          const record={index:resource.index,name:resource.name,counts:native.counts,unsupportedReasons:{},firstSupported:null};
          for(const entry of native.entries) {
            if(entry.status!=='supported'){record.unsupportedReasons[entry.reason]=(record.unsupportedReasons[entry.reason]??0)+1;continue;}
            const scene=native.load(entry);assert.ok(scene.groups.length&&scene.triangles>0);assert.ok(scene.bounds.flat().every(Number.isFinite));
            if(entry.kind==='vehicle-assembled'){assert.equal(scene.meshes.length,5);assert.equal(new Set(scene.groups.map(g=>g.instance)).size,5);assert.equal(scene.assembly.parts.length,5);}
            for(const group of scene.groups){assert.equal(Buffer.from(group.buffer,'base64').length,group.vertices*32);assert.ok(scene.textures.has(group.page));}
            result.checkedScenes++;result.triangles+=scene.triangles;
            if(selected.has(entry.id)){assert.deepEqual(JSON.parse(JSON.stringify(summarize(bundled.load(entry.id)))),JSON.parse(JSON.stringify(summarize(scene))),`${entry.id} bundled scene parity`);result.browserScenes++;}
            if(!record.firstSupported)record.firstSupported={id:entry.id,label:entry.label,...summarize(scene)};
          }
          result.models+=native.counts.models;result.supportedEntries+=native.counts.supported;result.unsupportedEntries+=native.counts.unsupported;result.vehicleParts+=native.counts.vehicleParts;result.assembledCars+=native.counts.assembledCars;result.resources.push(record);
        }
        assert.ok(result.supportedEntries>0,`${gameId} supported models`);report.games.push(result);
        console.log(JSON.stringify({game:gameId,resources:result.resources.length,models:result.models,supported:result.supportedEntries,unsupported:result.unsupportedEntries,vehicleParts:result.vehicleParts,assembledCars:result.assembledCars,checkedScenes:result.checkedScenes,browserScenes:result.browserScenes}));
      } finally {await archive.close();await disc?.close();}
    }
    report.matched=true;report.limits='Primary/local models and recovered neutral Rollcage primary-body/four-wheel assemblies. Separate animated linked objects remain outside assembled scenes because their original draw transform is unresolved. Ordinary proven scenery material contexts and separate vehicle parts retained. Unsupported/special-only entries have explicit reasons. Source/browser parity is not original-process rendering equivalence. Installed archives/disc read-only; report contains no asset pixels or mesh payloads.';
    await handle.writeFile(JSON.stringify(report,null,2)+'\n');return report;
  } catch(error) {report.error=error.stack;await handle.writeFile(JSON.stringify(report,null,2)+'\n');throw error;}
  finally {await handle.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [output,firebugsZip]=process.argv.slice(2);
  if(!output||!firebugsZip)throw Error('Usage: node tools/check-object-catalog.mjs <new-report.json> <Firebugs-disc.zip>');
  await checkObjectCatalog({output,firebugsZip});
}

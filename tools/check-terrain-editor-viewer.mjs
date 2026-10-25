import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readTrackZIP} from './lib/check-track-download.mjs';
import {parseIndex} from '../src/archive-index.mjs';
import {validateTrackProject} from '../src/track-editor-project.mjs';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {Navigation} from './track-viewer/navigation.mjs';
import {cameraRay,intersectTerrain} from './track-viewer/pickup-picking.mjs';
const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);if(!launcher||!output)throw Error('Usage: node tools/check-terrain-editor-viewer.mjs PLAYWRIGHT_LAUNCHER NEW_DIRECTORY [INSTALLATION]');
await mkdir(output);const {chromium}=createRequire(path.resolve(launcher))('playwright-core'),browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());const inspect=()=>page.evaluate(()=>window.rollcageViewer.inspect()),idle=()=>page.waitForFunction(()=>!window.rollcageViewer.inspect().loading&&!window.rollcageViewer.inspect().editor.busy);
let report,archive,stage='load';
try{
 await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));await page.waitForFunction(()=>window.rollcageViewer.inspect().verified&&!window.rollcageViewer.inspect().loading);await idle();
 await page.locator('#workspace-editor').click();await idle();assert.equal((await inspect()).editor.terrainEditing,true);
 archive=await RollcageArchive.open(installation);const game=getGame('rollcage'),t=game.tracks.find(t=>t.name==='LOW/LEV1.BLP'),scene=game.decodeTrack((await archive.readResource(t.index)).data,(await archive.readResource(t.textureIndex)).data);
 const state=await inspect(),nav=new Navigation();nav.reset(scene.bounds);Object.assign(nav,{mode:state.mode,eye:state.eye,target:state.target,yaw:state.yaw,pitch:state.pitch,distance:state.distance});const box=await page.locator('#canvas').boundingBox(),rect={left:box.x,top:box.y,width:box.width,height:box.height};
 const candidates=Array.from({length:100},(_,i)=>[440+i%10*90,80+Math.floor(i/10)*85]).map(pixel=>({pixel,hit:intersectTerrain(scene,cameraRay(nav,rect,...pixel))})).filter(p=>p.hit?.cell!==null&&p.hit);
 stage='brush';await page.locator('#terrain-radius').fill('70');await page.locator('#terrain-strength').fill('4');let chosen;
 for(const candidate of candidates){await page.mouse.move(...candidate.pixel);await page.mouse.click(...candidate.pixel);await idle();if((await inspect()).editor.terrain.heights.length){chosen=candidate;break;}}
 assert.ok(chosen,await page.locator('#editor-error').textContent());const raised=(await inspect()).editor.terrain;checks.push({case:'A real terrain click changes paired heights and collision compilation succeeds',pixel:chosen.pixel,heights:raised.heights.length});
 stage='history';await page.locator('#terrain-undo').click();await idle();assert.equal((await inspect()).editor.terrain.heights.length,0);await page.locator('#terrain-redo').click();await idle();assert.deepEqual((await inspect()).editor.terrain,raised);
 await page.mouse.move(...chosen.pixel);await page.mouse.down();await page.keyboard.press('Escape');await page.mouse.up();await idle();assert.deepEqual((await inspect()).editor.terrain,raised);checks.push({case:'Undo/redo and cancelled strokes preserve committed terrain'});
 stage='surface';await page.selectOption('#editor-tool','surfaces');await idle();assert.equal(await page.locator('#terrain-panel').isVisible(),true);assert.ok(await page.locator('#surface-palette button').count()>0);await page.locator('#surface-palette button').nth(1).click();
 await page.mouse.click(...chosen.pixel);await idle();assert.ok((await inspect()).editor.terrain.surfaces.length,await page.locator('#editor-error').textContent());checks.push({case:'Surface thumbnails select complete native presets and a real click paints cells',surfaces:(await inspect()).editor.terrain.surfaces.length});
 stage='project';const downloadPromise=page.waitForEvent('download');await page.locator('#editor-save').click();await idle();const download=await downloadPromise;await download.saveAs(path.join(output,'terrain-project.json'));const project=JSON.parse(await readFile(path.join(output,'terrain-project.json'),'utf8'));assert.equal(project.schemaVersion,5);assert.ok(project.levels[0].terrain.heights.length);await page.locator('#editor-load').setInputFiles(path.join(output,'terrain-project.json'));await idle();
 assert.equal((await inspect()).editor.terrainEditing,true);assert.equal((await inspect()).editor.modelsEditing,false);
 stage='export';const exportPromise=page.waitForEvent('download',{timeout:120000});await page.locator('#editor-export').click();const exported=await exportPromise;await idle();const zipPath=path.join(output,'rollcage-track-edits.zip');await exported.saveAs(zipPath);
 const files=readTrackZIP(await readFile(zipPath));assert.deepEqual([...files.keys()],['Rollcage.img','Rollcage.idx','track-project.json','README.txt']);assert.deepEqual(JSON.parse(files.get('track-project.json').toString()),project);
 const image=files.get('Rollcage.img'),index=files.get('Rollcage.idx'),originalImage=await readFile(path.join(installation,'IDXData/Rollcage.img'));assert.deepEqual(image.subarray(0,originalImage.length),originalImage);
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),sources=new Map(),hashes=new Map();
 for(const row of project.sources){const pair={},digests={};for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===q+'/LEV'+row.level+'.BLP');pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};digests[q]={geometry:sha(pair[q].geometry),texture:sha(pair[q].texture)};}sources.set(row.level,pair);hashes.set(row.level,digests);}
 const {compiled}=validateTrackProject(project,{indexSha256:sha(archive.indexData),sources,hashes}),entries=parseIndex(index,image.length),expected=[];
 for(const row of project.levels)for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===q+'/LEV'+row.level+'.BLP');for(const [key,id]of[['geometry',t.index],['texture',t.textureIndex]]){const data=compiled.get(row.level)[q][key];if(!data.equals(sources.get(row.level)[q][key])){const entry=entries[id];assert.equal(entry.storedBytes,entry.decodedBytes);assert.deepEqual(image.subarray(entry.offset,entry.offset+entry.storedBytes),data);expected.push(id);}}}
 const changed=entries.flatMap((_,i)=>index.subarray(i*16,i*16+16).equals(archive.indexData.subarray(i*16,i*16+16))?[]:[i]);assert.deepEqual(changed,expected.sort((a,b)=>a-b));checks.push({case:'Real browser ZIP has valid CRCs, unchanged IMG prefix and precisely the independently compiled LOW/HIGH resources',changed});
 stage='race';await page.locator('#editor-test').click();await idle();await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.ticks>=30||window.rollcageViewer.inspect().practice?.state==='error');assert.notEqual((await inspect()).practice.state,'error',await page.locator('#practice-error').textContent());assert.equal((await inspect()).workspace,'racing');checks.push({case:'Project v5 round-trips and Test changes starts a race from compiled terrain'});
 await page.locator('#workspace-editor').click();await page.selectOption('#editor-tool','terrain');await idle();await page.screenshot({path:path.join(output,'height-editor.png'),fullPage:true});await page.selectOption('#editor-tool','surfaces');await idle();await page.screenshot({path:path.join(output,'surface-editor.png'),fullPage:true});assert.deepEqual(errors,[]);report={passed:true,checks,errors,scope:'Headless browser/source runtime. No original game launch.'};
}catch(error){report={passed:false,stage,error:error.stack,errors,state:await inspect().catch(()=>null),editorError:await page.locator('#editor-error').textContent().catch(()=>null),terrainStatus:await page.locator('#terrain-status').textContent().catch(()=>null)};process.exitCode=1;}
finally{await page.screenshot({path:path.join(output,'final.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await archive?.close();await browser.close();}
console.log(JSON.stringify({passed:report.passed,stage,error:report.error,editorError:report.editorError,checks:report.checks,output}));

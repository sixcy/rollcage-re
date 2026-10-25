// Headless browser interaction with read-only originals; no native game launch.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {parseIndex} from '../src/archive-index.mjs';
import {getGame} from '../src/track-games.mjs';
import {validateTrackProject} from '../src/track-editor-project.mjs';
import {parseBTP,decodeBTPTexture} from '../src/btp.mjs';
import {selectViewerWorkspace} from './lib/check-viewer-workspace.mjs';
import {readTrackZIP} from './lib/check-track-download.mjs';
import {Navigation} from './track-viewer/navigation.mjs';
import {cameraRay,intersectTerrain} from './track-viewer/pickup-picking.mjs';

const [launcher,output,installation='analysis/pickup-editor-native-baseline-20261024/installation']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-static-import-editor-viewer.mjs INSTALLED_LAUNCHER NEW_DIRECTORY [INSTALLATION]');
await mkdir(output);
const sha=b=>createHash('sha256').update(b).digest('hex'),{chromium}=createRequire(path.resolve(launcher))('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const inspect=()=>page.evaluate(()=>window.rollcageViewer.inspect());
const idle=()=>page.waitForFunction(()=>!window.rollcageViewer.inspect().editor?.busy&&!window.rollcageViewer.inspect().loading);
let report,archive,stage='load';
try{
  archive=await RollcageArchive.open(installation);const originalImage=await readFile(path.join(installation,'IDXData/Rollcage.img')),originalIndex=Buffer.from(archive.indexData);
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));
  await page.waitForFunction(()=>window.rollcageViewer.inspect().editor?.available&&!window.rollcageViewer.inspect().loading);
  const track=await page.locator('#track option').evaluateAll(options=>options.find(o=>o.textContent.endsWith('HIGH / LEV1')).value);await page.selectOption('#track',track);await idle();
  assert.equal((await inspect()).track,'HIGH/LEV1.BLP');await selectViewerWorkspace(page,'editor','models');await page.locator('#models-enable').check();
  stage='library';await page.locator('#models-add').click();await page.selectOption('#model-library-level','3');await idle();
  const choice=await page.locator('#model-library-entry option').evaluateAll(options=>options.find(o=>o.textContent.startsWith('Model 19 /')&&!o.textContent.includes('locked'))?.value);assert.ok(choice,'Formerly blocked LEV3/model19 is eligible');
  await page.selectOption('#model-library-entry',choice);const note=await page.locator('#model-library-note').textContent();assert.match(note,/LOW: 45 texture slots/);assert.match(note,/HIGH: 74 texture slots/);assert.match(note,/allocate 2 \(72, 73\)/);assert.match(note,/410 slots remain/);assert.equal(await page.locator('#model-library-place').isDisabled(),false);
  await page.locator('#model-library-placeable-only').check();assert.equal(await page.locator('#model-library-entry').inputValue(),choice);assert.equal(await page.locator('#model-library-place').isDisabled(),false);await page.screenshot({path:path.join(output,'lossless-library.png'),fullPage:true});checks.push('Textured model19 preview is placeable with per-quality native IDs and headroom; opt-in filter retains it');
  await page.locator('#model-library-place').click();await idle();stage='placement';
  const sourceTrack=getGame('rollcage').tracks.find(t=>t.name==='HIGH/LEV1.BLP'),geometry=(await archive.readResource(sourceTrack.index)).data,texture=(await archive.readResource(sourceTrack.textureIndex)).data,scene=getGame('rollcage').decodeTrack(geometry,texture),state=await inspect(),nav=new Navigation();nav.reset(scene.bounds);Object.assign(nav,{mode:state.mode,eye:state.eye,target:state.target,yaw:state.yaw,pitch:state.pitch,distance:state.distance});
  const box=await page.locator('#canvas').boundingBox(),rect={left:box.x,top:box.y,width:box.width,height:box.height},points=Array.from({length:100},(_,i)=>[450+i%10*90,100+Math.floor(i/10)*85]).filter(([x,y])=>intersectTerrain(scene,cameraRay(nav,rect,x,y)));
  let placed=false;for(const point of points){await page.mouse.move(...point);await page.mouse.click(...point);await idle();if(!(await inspect()).editor.placingModel){placed=true;break;}}
  assert.ok(placed,await page.locator('#editor-error').textContent());const added=(await inspect()).editor.models.find(m=>m.id.startsWith('model-'));assert.equal(added.sourceLevel,3);assert.equal(added.templateIndex,42);assert.equal(await page.locator('#editor-error').textContent(),'');checks.push('Actual terrain click commits LEV3/template42 into HIGH/LEV1 with both qualities compiled');
  stage='idle-camera';const mutations=await page.evaluate(async()=>{let count=0;const observer=new MutationObserver(rows=>count+=rows.length);observer.observe(document.body,{attributes:true,childList:true,subtree:true,characterData:true});for(let i=0;i<20;i++)await new Promise(requestAnimationFrame);observer.disconnect();return count;});assert.equal(mutations,0);await page.selectOption('#mode','fly');assert.equal((await inspect()).mode,'fly');await page.selectOption('#mode','orbit');checks.push('Twenty idle editor frames have no DOM mutations and Camera remains usable');
  stage='project';await selectViewerWorkspace(page,'editor');let pending=page.waitForEvent('download');await page.locator('#editor-save').click();const projectPath=path.join(output,'track-project.json');await(await pending).saveAs(projectPath);const project=JSON.parse(await readFile(projectPath,'utf8'));assert.ok(project.schemaVersion>=5);assert.ok(project.sources.some(row=>row.level===3));
  await selectViewerWorkspace(page,'editor','models');await page.locator('#models-reset').click();await idle();await selectViewerWorkspace(page,'editor');await page.locator('#editor-load').setInputFiles(projectPath);await idle();assert.ok((await inspect()).editor.models.some(m=>m.id===added.id));
  const invalid=structuredClone(project);invalid.sources.find(row=>row.level===3).hashes.HIGH.texture='0'.repeat(64);const invalidPath=path.join(output,'wrong-donor-project.json');await writeFile(invalidPath,JSON.stringify(invalid),{flag:'wx'});await page.locator('#editor-load').setInputFiles(invalidPath);await idle();assert.match(await page.locator('#editor-error').textContent(),/hash mismatch/);assert.ok((await inspect()).editor.models.some(m=>m.id===added.id));await page.locator('#editor-load').setInputFiles(projectPath);await idle();checks.push('Project saves/reloads donor-pinned import and atomically rejects a changed donor fingerprint');
  stage='export';pending=page.waitForEvent('download',{timeout:120000});await page.locator('#editor-export').click();const zipPath=path.join(output,'rollcage-track-edits.zip');await(await pending).saveAs(zipPath);await idle();const files=readTrackZIP(await readFile(zipPath)),image=files.get('Rollcage.img'),index=files.get('Rollcage.idx');assert.deepEqual(image.subarray(0,originalImage.length),originalImage);assert.deepEqual(JSON.parse(files.get('track-project.json').toString()),project);
  const sources=new Map(),hashes=new Map();for(const row of project.sources){const pair={},digests={};for(const quality of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV${row.level}.BLP`);pair[quality]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};digests[quality]={geometry:sha(pair[quality].geometry),texture:sha(pair[quality].texture)};}sources.set(row.level,pair);hashes.set(row.level,digests);}
  const {compiled}=validateTrackProject(project,{indexSha256:sha(originalIndex),sources,hashes}),entries=parseIndex(index,image.length),expected=new Set(),qualities=[];
  for(const quality of ['LOW','HIGH']){const result=compiled.get(1)[quality],t=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV1.BLP`),btp=parseBTP(result.texture),original=parseBTP(sources.get(1)[quality].texture);assert.equal(btp.textureCount,quality==='LOW'?45:74);for(const tex of original.textures.filter(t=>!t.empty))assert.deepEqual(decodeBTPTexture(btp,tex.index).rgba,decodeBTPTexture(original,tex.index).rgba);for(const [key,id]of[['geometry',t.index],['texture',t.textureIndex]]){const entry=entries[id];assert.deepEqual(image.subarray(entry.offset,entry.offset+entry.storedBytes),result[key]);expected.add(id);}qualities.push({quality,textureCount:btp.textureCount});}
  const changed=[];for(let i=0;i<entries.length;i++)if(!index.subarray(i*16,i*16+16).equals(originalIndex.subarray(i*16,i*16+16)))changed.push(i);assert.deepEqual(changed,[...expected].sort((a,b)=>a-b));checks.push('Downloaded ZIP has unchanged original IMG prefix, exactly four resource updates, independently compiled LOW/HIGH bytes and unchanged original decoded textures');
  stage='test-changes';await page.locator('#editor-test').click();await idle();await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.state==='running');assert.equal((await inspect()).practice.cars.length,3);checks.push('Test changes starts the compiled scene with the default three cars');
  assert.equal(sha(await readFile(path.join(installation,'IDXData/Rollcage.img'))),sha(originalImage));assert.equal(sha(await readFile(path.join(installation,'IDXData/Rollcage.idx'))),sha(originalIndex));assert.deepEqual(errors,[]);report={passed:true,checks,qualities,mutations,errors,libraryNote:note,scope:'Headless Edge source viewer with pristine original archive input; no original game process launched.'};
}catch(error){process.exitCode=1;report={passed:false,stage,error:error.stack,errors,state:await inspect().catch(()=>null),uiError:await page.locator('#editor-error').textContent().catch(()=>null)};}
finally{await page.screenshot({path:path.join(output,'final-state.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await archive?.close();await browser.close();}
console.log(JSON.stringify({passed:report.passed,stage,error:report.error,uiError:report.uiError,checks:report.checks,output}));

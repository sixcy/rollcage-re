import {selectViewerWorkspace} from './lib/check-viewer-workspace.mjs';
// Headless browser interaction only. Original game archives are read-only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {parseIndex} from '../src/archive-index.mjs';
import {validateTrackProject,compileTrackDraft} from '../src/track-editor-project.mjs';
import {createSceneryDraft,inspectScenery} from '../src/scenery-editor.mjs';
import {readTrackZIP} from './lib/check-track-download.mjs';
import {getGame} from '../src/track-games.mjs';
import {Navigation} from './track-viewer/navigation.mjs';
import {cameraRay,intersectTerrain} from './track-viewer/pickup-picking.mjs';

const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-scenery-editor-viewer.mjs INSTALLED_LAUNCHER NEW_REPORT_DIRECTORY [INSTALLATION]');
await mkdir(output);
const {chromium}=createRequire(path.resolve(launcher))('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const inspect=()=>page.evaluate(()=>window.rollcageViewer.inspect());
const idle=()=>page.waitForFunction(()=>!window.rollcageViewer.inspect().editor?.busy);
const click=async id=>{if(id.startsWith('practice-'))await selectViewerWorkspace(page,'racing');else if(id.startsWith('editor-')||id.startsWith('models-'))await selectViewerWorkspace(page,'editor',id.startsWith('models-')?'models':undefined);await page.locator(`#${id}`).click();await idle();};
let stage='load',report,archive;
try{
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));
  await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));
  await page.waitForFunction(()=>{const s=window.rollcageViewer.inspect();return s.editor?.available&&!s.loading;});
  const target=await page.locator('#track option').evaluateAll(options=>options.find(o=>o.textContent.endsWith('LOW / LEV10')).value);
  await page.selectOption('#track',target);await page.waitForFunction(()=>window.rollcageViewer.inspect().track==='LOW/LEV10.BLP'&&!window.rollcageViewer.inspect().loading);
  await selectViewerWorkspace(page,'editor','models');await page.locator('#models-enable').check();
  archive=await RollcageArchive.open(installation);const plainInfo={};for(const q of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${q}/LEV10.BLP`);plainInfo[q]=inspectScenery((await archive.readResource(t.index)).data,(await archive.readResource(t.textureIndex)).data);}const plain=plainInfo.LOW.find(p=>[p,plainInfo.HIGH.find(h=>h.index===p.index)].every(p=>p?.removable&&p.duplicable&&p.yawEditable));assert.ok(plain);const editableId=`original-${plain.index}`;
  await page.selectOption('#models-selection',editableId);
  let state=await inspect(),original=state.editor.models;
  stage='move-yaw';
  const x=Number(await page.locator('#models-x').inputValue());await page.locator('#models-x').fill(String(x+16));await page.locator('#models-x').press('Tab');await idle();
  assert.equal((await inspect()).editor.models.find(m=>m.id===editableId).position[0],original.find(m=>m.id===editableId).position[0]+16);
  await page.locator('#models-yaw').fill('90');await page.locator('#models-yaw').press('Tab');await idle();
  assert.equal((await inspect()).editor.models.find(m=>m.id===editableId).yaw,1024);assert.equal(await page.locator('#editor-error').textContent(),'');
  checks.push('Numeric move and quantized yaw compile LOW/HIGH and update the displayed scene');
  stage='delete-undo';await click('models-delete');assert.equal((await inspect()).editor.models.length,original.length-1);await click('models-undo');assert.equal((await inspect()).editor.models.length,original.length);await click('models-redo');assert.equal((await inspect()).editor.models.length,original.length-1);await click('models-undo');
  await page.selectOption('#models-selection','original-4');assert.equal(await page.locator('#models-delete').isDisabled(),true);checks.push('Delete/undo/redo preserve the draft; special objects remain locked');
  stage='idle-camera';
  const mutations=await page.evaluate(async()=>{let count=0;const observer=new MutationObserver(rows=>count+=rows.length);observer.observe(document.body,{attributes:true,childList:true,subtree:true,characterData:true});for(let i=0;i<20;i++)await new Promise(requestAnimationFrame);observer.disconnect();return count;});assert.equal(mutations,0);
  await page.selectOption('#mode','fly');assert.equal((await inspect()).mode,'fly');await page.selectOption('#mode','orbit');checks.push('Twenty idle frames have zero DOM mutations and the Camera menu remains usable');
  stage='cancel-duplicate';await page.selectOption('#models-selection',editableId);await click('models-duplicate');assert.equal((await inspect()).editor.placingModel,true);await page.locator('#canvas').focus();await page.keyboard.press('Escape');assert.equal((await inspect()).editor.placingModel,false);assert.equal((await inspect()).editor.models.length,original.length);checks.push('Duplicate placement cancels without modifying the project');
  stage='cross-library';
  const track18=await page.locator('#track option').evaluateAll(options=>options.find(o=>o.textContent.endsWith('LOW / LEV18')).value);
  await page.selectOption('#track',track18);await page.waitForFunction(()=>window.rollcageViewer.inspect().track==='LOW/LEV18.BLP'&&!window.rollcageViewer.inspect().loading);
  await selectViewerWorkspace(page,'editor','models');await page.locator('#models-enable').check();await click('models-add');await page.selectOption('#model-library-level','2');await idle();
  const entry=await page.locator('#model-library-entry option').evaluateAll(options=>options.find(o=>o.textContent.startsWith('Model 18 /')&&!o.textContent.includes('locked')).value);
  stage='placeable-only-filter';
  assert.equal(await page.locator('#model-library-placeable-only').isChecked(),false);
  const allOptions=await page.locator('#model-library-entry option').allTextContents();assert.ok(allOptions.some(label=>label.includes('locked')));
  await page.selectOption('#model-library-entry',entry);await page.locator('#model-library-placeable-only').check();
  const filtered=await page.locator('#model-library-entry option').allTextContents();assert.ok(filtered.length>0&&filtered.length<allOptions.length);assert.ok(filtered.every(label=>!label.includes('locked')));assert.equal(await page.locator('#model-library-entry').inputValue(),entry);assert.equal(await page.locator('#model-library-place').isDisabled(),false);
  await page.locator('#model-library-search').fill('no-matching-model-xyz');assert.equal(await page.locator('#model-library-entry option').count(),0);assert.equal(await page.locator('#model-library-place').isDisabled(),true);assert.match(await page.locator('#model-library-note').textContent(),/No placeable models match/);
  await page.locator('#model-library-search').fill('');assert.equal(await page.locator('#model-library-entry option').count(),filtered.length);
  await page.locator('#model-library-placeable-only').uncheck();assert.equal(await page.locator('#model-library-entry option').count(),allOptions.length);
  await page.locator('#model-library-placeable-only').check();await page.selectOption('#model-library-level','15');await idle();assert.equal(await page.locator('#model-library-entry option').count(),0);assert.equal(await page.locator('#model-library-place').isDisabled(),true);
  await page.selectOption('#model-library-level','2');await idle();assert.equal(await page.locator('#model-library-placeable-only').isChecked(),true);assert.equal(await page.locator('#model-library-entry option').count(),filtered.length);
  checks.push('Placeable-only filtering is opt-in, combines with search, retains eligible selection, hides locked models, handles empty libraries and persists across library changes');
  stage='cross-library';
  await page.selectOption('#model-library-entry',entry);assert.equal(await page.locator('#model-library-place').isDisabled(),false);await page.screenshot({path:path.join(output,'model-library.png'),fullPage:true});await click('model-library-place');
  archive??=await RollcageArchive.open(installation);const track=getGame('rollcage').tracks.find(t=>t.name==='LOW/LEV18.BLP');const source={geometry:(await archive.readResource(track.index)).data,texture:(await archive.readResource(track.textureIndex)).data},scene=getGame('rollcage').decodeTrack(source.geometry,source.texture);
  state=await inspect();const nav=new Navigation();nav.reset(scene.bounds);Object.assign(nav,{mode:state.mode,eye:state.eye,target:state.target,yaw:state.yaw,pitch:state.pitch,distance:state.distance});
  const box=await page.locator('#canvas').boundingBox(),rect={left:box.x,top:box.y,width:box.width,height:box.height};
  const candidates=Array.from({length:100},(_,i)=>[450+i%10*90,100+Math.floor(i/10)*85]).filter(([x,y])=>intersectTerrain(scene,cameraRay(nav,rect,x,y)));
  let placed=false;
  for(const point of candidates){await page.mouse.move(...point);await page.mouse.click(...point);await idle();if(!(await inspect()).editor.placingModel){placed=true;break;}}
  assert.ok(placed,`A valid cross-library placement exists: ${await page.locator('#editor-error').textContent()}`);
  state=await inspect();const added=state.editor.models.find(p=>p.id.startsWith('model-'));assert.equal(added.sourceLevel,2);assert.equal(added.templateIndex,60);checks.push('Library textured preview, terrain ghost and confirmed cross-track import work with native dependency checks');
  stage='drag-one-undo';
  await click('models-focus');
  const dragSources=new Map();for(const level of [2,18]){const pair={};for(const q of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${q}/LEV${level}.BLP`);pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};}dragSources.set(level,pair);}
  const dragPoint=async()=>{
    const state=await inspect(),c=compileTrackDraft(dragSources.get(18),{level:18,pickups:state.editor.pickups,models:state.editor.models},dragSources).LOW,s=getGame('rollcage').decodeTrack(c.geometry,c.texture),index=c.indices[added.id];
    const n=new Navigation();n.reset(s.bounds);Object.assign(n,{mode:state.mode,eye:state.eye,target:state.target,yaw:state.yaw,pitch:state.pitch,distance:state.distance});const m=n.matrix(rect.width/rect.height);
    const meshes=new Map();for(const g of s.groups.filter(g=>g.kind==='object')){if(!meshes.has(g.instance))meshes.set(g.instance,{groups:[]});meshes.get(g.instance).groups.push({...g,kind:'terrain'});}
    for(const g of s.groups.filter(g=>g.instance===index&&g.kind==='object')){
      const bytes=Buffer.from(g.buffer,'base64');for(let i=0;i<g.vertices;i+=3){const p=[0,1,2].map(axis=>[0,1,2].reduce((sum,v)=>sum+bytes.readFloatLE((i+v)*32+axis*4),0)/3),clip=[0,1,2,3].map(r=>m[r]*p[0]+m[r+4]*p[1]+m[r+8]*p[2]+m[r+12]);if(clip[3]<=0)continue;
        const x=rect.left+(clip[0]/clip[3]+1)*rect.width/2,y=rect.top+(1-clip[1]/clip[3])*rect.height/2;if(x<430||x>rect.width-30||y<40||y>rect.height-50)continue;
        const ray=cameraRay(n,rect,x,y),hit=intersectTerrain(meshes.get(index),ray),ground=intersectTerrain(s,ray);if(!hit||!ground||ground.distance<hit.distance)continue;
        if([...meshes].some(([other,mesh])=>other!==index&&(intersectTerrain(mesh,ray)?.distance??Infinity)<hit.distance))continue;return [x,y];
      }
    }return null;
  };
  let point=await dragPoint();assert.ok(point,'An uncovered model triangle with supporting terrain is clickable');const beforeDrag=(await inspect()).editor;
  await page.mouse.move(...point);await page.mouse.down();await page.mouse.move(point[0]+6,point[1]+3,{steps:5});await page.mouse.up();await idle();state=await inspect();assert.equal(state.editor.modelUndo,beforeDrag.modelUndo+1);assert.notDeepEqual(state.editor.models.find(m=>m.id===added.id).position,beforeDrag.models.find(m=>m.id===added.id).position);assert.equal(await page.locator('#editor-error').textContent(),'');
  await click('models-focus');point=await dragPoint();assert.ok(point);const beforeCancel=(await inspect()).editor;await page.mouse.move(...point);await page.mouse.down();await page.mouse.move(point[0]+5,point[1]+2,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();await idle();state=await inspect();assert.deepEqual(state.editor.models,beforeCancel.models);assert.equal(state.editor.modelUndo,beforeCancel.modelUndo);checks.push('A real multi-move pointer drag commits one undo step; Escape rolls a drag back without changing history');
  stage='combined-project';
  await selectViewerWorkspace(page,'editor','pickups');await page.locator('#editor-enable').check();assert.equal((await inspect()).editor.modelsEditing,false);const pickup=(await inspect()).editor.pickups[0];await page.selectOption('#editor-pickup',pickup.id);const px=Number(await page.locator('#editor-x').inputValue());await page.locator('#editor-x').fill(String(px+1));await page.locator('#editor-x').press('Tab');await idle();
  const downloadPromise=page.waitForEvent('download');await click('editor-save');const download=await downloadPromise,projectPath=path.join(output,'track-project.json');await download.saveAs(projectPath);const project=JSON.parse(await readFile(projectPath,'utf8'));assert.equal(project.schemaVersion,5);assert.ok(project.levels.find(l=>l.level===18).models.some(m=>m.id===added.id));
  await selectViewerWorkspace(page,'editor','models');await page.locator('#models-enable').check();await click('models-reset');await selectViewerWorkspace(page,'editor');await page.locator('#editor-load').setInputFiles(projectPath);await idle();state=await inspect();assert.ok(state.editor.models.some(p=>p.id===added.id));assert.equal(state.editor.pickups[0].position[0],pickup.position[0]+1);checks.push('One project round-trips scenery, donor hashes and pickup edits without losing either feature');
  stage='bad-project';const invalid=structuredClone(project);invalid.sources[0].hashes.HIGH.texture='0'.repeat(64);const invalidPath=path.join(output,'wrong-source-project.json');await writeFile(invalidPath,JSON.stringify(invalid),{flag:'wx'});await selectViewerWorkspace(page,'editor');await page.locator('#editor-load').setInputFiles(invalidPath);await idle();assert.deepEqual((await inspect()).editor.models,state.editor.models);assert.match(await page.locator('#editor-error').textContent(),/hash mismatch/);await selectViewerWorkspace(page,'editor');await page.locator('#editor-load').setInputFiles(projectPath);await idle();checks.push('A wrong donor texture fingerprint rejects the entire project without changing the draft');
  stage='export';
  await page.locator('#editor-export').click();await page.locator('#editor-cancel-export').waitFor({state:'visible'});await page.locator('#editor-cancel-export').click();await idle();assert.ok((await inspect()).editor.models.some(p=>p.id===added.id));
  const exportPromise=page.waitForEvent('download',{timeout:120000});await page.locator('#editor-export').click();const exported=await exportPromise;await idle();const zipPath=path.join(output,'rollcage-track-edits.zip');await exported.saveAs(zipPath);
  const files=readTrackZIP(await readFile(zipPath));assert.deepEqual([...files.keys()],['Rollcage.img','Rollcage.idx','track-project.json','README.txt']);assert.deepEqual(JSON.parse(files.get('track-project.json').toString()),project);
  const image=files.get('Rollcage.img'),index=files.get('Rollcage.idx'),originalImage=await readFile(path.join(installation,'IDXData/Rollcage.img'));
  assert.deepEqual(image.subarray(0,originalImage.length),originalImage);
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),sources=new Map(),hashes=new Map();
  for(const row of project.sources){const pair={},digests={};for(const q of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${q}/LEV${row.level}.BLP`);pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};digests[q]={geometry:sha(pair[q].geometry),texture:sha(pair[q].texture)};}sources.set(row.level,pair);hashes.set(row.level,digests);}
  const {compiled}=validateTrackProject(project,{indexSha256:sha(archive.indexData),sources,hashes}),newEntries=parseIndex(index,image.length),expected=new Set();
  for(const row of project.levels)for(const q of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${q}/LEV${row.level}.BLP`);for(const [key,id]of[['geometry',t.index],['texture',t.textureIndex]]){const data=compiled.get(row.level)[q][key];if(!data.equals(sources.get(row.level)[q][key])){const entry=newEntries[id];assert.equal(entry.storedBytes,entry.decodedBytes);assert.deepEqual(image.subarray(entry.offset,entry.offset+entry.storedBytes),data);expected.add(id);}}}
  const changed=[];for(let i=0;i<newEntries.length;i++)if(!index.subarray(i*16,i*16+16).equals(archive.indexData.subarray(i*16,i*16+16)))changed.push(i);assert.deepEqual(changed,[...expected].sort((a,b)=>a-b));checks.push('Cancelled export retains drafts; downloaded ZIP CRCs, IMG prefix, IDX changes and both compiled resource pairs match Node independently');
  stage='test-restart';await click('editor-test');state=await inspect();assert.equal(state.editor.active,false);assert.equal(state.practice.state,'running');assert.equal(state.practice.cars.length,3);assert.equal(state.practice.weapons.enabled,true);checks.push('Test changes starts a fresh three-car Expert race with the compiled resources');
  stage='legacy-project';const legacy={schemaVersion:1,game:'rollcage',indexSha256:project.indexSha256,levels:[{level:18,sourceHashes:{LOW:hashes.get(18).LOW.geometry,HIGH:hashes.get(18).HIGH.geometry},pickups:project.levels.find(l=>l.level===18).pickups}]};const legacyPath=path.join(output,'legacy-pickup-project.json');await writeFile(legacyPath,JSON.stringify(legacy),{flag:'wx'});await selectViewerWorkspace(page,'editor');await page.locator('#editor-load').setInputFiles(legacyPath);await idle();state=await inspect();assert.deepEqual(state.editor.models,createSceneryDraft(source.geometry,source.texture,18));assert.equal(state.editor.modelsEditing,true);assert.equal(state.editor.pickups[0].position[0],pickup.position[0]+1);checks.push('Legacy pickup projects still load and restore original scenery without losing their pickup edits');
  await selectViewerWorkspace(page,'editor');await page.locator('#editor-load').setInputFiles(projectPath);await idle();await selectViewerWorkspace(page,'editor','models');await page.selectOption('#models-selection',added.id);await page.screenshot({path:path.join(output,'editing-models.png'),fullPage:true});
  assert.equal(sha(await readFile(path.join(installation,'IDXData/Rollcage.img'))),sha(originalImage));assert.equal(sha(await readFile(path.join(installation,'IDXData/Rollcage.idx'))),sha(archive.indexData));
  assert.deepEqual(errors,[]);report={matched:true,checks,mutations,errors,scope:'Headless Edge using read-only original archives. No original game process was launched.'};
}catch(error){report={matched:false,stage,error:error.stack,errors,state:await inspect().catch(()=>null),uiError:await page.locator('#editor-error').textContent().catch(()=>null)};process.exitCode=1;}
finally{await page.screenshot({path:path.join(output,'scenery-editor.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await archive?.close();await browser.close();}
console.log(JSON.stringify({matched:report.matched,stage,checks:report.checks,error:report.error,uiError:report.uiError,output}));

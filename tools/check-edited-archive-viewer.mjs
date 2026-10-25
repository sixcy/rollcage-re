import {selectViewerWorkspace} from './lib/check-viewer-workspace.mjs';
// Headless Edge only; selected IMG/IDX files are read-only throughout.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {Navigation} from './track-viewer/navigation.mjs';
import {cameraRay,intersectTerrain} from './track-viewer/pickup-picking.mjs';

const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-edited-archive-viewer.mjs INSTALLED_LAUNCHER NEW_REPORT_DIRECTORY [EDITED_INSTALLATION]');
await mkdir(output);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),files=['Rollcage.img','Rollcage.idx'];
const before=await Promise.all(files.map(async name=>sha(await readFile(path.join(installation,'IDXData',name)))));
const {chromium}=createRequire(path.resolve(launcher))('playwright-core'),browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const inspect=()=>page.evaluate(()=>window.rollcageViewer.inspect()),idle=()=>page.waitForFunction(()=>!window.rollcageViewer.inspect().editor.busy);
let report,stage='open-edited-archive';
try{
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));
  await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));
  await page.waitForFunction(()=>window.rollcageViewer.inspect().verified&&!window.rollcageViewer.inspect().loading);
  assert.match(await page.locator('#game-info').textContent(),/Recognized edited archive/);
  const options=await page.locator('#track option').evaluateAll(os=>os.map(o=>({value:o.value,name:o.textContent})));
  for(const quality of ['HIGH','LOW']){
    stage=`${quality}-LEV1-controls`;await page.selectOption('#track',options.find(o=>o.name.endsWith(`${quality} / LEV1`)).value);
    await page.waitForFunction(name=>window.rollcageViewer.inspect().track===name&&!window.rollcageViewer.inspect().loading,`${quality}/LEV1.BLP`);
    for(const id of ['editor-enable','models-enable','practice-start'])assert.equal(await page.locator(`#${id}`).isDisabled(),false,`${id} must be enabled for ${quality}/LEV1`);
    await selectViewerWorkspace(page,'racing');await page.locator('#practice-start').click();await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.state==='running'&&window.rollcageViewer.inspect().practice.ticks>=3);await selectViewerWorkspace(page,'racing');await page.locator('#practice-start').click();
    assert.equal((await inspect()).practice.state,'paused');checks.push(`${quality}/LEV1: automatic detection, pickup/scenery controls and a running race work with edited archives`);
  }
  stage='incompatible-model';await page.selectOption('#track',options.find(o=>o.name.endsWith('HIGH / LEV1')).value);await page.waitForFunction(()=>window.rollcageViewer.inspect().track==='HIGH/LEV1.BLP'&&!window.rollcageViewer.inspect().loading);
  await selectViewerWorkspace(page,'editor','models');await page.locator('#models-enable').check();await page.locator('#models-add').click();await idle();await page.selectOption('#model-library-level','3');await idle();
  const unavailable=await page.locator('#model-library-entry option').evaluateAll(os=>os.find(o=>o.textContent.startsWith('Model 19 /')).value);await page.selectOption('#model-library-entry',unavailable);
  assert.equal(await page.locator('#model-library-place').isDisabled(),true);assert.match(await page.locator('#model-library-note').textContent(),/HIGH: No compatible native texture slot/);
  await page.screenshot({path:path.join(output,'incompatible-model.png'),fullPage:true});await page.locator('#model-library-placeable-only').check();assert.equal(await page.locator('#model-library-entry option').evaluateAll((os,id)=>os.some(o=>o.value===id),unavailable),false);
  checks.push('LEV3 model 19 cannot start a placement ghost on HIGH/LEV1; the texture-slot reason appears in the library and the placeable-only filter hides it');
  stage='placement-feedback';await page.selectOption('#model-library-level','1');await idle();assert.ok(await page.locator('#model-library-entry option').count());await page.locator('#model-library-place').click();await idle();assert.equal(await page.locator('#model-placement-feedback').isVisible(),true);
  const archive=await RollcageArchive.open(installation);let scene;try{const track=getGame('rollcage').tracks.find(t=>t.name==='HIGH/LEV1.BLP');scene=getGame('rollcage').decodeTrack((await archive.readResource(track.index)).data,(await archive.readResource(track.textureIndex)).data);}finally{await archive.close();}
  const state=await inspect(),nav=new Navigation();nav.reset(scene.bounds);Object.assign(nav,{mode:state.mode,eye:state.eye,target:state.target,yaw:state.yaw,pitch:state.pitch,distance:state.distance});const box=await page.locator('#canvas').boundingBox(),rect={left:box.x,top:box.y,width:box.width,height:box.height};
  const points=Array.from({length:100},(_,i)=>[450+i%10*90,60+Math.floor(i/10)*90]),valid=points.find(p=>intersectTerrain(scene,cameraRay(nav,rect,...p))),empty=points.find(p=>!intersectTerrain(scene,cameraRay(nav,rect,...p)));assert.ok(valid&&empty);
  await page.mouse.click(...empty);await idle();assert.match(await page.locator('#model-placement-message').textContent(),/No terrain/);assert.equal((await inspect()).editor.placingModel,true);
  const count=(await inspect()).editor.models.length;await page.mouse.click(...valid);await idle();assert.equal((await inspect()).editor.models.length,count+1);assert.equal(await page.locator('#model-placement-feedback').isHidden(),true);
  let rejected=false,accepted=1;
  for(let i=0;i<8;i++){await page.locator('#models-duplicate').click();await idle();await page.mouse.click(...valid);await idle();if((await inspect()).editor.placingModel){rejected=true;break;}accepted++;}
  assert.ok(rejected);assert.equal((await inspect()).editor.models.length,count+accepted);assert.equal(await page.locator('#model-placement-feedback').isVisible(),true);assert.match(await page.locator('#model-placement-message').textContent(),/7 static models/);await page.screenshot({path:path.join(output,'placement-rejection.png'),fullPage:true});await page.keyboard.press('Escape');assert.equal(await page.locator('#model-placement-feedback').isHidden(),true);
  await page.locator('#models-reset').click();await idle();assert.equal((await inspect()).editor.models.length,count);
  checks.push('Terrain misses and collision-cell rejections are visible over the canvas; valid clicks commit, failed clicks retain the draft, and Escape cancels the ghost');
  stage='edit-high-pickups';
  await selectViewerWorkspace(page,'editor','pickups');await page.locator('#editor-enable').check();const original=(await inspect()).editor.pickups;await page.selectOption('#editor-pickup',original[0].id);await page.locator('#editor-x').fill(String(original[0].position[0]+1));await page.locator('#editor-x').press('Tab');await idle();const edited=(await inspect()).editor.pickups;assert.equal(edited[0].position[0],original[0].position[0]+1);assert.equal(await page.locator('#editor-error').textContent(),'');
  const downloadPromise=page.waitForEvent('download');await page.locator('#editor-save').click();const download=await downloadPromise;await idle();const projectPath=path.join(output,'edited-base-project.json');await download.saveAs(projectPath);const project=JSON.parse(await readFile(projectPath,'utf8'));assert.equal(project.indexSha256,before[1]);checks.push('An edited HIGH track remains editable and saves a project bound to its actual starting archive');
  stage='wrong-starting-files';const wrong=structuredClone(project);wrong.indexSha256='28c30b94d5612b98cc9d68540982f40bc1ae6f05df3113cb964c6b2eccf02377';await selectViewerWorkspace(page,'editor');await page.locator('#editor-load').setInputFiles({name:'wrong-starting-files.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(wrong))});await idle();assert.match(await page.locator('#editor-error').textContent(),/different IMG\/IDX pair.*same starting files/);assert.deepEqual((await inspect()).editor.pickups,edited);
  await selectViewerWorkspace(page,'editor');await page.locator('#editor-load').setInputFiles(projectPath);await idle();assert.deepEqual((await inspect()).editor.pickups,edited);assert.equal(await page.locator('#editor-error').textContent(),'');checks.push('Wrong starting archives are explained without changing the draft; the matching project reloads');
  assert.match(await page.locator('#project-workflow').textContent(),/same IMG\/IDX pair/);assert.match(await page.locator('#editor-source-note').textContent(),/already contain edits/);
  const after=await Promise.all(files.map(async name=>sha(await readFile(path.join(installation,'IDXData',name)))));assert.deepEqual(after,before);assert.deepEqual(errors,[]);
  report={passed:true,checks,errors,archivesUnchanged:true,sourceHashes:Object.fromEntries(files.map((name,i)=>[name,before[i]])),scope:'Headless browser only; no original game process launched.'};
}catch(error){report={passed:false,stage,error:error.stack,errors,state:await inspect().catch(()=>null),uiError:await page.locator('#editor-error').textContent().catch(()=>null)};process.exitCode=1;}
finally{await page.locator('#game-info').scrollIntoViewIfNeeded().catch(()=>{});await page.screenshot({path:path.join(output,'archive-workflow.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await browser.close();}
console.log(JSON.stringify({passed:report.passed,stage,checks:report.checks,error:report.error,uiError:report.uiError,output}));

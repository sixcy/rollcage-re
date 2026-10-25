// Headless browser/source validation only. Installed game assets stay read-only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createRaceRouteTopology} from '../src/race-route-topology.mjs';
import {createCheckpointTopologyDraft,insertCheckpointAfter} from '../src/checkpoint-topology.mjs';
import {selectViewerWorkspace} from './lib/check-viewer-workspace.mjs';

const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-topology-editor-viewer.mjs PLAYWRIGHT_LAUNCHER NEW_DIRECTORY [INSTALLATION]');
await mkdir(output);const {chromium}=createRequire(path.resolve(launcher))('playwright-core'),browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
const inspect=()=>page.evaluate(()=>window.rollcageViewer.inspect()),idle=()=>page.waitForFunction(()=>!window.rollcageViewer.inspect().loading&&!window.rollcageViewer.inspect().editor.busy),clean=async()=>assert.equal(await page.locator('#editor-error').textContent(),'');
let archive,report,stage='load';
try{
  archive=await RollcageArchive.open(installation);const track=getGame('rollcage').tracks.find(row=>row.name==='LOW/LEV1.BLP'),data=(await archive.readResource(track.index)).data;
  const topology=createRaceRouteTopology(data),group=topology.groups.find((g,index)=>index&&g.points.length>2&&!g.header[3]);assert.ok(group);
  const originalPoint=group.points[0],baseCheckpoints=createCheckpointTopologyDraft(data),insertion=baseCheckpoints.checkpoints.find(cp=>{try{insertCheckpointAfter(data,baseCheckpoints,cp.id);return true;}catch{return false;}});assert.ok(insertion);
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));await page.waitForFunction(()=>window.rollcageViewer.inspect().verified&&!window.rollcageViewer.inspect().loading);await idle();
  await selectViewerWorkspace(page,'editor','routes');await page.selectOption('#layout-selection',originalPoint.id);
  stage='speed';await page.locator('#layout-minimum-readable').fill('18');await page.locator('#layout-minimum-readable').press('Tab');await idle();await clean();
  assert.equal((await inspect()).editor.layoutRows.find(row=>row.routePointId===originalPoint.id).minSpeed,9);
  await page.locator('#layout-full-throttle').check();await idle();await clean();assert.equal((await inspect()).editor.layoutRows.find(row=>row.routePointId===originalPoint.id).targetSpeed,255);
  checks.push('Readable doubled speed thresholds and native full-throttle sentinel compile');
  stage='clone';await page.locator('#layout-clone-group').click();await idle();await clean();
  let cloneRows=(await inspect()).editor.layoutRows;assert.equal(cloneRows.length,group.points.length);const cloneGroup=cloneRows[0].groupId,clonePoint=cloneRows[0].routePointId;
  assert.match(await page.locator('#layout-topology-warning').textContent(),/entry|exit/);
  await page.locator('#editor-test').click();await idle();assert.match(await page.locator('#editor-error').textContent(),/entry|exit/);
  stage='unfinished-project';const unfinishedPromise=page.waitForEvent('download');await page.locator('#editor-save').click();const unfinished=await unfinishedPromise,unfinishedPath=path.join(output,'unfinished-route-project.json');await unfinished.saveAs(unfinishedPath);await idle();await clean();
  await selectViewerWorkspace(page,'racing');assert.equal((await inspect()).practice,null);assert.match(await page.locator('#practice-error').textContent(),/entry|exit/);assert.equal(await page.locator('#practice-start').isDisabled(),true);
  await selectViewerWorkspace(page,'editor','routes');await page.locator('#editor-load').setInputFiles(unfinishedPath);await idle();await clean();await page.selectOption('#layout-group',cloneGroup);await page.selectOption('#layout-selection',clonePoint);checks.push('Unfinished topology saves/reloads while direct Racing test startup also enforces connectivity');
  stage='insert';await page.locator('#layout-insert-after').click();await idle();await clean();cloneRows=(await inspect()).editor.layoutRows;assert.equal(cloneRows.length,group.points.length+1);const inserted=(await inspect()).editor.layoutSelected;
  await page.locator('#layout-undo').click();await idle();assert.equal((await inspect()).editor.layoutRows.length,group.points.length);
  await page.locator('#layout-redo').click();await idle();assert.equal((await inspect()).editor.layoutRows.length,group.points.length+1);assert.ok((await inspect()).editor.layoutRows.some(row=>row.routePointId===inserted));
  checks.push('Group cloning creates an explicit disconnected draft; inserted point identities survive undo/redo');
  stage='connect';await page.locator('#layout-route-actions details').evaluate(node=>node.open=true);await page.selectOption('#layout-group','');await page.selectOption('#layout-selection',originalPoint.id);await page.selectOption('#layout-link-target',clonePoint);await page.locator('#layout-replace-link').check();await page.locator('#layout-connect').click();await idle();await clean();
  await page.selectOption('#layout-selection',clonePoint);await page.selectOption('#layout-link-target',originalPoint.id);await page.locator('#layout-connect').click();await idle();await clean();assert.equal(await page.locator('#layout-topology-warning').textContent(),'');
  checks.push('Explicit incoming/outgoing connections satisfy strict network readiness');
  stage='checkpoints';await selectViewerWorkspace(page,'editor','checkpoints');const initialCount=(await inspect()).editor.layoutRows.length;await page.selectOption('#layout-selection',insertion.planes[0].id);await page.locator('#layout-checkpoint-add').click();await idle();await clean();assert.equal((await inspect()).editor.layoutRows.length,initialCount+1);
  const addedId=(await inspect()).editor.layoutSelected;assert.equal((await inspect()).editor.layoutRows.find(row=>row.id===addedId).timingMarker,false);
  await page.locator('#layout-checkpoint-timing').check();await idle();await clean();assert.equal((await inspect()).editor.layoutRows.find(row=>row.id===addedId).timingMarker,true);
  await page.locator('#layout-checkpoint-finish').click();await idle();await clean();assert.equal((await inspect()).editor.layoutRows.find(row=>row.id===addedId).order,0);
  await page.locator('#layout-checkpoint-remove').click();await idle();await clean();assert.equal((await inspect()).editor.layoutRows.length,initialCount);
  checks.push('Checkpoint insertion defaults timing off; timing toggle, finish rotation and removal compile');
  stage='camera';const mutations=await page.evaluate(async()=>{let count=0;const observer=new MutationObserver(rows=>count+=rows.length);observer.observe(document.getElementById('mode'),{attributes:true,childList:true,subtree:true});for(let i=0;i<20;i++)await new Promise(requestAnimationFrame);observer.disconnect();return count;});assert.equal(mutations,0);
  await page.selectOption('#mode','fly');assert.equal(await page.locator('#mode').inputValue(),'fly');checks.push('Camera selector remains stable and interactive after topology edits');
  stage='project';const savePromise=page.waitForEvent('download');await page.locator('#editor-save').click();const saved=await savePromise;await idle();const savedPath=path.join(output,'topology-project.json');await saved.saveAs(savedPath);const project=JSON.parse(await readFile(savedPath,'utf8'));assert.equal(project.schemaVersion,5);assert.ok(project.levels[0].routeTopology.groups.some(g=>g.id===cloneGroup));assert.equal(project.levels[0].checkpointTopology.checkpoints.length,baseCheckpoints.checkpoints.length);
  await page.locator('#layout-reset').click();await idle();await page.locator('#editor-load').setInputFiles(savedPath);await idle();await clean();checks.push('Version-5 project persists and reloads full route/checkpoint topology');
  stage='race';await page.locator('#editor-test').click();await idle();await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.ticks>=3||window.rollcageViewer.inspect().practice?.state==='error');assert.notEqual((await inspect()).practice.state,'error');checks.push('Test changes starts a fresh reconstructed race with edited topology');
  await selectViewerWorkspace(page,'editor','routes');await page.selectOption('#layout-group',cloneGroup);await page.screenshot({path:path.join(output,'routes.png'),fullPage:true});assert.deepEqual(errors,[]);report={passed:true,checks,errors,scope:'Browser and reconstructed source runtime, no original game launch.'};
}catch(error){report={passed:false,stage,error:error.stack,errors,uiError:await page.locator('#editor-error').textContent().catch(()=>null),state:await inspect().catch(()=>null)};process.exitCode=1;}
finally{await page.screenshot({path:path.join(output,'final.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await archive?.close();await browser.close();}
console.log(JSON.stringify({passed:report.passed,stage,error:report.error,uiError:report.uiError,checks:report.checks,output}));

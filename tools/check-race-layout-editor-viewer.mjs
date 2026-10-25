// Real authoring controls and exported resources; no original game execution.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {inspectRaceLayout,raceLayoutMoveConstraint} from '../src/race-layout-editor.mjs';
import {validateTrackProject} from '../src/track-editor-project.mjs';
import {createSession} from '../src/solo-session.mjs';
import {parseIndex} from '../src/archive-index.mjs';
import {readTrackZIP} from './lib/check-track-download.mjs';
import {selectViewerWorkspace} from './lib/check-viewer-workspace.mjs';

const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-race-layout-editor-viewer.mjs PLAYWRIGHT_LAUNCHER NEW_DIRECTORY [INSTALLATION]');
await mkdir(output);const {chromium}=createRequire(path.resolve(launcher))('playwright-core'),browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
const inspect=()=>page.evaluate(()=>window.rollcageViewer.inspect()),idle=()=>page.waitForFunction(()=>!window.rollcageViewer.inspect().loading&&!window.rollcageViewer.inspect().editor.busy),sha=d=>createHash('sha256').update(d).digest('hex');
const input=async(id,value)=>{await page.locator('#layout-'+id).fill(String(value));if(['x','y','z'].includes(id))await page.locator('#layout-apply').click();else await page.locator('#layout-'+id).press('Tab');await idle();};
let archive,report,stage='load';
try{
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));await page.waitForFunction(()=>window.rollcageViewer.inspect().verified&&!window.rollcageViewer.inspect().loading);await idle();
  archive=await RollcageArchive.open(installation);const game=getGame('rollcage'),pair={},hashes={};
  for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===q+'/LEV1.BLP');pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};hashes[q]={geometry:sha(pair[q].geometry),texture:sha(pair[q].texture)};}
  const info=inspectRaceLayout(pair.LOW.geometry);
  await selectViewerWorkspace(page,'editor','routes');assert.equal((await inspect()).editor.layoutEditing,true);assert.equal((await inspect()).editor.layoutRows.length,info.routes.length);
  stage='route';const route=info.routes[0],routeId=`g${route.group}:p${route.point}`;await page.selectOption('#layout-selection',routeId);await page.locator('#layout-speeds details').evaluate(node=>node.open=true);await input('target-speed',(route.targetSpeed+1)%256);
  const changed=(await inspect()).editor.layoutRows;assert.equal(changed.find(row=>row.routePointId===routeId).targetSpeed,(route.targetSpeed+1)%256);assert.equal(await page.locator('#editor-error').textContent(),'');
  await page.locator('#layout-undo').click();await idle();assert.equal((await inspect()).editor.layoutRows.find(row=>row.routePointId===routeId).targetSpeed,route.targetSpeed);await page.locator('#layout-redo').click();await idle();assert.deepEqual((await inspect()).editor.layoutRows,changed);
  checks.push('Route speed byte editing, undo and redo preserve original graph links and other drafts');
  stage='wide-route';const destination=info.routes.find(other=>other.group===route.group&&other.point>route.point+2&&Math.hypot(...other.position.map((n,i)=>n-route.position[i]))>512&&raceLayoutMoveConstraint(info,route.position,other.position).allowed);assert.ok(destination);
  for(const [axis,i]of ['x','y','z'].map((axis,i)=>[axis,i]))await page.locator('#layout-'+axis).fill(String(i===0?destination.position[i]:-destination.position[i]));await page.locator('#layout-apply').click();await idle();assert.equal(await page.locator('#editor-error').textContent(),'');assert.deepEqual((await inspect()).editor.layoutRows.find(row=>row.routePointId===routeId).position,destination.position);checks.push('A complete numeric coordinate edit moves an existing route across native cells and rebuilds fallback references');
  stage='markers';
  for(const kind of ['checkpoints','starts']){
    await selectViewerWorkspace(page,'editor',kind);const row=info[kind].find(row=>[-1,1].some(delta=>raceLayoutMoveConstraint(info,row.position,[row.position[0]+delta,...row.position.slice(1)],kind==='checkpoints'?{sector:row.sector}:{}).allowed));assert.ok(row,`Supported ${kind} move exists`);
    const delta=[1,-1].find(delta=>raceLayoutMoveConstraint(info,row.position,[row.position[0]+delta,...row.position.slice(1)],kind==='checkpoints'?{sector:row.sector}:{}).allowed);
    const markerId=String(kind==='checkpoints'?`plane-${row.id}`:row.index);await page.selectOption('#layout-selection',markerId);await input('x',row.position[0]+delta);assert.equal(await page.locator('#editor-error').textContent(),'');assert.equal((await inspect()).editor.layoutRows.find(r=>String(kind==='checkpoints'?r.id:r.index)===markerId).position[0],row.position[0]+delta);
    if(kind==='checkpoints'){
      const before=(await inspect()).editor.layoutRows;await input('z',32767);assert.match(await page.locator('#editor-error').textContent(),/original|spatial|sector|local|Destination|terrain/);assert.deepEqual((await inspect()).editor.layoutRows,before);
      await page.locator('#layout-z').fill(String(-row.position[2]));await input('x',row.position[0]+delta);
    }
  }
  checks.push('Checkpoint/start coordinates compile; out-of-area changes reject atomically');
  stage='pointer-cancel';await page.selectOption('#mode','fly');await page.locator('#layout-focus').click();assert.equal(await page.locator('#mode').inputValue(),'orbit');await page.mouse.move(720,500);const beforeCancel=(await inspect()).editor.layout;await page.mouse.down();await page.mouse.move(728,502,{steps:3});await page.keyboard.press('Escape');await page.mouse.up();await idle();assert.deepEqual((await inspect()).editor.layout,beforeCancel);
  const mutations=await page.evaluate(async()=>{let n=0;const observer=new MutationObserver(rows=>n+=rows.length);observer.observe(document.getElementById('mode'),{attributes:true,subtree:true,childList:true});for(let i=0;i<20;i++)await new Promise(requestAnimationFrame);observer.disconnect();return n;});assert.equal(mutations,0);checks.push('Cancelled pointer drag preserves committed positions and the Camera menu remains stable');
  stage='project';const savedPromise=page.waitForEvent('download');await page.locator('#editor-save').click();const saved=await savedPromise;await idle();const projectPath=path.join(output,'race-layout-project.json');await saved.saveAs(projectPath);const project=JSON.parse(await readFile(projectPath,'utf8'));assert.equal(project.schemaVersion,5);assert.ok(project.levels[0].routeTopology.groups.length&&project.levels[0].checkpointTopology.checkpoints.length&&project.levels[0].layout.starts.length);
  await page.locator('#layout-reset').click();await idle();await page.locator('#editor-load').setInputFiles(projectPath);await idle();assert.deepEqual((await inspect()).editor.layout,project.levels[0].layout);assert.equal((await inspect()).editor.layoutEditing,true);
  const sources=new Map([[1,pair]]),{compiled}=validateTrackProject(project,{indexSha256:sha(archive.indexData),sources,hashes:new Map([[1,hashes]])});
  stage='export';const exportPromise=page.waitForEvent('download',{timeout:120000});await page.locator('#editor-export').click();const exported=await exportPromise;await idle();const zipPath=path.join(output,'rollcage-race-layout-edits.zip');await exported.saveAs(zipPath);const files=readTrackZIP(await readFile(zipPath)),image=files.get('Rollcage.img'),index=files.get('Rollcage.idx'),entries=parseIndex(index,image.length);assert.deepEqual(JSON.parse(files.get('track-project.json').toString()),project);
  const originalImage=await readFile(path.join(installation,'IDXData/Rollcage.img'));assert.deepEqual(image.subarray(0,originalImage.length),originalImage);
  for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===q+'/LEV1.BLP'),entry=entries[t.index];assert.deepEqual(image.subarray(entry.offset,entry.offset+entry.storedBytes),compiled.get(1)[q].geometry);}
  checks.push('Version-5 projects round-trip and real downloaded LOW/HIGH resources match independent compilation');
  stage='race';await page.locator('#editor-test').click();await idle();await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.ticks>=10||window.rollcageViewer.inspect().practice?.state==='error');assert.notEqual((await inspect()).practice.state,'error');await page.locator('#practice-start').click();const state=await inspect(),session=createSession(compiled.get(1).LOW.geometry,compiled.get(1).LOW.texture,{vehicleTypes:[0,1,2],aiDifficulty:2,weaponsEnabled:true});try{for(let i=0;i<state.practice.ticks;i++)session.step();const {state:status,...snapshot}=state.practice;assert.deepEqual(snapshot,session.snapshot);}finally{session.dispose();}
  checks.push('Test changes starts a fresh reconstructed race using edited starts/routes/checkpoints; browser and Node snapshots match');
  await selectViewerWorkspace(page,'editor','starts');await page.screenshot({path:path.join(output,'starting-grid.png'),fullPage:true});assert.deepEqual(errors,[]);report={passed:true,checks,errors,scope:'Browser/source/export validation only; no original game launch.'};
}catch(error){report={passed:false,stage,error:error.stack,errors,uiError:await page.locator('#editor-error').textContent().catch(()=>null),state:await inspect().catch(()=>null)};process.exitCode=1;}
finally{await page.screenshot({path:path.join(output,'final.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await archive?.close();await browser.close();}
console.log(JSON.stringify({passed:report.passed,stage,error:report.error,uiError:report.uiError,checks:report.checks,output}));

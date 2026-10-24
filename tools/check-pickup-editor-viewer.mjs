//Headless DOM/source/export regression only. Uses installed Playwright/Edge;
//the installed archives stay read-only and no original game is launched.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {parseIndex} from '../src/archive-index.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';
import {compilePickupEdits,createPickupDraft,parsePickupPlacements} from '../src/pickup-editor.mjs';
import {parseTrackProject} from '../src/track-editor-project.mjs';
import {readTrackZIP} from './lib/check-track-download.mjs';
import {Navigation} from './track-viewer/navigation.mjs';
import {cameraRay,intersectTerrain,pickPickup,sourceToDisplay} from './track-viewer/pickup-picking.mjs';

const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output||process.argv.length>5)throw Error('Usage: node tools/check-pickup-editor-viewer.mjs INSTALLED_LAUNCHER NEW_REPORT_DIRECTORY [INSTALLATION]');
const require=createRequire(path.resolve(launcher)),{chromium}=require('playwright-core'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output);
const originalImage=await readFile(path.join(installation,'IDXData/Rollcage.img')),originalIndex=await readFile(path.join(installation,'IDXData/Rollcage.idx'));
const sourceHashes={image:hash(originalImage),index:hash(originalIndex)},errors=[],requests=[],checks=[];
const previewReports=[];
let stage='browser-start',browser,archive,session,page;
const trackFor=name=>getGame('rollcage').tracks.find(row=>row.name===name);
try {
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
  page.on('dialog',dialog=>dialog.accept());
  const inspect=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(window.rollcageViewer.inspect()))));
  const idle=()=>page.waitForFunction(()=>window.rollcageViewer.inspect().editor&&!window.rollcageViewer.inspect().editor.busy);
  const click=async id=>{await page.locator(`#${id}`).click();await idle();};
  const selectTrack=async name=>{
    await page.selectOption('#track',String(trackFor(name).index));
    await page.waitForFunction(name=>{const s=window.rollcageViewer.inspect();return s.track===name&&!s.loading&&s.editor?.level===Number(/LEV(\d+)/.exec(name)[1]);},name);
    await idle();
  };
  const numeric=async(axis,value)=>{await page.locator(`#editor-${axis}`).fill(String(value));await page.locator(`#editor-${axis}`).press('Tab');await idle();};
  const saveProject=async filename=>{
    const promised=page.waitForEvent('download');await click('editor-save');const download=await promised;
    assert.equal(download.suggestedFilename(),'track-project.json');const target=path.join(output,filename);await download.saveAs(target);
    return {target,project:parseTrackProject(JSON.parse(await readFile(target,'utf8')))};
  };
  const navFor=(state,scene)=>{const n=new Navigation();n.reset(scene.bounds);Object.assign(n,{mode:state.mode,eye:state.eye,target:state.target,yaw:state.yaw,pitch:state.pitch,distance:state.distance});return n;};
  const canvasRect=async()=>{await page.locator('#canvas').scrollIntoViewIfNeeded();const box=await page.locator('#canvas').boundingBox();return {left:box.x,top:box.y,width:box.width,height:box.height};};
  const pixel=(n,rect,point)=>{const m=n.matrix(rect.width/rect.height),c=[0,1,2,3].map(i=>m[i]*point[0]+m[i+4]*point[1]+m[i+8]*point[2]+m[i+12]);if(c[3]<=0)return null;return [rect.left+(c[0]/c[3]+1)*rect.width/2,rect.top+(1-c[1]/c[3])*rect.height/2];};
  const terrainPixel=(scene,n,rect,points,near=null)=>{
    const candidates=near?[[24,0],[-24,0],[0,24],[0,-24],[40,20],[-40,-20]].map(([x,y])=>[near[0]+x,near[1]+y]):Array.from({length:49},(_,i)=>[rect.left+rect.width*(0.2+(i%7)*0.1),rect.top+rect.height*(0.2+Math.floor(i/7)*0.1)]);
    const viewport=page.viewportSize();
    return candidates.find(([x,y])=>x>5&&y>5&&x<viewport.width-5&&y<viewport.height-5&&pickPickup(points,n,rect,x,y)===null&&intersectTerrain(scene,cameraRay(n,rect,x,y)));
  };

  stage='original-archive-load';await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  assert.equal(await page.locator('#editor-enable').isDisabled(),true);
  await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));
  await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));
  await page.waitForFunction(()=>{const s=window.rollcageViewer.inspect();return s.track==='LOW/LEV1.BLP'&&!s.loading&&s.editor?.available;});
  archive=await RollcageArchive.open(installation);
  const low1=trackFor('LOW/LEV1.BLP'),high1=trackFor('HIGH/LEV1.BLP'),low2=trackFor('LOW/LEV2.BLP');
  const {data:base1}=await archive.readResource(low1.index),{data:texture1}=await archive.readResource(low1.textureIndex),scene1=getGame('rollcage').decodeTrack(base1,texture1),originalDraft=createPickupDraft(base1);
  assert.deepEqual((await inspect()).editor.pickups,originalDraft);assert.equal((await inspect()).editor.editing,false);
  await page.locator('#editor-enable').check();await idle();assert.equal((await inspect()).mode,'orbit');

  stage='numeric-undo-redo-focus';await page.selectOption('#editor-pickup',originalDraft[0].id);
  for(const [i,axis]of ['x','y','z'].entries())assert.equal(Number(await page.locator(`#editor-${axis}`).inputValue()),sourceToDisplay(originalDraft[0].position)[i]);
  await numeric('x',originalDraft[0].position[0]+10);const numericDraft=(await inspect()).editor.pickups;
  assert.equal(numericDraft[0].position[0],originalDraft[0].position[0]+10);
  await click('editor-undo');assert.deepEqual((await inspect()).editor.pickups,originalDraft);
  await click('editor-redo');assert.deepEqual((await inspect()).editor.pickups,numericDraft);
  await page.locator('#editor-x').focus();const cameraBefore=(await inspect()).eye;
  await page.locator('#editor-x').press('ArrowRight');await page.waitForTimeout(40);
  assert.deepEqual((await inspect()).eye,cameraBefore);assert.equal((await inspect()).heldKeys,0);checks.push('numeric axes, undo/redo and input focus');

  stage='genuine-marker-drag';let state=await inspect(),rect=await canvasRect(),n=navFor(state,scene1),points=state.editor.pickups.map(row=>sourceToDisplay(row.position));
  const viewport=page.viewportSize();let chosen;
  for(let index=0;index<points.length;index++){const at=pixel(n,rect,points[index]);if(!at||at[0]<10||at[1]<10||at[0]>viewport.width-10||at[1]>viewport.height-10||pickPickup(points,n,rect,...at)!==index)continue;const to=terrainPixel(scene1,n,rect,points,at);if(to){chosen={index,at,to};break;}}
  assert.ok(chosen,'An authored visible marker and neighboring terrain must be reachable with the reset view.');
  const beforeDrag=state.editor.pickups;
  await page.mouse.move(...chosen.at);await page.mouse.down();await page.mouse.move(...chosen.to,{steps:8});await page.mouse.up();await idle();
  state=await inspect();assert.equal(state.editor.selected,beforeDrag[chosen.index].id);assert.notDeepEqual(state.editor.pickups[chosen.index].position,beforeDrag[chosen.index].position);
  await click('editor-undo');assert.deepEqual((await inspect()).editor.pickups,beforeDrag);await click('editor-redo');
  checks.push('genuine marker pointer drag/drop, terrain hit and history');

  stage='add-duplicate-delete';state=await inspect();rect=await canvasRect();n=navFor(state,scene1);points=state.editor.pickups.map(row=>sourceToDisplay(row.position));
  const drop=terrainPixel(scene1,n,rect,points);assert.ok(drop,'Track terrain must be available for placement.');
  const countBefore=state.editor.pickups.length;assert.ok(countBefore<15,'Fixture needs room to exercise add and duplicate below16.');
  await click('editor-add');assert.equal((await inspect()).editor.adding,true);await page.mouse.click(...drop);await idle();
  state=await inspect();assert.equal(state.editor.pickups.length,countBefore+1);assert.equal(state.editor.adding,false);
  const addedId=state.editor.selected;assert.ok(addedId.startsWith('new-'));
  await click('editor-duplicate');assert.equal((await inspect()).editor.pickups.length,countBefore+2);
  await page.mouse.click(drop[0]+2,drop[1]+2);await idle();assert.equal((await inspect()).editor.pickups.length,countBefore+2,'Placing a duplicate must not create a second added point.');
  await click('editor-delete');assert.equal((await inspect()).editor.pickups.length,countBefore+1);
  await click('editor-undo');assert.equal((await inspect()).editor.pickups.length,countBefore+2);
  await click('editor-redo');assert.equal((await inspect()).editor.pickups.length,countBefore+1);
  const edited1=(await inspect()).editor.pickups;
  await click('editor-reset-level');assert.deepEqual((await inspect()).editor.pickups,originalDraft);await click('editor-undo');assert.deepEqual((await inspect()).editor.pickups,edited1);
  await page.screenshot({path:path.join(output,'pickup-editor-desktop.png'),fullPage:true});checks.push('add, duplicate placement, delete, reset and history');

  stage='low-high-and-multiple-levels';await selectTrack(high1.name);assert.deepEqual((await inspect()).editor.pickups,edited1);
  await page.selectOption('#editor-pickup',edited1[0].id);await numeric('z',-edited1[0].position[2]+7);const final1=(await inspect()).editor.pickups;
  await selectTrack(low1.name);assert.deepEqual((await inspect()).editor.pickups,final1);
  await selectTrack(low2.name);await page.selectOption('#editor-pickup',(await inspect()).editor.pickups[0].id);
  let current=(await inspect()).editor.pickups;await numeric('x',current[0].position[0]+2);
  const edited2=(await inspect()).editor.pickups,saved=await saveProject('pickup-project-first.json');
  assert.deepEqual(saved.project.levels.map(row=>row.level),[1,2]);
  assert.deepEqual(saved.project.levels[0].pickups,final1);assert.deepEqual(saved.project.levels[1].pickups,edited2);
  await click('editor-reset-level');await page.locator('#editor-load').setInputFiles(saved.target);await idle();
  assert.deepEqual((await inspect()).editor.pickups,edited2);
  const invalid=structuredClone(saved.project);invalid.indexSha256='0'.repeat(64);
  await page.locator('#editor-load').setInputFiles({name:'invalid-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await idle();
  assert.match(await page.locator('#editor-error').textContent(),/same starting files/);assert.deepEqual((await inspect()).editor.pickups,edited2);
  await page.locator('#editor-load').setInputFiles(saved.target);await idle();assert.equal(await page.locator('#editor-error').textContent(),'');
  checks.push('LOW/HIGH shared draft, multiple levels, project save/load and atomic rejection');

  const {data:base2}=await archive.readResource(low2.index),{data:texture2}=await archive.readResource(low2.textureIndex);
  const comparePreview=async(track,data,textures,draft)=>{
    stage=`edited-source-preview-${track.name}`;await click('editor-test');
    await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.state==='running');await page.locator('#practice-start').click();
    const state=await inspect();assert.equal(state.editor.editing,false);assert.equal(state.practice.state,'paused');assert.equal(state.practice.weapons.enabled,true);assert.equal(state.practice.cars.length,3);
    session=createSession(compilePickupEdits(data,draft),textures,{vehicleTypes:[0,1,2],aiDifficulty:2,weaponsEnabled:true});
    const row={track:track.name,aiCars:3,manualFrames:700,batchSize:10,snapshotComparisons:0,startTick:state.practice.ticks,collections:0,respawns:0,inventoryAcquisitions:0,projectileActivations:0,pickupStateTransitions:[]};previewReports.push(row);
    let previous=session.snapshot;const collected=new Set();
    const stepNode=()=>{
      const next=session.step();
      for(let i=0;i<next.weapons.pickups.length;i++){
        const before=previous.weapons.pickups[i].state&0x7f,after=next.weapons.pickups[i].state&0x7f;
        if(before!==after)row.pickupStateTransitions.push({tick:next.ticks,index:i,before,after});
        if(before!==2&&after===2){row.collections++;collected.add(i);row.firstCollectionTick??=next.ticks;}
        if(collected.has(i)&&before!==3&&after===3){row.respawns++;row.firstRespawnTick??=next.ticks;}
      }
      for(let i=0;i<next.cars.length;i++)for(let slot=0;slot<2;slot++)if(previous.cars[i].inventory[slot]===255&&next.cars[i].inventory[slot]!==255)row.inventoryAcquisitions++;
      for(let i=0;i<next.weapons.projectiles.length;i++)if(previous.weapons.projectiles[i].state===0&&next.weapons.projectiles[i].state!==0)row.projectileActivations++;
      previous=next;
    };
    for(let i=0;i<state.practice.ticks;i++)stepNode();
    let {state:practiceState,...snapshot}=state.practice;assert.deepEqual(snapshot,session.snapshot);row.snapshotComparisons++;
    for(let batch=0;batch<70;batch++){
      //Invoke the actual enabled UI handlers, never session/runtime mutation.
      await page.evaluate(()=>{for(let i=0;i<10;i++)document.getElementById('practice-step').click();});
      for(let i=0;i<10;i++)stepNode();
      ({state:practiceState,...snapshot}=(await inspect()).practice);assert.equal(practiceState,'paused');assert.deepEqual(snapshot,session.snapshot);row.snapshotComparisons++;
    }
    row.finalTick=session.snapshot.ticks;row.parityMatched=true;session.dispose();session=null;return row;
  };
  const firstPreview=await comparePreview(low2,base2,texture2,edited2);
  if(firstPreview.collections+firstPreview.respawns===0){
    await selectTrack(low1.name);await comparePreview(low1,base1,texture1,final1);await selectTrack(low2.name);
  }
  assert.ok(previewReports.some(row=>row.collections+row.respawns>0),'An edited enabled session must naturally collect or respawn a pickup within700frames; no item grants or vehicle repositioning are supplied.');
  checks.push('edited native resource source/Edge full snapshot parity through700manualframes in10framebatches, with natural pickup state transitions');

  stage='mobile';await page.locator('#editor-enable').check();await idle();
  await page.setViewportSize({width:390,height:844});await page.locator('#editor-controls').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.screenshot({path:path.join(output,'pickup-editor-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});checks.push('responsive mobile editor');

  stage='export-cancel';await page.locator('#editor-export').click();await page.locator('#editor-cancel-export').waitFor({state:'visible'});await page.locator('#editor-cancel-export').click();await idle();
  assert.match(await page.locator('#editor-status').textContent(),/cancelled/);assert.deepEqual((await inspect()).editor.pickups,edited2);
  stage='native-archive-export';const promised=page.waitForEvent('download',{timeout:120000});await page.locator('#editor-export').click();const download=await promised;await idle();
  assert.equal(download.suggestedFilename(),'rollcage-track-edits.zip');const zipPath=path.join(output,'rollcage-track-edits.zip');await download.saveAs(zipPath);
  const files=readTrackZIP(await readFile(zipPath));assert.deepEqual([...files.keys()],['Rollcage.img','Rollcage.idx','track-project.json','README.txt']);
  const project=parseTrackProject(JSON.parse(files.get('track-project.json').toString('utf8')));assert.deepEqual(project,saved.project);
  const image=files.get('Rollcage.img'),index=files.get('Rollcage.idx');assert.deepEqual(image.subarray(0,originalImage.length),originalImage);
  const oldEntries=parseIndex(originalIndex,originalImage.length),newEntries=parseIndex(index,image.length),changed=[];
  for(let i=0;i<oldEntries.length;i++)if(!index.subarray(i*16,i*16+16).equals(originalIndex.subarray(i*16,i*16+16)))changed.push(i);
  const expectedEntries=[];
  for(const level of project.levels)for(const quality of ['LOW','HIGH']){
    const track=trackFor(`${quality}/LEV${level.level}.BLP`),{data:base}=await archive.readResource(track.index),entry=newEntries[track.index],compiled=image.subarray(entry.offset,entry.offset+entry.storedBytes);
    expectedEntries.push(track.index);assert.equal(entry.storedBytes,entry.decodedBytes);assert.deepEqual(compiled,compilePickupEdits(base,level.pickups));
    const table=parsePickupPlacements(compiled),templates=parsePickupPlacements(base);assert.deepEqual(table.records.map(row=>row.position),level.pickups.map(row=>row.position));
    table.records.forEach((row,i)=>assert.deepEqual(row.raw.subarray(6),templates.records[level.pickups[i].templateIndex].raw.subarray(6)));
    for(let p=0;p<base.length;p++)if(p<0x90||p>0x94)assert.equal(compiled[p],base[p],`Unedited native resource byte${track.name}+${p}`);
  }
  assert.deepEqual(changed,expectedEntries.toSorted((a,b)=>a-b));assert.match(files.get('README.txt').toString('utf8'),/separate copy/);
  checks.push('cancel export retains drafts; full ZIP independent CRC/nativeIDX/nativeGFXM validation');

  stage='fresh-project-reload';await page.reload();await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));
  await page.waitForFunction(()=>window.rollcageViewer.inspect().editor?.available);await page.locator('#editor-load').setInputFiles(saved.target);await idle();
  assert.deepEqual((await inspect()).editor.pickups,final1);await selectTrack(low2.name);assert.deepEqual((await inspect()).editor.pickups,edited2);checks.push('fresh page/original archive/project reload');
  stage='excluded-track';await page.selectOption('#track',String(trackFor('LOW/LEV16.BLP').index));await page.waitForFunction(()=>window.rollcageViewer.inspect().track==='LOW/LEV16.BLP'&&!window.rollcageViewer.inspect().loading);
  assert.equal((await inspect()).editor.available,false);assert.equal(await page.locator('#editor-enable').isDisabled(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  const webglError=await page.evaluate(()=>document.getElementById('canvas').getContext('webgl').getError());assert.equal(webglError,0);
  assert.equal(hash(await readFile(path.join(installation,'IDXData/Rollcage.img'))),sourceHashes.image);assert.equal(hash(await readFile(path.join(installation,'IDXData/Rollcage.idx'))),sourceHashes.index);
  await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,checks,previewReports,editedLevels:[1,2],changedArchiveEntries:changed,zipBytes:(await readFile(zipPath)).length,sourceHashes,sourceArchivesUnchanged:true,errors,requests,webglError,
    limits:['Editor/source/export behavior only; no original game or native combat/physics fidelity is claimed.']},null,2),{flag:'wx'});
  console.log(JSON.stringify({passed:true,checks:checks.length,changedArchiveEntries:changed,output}));
}catch(error){
  if(page)try{await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});}catch{}
  let diagnostics;try{diagnostics=await page?.evaluate(()=>({editor:window.rollcageViewer?.inspect().editor,active:document.activeElement?.id,values:['x','y','z'].map(axis=>document.getElementById(`editor-${axis}`)?.value),editorError:document.getElementById('editor-error')?.textContent}));}catch{}
  await writeFile(path.join(output,'report.json'),JSON.stringify({passed:false,stage,error:error.stack,errors,requests,checks,previewReports,diagnostics},null,2),{flag:'wx'});throw error;
}finally{session?.dispose();await archive?.close();await browser?.close();}

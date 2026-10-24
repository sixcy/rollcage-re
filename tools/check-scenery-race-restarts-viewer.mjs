// Real headless viewer controls; no native game launch or installed-file writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {Navigation} from './track-viewer/navigation.mjs';
import {cameraRay,intersectTerrain} from './track-viewer/pickup-picking.mjs';

const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-scenery-race-restarts-viewer.mjs INSTALLED_LAUNCHER NEW_REPORT_DIRECTORY [INSTALLATION]');
await mkdir(output);
const {chromium}=createRequire(path.resolve(launcher))('playwright-core'),browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[],races=[],placed=[];
page.on('pageerror',error=>errors.push(error.message));
const inspect=()=>page.evaluate(()=>window.rollcageViewer.inspect()),idle=()=>page.waitForFunction(()=>!window.rollcageViewer.inspect().editor.busy);
const click=async id=>{await page.locator(`#${id}`).click();await idle();};
let report,stage='load',archive;
try{
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));
  await page.waitForFunction(()=>window.rollcageViewer.inspect().verified&&!window.rollcageViewer.inspect().loading);
  const target=await page.locator('#track option').evaluateAll(os=>os.find(o=>o.textContent.endsWith('HIGH / LEV3')).value);await page.selectOption('#track',target);await page.waitForFunction(()=>window.rollcageViewer.inspect().track==='HIGH/LEV3.BLP'&&!window.rollcageViewer.inspect().loading);
  const original=(await inspect()).editor.models.length;
  archive=await RollcageArchive.open(installation);const track=getGame('rollcage').tracks.find(t=>t.name==='HIGH/LEV3.BLP'),scene=getGame('rollcage').decodeTrack((await archive.readResource(track.index)).data,(await archive.readResource(track.textureIndex)).data);
  async function restart(label,count){
    await click('editor-test');await page.waitForFunction(()=>{const p=window.rollcageViewer.inspect().practice;return !p||p.state==='error'||p.ticks>=30;});
    let state=await inspect();assert.ok(state.practice,await page.locator('#practice-error').textContent());assert.notEqual(state.practice.state,'error',await page.locator('#practice-error').textContent());assert.equal(state.editor.models.length,original+count);assert.equal(state.practice.cars.length,3);
    if(state.practice.state==='running')await click('practice-start');state=await inspect();assert.equal(state.practice.state,'paused');races.push({label,models:count,ticks:state.practice.ticks});await page.locator('#models-enable').check();
  }
  for(const model of [27,19,29]){
    stage=`place-model-${model}`;await page.locator('#models-enable').check();await click('models-add');await page.locator('#model-library-placeable-only').check();
    const choice=await page.locator('#model-library-entry option').evaluateAll((os,n)=>os.find(o=>o.textContent.startsWith(`Model ${n} /`))?.value,model);assert.ok(choice,`Model ${model} is available`);await page.selectOption('#model-library-entry',choice);await click('model-library-place');
    const state=await inspect(),nav=new Navigation();nav.reset(scene.bounds);Object.assign(nav,{mode:state.mode,eye:state.eye,target:state.target,yaw:state.yaw,pitch:state.pitch,distance:state.distance});const box=await page.locator('#canvas').boundingBox(),rect={left:box.x,top:box.y,width:box.width,height:box.height};
    const candidates=Array.from({length:100},(_,i)=>[450+i%10*90,80+Math.floor(i/10)*85]).map(pixel=>({pixel,hit:intersectTerrain(scene,cameraRay(nav,rect,...pixel))})).filter(p=>p.hit&&placed.every(other=>Math.hypot(other.position[0]-p.hit.position[0],other.position[2]-p.hit.position[2])>600));
    let success;
    for(const candidate of candidates){await page.mouse.move(...candidate.pixel);await page.mouse.click(...candidate.pixel);await idle();if(!(await inspect()).editor.placingModel){success=candidate;break;}}
    assert.ok(success,await page.locator('#model-placement-message').textContent());placed.push({model,position:success.hit.position,pixel:success.pixel});
    stage=`race-after-model-${model}`;await restart(stage,placed.length);
  }
  checks.push('Three different LEV3 models (27, 19, 29) are placed through actual terrain clicks, with Test changes and a running race after each addition');
  stage='undo-restart';await click('models-undo');await restart(stage,2);
  stage='redo-restart';await click('models-redo');await restart(stage,3);
  stage='delete-restart';await click('models-delete');await restart(stage,2);
  stage='restore-delete-restart';await click('models-undo');await restart(stage,3);
  checks.push('Undo, redo, delete and restoration each restart Racing test with the expected model count');
  stage='long-edited-race';await page.locator('#models-enable').uncheck();const start=(await inspect()).practice.ticks;
  for(let batch=0;batch<60;batch++){await page.evaluate(()=>{for(let i=0;i<10;i++)document.getElementById('practice-step').click();});const s=await inspect();assert.equal(s.practice.state,'paused',await page.locator('#practice-error').textContent());}
  assert.equal((await inspect()).practice.ticks,start+600);assert.equal(await page.locator('#practice-error').textContent(),'');checks.push('The edited HIGH/LEV3 race completes 600 additional source-runtime steps without a buffer error');
  await page.locator('#models-enable').check();const downloadPromise=page.waitForEvent('download');await click('editor-save');const download=await downloadPromise;await download.saveAs(path.join(output,'three-models-project.json'));assert.deepEqual(errors,[]);
  report={passed:true,checks,races,placed,errors,scope:'Headless Edge/source runtime with read-only installed archives; no original game process or full native physics parity claim.'};
}catch(error){report={passed:false,stage,error:error.stack,errors,races,placed,state:await inspect().catch(()=>null),raceError:await page.locator('#practice-error').textContent().catch(()=>null)};process.exitCode=1;}
finally{await page.screenshot({path:path.join(output,'placed-models.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await archive?.close();await browser.close();}
console.log(JSON.stringify({passed:report.passed,stage,checks:report.checks,error:report.error,raceError:report.raceError,output}));

import {selectViewerWorkspace} from './lib/check-viewer-workspace.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession} from '../src/solo-session.mjs';
import {getGame} from '../src/track-games.mjs';

const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-racing-ai-count-viewer.mjs INSTALLED_LAUNCHER NEW_REPORT_DIRECTORY [INSTALLATION]');
const require=createRequire(path.resolve(launcher)),{chromium}=require('playwright-core');
await mkdir(output);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let archive,session;
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  const slider=page.locator('#practice-ai-count');
  assert.equal(await slider.inputValue(),'3');assert.equal(await slider.isDisabled(),true);
  await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));
  await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));
  await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.state==='ready');
  await selectViewerWorkspace(page,'racing');
  const inspect=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(window.rollcageViewer.inspect()))));
  assert.equal(await slider.isEnabled(),true);assert.equal(await slider.getAttribute('min'),'1');assert.equal(await slider.getAttribute('max'),'6');
  assert.match(await page.locator('#practice-performance-note').textContent(),/JavaScript.*More AI cars can lower FPS/);
  assert.equal((await inspect()).practice.cars.length,3);
  archive=await RollcageArchive.open(installation);
  const {data}=await archive.readResource(30),{data:textures}=await archive.readResource(31);
  const makeSession=count=>{session?.dispose();session=createSession(data,textures,{vehicleTypes:Array.from({length:count},(_,i)=>i),aiDifficulty:2,weaponsEnabled:true});};
  const compare=async count=>{
    const value=await inspect(),{state,...snapshot}=value.practice;
    assert.ok(['ready','paused'].includes(state));assert.deepEqual(snapshot,session.snapshot);
    assert.equal(value.renderedCars,count);assert.equal(value.carInstances,count);
    assert.equal(await page.locator('#practice-car option').count(),count);
    assert.equal(await page.locator('#practice-ai-count-value').textContent(),String(count));
    assert.match(await page.locator('#physics-car-label').textContent(),new RegExp(`Car ${value.followedCarIndex+1} of ${count}`));
    return value;
  };
  const step=async count=>{
    await page.evaluate(count=>{for(let i=0;i<count;i++)document.getElementById('practice-step').click();},count);
    for(let i=0;i<count;i++)session.step();
  };
  makeSession(3);await compare(3);
  for(let i=0;i<70;i++){await step(10);await compare(3);}
  await slider.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'default-three-cars.png')});
  await slider.press('End');makeSession(6);await compare(6);
  await page.selectOption('#practice-car','5');await page.selectOption('#mode','follow');
  await page.locator('#practice-start').click();
  await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.ticks>=3);
  await slider.press('Home');makeSession(1);
  const reduced=await compare(1);assert.equal(reduced.practice.ticks,0);assert.equal(reduced.followedCarIndex,0);assert.equal(reduced.mode,'follow');
  assert.equal(await page.locator('#physics-race-position').textContent(),'1st / 1');
  const counts=[];
  for(let count=1;count<=6;count++){
    if(count>1){await slider.press('ArrowRight');makeSession(count);}
    await compare(count);await step(30);await compare(count);counts.push(count);
  }
  await slider.press('Home');await slider.press('ArrowRight');await slider.press('ArrowRight');makeSession(3);
  await compare(3);await step(10);await page.locator('#practice-reset').click();session.reset();await compare(3);
  await page.setViewportSize({width:390,height:844});await slider.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.screenshot({path:path.join(output,'ai-count-mobile.png')});
  const track=getGame('rollcage').tracks.find(row=>row.name==='LOW/LEV16.BLP');
  await page.selectOption('#track',String(track.index));
  await page.waitForFunction(()=>window.rollcageViewer.inspect().track==='LOW/LEV16.BLP'&&!window.rollcageViewer.inspect().loading);
  assert.equal((await inspect()).practice,null);assert.equal(await slider.isDisabled(),true);assert.equal(await slider.inputValue(),'3');
  assert.deepEqual(errors,[]);
  const webglError=await page.evaluate(()=>document.getElementById('canvas').getContext('webgl').getError());assert.equal(webglError,0);
  await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,defaultAiCars:3,selectableCounts:counts,defaultTicksCompared:700,eachCountTicksCompared:30,runningChangeResetsAndClampsFollowedCar:true,resetKeepsCount:true,mobile:true,excludedTrackDisabled:true,errors,webglError,limits:['Browser/source behavior only; no hardware-independent FPS improvement is asserted.']},null,2),{flag:'wx'});
  console.log(JSON.stringify({passed:true,defaultAiCars:3,counts,output}));
}finally{session?.dispose();await archive?.close();await browser.close();}

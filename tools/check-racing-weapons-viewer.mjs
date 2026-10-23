import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession} from '../src/solo-session.mjs';
import {getGame} from '../src/track-games.mjs';

const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-racing-weapons-viewer.mjs INSTALLED_LAUNCHER NEW_REPORT_DIRECTORY [INSTALLATION]');
const require=createRequire(path.resolve(launcher)),{chromium}=require('playwright-core');
await mkdir(output);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let archive,session;
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));
  await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));
  await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.state==='ready');
  assert.equal(await page.locator('#practice-ai-count').inputValue(),'3');
  assert.equal((await page.evaluate(()=>window.rollcageViewer.inspect())).practice.cars.length,3);
  await page.locator('#practice-ai-count').press('End');
  await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.cars.length===6);
  const inspect=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(window.rollcageViewer.inspect()))));
  assert.equal(await page.locator('#practice-weapons').isChecked(),true);
  await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.weapons?.enabled&&window.rollcageViewer.inspect().practice?.state==='ready');
  archive=await RollcageArchive.open(installation);
  const {data}=await archive.readResource(30),{data:textures}=await archive.readResource(31);
  session=createSession(data,textures,{vehicleTypes:[0,1,2,3,4,5],aiDifficulty:2,weaponsEnabled:true});
  const snapshots=[],observed={spawn:false,collection:false,launch:false,movement:false,detonation:false,released:false,terrainWave:false};
  const compare=value=>{const {state,...snapshot}=value.practice;assert.ok(['ready','paused'].includes(state));assert.deepEqual(snapshot,session.snapshot);};
  const checkRacePosition=async value=>{
    const cars=value.practice.cars,rank=cars[value.followedCarIndex].racePosition;
    assert.deepEqual(cars.map(car=>car.racePosition).sort((a,b)=>a-b),[1,2,3,4,5,6]);
    assert.equal(await page.locator('#physics-race-position').textContent(),`${['1st','2nd','3rd','4th','5th','6th'][rank-1]} / ${cars.length}`);
  };
  const initial=await inspect();compare(initial);
  for(let index=0;index<6;index++){
    await page.selectOption('#practice-car',String(index));
    const selected=await inspect();compare(selected);await checkRacePosition(selected);
  }
  await page.selectOption('#practice-car','0');
  assert.equal(await page.locator('#physics-inventory').isVisible(),true);
  assert.deepEqual(await page.locator('#physics-inventory dd').allTextContents(),['Empty','Empty']);
  assert.ok(initial.weaponBuffers>0);assert.equal(initial.weaponDraws.spawnMarkers,initial.practice.weapons.authoredPickupCount);
  assert.match(await page.locator('#racing-warning').textContent(),/Super experimental/);
  assert.match(await page.locator('label').filter({has:page.locator('#practice-weapons')}).textContent(),/experimental/);
  let launchPosition;
  for(let start=0;start<700;start+=10){
    //Use the real DOM single-step control; no mutable simulation test API.
    await page.evaluate(()=>{for(let i=0;i<10;i++)document.getElementById('practice-step').click();});
    for(let i=0;i<10;i++)session.step();
    const value=await inspect();compare(value);await checkRacePosition(value);assert.equal(value.practice.ticks,start+10);
    const weapons=value.practice.weapons,projectile=weapons.projectiles[22];
    assert.equal(value.weaponDraws.pickups,weapons.pickups.filter(row=>row.visible).length);
    assert.equal(value.weaponDraws.projectiles,weapons.projectiles.filter(row=>row.visible).length);
    observed.spawn||=value.weaponDraws.pickups>0;
    observed.collection||=value.practice.cars.some(car=>car.inventory.some(code=>code!==255));
    observed.launch||=value.weaponDraws.projectiles>0;
    if(projectile.visible){if(launchPosition)observed.movement||=JSON.stringify(projectile.position)!==launchPosition;else launchPosition=JSON.stringify(projectile.position);}
    observed.detonation||=projectile.state===16;observed.released||=observed.detonation&&projectile.state===0;
    observed.terrainWave||=weapons.effects.terrainWaveActive;
    if([60,350,400,410,500,560,700].includes(value.practice.ticks)){
      snapshots.push({tick:value.practice.ticks,draws:value.weaponDraws,inventory:value.practice.cars.map(car=>car.inventory),racePositions:value.practice.cars.map(car=>car.racePosition),groundState:projectile.state});
      if(value.practice.ticks===350)assert.deepEqual(await page.locator('#physics-inventory dd').allTextContents(),['Wormhole','Triple missiles']);
      if(value.practice.ticks===400){await page.selectOption('#practice-car','2');const selected=await inspect();compare(selected);await checkRacePosition(selected);assert.equal(selected.followedCarIndex,2);assert.match(await page.locator('#practice-inventory').textContent(),/Car 3/);assert.deepEqual(await page.locator('#physics-inventory dd').allTextContents(),['Empty','Homing missile']);}
      if([60,400,500].includes(value.practice.ticks))await page.screenshot({path:path.join(output,`weapons-tick-${value.practice.ticks}.png`)});
    }
  }
  assert.ok(Object.values(observed).every(Boolean),JSON.stringify(observed));
  await page.locator('#practice-reset').click();session.reset();
  await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.ticks===0);
  const reset=await inspect();compare(reset);await checkRacePosition(reset);assert.equal(await page.locator('#practice-weapons').isChecked(),true);
  await page.locator('#practice-weapons').uncheck();
  await page.waitForFunction(()=>!window.rollcageViewer.inspect().loading&&window.rollcageViewer.inspect().practice?.weapons?.enabled!==true);
  const disabled=await inspect();assert.equal(disabled.weaponBuffers,0);assert.equal(disabled.weaponDraws.spawnMarkers,0);assert.equal(disabled.practice.ticks,0);
  assert.equal(await page.locator('#physics-inventory').isVisible(),false);
  await page.locator('#practice-weapons').check();
  await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.weapons?.enabled&&window.rollcageViewer.inspect().practice?.state==='ready');
  const reenabled=await inspect();compare(reenabled);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('#practice-weapons').isVisible(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.screenshot({path:path.join(output,'weapons-mobile.png')});
  await page.selectOption('#track',String(getGame('rollcage').tracks.find(track=>track.name==='LOW/LEV16.BLP').index));
  await page.waitForFunction(()=>window.rollcageViewer.inspect().track==='LOW/LEV16.BLP'&&!window.rollcageViewer.inspect().loading);
  const excluded=await inspect();assert.equal(excluded.practice,null);assert.equal(excluded.weaponBuffers,0);assert.equal(await page.locator('#practice-weapons').isDisabled(),true);
  const webglError=await page.evaluate(()=>document.getElementById('canvas').getContext('webgl').getError());
  assert.equal(webglError,0);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  const report={passed:true,method:'Actual headless Edge default-enabled weapons, followed-car HUD pickup slots and native race rank, all six selections, local archive UI, real DOM700single-steps, complete Node/browser enabled-state equality every10ticks, original pickups/projectile rendering and AI collection/launch/movement/detonation/release/wave states, toggle/reset/selection/mobile/excluded-track cleanup.',defaultWeaponsEnabled:true,inventoryHud:true,racePositionHud:true,observed,snapshots,webglError,errors,network,
    limits:['Browser/source parity only, not original-process active-combat equivalence.','Weapon sounds, trails and many effects remain outside presentation.']};
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({passed:true,ticks:700,observed,output}));
}finally{session?.dispose();await archive?.close();await browser.close();}

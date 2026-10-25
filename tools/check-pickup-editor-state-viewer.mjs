import {selectViewerWorkspace} from './lib/check-viewer-workspace.mjs';
// Narrow genuine DOM regressions; no original game launch or archive writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-pickup-editor-state-viewer.mjs INSTALLED_LAUNCHER NEW_REPORT_DIRECTORY [INSTALLATION]');
await mkdir(output);
const {chromium}=createRequire(path.resolve(launcher))('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const inspect=()=>page.evaluate(()=>window.rollcageViewer.inspect());
const idle=()=>page.waitForFunction(()=>!window.rollcageViewer.inspect().editor?.busy);
const click=async id=>{if(id.startsWith('practice-'))await selectViewerWorkspace(page,'racing');await page.locator(`#${id}`).click();await idle();};
let stage='load',report;
try {
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));
  await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));
  await page.waitForFunction(()=>{const s=window.rollcageViewer.inspect();return s.editor?.available&&!s.loading;});
  await selectViewerWorkspace(page,'editor','pickups');await page.locator('#editor-enable').check();await idle();
  const original=(await inspect()).editor.pickups;
  await page.selectOption('#editor-pickup',original[0].id);
  stage='reset-pending-duplicate';await click('editor-duplicate');
  assert.equal((await inspect()).editor.adding,true);
  await click('editor-reset-level');let state=await inspect();
  assert.equal(state.editor.adding,false);assert.deepEqual(state.editor.pickups,original);
  checks.push('Reset cancels pending duplicate and restores exact authored points');
  stage='selection-cancels-duplicate';await page.selectOption('#editor-pickup',original[0].id);await click('editor-duplicate');
  await page.selectOption('#editor-pickup',original[1].id);state=await inspect();
  assert.equal(state.editor.selected,original[1].id);assert.equal(state.editor.adding,false);
  await click('editor-reset-level');
  checks.push('Changing selection cancels pending duplicate placement');
  stage='numeric-cancels-duplicate';await page.selectOption('#editor-pickup',original[0].id);await click('editor-duplicate');
  const duplicate=(await inspect()).editor.selected;
  await page.locator('#editor-x').fill(String(original[0].position[0]+1));await page.locator('#editor-x').press('Tab');await idle();
  state=await inspect();assert.equal(state.editor.adding,false);assert.equal(state.editor.pickups.find(row=>row.id===duplicate).position[0],original[0].position[0]+1);
  await click('editor-reset-level');
  checks.push('Numeric duplicate placement commits and cancels placement mode');
  stage='test-clean-race-restart';await click('editor-test');
  await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.state==='running');await click('practice-start');
  await page.evaluate(()=>{for(let i=0;i<100;i++)document.getElementById('practice-step').click();});
  const previous=await inspect();assert.equal(previous.practice.state,'paused');assert.ok(previous.practice.ticks>=100);
  await selectViewerWorkspace(page,'editor','pickups');await page.locator('#editor-enable').check();await idle();
  assert.deepEqual((await inspect()).editor.pickups,original);
  await click('editor-test');await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.state==='running');await click('practice-start');
  state=await inspect();assert.equal(state.practice.state,'paused');assert.ok(state.practice.ticks<20,`Fresh test should restart, got ${state.practice.ticks} after ${previous.practice.ticks}`);
  assert.equal(state.practice.cars.length,3);assert.equal(state.practice.weapons.enabled,true);
  checks.push('Test unchanged points restarts a clean three-car race instead of resuming paused ticks');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,'pickup-editor-state.png'),fullPage:true});
  report={matched:true,checks,previousTicks:previous.practice.ticks,restartedTicks:state.practice.ticks,errors,scope:'Headless Edge DOM state regressions; installed archives read-only; no original game.'};
} catch(error) {
  report={matched:false,stage,error:error.stack,errors,state:await inspect().catch(()=>null)};
  await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
  process.exitCode=1;
} finally {
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  await browser.close();
}
console.log(JSON.stringify(report));

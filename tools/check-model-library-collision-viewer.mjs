// Browser metadata checks only; installed archives stay read-only, no game launch.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-model-library-collision-viewer.mjs INSTALLED_LAUNCHER NEW_DIRECTORY [INSTALLATION]');
await mkdir(output);
const {chromium}=createRequire(path.resolve(launcher))('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const idle=()=>page.waitForFunction(()=>!window.rollcageViewer.inspect().editor.busy);
async function track(name){
  const value=await page.locator('#track option').evaluateAll((os,n)=>os.find(o=>o.textContent.endsWith(n)).value,name);
  await page.selectOption('#track',value);
  await page.waitForFunction(n=>window.rollcageViewer.inspect().track===n+'.BLP'&&!window.rollcageViewer.inspect().loading,name.replaceAll(' / ','/'));
  await idle();await page.locator('#models-enable').check();await page.locator('#models-add').click();await idle();
}
async function model(number){
  const value=await page.locator('#model-library-entry option').evaluateAll((os,n)=>os.find(o=>o.textContent.startsWith(`Model ${n} /`))?.value,number);
  assert.ok(value,`Model ${number} exists`);await page.selectOption('#model-library-entry',value);
  return {label:await page.locator('#model-library-entry option:checked').textContent(),detail:await page.locator('#model-library-collision').textContent(),placeEnabled:await page.locator('#model-library-place').isEnabled()};
}
let report,stage='load';
try{
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));
  await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));
  await page.waitForFunction(()=>window.rollcageViewer.inspect().verified&&!window.rollcageViewer.inspect().loading);
  stage='LEV3';await track('HIGH / LEV3');
  const disabled=await model(27);assert.match(disabled.label,/no active collision/);assert.match(disabled.detail,/7 disabled shape records/);assert.equal(disabled.placeEnabled,true);
  checks.push({case:'LEV3 model 27 is placeable with seven disabled collision records',...disabled});
  const locked=await model(11);assert.match(locked.label,/active collision records.*locked/);assert.match(locked.detail,/4\/8 shapes/);assert.equal(locked.placeEnabled,false);
  checks.push({case:'LEV3 model 11 has collision but remains locked for placement',...locked});
  await page.locator('#model-library-placeable-only').check();
  await page.locator('#model-library-search').fill('active collision records');
  assert.equal(await page.locator('#model-library-entry option').count(),0);assert.equal(await page.locator('#model-library-collision').isHidden(),true);
  checks.push({case:'Empty placeable/collision search clears stale details'});
  await page.locator('#model-library-search').fill('');await model(27);
  const drawn=()=>page.evaluate(()=>window.rollcageViewer.inspect().editor.collisionPreview.drawnSegments);
  await page.waitForFunction(()=>window.rollcageViewer.inspect().editor.collisionPreview.drawnSegments===0);
  await page.locator('#model-library-show-disabled').check();await page.waitForFunction(()=>window.rollcageViewer.inspect().editor.collisionPreview.drawnSegments>0);
  checks.push({case:'Disabled LEV3 records appear only when requested, as center markers',segments:await drawn()});
  await page.locator('#model-library-show-disabled').uncheck();await page.locator('#model-library-cancel').click();
  stage='LEV2';await track('LOW / LEV2');await page.locator('#model-library-search').fill('active collision records');
  const labels=await page.locator('#model-library-entry option').allTextContents();assert.equal(labels.length,3);assert.ok(labels.every(label=>label.includes('active collision records')&&!label.includes('locked')));
  const enabled=await model(0);assert.match(enabled.detail,/1\/1 shapes \(1 volume\)/);assert.match(enabled.detail,/Shape warning/);assert.equal(enabled.placeEnabled,true);
  checks.push({case:'LEV2 placeable collision search returns models 0, 4 and 22, with a warning for tree 0',labels,...enabled});
  await page.waitForFunction(()=>window.rollcageViewer.inspect().editor.collisionPreview.drawnSegments>0);
  const withNormals=await drawn();await page.locator('#model-library-show-normals').uncheck();await page.waitForFunction(n=>window.rollcageViewer.inspect().editor.collisionPreview.drawnSegments<n,withNormals);
  const wireOnly=await drawn();assert.ok(wireOnly>0);await page.locator('#model-library-show-collision').uncheck();await page.waitForFunction(()=>window.rollcageViewer.inspect().editor.collisionPreview.drawnSegments===0);
  await page.locator('#model-library-show-collision').check();await page.locator('#model-library-show-normals').check();await page.locator('#model-library-show-model').uncheck();
  await page.waitForFunction(n=>window.rollcageViewer.inspect().editor.collisionPreview.drawnSegments===n,withNormals);
  await page.screenshot({path:path.join(output,'tree-collision-only.png'),fullPage:true});
  const cyanPixels=await page.locator('#model-library-canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl'),pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<80&&pixels[i+1]>220&&pixels[i+2]>220)count++;return count;});assert.ok(cyanPixels>20);
  checks.push({case:'Collision wireframe and normal arrows render; controls toggle overlay, normals and mesh independently',withNormals,wireOnly,cyanPixels});
  await page.locator('#model-library-show-model').check();const solid=await model(4);assert.doesNotMatch(solid.detail,/Shape warning/);
  const mutations=await page.evaluate(async()=>{
    let count=0;const observer=new MutationObserver(records=>count+=records.length);observer.observe(document.getElementById('model-library'),{subtree:true,attributes:true,childList:true,characterData:true});
    for(let i=0;i<20;i++)await new Promise(requestAnimationFrame);observer.disconnect();return count;
  });assert.equal(mutations,0);assert.deepEqual(errors,[]);
  checks.push({case:'Twenty idle modal frames produce no DOM mutations',mutations});
  report={passed:true,checks,errors,scope:'Headless Edge, authored collision metadata; no original-process contact test.'};
}catch(error){report={passed:false,stage,error:error.stack,checks,errors};process.exitCode=1;}
finally{
  await page.screenshot({path:path.join(output,'collision-library.png'),fullPage:true}).catch(()=>{});
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await browser.close();
}
console.log(JSON.stringify(report));

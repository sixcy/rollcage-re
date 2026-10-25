import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-editor-workspaces.mjs PLAYWRIGHT_LAUNCHER NEW_DIRECTORY [INSTALLATION]');
await mkdir(output);const {chromium}=createRequire(path.resolve(launcher))('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));let report,stage='load';
const inspect=()=>page.evaluate(()=>window.rollcageViewer.inspect());
const idle=()=>page.waitForFunction(()=>!window.rollcageViewer.inspect().loading&&!window.rollcageViewer.inspect().editor.busy);
async function track(name){const value=await page.locator('#track option').evaluateAll((os,n)=>os.find(o=>o.textContent.endsWith(n.replaceAll('/',' / '))).value,name);await page.selectOption('#track',value);await page.waitForFunction(n=>window.rollcageViewer.inspect().track===n+'.BLP',name);await idle();}
try{
 await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
 await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));await page.waitForFunction(()=>window.rollcageViewer.inspect().verified&&!window.rollcageViewer.inspect().loading);await idle();
 assert.equal((await inspect()).workspace,'explore');assert.equal(await page.locator('#racing-panel').isHidden(),true);assert.equal(await page.locator('#source-files').getAttribute('open'),null);
 await page.locator('#viewer-changelog').evaluate(el=>el.open=true);assert.match(await page.locator('#viewer-changelog').textContent(),/\d{4}-\d{2}-\d{2}/);await page.locator('#viewer-changelog').evaluate(el=>el.open=false);
 stage='all-levels';await page.locator('#workspace-editor').click();
 const variants=[];for(const level of Array.from({length:20},(_,i)=>i+1))for(const quality of ['LOW','HIGH']){
  await track(`${quality}/LEV${level}`);const s=await inspect();assert.ok(s.editor.models.length,`${quality}/LEV${level}`);assert.equal(await page.locator('#editor-error').textContent(),'');variants.push(`${quality}/LEV${level}`);
  if([16,17].includes(level)){assert.equal(s.practice,null);assert.equal(await page.locator('#editor-test').textContent(),'Preview changes');await page.selectOption('#editor-tool','pickups');assert.equal(await page.locator('#editor-enable').isEnabled(),true);await page.selectOption('#editor-tool','models');await page.locator('#editor-test').click();await idle();assert.equal((await inspect()).practice,null);}
 }
 checks.push({case:'All forty variants initialize editor state; LEV16/17 offer model/pickup editing and preview without AI',variants});
 stage='library';await track('HIGH/LEV2');await page.selectOption('#editor-tool','models');await page.locator('#models-add').click();await idle();
 assert.equal(await page.locator('#model-library-level option').count(),20);await page.selectOption('#model-library-level','17');await idle();assert.ok(await page.locator('#model-library-entry option').count()>0);await page.locator('#model-library-cancel').click();
 checks.push({case:'All twenty model libraries are available, including LEV17'});
 stage='race';await page.locator('#workspace-racing').click();await page.locator('#practice-start').click();await page.waitForFunction(()=>window.rollcageViewer.inspect().practice.ticks>=10);await page.locator('#workspace-editor').click();assert.equal((await inspect()).practice.state,'paused');await page.locator('#workspace-explore').click();assert.equal((await inspect()).practice.state,'paused');
 await page.selectOption('#mode','fly');assert.equal((await inspect()).mode,'fly');await page.selectOption('#mode','orbit');
 const mutations=await page.evaluate(async()=>{let n=0;const o=new MutationObserver(records=>n+=records.length);o.observe(document.getElementById('mode'),{attributes:true,childList:true,subtree:true});for(let i=0;i<20;i++)await new Promise(requestAnimationFrame);o.disconnect();return n;});assert.equal(mutations,0);
 checks.push({case:'Workspace changes pause racing, do not resume it, and retain a stable Camera selector',mutations});
 await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.locator('#workspace-editor').click();await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
 report={passed:true,checks,errors,scope:'Headless Edge with read-only installed archives. No original game execution.'};
}catch(error){report={passed:false,stage,error:error.stack,errors,state:await inspect().catch(()=>null)};process.exitCode=1;}
finally{await page.screenshot({path:path.join(output,'final.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await browser.close();}
console.log(JSON.stringify({passed:report.passed,stage,error:report.error,checks:report.checks?.length,output}));

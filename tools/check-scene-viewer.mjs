// Browser verification uses a caller-installed Playwright and Edge. It only
// opens the generated local viewer, whose textures and geometry are embedded.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [publicReaLauncher,directory]=process.argv.slice(2);
if(!publicReaLauncher||!directory)throw new Error('Pass the installed REA public launcher and generated scene directory.');
const require=createRequire(path.resolve(publicReaLauncher));
const {chromium}=require('playwright-core');
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const requests=[];page.on('request',request=>requests.push(request.url()));
 await page.goto(pathToFileURL(path.resolve(directory,'viewer.html')).href);
 await page.waitForFunction(()=>window.recoveredSceneStats||document.getElementById('error').textContent,undefined,{timeout:15000});
 await page.waitForFunction(()=>document.getElementById('error').textContent||window.recoveredSceneStats.loadedTextures===window.recoveredSceneStats.textureCount,undefined,{timeout:15000});
 await page.waitForTimeout(800);
 const result=await page.evaluate(()=>({stats:window.recoveredSceneStats,error:document.getElementById('error').textContent,
  canvas:[document.getElementById('canvas').width,document.getElementById('canvas').height],
  webglError:document.getElementById('canvas').getContext('webgl').getError()}));
 result.pageErrors=errors;
 await page.screenshot({path:path.resolve(directory,'preview.png')});
 await page.selectOption('#sector','0');
 await page.waitForTimeout(100);
 result.sectorSelect=await page.locator('#sector').inputValue();
 await page.click('#reset');
 result.resetSelect=await page.locator('#sector').inputValue();
 await page.locator('#textures').uncheck();await page.locator('#lighting').uncheck();await page.locator('#filter').check();
 await page.waitForTimeout(100);
 result.controls=await page.evaluate(()=>({textures:document.getElementById('textures').checked,lighting:document.getElementById('lighting').checked,filter:document.getElementById('filter').checked}));
 const before=await page.locator('#canvas').screenshot();
 await page.mouse.move(950,650);await page.mouse.down();await page.mouse.move(1100,700,{steps:8});await page.mouse.up();await page.mouse.wheel(0,-250);await page.waitForTimeout(150);
 result.orbitAndZoomChangeImage=!(await page.locator('#canvas').screenshot()).equals(before);
 result.webglErrorAfterControls=await page.evaluate(()=>document.getElementById('canvas').getContext('webgl').getError());
 result.externalRequests=requests.filter(url=>/^https?:/.test(url));
 await writeFile(path.resolve(directory,'browser-check.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
 if(result.error||errors.length||result.webglError||result.webglErrorAfterControls||!result.orbitAndZoomChangeImage||result.externalRequests.length||result.sectorSelect!=='0'||result.resetSelect!=='-1')process.exitCode=1;
}finally{await browser.close();}

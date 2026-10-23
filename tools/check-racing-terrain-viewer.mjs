import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';
import {buildRacingTerrainGroups} from './track-viewer/racing-terrain.mjs';

const [launcher,output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!launcher||!output)throw Error('Usage: node tools/check-racing-terrain-viewer.mjs INSTALLED_REA_LAUNCHER NEW_REPORT_DIRECTORY [INSTALLATION]');
const require=createRequire(path.resolve(launcher)),{chromium}=require('playwright-core');
await mkdir(output);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const archive=await RollcageArchive.open(installation),cases=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(...args){
      const gl=original.apply(this,args);
      if(args[0]==='webgl'&&gl&&!gl.__terrainObserved){
        gl.__terrainObserved=true;
        const ids=new Map(),uploads=new Map(),deleted=[],id=buffer=>{if(!ids.has(buffer))ids.set(buffer,ids.size+1);return ids.get(buffer);};
        let bound=null;
        const bind=gl.bindBuffer,upload=gl.bufferData,remove=gl.deleteBuffer;
        gl.bindBuffer=function(target,buffer){if(target===gl.ARRAY_BUFFER)bound=buffer;return bind.call(this,target,buffer);};
        gl.bufferData=function(target,data,usage){if(target===gl.ARRAY_BUFFER&&usage===gl.DYNAMIC_DRAW){uploads.set(id(bound),Array.from(data));}return upload.call(this,target,data,usage);};
        gl.deleteBuffer=function(buffer){const key=ids.get(buffer);if(key!==undefined){uploads.delete(key);deleted.push(key);}return remove.call(this,buffer);};
        window.__terrainGpu=()=>({uploads:[...uploads].map(([buffer,data])=>({buffer,data})),deleted});
      }
      return gl;
    };
  });
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  await page.locator('#image').setInputFiles(path.join(installation,'IDXData/Rollcage.img'));
  await page.locator('#index').setInputFiles(path.join(installation,'IDXData/Rollcage.idx'));
  await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.state==='ready');
  await page.locator('#practice-weapons').uncheck();
  await page.waitForFunction(()=>window.rollcageViewer.inspect().practice?.state==='ready'&&!window.rollcageViewer.inspect().practice?.weapons?.enabled);
  for(const name of ['LOW/LEV4.BLP','LOW/LEV8.BLP','LOW/LEV14.BLP','LOW/LEV18.BLP']){
    const track=getGame('rollcage').tracks.find(row=>row.name===name),{data}=await archive.readResource(track.index),{data:textures}=await archive.readResource(track.textureIndex);
    await page.selectOption('#track',String(track.index));
    await page.waitForFunction(expected=>window.rollcageViewer.inspect().track===expected&&window.rollcageViewer.inspect().practice?.state==='ready'&&window.rollcageViewer.inspect().terrainBuffers>0,name);
    const ready=await page.evaluate(()=>window.rollcageViewer.inspect());
    assert.equal(ready.terrainDraws.segments,ready.practice.terrain.segments.length);
    const session=createSession(data,textures,{vehicleTypes:[0,1,2,3,4,5],aiDifficulty:2});
    const readGpu=()=>page.evaluate(()=>window.__terrainGpu());
    const assertGpu=async state=>{
      const actual=(await readGpu()).uploads.map(row=>row.data);
      const decoded=await getGame('rollcage').loadTrack(archive,track);
      const expected=session.assets.terrain.segments.flatMap(template=>buildRacingTerrainGroups(template,state.terrain.segments.find(row=>row.index===template.index),state.terrain.palette,decoded.textures)).map(row=>Array.from(row.data));
      assert.equal(actual.length,expected.length);
      for(let index=0;index<expected.length;index++)assert.deepEqual(actual[index],expected[index],`Actual GPU upload ${name}/${index}`);
    };
    await assertGpu(ready.practice);
    await page.screenshot({path:path.join(output,`${name.replaceAll('/','-').replace('.BLP','')}-ready.png`)});
    const readyVertices=ready.practice.terrain.segments.map(row=>row.vertices);
    for(let tick=0;tick<300;tick++)session.step();
    await page.evaluate(async()=>{
      for(let batch=0;batch<15;batch++){
        for(let step=0;step<20;step++)document.getElementById('practice-step').click();
        await new Promise(resolve=>requestAnimationFrame(resolve));
      }
    });
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    const after=await page.evaluate(()=>window.rollcageViewer.inspect()),{state,...snapshot}=after.practice;
    assert.equal(state,'paused');assert.equal(snapshot.ticks,300);
    assert.equal(JSON.stringify(snapshot),JSON.stringify(session.snapshot),`Complete Node/browser animated track parity ${name}`);
    assert.notDeepEqual(snapshot.terrain.segments.map(row=>row.vertices),readyVertices);
    assert.equal(snapshot.camera.animationUnconditional,false);
    if(name==='LOW/LEV8.BLP'){
      assert.equal(snapshot.terrain.points.count,114);
      assert.deepEqual(snapshot.terrain.segments.map(row=>row.index),[4,5,9]);
      assert.ok(snapshot.terrain.points.rows.some(row=>JSON.stringify(row.position)!==JSON.stringify(row.basePosition)));
    }
    assert.ok(snapshot.lighting.dirtyRangeCount<=64);
    assert.equal(snapshot.lighting.queuedAllocationCount,0);
    await assertGpu(snapshot);
    await page.screenshot({path:path.join(output,`${name.replaceAll('/','-').replace('.BLP','')}-tick300.png`)});
    assert.equal(await page.evaluate(()=>document.getElementById('canvas').getContext('webgl').getError()),0);
    cases.push({track:name,ticks:300,segments:snapshot.terrain.segments.length,phases:snapshot.terrain.rows.map(row=>row.phase),pointCount:snapshot.terrain.points.count,lighting:snapshot.lighting,camera:snapshot.camera,terrainDraws:after.terrainDraws,fullStateParity:true,exactGpuUploads:true});
    session.dispose();
  }
  const previousBuffers=(await page.evaluate(()=>window.__terrainGpu())).uploads.map(row=>row.buffer);
  await page.selectOption('#track',String(getGame('rollcage').tracks.find(row=>row.name==='LOW/LEV16.BLP').index));
  await page.waitForFunction(()=>window.rollcageViewer.inspect().track==='LOW/LEV16.BLP'&&!window.rollcageViewer.inspect().loading);
  const cleared=await page.evaluate(()=>({viewer:window.rollcageViewer.inspect(),gpu:window.__terrainGpu()}));
  assert.equal(cleared.viewer.terrainBuffers,0);assert.equal(cleared.gpu.uploads.length,0);
  assert.ok(previousBuffers.every(buffer=>cleared.gpu.deleted.includes(buffer)));
  assert.deepEqual(errors,[]);
  const report={matched:true,method:'Actual Edge animated-track sessions with original installed assets,300 manual native ticks per LOWLEV4/8/14/18,complete Node/browser snapshot equality, exact live WebGL DYNAMIC_DRAW uploads including position/normal/palette floats, actual camera-mode gating, late point animation, native dirty-range aging, screenshots and buffer release on excluded-track change. No original game launched.',cases,cleared:true,errors,limits:'Display normals use triangle cross products over native completed vertices. This is a viewer presentation adapter, not the original dirty-range lighting/GPU renderer or original-process trajectory equivalence.'};
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({matched:true,tracks:cases.length,output}));
}finally{await archive.close();await browser.close();}

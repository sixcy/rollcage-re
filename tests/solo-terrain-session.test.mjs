import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';
import {ByteBuffer} from '../tools/track-viewer/byte-buffer.mjs';
import {buildViewerBundle} from '../tools/lib/track-viewer-bundle.mjs';
import {buildRacingTerrainGroups} from '../tools/track-viewer/racing-terrain.mjs';
import {interpolateRacingPresentation} from '../tools/track-viewer/solo-presentation.mjs';

test('browser scalar offsets and bounded UTF8 writes retain the Node Buffer interface used by native spans and camera formatting', () => {
  const native = Buffer.from([1,2,3,4,5,6,7,8]), browser = ByteBuffer.from(native);
  for (const reader of ['readUInt32LE','readUInt16LE','readInt32LE','readInt16LE','readUInt8','readInt8','readFloatLE','readDoubleLE','readBigUInt64LE']) assert.equal(browser[reader](), native[reader]());
  native.writeInt16LE(-301); browser.writeInt16LE(-301); assert.deepEqual([...browser], [...native]);
  for (const [text, offset, length] of [['3 Player\0',0,8], ['€',1,2], ['é',2,2]]) {
    assert.equal(browser.write(text,offset,length), native.write(text,offset,length));
    assert.deepEqual([...browser], [...native]);
  }
});

test('racing terrain display consumes changed native vertices, diagonal flags and palette colors without mutating inputs', () => {
  const template = {index: 2, columns: 1, rows: 1, faces: [{page: 0, uv: [[0,0],[1,0],[0,1],[1,1]], gridIndices: [0,1,2,3]}]};
  const palette = [[255,255,255,0], [40,40,40,0]], textures = new Map([[0,{width:2,height:2}]]);
  const before = {index:2,columns:1,rows:1,vertices:[[0,0,0,0],[10,0,0,0],[0,0,10,0],[10,0,10,4]]};
  const after = structuredClone(before); after.vertices[0] = [0,-4,0,64]; after.vertices[3][3] = 6;
  const saved = structuredClone({template,before,after,palette});
  const original = buildRacingTerrainGroups(template,before,palette,textures)[0], changed = buildRacingTerrainGroups(template,after,palette,textures)[0];
  assert.equal(changed.vertices,6); assert.equal(changed.data.length,66);
  assert.notDeepEqual(changed.data,original.data);
  assert.equal(changed.data[1],4); assert.ok(Math.abs(changed.data[8]-40/255)<1e-7);
  assert.notDeepEqual([...changed.data.slice(5,8)],[...original.data.slice(5,8)]);
  assert.deepEqual({template,before,after,palette},saved);
});

const installation='C:/Program Files (x86)/Psygnosis/Rollcage';
test('LEV8 restores point XYZ before physics, retains its surface flags and renders late points with bounded dirty ownership', {skip:!existsSync(`${installation}/IDXData/Rollcage.idx`)}, async () => {
  const archive=await RollcageArchive.open(installation);
  try {
    const track=getGame('rollcage').tracks.find(row=>row.name==='LOW/LEV8.BLP');
    const {data}=await archive.readResource(track.index),{data:textures}=await archive.readResource(track.textureIndex),original=Buffer.from(data);
    let session,previousFlags=null,physicsChecks=0;
    session=createSession(data,textures,{onDebugFrame(frame){
      if(frame.stage!=='after-physics')return;
      const rows=session.snapshot.terrain.points.rows;
      assert.equal(rows.length,114);
      for(const row of rows)assert.deepEqual(row.position,row.basePosition,'Physical queries use restored base coordinates.');
      if(previousFlags)assert.deepEqual(rows.map(row=>row.flags>>>6),previousFlags,'Restoration preserves the late material/palette flags.');
      physicsChecks++;
    }});
    const browserCreate=runInNewContext(await buildViewerBundle('src/solo-session.mjs'),{btoa,atob,TextEncoder,TextDecoder}).createSession;
    const browser=browserCreate(data,textures),initial=session.snapshot;
    assert.equal(initial.terrain.rows.length,0);assert.equal(initial.terrain.points.count,114);
    assert.deepEqual(session.assets.terrain.segments.map(row=>row.index),[4,5,9]);
    for(let tick=0;tick<60;tick++){
      const state=session.step();browser.step();
      assert.equal(JSON.stringify(state),JSON.stringify(browser.snapshot));
      previousFlags=state.terrain.points.rows.map(row=>row.flags>>>6);
      assert.ok(state.lighting.dirtyRangeCount<=64);assert.equal(state.lighting.queuedAllocationCount,0);
    }
    assert.equal(physicsChecks,60);
    assert.ok(session.snapshot.terrain.points.rows.some(row=>JSON.stringify(row.position)!==JSON.stringify(row.basePosition)));
    assert.deepEqual(session.reset(),initial);assert.deepEqual(data,original);
    session.dispose();browser.dispose();
  } finally {await archive.close();}
});
test('installed animated track shares real camera bodies, native terrain eligibility and complete browser state', {skip:!existsSync(`${installation}/IDXData/Rollcage.idx`)}, async () => {
  const archive=await RollcageArchive.open(installation);
  try {
    const {data}=await archive.readResource(36),{data:textures}=await archive.readResource(37), saved=Buffer.from(data);
    const options={vehicleTypes:[0,1,2,3,4,5],aiDifficulty:2}, session=createSession(data,textures,options);
    const initial=session.snapshot, browserCreate=runInNewContext(await buildViewerBundle('src/solo-session.mjs'),{btoa,atob,TextEncoder,TextDecoder}).createSession;
    const browser=browserCreate(data,textures,options);
    assert.equal(initial.terrain.rows.length,1); assert.equal(initial.terrain.rows[0].phase,0);
    assert.equal(initial.camera.animationUnconditional,true); assert.equal(initial.camera.bodies.length,6);
    assert.equal(initial.camera.physicalBodyCount,19);
    assert.equal(session.assets.terrain.segments[0].index,initial.terrain.segments[0].index);
    for(const row of initial.camera.bodies){assert.equal(row.flags&511,4);assert.equal(row.controllerAddress,row.controllerBacklink);assert.equal(row.controllerAddress,0x909060+row.index*0x4c);}
    let previous=initial;
    for(let tick=1;tick<=300;tick++){
      const state=session.step();if(tick<=150)assert.equal(JSON.stringify(browser.step()),JSON.stringify(state),`Complete browser parity${tick}`);
      if(tick<=2){
        assert.equal(state.lighting.highWaterCount,initial.lighting.highWaterCount+6,'Each car publishes one attached light; the once guard prevents duplicates.');
        assert.equal(state.lighting.queuedAllocationCount,0,'The final native light pass consumes the animation requests.');
      }
      if(tick===40){
        const presentation=interpolateRacingPresentation(previous,state,0.5), a=previous.terrain.segments[0].vertices,b=state.terrain.segments[0].vertices;
        assert.deepEqual(presentation.terrain.segments[0].vertices,b.map((vertex,i)=>vertex.map((value,axis)=>axis<3?(a[i][axis]+value)/2:value)));
        assert.ok(Object.isFrozen(state.terrain.segments[0].vertices[0]));
      }
      previous=state;
    }
    assert.equal(previous.camera.animationUnconditional,false,'The actual camera mode policy clears the constructor flag.');
    assert.ok(previous.terrain.rows[0].phase>0&&previous.terrain.rows[0].phase<300,'Real camera position gating pauses this authored sector.');
    assert.notDeepEqual(previous.camera.bodies[0].positionQ16,initial.camera.bodies[0].positionQ16);
    assert.notDeepEqual(previous.terrain.segments[0].vertices,initial.terrain.segments[0].vertices);
    assert.deepEqual(data,saved);assert.deepEqual(session.reset(),initial);
    session.dispose();browser.dispose();
  } finally {await archive.close();}
});

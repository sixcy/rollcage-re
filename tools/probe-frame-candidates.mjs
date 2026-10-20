import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {writeFile} from 'node:fs/promises';
import template from '../src/vehicle-contact-template.json' with {type:'json'};
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {createModelCollisionContext,buildModelCandidates} from '../src/model-candidates.mjs';
import {buildTerrainCandidates} from '../src/terrain-candidates.mjs';
import {buildFrameCandidates,candidateArenaView} from '../src/frame-candidates.mjs';
import {BodyShapePool,registerBodyCollisionShapes} from '../src/body-shape-registration.mjs';
import {BodySpatialRegistry,createBodySpatialSelector} from '../src/body-spatial.mjs';
import {initializeVehicleContacts} from '../src/vehicle-contacts.mjs';
import {beginPhysicsFrame} from '../src/physics-frame-state.mjs';
const descriptors=Buffer.from(template.shapes.hex,'hex'),geometry=initializeVehicleContacts(),summary={resources:0,batches:0,bodies:0,registeredRecords:0,terrainCandidates:0,modelCandidates:0,overwrittenArenaSlots:0,modelViewsChangedByLaterWrites:0,outsideStates:0},resources=[],failures=[];
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const grid=parseCollisionGrid(data);if(!grid.available)continue;
   const {data:btp}=await archive.readResource(entry.index+1),models=createModelCollisionContext(data,btp,{spatial:grid.spatial}),buckets=grid.spatial.nodes.map(()=>({headId:0})),select=createBodySpatialSelector(grid.spatial,buckets),counts={resource:entry.index,batches:0,bodies:0,terrainCandidates:0,modelCandidates:0,overwrittenArenaSlots:0};
   const spatialStateFor=body=>({found:true,outside:body.spatialOutside,node:grid.spatial.nodes[buckets.indexOf(body.spatialBucket)]});
   for(const sector of grid.sectors) {
    const active=sector.cells.filter(cell=>cell.covered);if(!active.length)continue;
    const physical=[],pool=new BodyShapePool(Buffer.alloc(72*32,0xa5),Array.from({length:32},(_,id)=>id));
    for(let profile=0;profile<3;profile++) {
     const cell=active[Math.floor((active.length-1)*profile/2)],form=cell.forms[0],position=[0,1,2].map(axis=>Math.trunc(form.indices.reduce((sum,index)=>sum+sector.vertices[index][axis],0)/form.indices.length));position[1]-=40;
     const body={flags:3,collisionFlags:0,position:position.map(value=>value<<16),linearVelocity:profile===0?[0,0,0]:profile===1?[12*65536,8*65536,-6*65536]:[-16*65536,-4*65536,10*65536],collisionCooldown66f:64,closestTerrain11c:null};
     const aggregate=registerBodyCollisionShapes(body,descriptors,pool,physical);aggregate.writeInt32LE(Math.max(aggregate.readInt32LE(64),geometry.wheelRadiusQ8),64);
    }
    const registry=new BodySpatialRegistry(physical.map((body,index)=>({body,poolOffset:index*0x4000})),select);physical.forEach(body=>registry.insert(body));beginPhysicsFrame(physical,physical);
    // Independent per-body outputs establish the expected two-pass writes. They
    // are deliberately retained before the parent aliases the shared arena.
    const separate=physical.map(body=>{const radiusQ8=pool.records.readInt32LE(body.collisionIds[body.collisionCount10c]*72+64),spatialState=spatialStateFor(body);return {terrain:buildTerrainCandidates(grid,body,{radiusQ8,spatialState}),model:buildModelCandidates(models,body,{radiusQ8,spatialState})};});
    const startOffset=16*(counts.batches%4),arena={entries:Array.from({length:256},()=>null),startOffset},expected=arena.entries.slice(),written=new Set();let cursor=startOffset,overwritten=0;
    function write(offset,values){values.forEach((value,index)=>{const slot=(offset>>4)+index;if(written.has(slot))overwritten++;written.add(slot);expected[slot]=value;});}
    const terrainOffsets=[],modelOffsets=[];
    for(const result of separate){terrainOffsets.push(cursor);write(cursor,result.terrain.candidates);cursor+=result.terrain.candidates.length*16;}
    for(const result of separate){modelOffsets.push(cursor);write(cursor,result.model.candidates);cursor+=result.terrain.candidates.length*16;}
    const actual=buildFrameCandidates(physical,{records:pool.records,grid,models,arena,spatialStateFor});assert.equal(actual.cursor,cursor);assert.deepEqual(arena.entries,expected);
    physical.forEach((body,index)=>{
     const {terrain,model}=separate[index];assert.equal(body.terrainCandidateOffset154,terrainOffsets[index]);assert.equal(body.modelCandidateOffset158,modelOffsets[index]);assert.equal(body.terrainWord15c,terrain.candidates.length);assert.equal(body.modelCandidateCount15e,model.candidates.length);
     if(terrain.skipped==='outside_stays_outside'){assert.equal(body.collisionState128,16);summary.outsideStates++;}else {assert.deepEqual(body.closestTerrain11c,terrain.closest);assert.equal(body.collisionBound120,terrain.closestDistanceSquared);}
     const aggregate=pool.records.subarray(body.collisionIds[body.collisionCount10c]*72,(body.collisionIds[body.collisionCount10c]+1)*72);assert.deepEqual([8,12,16].map(offset=>aggregate.readInt32LE(offset)),body.position.map(value=>value>>8));assert.deepEqual([20,24,28].map(offset=>aggregate.readInt32LE(offset)),body.linearVelocity.map(value=>value>>8));
     assert.deepEqual(candidateArenaView(arena,body),expected.slice(terrainOffsets[index]>>4,(terrainOffsets[index]>>4)+terrain.candidates.length));
     if(!isDeepStrictEqual(candidateArenaView(arena,body,'model'),model.candidates))summary.modelViewsChangedByLaterWrites++;
     counts.terrainCandidates+=terrain.candidates.length;counts.modelCandidates+=model.candidates.length;
    });
    physical.forEach(body=>registry.remove(body));assert.equal(buckets.some(bucket=>bucket.headId),false);
    counts.batches++;counts.bodies+=physical.length;counts.overwrittenArenaSlots+=overwritten;summary.registeredRecords+=pool.allocatedCount;
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,error:error.message,stack:error.stack?.split('\n').slice(0,3)});}
 }
}finally{await archive.close();}
for(const key of ['batches','bodies','terrainCandidates','modelCandidates','overwrittenArenaSlots'])summary[key]=resources.reduce((sum,resource)=>sum+resource[key],0);summary.resources=resources.length;summary.failures=failures;
const report={method:'Complete recovered4287f0 frame parent with real region and model append defaults on installed level data. Three declared synthetic vehicles per covered sector use first/middle/last covered cells, 40-unit height offset and stationary or stated velocities [12,8,-6]/[-16,-4,10] units per frame. Actual five-sphere descriptors and wheel-extended aggregate radius, explicit free-ID order, caller-owned bucket pool, recovered spatial insertion, begin-frame reset and retained candidate arena. Prior static-node identity is resolved from the body registered bucket, rather than recomputed at the midpoint. Independent terrain/model stage outputs reconstruct expected ordered arena writes, including native model-cursor advancement by terrain count and overwrite aliases. Verifies all aggregate cache coordinates, counts, offsets, nearest terrain state and arena contents, then spatial cleanup. This checks reconstruction integration, not original process behavior; instruction comparison is separately retained in frame-candidates-instruction-check.json. No sphere contact queries or responses are executed.',summary,resources};
await writeFile('analysis/frame-candidate-probes.json',JSON.stringify(report,null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;

// Source runtime + interpreted retained instructions. No original game launch.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parseModelCollision} from '../src/model-collision.mjs';
import {createSceneryDraft,compileSceneryEdits} from '../src/scenery-editor.mjs';
import {createModelCollisionContext} from '../src/model-candidates.mjs';
import {createSession} from '../src/solo-session.mjs';
import {intersectTerrain} from './track-viewer/pickup-picking.mjs';
import {verifyModelShapeSphere} from './verify-model-sphere-query-instructions.mjs';

const [output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!output)throw Error('Usage: node tools/check-scenery-car-obstacles.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),cases=[],sha=data=>createHash('sha256').update(data).digest('hex');
try{
  const game=getGame('rollcage');
  for(const quality of ['LOW','HIGH']){
    const track=game.tracks.find(t=>t.name===`${quality}/LEV2.BLP`),geometry=(await archive.readResource(track.index)).data,texture=(await archive.readResource(track.textureIndex)).data;
    const scene=game.decodeTrack(geometry,texture),baseline=createSession(geometry,texture,{aiDifficulty:2}),poses=[];
    try{for(let i=0;i<120;i++){baseline.step();poses.push(baseline.snapshot.cars[0].position);}}finally{baseline.dispose();}
    const point=poses[49],ground=intersectTerrain(scene,{origin:[point[0],-point[1]+1000,-point[2]],direction:[0,-1,0]});assert.ok(ground);
    const position=[Math.round(point[0]),Math.round(-ground.position[1]),Math.round(point[2])],models=parseGFXM(geometry).models,collision=parseModelCollision(geometry,models[0]),nativeChecks=[];
    for(const height of [-160,-40,-30,-20,-10,0,10])for(const radius of [16,24,32]){
      const result=verifyModelShapeSphere(collision,collision.shapes[0],{originQ8:[-200*256,height*256,0],deltaQ8:[400*256,0,0],radiusQ8:radius*256},{roundingMode:'nearest-even'});
      assert.equal(result.flags,0);nativeChecks.push({height,radius,...result});
    }
    const runs=[];
    for(const [model,templateIndex] of [[0,66],[4,96]]){
      const draft=createSceneryDraft(geometry,texture,2);draft.push({id:'obstacle',sourceLevel:2,templateIndex,position,yaw:0});
      const compiled=compileSceneryEdits({geometry,texture},draft,{level:2}),context=createModelCollisionContext(compiled.geometry,compiled.texture),instance=context.instances.get(compiled.indices.obstacle);
      assert.equal(instance.settings.modelIndex,model);assert.deepEqual(instance.collision.shapes.map(s=>s.raw),context.instances.get(templateIndex).collision.shapes.map(s=>s.raw));
      const node=context.spatial.lookup(position.map(n=>n*65536)).node;assert.ok(context.links.nodes[node.index].placementIndices.includes(compiled.indices.obstacle));
      const session=createSession(compiled.geometry,compiled.texture,{aiDifficulty:2});let maxPathDeviation=0;
      try{
        for(let i=0;i<120;i++){session.step();maxPathDeviation=Math.max(maxPathDeviation,Math.hypot(...session.snapshot.cars[0].position.map((v,axis)=>v-poses[i][axis])));}
        const stats=session.snapshot.stats;assert.equal(stats.modelHits>0,model===4);if(model===4)assert.ok(maxPathDeviation>100);
        runs.push({model,templateIndex,placementIndex:compiled.indices.obstacle,position,stats,maxPathDeviation});
      }finally{session.dispose();}
    }
    cases.push({quality,hashes:{geometry:sha(geometry),texture:sha(texture)},nativeChecks,runs});
  }
  const report={passed:true,scope:'Read-only installed LOW/HIGH LEV2. Reconstructed one-car Expert races, 120 ticks each. Model 0 sphere misses compared with complete interpreted retained 424040 instructions and helpers; this is not original-process evidence.',cases};
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,cases:cases.map(c=>({quality:c.quality,nativeChecks:c.nativeChecks.length,runs:c.runs})),output}));
}finally{await archive.close();}

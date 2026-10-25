import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {parseScene} from '../src/scene.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {speedPadPatterns,compileSpeedPadPatterns,speedPadFootprint} from '../src/speed-pad-patterns.mjs';
import {inspectTerrain} from '../src/terrain-editor.mjs';
import {createSession} from '../src/solo-session.mjs';
const [output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);if(!output)throw Error('Usage: node tools/validate-speed-pad-patterns.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),rows=[];
try{for(let level=1;level<=20;level++){
  const pair={};for(const q of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${q}/LEV${level}.BLP`);pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};}
  const patterns=speedPadPatterns(pair.LOW.geometry,pair.HIGH.geometry),cases=[];
  for(const q of ['LOW','HIGH']){const source=pair[q].geometry,scene=parseScene(source),info=inspectTerrain(source),grid=parseCollisionGrid(source);assert.deepEqual(compileSpeedPadPatterns(source,[]),source);
    if(patterns.length){const p=patterns.find(p=>!info.locked.has(p.sector));if(p){const target=scene.segments.flatMap(s=>s.faces.filter(f=>!info.locked.has(s.index)&&f.index%s.columns+1<s.columns&&Math.floor(f.index/s.columns)+1<s.rows&&[f.index,f.index+1,f.index+s.columns].every(i=>grid.sectors[s.index].cells[i].covered)).map(f=>({index:s.index,cell:f.index})))[0];assert.ok(target,'No fully covered arrow footprint.');for(let rotation=0;rotation<4;rotation++){
      const placement={sector:target.index,cell:target.cell,sourceSector:p.sector,sourceCell:p.cell,rotation},out=compileSpeedPadPatterns(source,[placement],{patterns,locked:info.locked}),edited=parseScene(out),footprint=speedPadFootprint(scene,placement,p);
      for(const f of footprint){const face=edited.segments[target.index].faces[f.cell];assert.equal(out.readUInt32LE(edited.uvTable+face.textureRecord*16+12)&255,1);assert.deepEqual(face.gridIndices,scene.segments[target.index].faces[f.cell].gridIndices);assert.equal(face.vertexFlags,scene.segments[target.index].faces[f.cell].vertexFlags);}
      cases.push({quality:q,rotation,cells:footprint.map(f=>f.cell)});
      if(rotation===0&&![16,17].includes(level)){const s=createSession(out,pair[q].texture,{aiDifficulty:2,vehicleTypes:[0,1,2],weaponsEnabled:true});try{for(let i=0;i<30;i++)s.step();assert.equal(s.snapshot.ticks,30);}finally{s.dispose();}}
    }}}
  }rows.push({level,patterns:patterns.length,cases});console.log(JSON.stringify(rows.at(-1)));
}}finally{await archive.close();}
await writeFile(output,JSON.stringify({passed:true,scope:'All 40 original source resources, corner/material/coverage checks and reconstructed races; no original-game runtime claim.',rows},null,2)+'\n',{flag:'wx'});

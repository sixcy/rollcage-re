// Recompile the six retained native fixtures without launching a game. This
// ties current compiler output to the resource hashes actually observed.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {createSceneryDraft} from '../src/scenery-editor.mjs';
import {compileTrackDraft} from '../src/track-editor-project.mjs';

const [output,installation='analysis/pickup-editor-native-baseline-20261024/installation']=process.argv.slice(2);
if(!output)throw Error('Usage: node tools/check-editor-v6-native-resources.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),sources=new Map(),rows=[],sha=b=>createHash('sha256').update(b).digest('hex');
try{
 for(const level of [1,2,3]){const pair={};for(const q of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${q}/LEV${level}.BLP`);pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};}sources.set(level,pair);}
 for(const quality of ['LOW','HIGH'])for(const kind of ['static-import','spline-road','reversed']){
  const suffix=quality.toLowerCase(),root=kind==='reversed'?`analysis/native-reversed-track-${suffix}-20261025-v3`:`analysis/native-scenery-editor-${kind}-${suffix}-20261025-${kind==='spline-road'?'v6b':'v6'}`;
  const expected=JSON.parse(await readFile(`${root}/${kind==='spline-road'?'spline-road':'scenery'}-expected.json`,'utf8')),pair=sources.get(expected.level);
  for(const q of ['LOW','HIGH'])for(const key of ['geometry','texture'])assert.equal(sha(pair[q][key]),expected.sourceHashes[q][key]);
  const row={level:expected.level,pickups:createPickupDraft(pair.LOW.geometry),models:expected.models??createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,expected.level),layout:expected.layout??{routes:[],checkpoints:[],starts:[]},routeTopology:expected.routes,checkpointTopology:expected.checkpoints,roads:expected.road?[expected.road]:[],reversal:expected.reversalReport??null};
  const compiled=compileTrackDraft(pair,row,sources)[quality];assert.equal(sha(compiled.geometry),expected.resourceSha256,`${kind}/${quality} geometry`);assert.equal(sha(compiled.texture),expected.textureSha256,`${kind}/${quality} texture`);
  rows.push({kind,quality,root,geometrySha256:expected.resourceSha256,textureSha256:expected.textureSha256,currentCompilerMatchesCapturedResources:true});
 }
}finally{await archive.close();}
await writeFile(output,JSON.stringify({passed:true,scope:'Read-only recompilation/hash comparison with captured native resources; no new process observation.',rows},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,cases:rows.length,output}));

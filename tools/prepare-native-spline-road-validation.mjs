// Stages genuine new terrain and authored grid relocation. Never launches a game.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rename,stat,copyFile,constants} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareNativePhysicsCapture} from './prepare-native-physics-capture.mjs';
import {createNativePickupEditorValidationConfig,writePickupArchiveParts} from './prepare-native-pickup-editor-validation.mjs';
import {RollcageArchive} from '../src/archive.mjs';
import {buildEditedArchive} from '../src/archive-write.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSplineRoad} from '../src/spline-road.mjs';
import {createSceneryDraft} from '../src/scenery-editor.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {inspectRaceLayout} from '../src/race-layout-editor.mjs';
import {compileTrackDraft} from '../src/track-editor-project.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {createSession} from '../src/solo-session.mjs';
const [output,quality='LOW',installation='analysis/pickup-editor-native-baseline-20261024/installation']=process.argv.slice(2);
if(!output||!['LOW','HIGH'].includes(quality))throw Error('Usage: node tools/prepare-native-spline-road-validation.mjs NEW_DIRECTORY LOW|HIGH [PRISTINE_INSTALLATION]');
const sha=d=>createHash('sha256').update(d).digest('hex'),root=path.resolve(output),game=getGame('rollcage'),archive=await RollcageArchive.open(path.resolve(installation)),pair={};
try{
  for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===`${q}/LEV1.BLP`);pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};}
  const originalLayout=inspectRaceLayout(pair.LOW.geometry),direction=originalLayout.checkpoints.find(c=>c.order===0).direction,n=Math.hypot(direction[0],direction[2]),forward=[direction[0]/n,direction[2]/n],right=[-forward[1],forward[0]],center=[-20000,-1000,-20000];
  const position=(along,lateral,height)=>[Math.round(center[0]+forward[0]*along+right[0]*lateral),height,Math.round(center[2]+forward[1]*along+right[1]*lateral)];
  const road=createSplineRoad({id:'native-contact-road',points:[-256,256].map(t=>({position:position(t,0,center[1]),width:256,bank:0})),surface:{sector:8,cell:263},columns:4,spacing:64}),layout={routes:[],checkpoints:[],starts:originalLayout.starts.map(s=>({index:s.index,position:position((Math.floor(s.index/2)-1)*120,s.index%2?60:-60,center[1]-60)}))};
  const compiled=compileTrackDraft(pair,{level:1,roads:[road],layout,models:createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,1),pickups:createPickupDraft(pair.LOW.geometry)}),selected=compiled[quality],data=selected.geometry,grid=parseCollisionGrid(data),sector=grid.sectors[16],s=grid.scene.segments[16];assert.equal(grid.sectors.length,17);assert.equal(sector.index,16);assert.equal(selected.texture.readUInt32LE(12),data.readUInt32LE(8));
  const sourceSession=createSession(data,selected.texture,{vehicleTypes:[0,1,2,3,4,5],aiDifficulty:2});let sourceTicks;try{for(let tick=0;tick<30;tick++)sourceSession.step();sourceTicks={ticks:sourceSession.snapshot.ticks,cars:sourceSession.snapshot.cars.length,positions:sourceSession.snapshot.cars.map(c=>c.position)};}finally{sourceSession.dispose();}
  const spans=[],add=(id,offset,length)=>spans.push({id:'terrain-'+id,offset,length,expectedHex:data.subarray(offset,offset+length).toString('hex')});
  for(const [i,index]of [0,4,20,44].filter(i=>i<s.vertices.length).entries())add('new-vertex-'+i,s.verticesOffset+index*8,6);
  add('new-packets',s.packetsOffset,Math.min(64,s.faces.length*8));add('new-last-packet',s.packetsOffset+(s.faces.length-1)*8,8);
  add('new-normals',data.readUInt32LE(0x34)+data.readUInt16LE(s.packetsOffset+2)*4,16);add('new-surface',grid.scene.uvTable+s.faces[0].textureRecord*16,16);add('authored-starts',data.readUInt32LE(0x74),48);
  const target=grid.spatial.lookup(layout.starts[0].position.map(n=>n*65536));assert.ok(target.found&&!target.outside);const node=target.node,visibility=data.readUInt32LE(0x20)+(node.referenceWord&65535)*2;
  add('new-spatial-node',data.readUInt32LE(0x68)+node.index*12,8);add('new-spatial-map',target.selected.mapPointer,2);add('new-pvs',visibility,Math.min(64,data.length-visibility));
  const allowedCellRefs=s.faces.map(f=>(16|((f.index%s.columns)<<8)|(Math.floor(f.index/s.columns)<<16))|0),probe={spans,requireContact:true,allowedCellRefs},splineRoadObservation={sectorIndex:16,sectorOffset:s.offset,sectorRows:s.rows,packetIndex:s.faces.at(-1).template,packetCount:data.readUInt32LE(8),rowStateOffset:data.readUInt32LE(0xc4),rowStateIndex:data.readUInt32LE(s.offset+0x4c),instanceOffset:data.readUInt32LE(0x3c)+data.readUInt32LE(s.offset+0x48)};
  await prepareNativePhysicsCapture(path.resolve(installation),root);await mkdir(path.join(root,'original-archives'));for(const ext of ['img','idx'])await rename(path.join(root,'installation/IDXData/Rollcage.'+ext),path.join(root,'original-archives/Rollcage.'+ext));
  const replacements=new Map();for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===`${q}/LEV1.BLP`);replacements.set(t.index,compiled[q].geometry);replacements.set(t.textureIndex,compiled[q].texture);}const originalImage=path.join(root,'original-archives/Rollcage.img'),plan=buildEditedArchive(archive.indexData,(await stat(originalImage)).size,replacements);await writePickupArchiveParts(originalImage,path.join(root,'installation/IDXData/Rollcage.img'),plan);await writeFile(path.join(root,'installation/IDXData/Rollcage.idx'),plan.index,{flag:'wx'});
  const imageSha256=sha(await readFile(path.join(root,'installation/IDXData/Rollcage.img'))),config=createNativePickupEditorValidationConfig(root,{kind:'baseline',quality,compiledData:data,indexSha256:sha(plan.index),imageSha256,frontendLevel:1});config.terrainEditorObservation=probe;config.splineRoadObservation=splineRoadObservation;config.breakpoints.push({id:'pickup-terrain-contact',rva:'0x25e2b',ranges:[]});
  const expected={profile:'new-spline-road',quality,level:1,road,layout,generated:selected.roads,probe,splineRoadObservation,sourceTicks,sourceHashes:Object.fromEntries(['LOW','HIGH'].map(q=>[q,{geometry:sha(pair[q].geometry),texture:sha(pair[q].texture)}])),resourceSha256:sha(data),textureSha256:sha(selected.texture),scope:'New LEV1 sector16 construction/render-row relocation, source packet initializer preservation, spatial/PVS references and actual native chassis/wheel terrain hit on new cells. Authored start records are moved onto a standalone road because the stock starting area reaches the four-sector lighting limit. No runtime pose/physics writes, AI-path parity or complete-race claim.'};
  await writeFile(path.join(root,'spline-road-capture-config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});await writeFile(path.join(root,'spline-road-expected.json'),JSON.stringify(expected,null,2)+'\n',{flag:'wx'});
  await copyFile('tools/lib/spline-road-native-debugger.cs',path.join(root,'observer-source.cs'),constants.COPYFILE_EXCL);await copyFile('tools/native-spline-road-capture.ps1',path.join(root,'observer-wrapper.ps1'),constants.COPYFILE_EXCL);
  const observerFiles=[];for(const name of ['observer-source.cs','observer-wrapper.ps1','spline-road-capture-config.json','spline-road-expected.json']){const bytes=await readFile(path.join(root,name));observerFiles.push({path:name,length:bytes.length,sha256:sha(bytes)});}await writeFile(path.join(root,'observer-manifest.json'),JSON.stringify({profile:'new-spline-road',files:observerFiles},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({root,quality,sectors:grid.sectors.length,spans:spans.length,contactCells:allowedCellRefs.length,splineRoadObservation}));
}finally{await archive.close();}

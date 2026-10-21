// Read-only structural feasibility check, not an AI behavior reconstruction.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {parseFirebugsTerrain} from '../src/firebugs-scene.mjs';
const directory='analysis/firebugs-resources',resources=[],failures=[];
const totals={environments:0,groups:0,nonemptyGroups:0,points:0,pointsInsideTerrainBounds:0,possibleLinks:0,possibleLinksWithinGroupCount:0};
for(const filename of (await readdir(directory)).filter(name=>/^\d+-GFXM\.bin$/.test(name)).sort((a,b)=>parseInt(a)-parseInt(b))){
 try{
  const data=await readFile(`${directory}/${filename}`),terrain=parseFirebugsTerrain(data);if(!terrain.segments.length)continue;
  const routes=parseRespawnRoutes(data),bounds=Array.from({length:3},()=>[Infinity,-Infinity]);
  for(const sector of terrain.segments)for(const point of sector.vertices)for(let axis=0;axis<3;axis++){bounds[axis][0]=Math.min(bounds[axis][0],point[axis]);bounds[axis][1]=Math.max(bounds[axis][1],point[axis]);}
  const counts={resource:parseInt(filename),sha256:createHash('sha256').update(data).digest('hex'),groups:routes.groups.length,nonemptyGroups:0,points:0,pointsInsideTerrainBounds:0,possibleLinks:0,possibleLinksWithinGroupCount:0,bounds,pointBounds:Array.from({length:3},()=>[Infinity,-Infinity])};
  for(const group of routes.groups){if(group.count)counts.nonemptyGroups++;for(const point of group.points){
   counts.points++;if(point.position.every((value,axis)=>value>=bounds[axis][0]&&value<=bounds[axis][1]))counts.pointsInsideTerrainBounds++;
   point.position.forEach((value,axis)=>{counts.pointBounds[axis][0]=Math.min(counts.pointBounds[axis][0],value);counts.pointBounds[axis][1]=Math.max(counts.pointBounds[axis][1],value);});
   const word=point.bytes.readUInt32LE(12);for(const [id,index]of [[word&31,(word>>>5)&511],[(word>>>14)&31,(word>>>19)&511]])if(id){counts.possibleLinks++;if(routes.groups[id]&&index<routes.groups[id].count)counts.possibleLinksWithinGroupCount++;}
  }}
  for(const name of ['groups','nonemptyGroups','points','pointsInsideTerrainBounds','possibleLinks','possibleLinksWithinGroupCount'])totals[name]+=counts[name];resources.push(counts);
 }catch(error){failures.push({filename,error:error.message});}
}
totals.environments=resources.length;
const report={method:'Structural feasibility using retained extracted Firebugs Europe GFXM bytes. Correct-base native loader80061328 independently establishes shared authored byte79/group table8c/point base98 and12-byte group relocation. Reuses the Redux16-byte point hypothesis and compares XYZ bounds to actual Firebugs terrain; possible packed links use Redux masks as an explicit unproven hypothesis. Passing bounds/alignment does not establish AI consumption, point-stride/link semantics, direction policy or authentic driving lines. No original process execution or viewer implementation.',nativeSource:'analysis/firebugs-native-20261021/focused-decompiled.c: FUN_80061328, route relocation and runtime publication',totals,failures,resources};
await writeFile('analysis/path-feasibility-firebugs.json',JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({totals,failures}));if(failures.length)process.exitCode=1;

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {parseScene} from '../src/scene.mjs';
import catalog from '../src/stage2-resource-map.json' with {type:'json'};

const installation=process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage Stage II',destination=process.argv[3]??'analysis/path-feasibility-stage2.json',loaderPath='analysis/stage2-native-live/024-loadera-entry.c',loader=await readFile(loaderPath,'utf8');
assert(loader.includes('FUN_0042f250'));assert(loader.includes('+ 0x8c'));assert(loader.includes('+ 0x98'));assert(loader.includes('+ 0x79'));assert(loader.includes('piVar11 = piVar11 + 3'));
const hash=data=>createHash('sha256').update(data).digest('hex'),trackMap=new Map(catalog.tracks.map(track=>[track.index,track]));
const summary={gfxmResources:0,catalogEnvironments:catalog.tracks.length,matchedEnvironments:0,environmentsWithPolylines:0,groups:0,nonemptyGroups:0,groupsWithAtLeast2Points:0,pointReferences:0,nonzeroAdjacentSegments:0,zeroLengthAdjacentSegments:0,pointsInsideTerrainXYZ:0,pointsOutsideTerrainXYZ:0,pointsInsideTerrainXZ:0,pointsOutsideTerrainXZ:0,nonzeroCandidateLinks:0,candidateLinksWithinDeclaredGroup:0,candidateLinksOutsideDeclaredGroup:0,groupsWithRepeatedEndpoint:0,byte4Values:{},failures:[]},resources=[],invalidLinkSamples=[],outsideSamples=[];
const archive=await RollcageArchive.open(installation);
try{
 for(const entry of archive.entries){
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try{
   const routes=parseRespawnRoutes(data),scene=parseScene(data),track=trackMap.get(entry.index),minimum=[32767,32767,32767],maximum=[-32768,-32768,-32768];
   for(const sector of scene.segments)for(const vertex of sector.vertices)for(let axis=0;axis<3;axis++){minimum[axis]=Math.min(minimum[axis],vertex[axis]);maximum[axis]=Math.max(maximum[axis],vertex[axis]);}
   const hasTerrain=scene.segments.length>0,counts={resource:entry.index,name:track?.name??null,category:track?.category??null,sha256:hash(data),terrainSectors:scene.segments.length,terrainBounds:hasTerrain?[minimum,maximum]:null,groups:[],points:0,insideXYZ:0,outsideXYZ:0,insideXZ:0,outsideXZ:0,linkTargetsInRange:0,linkTargetsOutOfRange:0};
   for(const group of routes.groups){
    assert.equal(group.count,data.readUInt16LE(routes.tableOffset+group.index*12));assert.equal(group.pointsOffset,routes.pointBaseOffset+data.readUInt32LE(routes.tableOffset+group.index*12+8));
    const byte4=group.bytes[4],first=group.points[0]?.position??null,last=group.points.at(-1)?.position??null;let length=0;
    summary.groups++;if(group.count)summary.nonemptyGroups++;if(group.count>=2)summary.groupsWithAtLeast2Points++;summary.byte4Values[byte4]=(summary.byte4Values[byte4]??0)+1;
    if(group.count>1&&first.every((value,axis)=>value===last[axis]))summary.groupsWithRepeatedEndpoint++;
    for(const [index,point]of group.points.entries()){
     assert.deepEqual(point.position,[0,2,4].map(offset=>data.readInt16LE(point.offset+offset)));summary.pointReferences++;counts.points++;
     if(index){const previous=group.points[index-1].position,distance=Math.hypot(...point.position.map((value,axis)=>value-previous[axis]));length+=distance;if(distance===0)summary.zeroLengthAdjacentSegments++;else summary.nonzeroAdjacentSegments++;}
     if(hasTerrain){const inside=point.position.map((value,axis)=>value>=minimum[axis]&&value<=maximum[axis]),xyz=inside.every(Boolean),xz=inside[0]&&inside[2];counts[xyz?'insideXYZ':'outsideXYZ']++;counts[xz?'insideXZ':'outsideXZ']++;summary[xyz?'pointsInsideTerrainXYZ':'pointsOutsideTerrainXYZ']++;summary[xz?'pointsInsideTerrainXZ':'pointsOutsideTerrainXZ']++;if(!xyz&&outsideSamples.length<12)outsideSamples.push({resource:entry.index,group:group.index,point:index,position:point.position,insideAxes:inside});}
     //These bit lanes are a candidate interpretation from Redux48da10, not a
     //proven StageII consumer. Structural validity is reported separately.
     const word=point.bytes.readUInt32LE(12),links=[[word&31,(word>>>5)&511],[(word>>>14)&31,(word>>>19)&511]];
     for(const [targetGroup,targetPoint]of links){if(targetGroup===0)continue;summary.nonzeroCandidateLinks++;const target=routes.groups[targetGroup],valid=!!target&&targetPoint<target.count;counts[valid?'linkTargetsInRange':'linkTargetsOutOfRange']++;summary[valid?'candidateLinksWithinDeclaredGroup':'candidateLinksOutsideDeclaredGroup']++;if(!valid&&invalidLinkSamples.length<12)invalidLinkSamples.push({resource:entry.index,group:group.index,point:index,word,targetGroup,targetPoint,targetCount:target?.count??null});}
    }
    counts.groups.push({index:group.index,points:group.count,byte2:group.reverseByte2,byte4,byte05:group.byte05,first,last,repeatedEndpoint:group.count>1&&first.every((value,axis)=>value===last[axis]),openPolylineLength:length});
   }
   summary.gfxmResources++;if(track){summary.matchedEnvironments++;if(routes.groups.some(group=>group.count>=2))summary.environmentsWithPolylines++;}resources.push(counts);
  }catch(error){summary.failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
assert.equal(summary.matchedEnvironments,catalog.tracks.length);const report={method:'Read-only StageII installed-data feasibility check. Existing Redux route reader independently checks all GFXM group/point pointer bounds and signed XYZ. StageII42f250 loader lines118..126 independently establish authored+8c/+98/+79 and12-byte group relocation. Adjacent stored points form directly drawable open polylines in source coordinates; viewer transform isX,-Y,-Z. Terrain bounding-box comparisons are geometric sanity checks, not path-following/runtime evidence. Group byte4 values and repeated endpoints are reported without assuming closure semantics. Point+12 links are checked only under the candidate Redux5/9-bit lane interpretation; StageII AI/route consumer semantics and flags are not established by this check. No viewer change, game execution or installed-file write.',nativeLoader:{path:loaderPath,sha256:hash(loader),procedure:'0x42f250',lines:[118,126]},summary,resources,invalidLinkSamples,outsideSamples};
await writeFile(destination,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({destination,...summary}));if(summary.failures.length)process.exitCode=1;

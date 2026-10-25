import {parseScene} from './scene.mjs';
import {parseCollisionGrid} from './collision-grid.mjs';
import {parseGFXM} from './gfxm.mjs';
import {parsePlacements} from './placements.mjs';
import {parsePickupPlacements,createPickupDraft} from './pickup-editor.mjs';
import {parseRespawnRoutes} from './respawn-routes.mjs';
import {parseCheckpointProgression} from './respawn-progress.mjs';
import {placementMatrix,transformPlacedVertex} from './fixed-math.mjs';
import {instantiateSceneryAssembly} from './scenery-assemblies.mjs';

// 44a1c0: executable literals select terrain axes by these native logical
// stages, sectors and rows. The editor deliberately protects whole sectors.
const rules=Object.freeze({12:{sectors:[2,3,4,5,7,8,10,16],stages:[4,11]},13:{sectors:[0,4,5,24],stages:[6,7,8,9,10,11,12,13]}});
const cache=new WeakMap(),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const bounds=points=>[0,1,2].map(axis=>[Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))]);
const intersects=(a,b,margin=0)=>a.every(([lo,hi],axis)=>lo<=b[axis][1]+margin&&hi>=b[axis][0]-margin);
const pointBox=position=>position.map(n=>[n,n]);

export function editorProtectionRules(level){const rule=rules[level];return {level,sectors:[...(rule?.sectors??[])],stages:[...(rule?.stages??[])],reason:rule?`LEV${level}: executable 44a1c0 hardcodes terrain direction for protected sectors and checkpoint stages.`:''};}

export function inspectEditorProtection(data,level){
  const rule=editorProtectionRules(level);if(!rule.sectors.length)return {...rule,regions:[]};
  let levels=cache.get(data);if(!levels){levels=new Map();cache.set(data,levels);}if(levels.has(level))return levels.get(level);
  const scene=parseScene(data),regions=rule.sectors.flatMap(index=>{const s=scene.segments[index];return s?[{sector:index,bounds:bounds(s.vertices),cells:s.faces.map(f=>bounds(f.gridIndices.map(i=>s.vertices[i]))),segment:s}]:[];}),result={...rule,regions};levels.set(level,result);return result;
}

export function protectedBoundsReason(data,level,box,{clearance=128}={}){
  const info=inspectEditorProtection(data,level),hit=info.regions.find(r=>intersects(box,r.bounds,clearance)&&r.cells.some(cell=>intersects(box,cell,clearance)));
  return hit?`LEV${level} sector ${hit.sector} is protected because executable 44a1c0 hardcodes its terrain direction. This edit touches the protected road area.`:'';
}
export const protectedPositionReason=(data,level,position,options)=>protectedBoundsReason(data,level,pointBox(position),options);

function modelBounds(source,row){
  const models=parseGFXM(source.geometry).models,p=parsePlacements(source.texture,models).records[row.templateIndex];if(!p)throw Error('Protected-area validation requires an existing model template.');
  const model=models[p.modelIndex],angles=[...p.angles];angles[1]=row.yaw;const matrix=placementMatrix(angles),vertices=model?.vertices??[[0,0,0]];
  return bounds(vertices.map(v=>transformPlacedVertex(v,matrix,row.position)));
}

// A semantic policy over immutable source identities and proposed operations.
// Native compilers still validate ordinary widths, geometry and references.
export function validateProtectedTrackDraft(source,{level,terrain,layout,routeTopology,checkpointTopology,pickups,models,assemblies=[],roads=[]},donors){
  const rule=editorProtectionRules(level);if(!rule.sectors.length)return {protected:false};
  const reject=(reason,label)=>{if(reason)throw Error(`${label}: ${reason}`);},position=(p,label)=>reject(protectedPositionReason(source.geometry,level,p),label);
  for(const row of [...(terrain?.heights??[]),...(terrain?.surfaces??[]),...(terrain?.patterns??[])])if(rule.sectors.includes(row.sector))throw Error(`LEV${level} sector ${row.sector} is protected; terrain and surface editing are disabled.`);
  const checkpoints=parseCheckpointProgression(source.geometry),originalPlanes=new Map();
  for(const id of new Set([...checkpoints.checkpointIds90].filter(id=>id!==255))){const offset=checkpoints.checkpointsOffset+id*20,stage=source.geometry[offset+1];originalPlanes.set(id,{id,stage,sector:source.geometry[offset],position:[4,6,8].map(o=>source.geometry.readInt16LE(offset+o)),direction:[12,14,16].map(o=>source.geometry.readInt16LE(offset+o)),timingMarker:Boolean(source.geometry[offset+18]&1)});}
  const lockedPlane=p=>rule.stages.includes(p.stage)||rule.sectors.includes(p.sector);
  for(const row of layout?.checkpoints??[]){const p=originalPlanes.get(row.id);if(p&&lockedPlane(p)&&(!same(p.position,row.position)||!same(p.direction,row.direction)))throw Error(`LEV${level} checkpoint stage ${p.stage} is protected.`);}
  if(checkpointTopology){
    if(checkpointTopology.checkpoints.length!==checkpoints.checkpointCount44)throw Error(`LEV${level} checkpoint topology is protected; stage numbering must remain unchanged.`);
    checkpointTopology.checkpoints.forEach((cp,stage)=>{const ids=[...checkpoints.checkpointIds90.subarray(stage*4,stage*4+4)];if(cp.id!==`checkpoint-${stage}`||cp.planes.some((p,lane)=>ids[lane]===255?p!==null:!p||p.id!==`plane-${ids[lane]}`||p.sourceId!==ids[lane]))throw Error(`LEV${level} checkpoint ordering is protected; stage numbering must remain unchanged.`);
      for(const plane of cp.planes){if(!plane)continue;const p=originalPlanes.get(plane.sourceId);if(p&&lockedPlane(p)&&(!same(p.position,plane.position)||!same(p.direction,plane.direction)||p.timingMarker!==plane.timingMarker))throw Error(`LEV${level} checkpoint stage ${p.stage} is protected, including its plane direction and timing flag.`);}
    });
  }
  for(const row of layout?.starts??[]){const offset=source.geometry.readUInt32LE(0x74)+row.index*8;position([0,2,4].map(o=>source.geometry.readInt16LE(offset+o)),'Original starting grid');position(row.position,'Starting grid');}
  for(const row of layout?.routes??[]){const p=parseRespawnRoutes(source.geometry).groups[row.group]?.points[row.point];if(p&&!same(p.position,row.position))position(p.position,'Original route point');position(row.position,'Route point');}
  if(routeTopology){
    const original=parseRespawnRoutes(source.geometry),current=new Map(routeTopology.groups.flatMap(g=>g.points.map(p=>[p.id,p]))),initial=new Map();
    for(const g of original.groups)for(const [i,p]of g.points.entries())initial.set(`g${g.index}:p${i}`,{position:p.position,minSpeed:p.bytes[6],targetSpeed:p.bytes[7],flags:p.bytes.readUInt32LE(8),links:p.bytes.readUInt32LE(12),group:g.index});
    for(const [id,p]of initial){const row=current.get(id),g=routeTopology.groups.find(g=>g.sourceGroup===p.group),sourceGroup=original.groups[p.group];
      const unchanged=row&&same(row.position,p.position)&&row.minSpeed===p.minSpeed&&row.targetSpeed===p.targetSpeed&&g?.header[2]===sourceGroup.bytes[2]&&row.links.every((link,slot)=>{const word=p.links>>>slot*14,group=word&31,point=word>>>5&511;return group?link?.groupId===`g${group}`&&link.pointId===`g${group}:p${point}`:link===null;});
      if(!unchanged){position(p.position,'Original route point');if(row){position(row.position,'Route point');for(const link of row.links??[]){const target=link&&current.get(link.pointId);if(target)position(target.position,'Route branch destination');}}}
    }
    for(const [id,row]of current)if(!initial.has(id))position(row.position,'Added route point');
  }
  if(pickups){const original=createPickupDraft(source.geometry),now=new Map(pickups.map(p=>[p.id,p]));for(const p of original){const row=now.get(p.id);if(!row||!same(row,p)){position(p.position,'Original pickup');if(row)position(row.position,'Pickup');}}for(const row of pickups)if(!original.some(p=>p.id===row.id))position(row.position,'Added pickup');}
  if(models){
    const parsed=parsePlacements(source.texture,parseGFXM(source.geometry).models),original=parsed.records.map(p=>({id:`original-${p.index}`,sourceLevel:level,templateIndex:p.index,position:p.position,yaw:p.angles[1]})),now=new Map(models.map(p=>[p.id,p]));
    for(const p of original){const row=now.get(p.id);if(!row||!same(row,p))reject(protectedBoundsReason(source.geometry,level,modelBounds(source,p)),'Original scenery');}
    for(const row of models)if(!same(row,original.find(p=>p.id===row.id))){const donor=row.sourceLevel===level?source:donors?.get(row.sourceLevel);if(!donor)throw Error('Scenery protection requires its source library.');reject(protectedBoundsReason(source.geometry,level,modelBounds(donor,row)),'Scenery');}
  }
  for(const command of assemblies)for(const row of instantiateSceneryAssembly(source,command.templateIndex,{...command,level}).members)reject(protectedBoundsReason(source.geometry,level,modelBounds(source,row)),'Assembly');
  for(const road of roads)for(const p of road.points??[])reject(protectedBoundsReason(source.geometry,level,p.position.map((n,axis)=>[n-(axis===1?128:p.width/2),n+(axis===1?128:p.width/2)])),'New road');
  return {protected:true,...rule};
}

export function validateProtectedCompiledTerrain(original,compiled,level){
  const info=inspectEditorProtection(original,level);if(!info.regions.length)return;
  const scene=parseScene(compiled);
  for(const region of info.regions){const before=region.segment,after=scene.segments[region.sector];if(!after||!same(before.vertices,after.vertices)||!same(before.faces.map(f=>[f.template,f.vertexFlags,f.uv,f.pageWord]),after.faces.map(f=>[f.template,f.vertexFlags,f.uv,f.pageWord])))throw Error(`LEV${level} protected sector ${region.sector} changed during compilation.`);}
  const beforeGrid=parseCollisionGrid(original),afterGrid=parseCollisionGrid(compiled);
  for(const {sector}of info.regions){const before=beforeGrid.sectors[sector],after=afterGrid.sectors[sector];if(before&&(!after||before.cells.some((cell,i)=>cell.covered!==after.cells[i]?.covered||!same(cell.forms.map(f=>[f.type,beforeGrid.normals[f.normal].packed]),after.cells[i].forms.map(f=>[f.type,afterGrid.normals[f.normal].packed])))))throw Error(`LEV${level} protected sector ${sector} collision coverage or normals changed.`);}
  const beforeCP=parseCheckpointProgression(original),afterCP=parseCheckpointProgression(compiled),rule=editorProtectionRules(level);
  for(const id of new Set([...beforeCP.checkpointIds90].filter(id=>id!==255))){const a=beforeCP.checkpointsOffset+id*20,b=afterCP.checkpointsOffset+id*20;if(rule.sectors.includes(compiled[b])&&!same([...original.subarray(a,a+20)],[...compiled.subarray(b,b+20)]))throw Error(`LEV${level} checkpoint changes touch protected sector ${compiled[b]}.`);}
  for(const s of scene.segments.slice(parseScene(original).segments.length))rejectGenerated(s);
  function rejectGenerated(s){const reason=protectedBoundsReason(original,level,bounds(s.vertices));if(reason)throw Error(`New road: ${reason}`);}
}

import {RaceLayoutEditorUI} from './race-layout-editor-ui.mjs';
import {SplineRoadEditorUI} from './spline-road-editor-ui.mjs';
import {ReversalEditorUI} from './reversal-editor-ui.mjs';
import {generateSplineRoad} from '../../src/spline-road.mjs';
import {compileSplineRoads} from '../../src/terrain-construction.mjs';
import {editorProtectionRules,inspectEditorProtection,protectedPositionReason,protectedBoundsReason} from '../../src/editor-protection.mjs';
import {emptyRaceLayoutDraft} from '../../src/race-layout-editor.mjs';
import {createRaceRouteTopology,validateRaceRouteTopology,upsertSplineRoadRoute,removeSplineRoadRoute} from '../../src/race-route-topology.mjs';
import {createCheckpointTopologyDraft} from '../../src/checkpoint-topology.mjs';
import {recoverEditedRollcageIndex,originalRollcageView} from '../../src/edited-rollcage-index.mjs';
import {TerrainEditorUI} from './terrain-editor-ui.mjs';
import {emptyTerrainDraft,compileTerrainEdits} from '../../src/terrain-editor.mjs';
import {parseScene} from '../../src/scene.mjs';
import {speedPadFootprint,speedPadPatternShape} from '../../src/speed-pad-patterns.mjs';
import {PickupEditor} from './pickup-editor-ui.mjs';
import {getGame} from '../../src/track-games.mjs';
import {parseGFXM} from '../../src/gfxm.mjs';
import {parsePlacements} from '../../src/placements.mjs';
import {placementMatrix, transformPlacedVertex} from '../../src/fixed-math.mjs';
import {SCENERY_LEVELS, inspectScenery, createSceneryDraft, inspectSceneryImport, applySceneryTransform,instantiateSceneryAssembly} from '../../src/scenery-editor.mjs';
import {buildSceneryAssemblyPreview} from '../../src/scenery-assembly-preview.mjs';
import {inspectSceneryCollisions} from '../../src/scenery-collision-info.mjs';
import {collisionLabel,collisionDescription} from './collision-label.mjs';
import {parseModelCollision,readPlacementCollision} from '../../src/model-collision.mjs';
import {buildModelCollisionPreview} from '../../src/model-collision-preview.mjs';
import {CollisionOverlay} from './collision-overlay.mjs';
import {compileTrackDraft, parseTrackProject, validateTrackProject} from '../../src/track-editor-project.mjs';
import {pickupSha256, parsePickupProject, validatePickupProject} from '../../src/pickup-editor.mjs';
import {decodeObjectCollection} from '../../src/object-catalog.mjs';
import {cameraRay, intersectTerrain, pickPickup, sourceToDisplay, displayToSource, prepareTerrainPicking} from './pickup-picking.mjs';
import {Renderer} from './renderer.mjs';
import {Navigation} from './navigation.mjs';
import {carDisplayMatrix} from './solo-presentation.mjs';
import {buildPlacedMeshes} from '../../src/placed-meshes.mjs';
import {buildScriptedEditorMeshes} from '../../src/scripted-scenery-editor.mjs';

const el=id=>document.getElementById(id), copy=value=>structuredClone(value), same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const equal=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]);
const qualityOf=track=>track.name.startsWith('HIGH/')?'HIGH':'LOW';
const levelOf=track=>Number(/\/LEV(\d+)\.BLP$/i.exec(track?.name??'')?.[1]);
const text=(id,value)=>{if(el(id).textContent!==value)el(id).textContent=value;};
const disabled=(id,value)=>{if(el(id).disabled!==value)el(id).disabled=value;};
const hidden=(id,value)=>{if(el(id).hidden!==value)el(id).hidden=value;};

export class TrackEditor extends PickupEditor {
  constructor(options) {
    super(options);
    this.modelsEditing=false;this.modelSelected=null;this.modelPending=null;this.modelDrag=null;this.modelSerial=0;this.libraryToken=0;
    this.modelPicks=new Map();this.importChecks=new Map();this.bindModels();this.terrainEditing=false;this.terrain=new TerrainEditorUI(this);this.layoutEditing=false;this.layout=new RaceLayoutEditorUI(this);this.roadEditing=false;this.variantEditing=false;this.roadsTool=new SplineRoadEditorUI(this);this.reversalTool=new ReversalEditorUI(this);this.modelOverlay=new CollisionOverlay(this.renderer);this.protectionOverlay=new CollisionOverlay(this.renderer);this.refresh();
  }
  get active(){return this.editing||this.modelsEditing||this.terrainEditing||this.layoutEditing||this.roadEditing||this.variantEditing;}
  stopRoadTools(){this.roadsTool?.cancel();this.roadEditing=false;this.variantEditing=false;}
  setRoadEditing(){this.layout.cancel();this.terrain.cancel();this.cancelModels();this.releaseMouse();this.editing=false;this.modelsEditing=false;this.terrainEditing=false;this.layoutEditing=false;this.variantEditing=false;this.roadEditing=Boolean(this.current);if(this.navigation.mode==='follow')this.navigation.setMode('orbit');this.roadsTool.ensure();this.onModeChange(this.active);this.refresh();}
  setVariantEditing(){this.stopRoadTools();this.layout.cancel();this.terrain.cancel();this.cancelModels();this.releaseMouse();this.editing=false;this.modelsEditing=false;this.terrainEditing=false;this.layoutEditing=false;this.variantEditing=Boolean(this.current);this.onModeChange(this.active);this.refresh();}
  routePointProtectionReason(row){return row&&this.current?protectedPositionReason(this.current.LOW.geometry,this.current.level,row.position):'';}
  checkpointProtectionReason(row){const rule=editorProtectionRules(this.current?.level);return row&&(rule.stages.includes(row.order)||rule.sectors.includes(row.sector))?`${rule.reason} Checkpoint stage ${row.order} is read-only.`:'';}
  modelProtectionReason(row){if(!row||!this.current||!editorProtectionRules(this.current.level).sectors.length)return '';const key=JSON.stringify([this.current.level,row]);this.protectedModelChecks??=new Map();if(!this.protectedModelChecks.has(key))this.protectedModelChecks.set(key,protectedBoundsReason(this.current.LOW.geometry,this.current.level,this.modelBounds(row).map(([lo,hi],axis)=>axis?[-hi,-lo]:[lo,hi])));return this.protectedModelChecks.get(key);}
  changed(base){return !same(base.draft,base.original)||!same(base.modelDraft,base.modelOriginal)||Boolean(base.roads?.length||base.reversal||base.assemblies?.length||base.terrainDraft?.heights.length||base.terrainDraft?.surfaces.length||base.terrainDraft?.patterns?.length||Object.values(base.layoutDraft??{}).some(rows=>rows.length))||!same(base.routeTopology,base.routeOriginal)||!same(base.checkpointTopology,base.checkpointOriginal);}
  levelDraft(base=this.current){return {level:base.level,pickups:copy(base.draft),models:copy(base.modelDraft),terrain:copy(base.terrainDraft),layout:copy(base.layoutDraft),routeTopology:copy(base.routeTopology),checkpointTopology:copy(base.checkpointTopology),assemblies:copy(base.assemblies??[]),roads:copy(base.roads??[]),reversal:copy(base.reversal??null)};}
  commitVariant(row){
    const base=this.current,compiled=compileTrackDraft({LOW:base.LOW,HIGH:base.HIGH},row,this.sources(),{requireConnected:false});this.cancelDrag();this.cancelModels();
    Object.assign(base,{draft:copy(row.pickups),modelDraft:copy(row.models),terrainDraft:copy(row.terrain),layoutDraft:copy(row.layout),routeTopology:copy(row.routeTopology),checkpointTopology:copy(row.checkpointTopology),assemblies:copy(row.assemblies??[]),roads:copy(row.roads??[]),reversal:copy(row.reversal??null)});
    for(const name of ['undo','redo','modelUndo','modelRedo','terrainUndo','terrainRedo','layoutUndo','layoutRedo','roadUndo','roadRedo'])base[name]=[];base.compiled=compiled;base.compiledSignature=this.signature(base);this.revision++;this.modelPicks.clear();this.onChange();this.refresh();
  }
  roadSnapshot(){return {roads:copy(this.current.roads),terrain:copy(this.current.terrainDraft),routes:copy(this.current.routeTopology)};}
  roadSourceGeometry(base=this.current){const signature=JSON.stringify(base.terrainDraft.heights);if(base.roadSourceSignature!==signature){base.roadSourceGeometry=compileTerrainEdits(base.LOW.geometry,{heights:base.terrainDraft.heights,surfaces:[]});base.roadSourceSignature=signature;}return base.roadSourceGeometry;}
  commitRoadState({roads,terrain=this.current.terrainDraft,routes=this.current.routeTopology},{history=true}={}){
    const base=this.current,compiled=this.compile(base,base.modelDraft,base.draft,terrain,base.layoutDraft,{roads,routes});if(history){base.roadUndo.push(this.roadSnapshot());if(base.roadUndo.length>100)base.roadUndo.shift();base.roadRedo=[];}base.roads=copy(roads);base.terrainDraft=copy(terrain);base.routeTopology=copy(routes);base.compiled=compiled;base.compiledSignature=this.signature(base);this.revision++;this.modelPicks.clear();this.onChange();this.refresh();
  }
  remapRoadPaint(roads){
    const base=this.current,current=this.compile(base).LOW,old=current.roads??[],constructed=compileSplineRoads(this.roadSourceGeometry(base),roads,{texture:base.LOW.texture}),next=constructed.generated,oldScene=parseScene(current.geometry),newScene=parseScene(constructed.data),oldMap=new Map(old.flatMap(road=>road.sectors.map((sector,part)=>[sector,{id:road.roadId,part}]))),newMap=new Map(next.map(r=>[r.roadId,r])),terrain=copy(base.terrainDraft);
    const remap=row=>{const out={...row};for(const [key,cellKey]of [['sector','cell'],['sourceSector','sourceCell']])if(oldMap.has(row[key])){const ref=oldMap.get(row[key]),sector=newMap.get(ref.id)?.sectors[ref.part];if(sector===undefined)return null;out[key]=sector;if(row[cellKey]!==undefined){const prior=oldScene.segments[row[key]],next=newScene.segments[sector],r=Math.floor(row[cellKey]/prior.columns),c=row[cellKey]%prior.columns;if(r>=next.rows||c>=next.columns)return null;out[cellKey]=r*next.columns+c;}}if(out.rotation!==undefined){try{speedPadFootprint(newScene,out,speedPadPatternShape(out));}catch{return null;}}return out;};for(const key of ['heights','surfaces','patterns'])if(terrain[key])terrain[key]=terrain[key].map(remap).filter(Boolean);return terrain;
  }
  commitRoadDefinition(road,{generateRoute=true,entryPointId=null,exitPointId=null,replaceEntry=false}={}){
    const base=this.current,roads=base.roads.filter(r=>r.id!==road.id);const index=base.roads.findIndex(r=>r.id===road.id);if(index<0)roads.push(road);else roads.splice(index,0,road);let routes=base.routeTopology;
    if(generateRoute&&road.routeTemplateGroup)routes=upsertSplineRoadRoute(base.LOW.geometry,routes,{roadId:road.id,centerline:generateSplineRoad(this.roadSourceGeometry(base),road).centerline,templateGroupId:road.routeTemplateGroup,entryPointId,exitPointId,replaceEntry}).topology;
    this.commitRoadState({roads,terrain:this.remapRoadPaint(roads),routes});this.say('Road and optional AI route applied to LOW + HIGH. Check endpoint links and tune copied speeds before racing.');
  }
  deleteRoadDefinition(id,{replacementPointId}={}){
    const base=this.current,group=base.routeTopology.groups.find(g=>g.roadId===id&&!g.retired);let routes=base.routeTopology;
    if(group){const outside=link=>link&&!group.points.some(p=>p.id===link.pointId);replacementPointId??=group.points.flatMap(p=>p.links).find(outside)?.pointId??base.routeTopology.groups.find(g=>g.sourceGroup!==null&&g.index&&g.points.length)?.points[0].id;routes=removeSplineRoadRoute(routes,id,{replacementPointId}).topology;}
    const roads=base.roads.filter(r=>r.id!==id);this.commitRoadState({roads,terrain:this.remapRoadPaint(roads),routes});this.say('Road and its generated route removed. Retired route IDs are preserved. Pickups and scenery keep their positions; inspect them before testing.');
  }
  roadHistory(from,to){const base=this.current;if(!base?.[from]?.length)return;const next=base[from].at(-1),current=this.roadSnapshot();this.commitRoadState(next,{history:false});base[from].pop();base[to].push(current);this.refresh();}
  get hasEdits(){return [...this.levels.values()].some(base=>base.modelDraft&&this.changed(base));}
  async readLevel(level,source) {
    const base=await super.readLevel(level,source);
    // Pickup loading has finished, but the shared level must not become visible
    // to a concurrent track/project/library request until BTPs and hashes finish.
    if(this.levels.get(level)===base)this.levels.delete(level);
    try {
      for(const quality of ['LOW','HIGH']) {
        const track=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV${level}.BLP`), resource=await source.readResource(track.textureIndex);
        Object.assign(base[quality],{geometry:base[quality].data,texture:resource.data,textureIndex:track.textureIndex});
        const recovered=source.indexData&&recoverEditedRollcageIndex(source.indexData);
        base[quality].originalGeometry=recovered?(await originalRollcageView(source,recovered.indexData).readResource(track.index)).data:base[quality].geometry;
      }
      if(this.archive!==source)throw Error('Archive changed while loading scenery.');
      base.modelInfo=inspectScenery(base.LOW.geometry,base.LOW.texture);base.modelOriginal=createSceneryDraft(base.LOW.geometry,base.LOW.texture,level);
      const high=createSceneryDraft(base.HIGH.geometry,base.HIGH.texture,level);
      if(!same(base.modelOriginal,high))throw Error('LOW/HIGH scenery placements differ.');
      base.highInfo=inspectScenery(base.HIGH.geometry,base.HIGH.texture);
      base.collisions={LOW:inspectSceneryCollisions(base.LOW.geometry,base.LOW.texture),HIGH:inspectSceneryCollisions(base.HIGH.geometry,base.HIGH.texture)};
      base.modelDraft=copy(base.modelOriginal);base.modelUndo=[];base.modelRedo=[];base.terrainDraft=emptyTerrainDraft();base.terrainUndo=[];base.terrainRedo=[];base.layoutDraft=emptyRaceLayoutDraft();base.layoutUndo=[];base.layoutRedo=[];
      base.routeOriginal=createRaceRouteTopology(base.LOW.geometry);base.routeTopology=copy(base.routeOriginal);base.checkpointOriginal=base.LOW.geometry[0x95]?createCheckpointTopologyDraft(base.LOW.geometry):{checkpoints:[]};base.checkpointTopology=copy(base.checkpointOriginal);base.assemblies=[];base.roads=[];base.reversal=null;base.roadUndo=[];base.roadRedo=[];
      base.hashes={};for(const quality of ['LOW','HIGH'])base.hashes[quality]={geometry:base.sourceHashes[quality],texture:await pickupSha256(base[quality].texture)};
      if(this.archive!==source)throw Error('Archive changed while checking scenery.');
      this.levels.set(level,base);
      return base;
    } catch(error){if(this.levels.get(level)===base)this.levels.delete(level);throw error;}
  }
  async setSource(...args){this.stopRoadTools();this.layout?.cancel();this.layoutEditing=false;this.terrain?.cancel();this.terrainEditing=false;this.terrain&&(this.terrain.paletteBase=null);this.cancelModels();this.importChecks?.clear();this.modelsEditing=false;this.modelSelected=null;this.libraryToken++;el('model-library').close();await super.setSource(...args);}
  clearTrack(){this.stopRoadTools();this.layout?.cancel();this.layoutEditing=false;this.terrain?.cancel();this.terrainEditing=false;this.cancelModels();this.libraryToken++;el('model-library').close();this.modelSelected=null;this.modelsEditing=false;this.modelPicks?.clear();super.clearTrack();}
  async setTrack(track,scene){this.track=track;await super.setTrack(track,scene);this.refresh();}
  validateRaceReady(base=this.current){if(!base?.modelDraft)return;const signature=this.signature(base);if(base.raceReadySignature!==signature){compileTrackDraft({LOW:base.LOW,HIGH:base.HIGH},this.levelDraft(base),this.sources(),{requireConnected:true});base.raceReadySignature=signature;}}
  setEditing(enabled,options){this.stopRoadTools();if(options?.testing)this.validateRaceReady();this.layout?.cancel();this.layoutEditing=false;this.terrain?.cancel();this.terrainEditing=false;this.cancelModels();this.modelsEditing=false;super.setEditing(enabled,options);}
  setModelsEditing(enabled){
    this.stopRoadTools();
    this.layout?.cancel();this.layoutEditing=false;this.terrain?.cancel();this.terrainEditing=false;
    this.releaseMouse();this.cancelModels();this.editing=false;this.adding=false;this.modelsEditing=Boolean(enabled&&this.current?.modelDraft);
    if(this.modelsEditing){if(this.navigation.mode==='follow')this.navigation.setMode('orbit');el('objects').checked=true;}
    this.onModeChange(this.active);this.refresh();
  }
  setTerrainEditing(kind){
    this.stopRoadTools();
    this.layout?.cancel();this.layoutEditing=false;this.releaseMouse();this.cancelModels();this.editing=false;this.modelsEditing=false;this.adding=false;this.terrainEditing=Boolean(kind&&this.current);
    if(this.terrainEditing){if(this.navigation.mode==='follow')this.navigation.setMode('orbit');this.terrain.setKind(kind);}
    this.onModeChange(this.active);this.refresh();
  }
  setLayoutEditing(kind){
    this.stopRoadTools();
    this.releaseMouse();this.cancelModels();this.terrain.cancel();this.terrainEditing=false;this.editing=false;this.modelsEditing=false;this.adding=false;this.layoutEditing=Boolean(kind&&this.current);
    if(this.layoutEditing){if(this.navigation.mode==='follow')this.navigation.setMode('orbit');this.layout.setKind(kind);}
    this.onModeChange(this.active);this.refresh();
  }
  commitLayout(draft){
    const base=this.current;if(same(draft,base.layoutDraft))return;
    this.commitTopology({layout:draft});
  }
  layoutSnapshot(base=this.current){return {layout:copy(base.layoutDraft),routes:copy(base.routeTopology),checkpoints:copy(base.checkpointTopology)};}
  commitTopology({layout=this.current.layoutDraft,routes=this.current.routeTopology,checkpoints=this.current.checkpointTopology}={}){
    const base=this.current,next={layout,routes,checkpoints};if(same(next,this.layoutSnapshot()))return;
    const compiled=this.compile(base,base.modelDraft,base.draft,base.terrainDraft,layout,{routes,checkpoints});base.layoutUndo.push(this.layoutSnapshot());if(base.layoutUndo.length>100)base.layoutUndo.shift();base.layoutRedo=[];base.layoutDraft=copy(layout);base.routeTopology=copy(routes);base.checkpointTopology=copy(checkpoints);base.compiled=compiled;base.compiledSignature=this.signature(base);this.revision++;this.onChange();this.refresh();
  }
  resetLayout(){this.commitTopology({layout:emptyRaceLayoutDraft(),routes:this.current.routeOriginal,checkpoints:this.current.checkpointOriginal});}
  layoutHistory(from,to){
    this.layout.cancel();const base=this.current;if(!base?.[from]?.length)return;const next=base[from].at(-1),compiled=this.compile(base,base.modelDraft,base.draft,base.terrainDraft,next.layout,{routes:next.routes,checkpoints:next.checkpoints});base[to].push(this.layoutSnapshot());base[from].pop();base.layoutDraft=copy(next.layout);base.routeTopology=copy(next.routes);base.checkpointTopology=copy(next.checkpoints);base.compiled=compiled;base.compiledSignature=this.signature(base);this.revision++;this.onChange();this.refresh();
  }
  signature(base){return JSON.stringify([base.modelDraft,base.draft,base.terrainDraft,base.layoutDraft,base.routeTopology,base.checkpointTopology,base.assemblies,base.roads,base.reversal]);}
  commitTerrain(draft){
    const base=this.current;if(same(draft,base.terrainDraft))return;
    const compiled=this.compile(base,base.modelDraft,base.draft,draft);base.terrainUndo.push(copy(base.terrainDraft));if(base.terrainUndo.length>100)base.terrainUndo.shift();base.terrainRedo=[];base.terrainDraft=copy(draft);base.compiled=compiled;base.compiledSignature=this.signature(base);this.revision++;this.modelPicks.clear();this.onChange();this.refresh();
  }
  terrainHistory(from,to){
    this.terrain.cancel();const base=this.current;if(!base?.[from]?.length)return;const next=base[from].at(-1),compiled=this.compile(base,base.modelDraft,base.draft,next);base[to].push(copy(base.terrainDraft));base.terrainDraft=base[from].pop();base.compiled=compiled;base.compiledSignature=this.signature(base);this.revision++;this.onChange();this.refresh();
  }
  sources(){return new Map([...this.levels].filter(([,base])=>base.modelDraft).map(([level,base])=>[level,{LOW:base.LOW,HIGH:base.HIGH}]));}
  compile(base=this.current,models=base.modelDraft,pickups=base.draft,terrain=base.terrainDraft??emptyTerrainDraft(),layout=base.layoutDraft??emptyRaceLayoutDraft(),{routes=base.routeTopology,checkpoints=base.checkpointTopology,assemblies=base.assemblies,roads=base.roads??[],reversal=base.reversal??null}={}){
    const signature=JSON.stringify([models,pickups,terrain,layout,routes,checkpoints,assemblies,roads,reversal]);
    if(base.compiledSignature===signature)return base.compiled;
    const result=compileTrackDraft({LOW:base.LOW,HIGH:base.HIGH},{level:base.level,pickups,models,terrain,layout,routeTopology:routes,checkpointTopology:checkpoints,assemblies,roads,reversal},this.sources(),{requireConnected:false});
    // Cache only committed state; rejected previews never replace it.
    if(models===base.modelDraft&&pickups===base.draft&&terrain===base.terrainDraft&&layout===base.layoutDraft&&routes===base.routeTopology&&checkpoints===base.checkpointTopology&&assemblies===base.assemblies&&roads===base.roads&&reversal===base.reversal){base.compiledSignature=signature;base.compiled=result;}
    return result;
  }
  resourcesFor(track,geometry,texture){const base=this.levels.get(levelOf(track));return base?.modelDraft?this.compile(base)[qualityOf(track)]:{geometry,texture};}
  decodeScene(geometry,texture){return getGame('rollcage').decodeTrack(geometry,texture,this.modelsEditing?{buildPlacedMeshes:(data,gfxm,placements)=>[...buildPlacedMeshes(data,gfxm,placements),...buildScriptedEditorMeshes(data,gfxm,placements)]}:{});}
  geometryFor(track,original){return this.resourcesFor(track,original,null).geometry;}
  async project(){
    if(!this.archive||!this.indexSha256)throw Error('Load original verified Rollcage archives first.');
    const levels=[...this.levels.values()].filter(b=>b.modelDraft&&this.changed(b)).sort((a,b)=>a.level-b.level).map(b=>({level:b.level,pickups:copy(b.draft),models:copy(b.modelDraft),terrain:copy(b.terrainDraft),layout:copy(b.layoutDraft),routeTopology:copy(b.routeTopology),checkpointTopology:copy(b.checkpointTopology),assemblies:copy(b.assemblies),roads:copy(b.roads??[]),reversal:copy(this.compile(b).reversalReport??b.reversal??null)}));
    const required=new Set(levels.flatMap(row=>[row.level,...row.models.map(m=>m.sourceLevel),...(row.reversal?.originalDraft?.models??[]).map(m=>m.sourceLevel)]));
    return parseTrackProject({schemaVersion:6,game:'rollcage',indexSha256:this.indexSha256,sources:[...required].sort((a,b)=>a-b).map(level=>({level,hashes:copy(this.levels.get(level).hashes)})),levels});
  }
  async restoreProject(value){
    let levels;
    if(value?.schemaVersion===1){
      const legacy=parsePickupProject(value);
      if(legacy.indexSha256!==this.indexSha256)throw Error('This project was saved with a different IMG/IDX pair. Select the same starting files used to create it, then load the project again.');
      const bases=await Promise.all(legacy.levels.map(row=>this.loadLevel(row.level)));
      validatePickupProject(legacy,{indexSha256:this.indexSha256,levels:bases.map(b=>({level:b.level,sourceHashes:b.sourceHashes,lowData:b.LOW.geometry,highData:b.HIGH.geometry}))});
      levels=legacy.levels.map(row=>({...row,models:copy(this.levels.get(row.level).modelOriginal)}));
    }else{
      const project=parseTrackProject(value);
      if(project.indexSha256!==this.indexSha256)throw Error('This project was saved with a different IMG/IDX pair. Select the same starting files used to create it, then load the project again.');
      await Promise.all(project.sources.map(row=>this.loadLevel(row.level)));
      const validated=validateTrackProject(project,{indexSha256:this.indexSha256,sources:this.sources(),hashes:new Map([...this.levels].map(([n,b])=>[n,b.hashes]))});levels=validated.project.levels;
    }
    // Hydrate legacy stable identities without revalidating moved points against
    // unedited terrain. The final paired compiler below validates them against
    // this project's terrain/scenery. Stage every level before touching visible
    // drafts so migration/second-quality failures cannot erase existing edits.
    const staged=levels.map(row=>{
      const base=this.levels.get(row.level),routes=copy(row.routeTopology??createRaceRouteTopology(base.LOW.geometry)),checkpoints=copy(row.checkpointTopology??createCheckpointTopologyDraft(base.LOW.geometry));
      if(!row.routeTopology)for(const edit of row.layout?.routes??[]){const point=routes.groups.find(g=>g.sourceGroup===edit.group)?.points.find(p=>p.sourcePoint===edit.point);if(!point)throw Error('Legacy route references a missing authored point.');Object.assign(point,{position:[...edit.position],minSpeed:edit.minSpeed,targetSpeed:edit.targetSpeed});}
      if(!row.checkpointTopology)for(const edit of row.layout?.checkpoints??[]){let found=false;for(const cp of checkpoints.checkpoints)for(const plane of cp.planes)if(plane?.sourceId===edit.id){found=true;Object.assign(plane,{position:[...edit.position],direction:[...edit.direction]});}if(!found)throw Error('Legacy checkpoint references a missing authored plane.');}
      const state={...row,terrain:copy(row.terrain??emptyTerrainDraft()),layout:{routes:[],checkpoints:[],starts:copy(row.layout?.starts??[])},routeTopology:routes,checkpointTopology:checkpoints,assemblies:copy(row.assemblies??[]),roads:copy(row.roads??[]),reversal:copy(row.reversal??null)};
      const finalCompiled=compileTrackDraft(this.sources().get(row.level),state,this.sources(),{requireConnected:false});return {state,compiled:finalCompiled};
    });
    // All resources, hashes, migrations and both quality compilers passed.
    this.cancelModels();this.cancelDrag();
    for(const base of this.levels.values())if(base.modelOriginal){base.draft=copy(base.original);base.modelDraft=copy(base.modelOriginal);base.undo=[];base.redo=[];base.modelUndo=[];base.modelRedo=[];base.terrainDraft=emptyTerrainDraft();base.terrainUndo=[];base.terrainRedo=[];base.layoutDraft=emptyRaceLayoutDraft();base.routeTopology=copy(base.routeOriginal);base.checkpointTopology=copy(base.checkpointOriginal);base.assemblies=[];base.layoutUndo=[];base.layoutRedo=[];base.compiledSignature=null;}
    for(const {state:row,compiled:result} of staged){const base=this.levels.get(row.level);base.draft=copy(row.pickups);base.modelDraft=copy(row.models);base.terrainDraft=copy(row.terrain);base.routeTopology=copy(row.routeTopology);base.checkpointTopology=copy(row.checkpointTopology);base.assemblies=copy(row.assemblies);base.roads=copy(row.roads);base.reversal=copy(row.reversal);base.layoutDraft=copy(row.layout);base.compiled=result;base.compiledSignature=this.signature(base);}
    this.revision++;this.savedRevision=this.revision;this.modelSelected=null;this.selected=null;this.onChange();
    const tool=el('editor-tool').value;if(tool==='models')this.setModelsEditing(true);else if(tool==='pickups')this.setEditing(true);else if(['routes','checkpoints','starts'].includes(tool))this.setLayoutEditing(tool);else if(tool==='roads')this.setRoadEditing();else if(tool==='reverse')this.setVariantEditing();else this.setTerrainEditing(tool);
    this.say('Track project loaded. Edits apply to LOW + HIGH.');
  }
  async exportReplacements(){
    const replacements=new Map();
    for(const base of this.levels.values())if(base.modelDraft&&this.changed(base)){this.validateRaceReady(base);const compiled=this.compile(base);for(const quality of ['LOW','HIGH']){for(const[key,indexKey]of[['geometry','index'],['texture','textureIndex']])if(!equal(compiled[quality][key],base[quality][key]))replacements.set(base[quality][indexKey],compiled[quality][key]);}}
    return replacements;
  }
  bindModels(){
    const action=(id,fn)=>el(id).addEventListener('click',()=>this.perform(fn));
    el('models-enable').addEventListener('change',()=>this.setModelsEditing(el('models-enable').checked));
    action('models-add',()=>this.openLibrary());
    action('models-delete',()=>{if(this.modelCapability(this.modelRow(),'removable'))this.commitModels(this.current.modelDraft.filter(row=>row.id!==this.modelSelected));});
    action('models-duplicate',async()=>{const row=this.modelRow();if(row&&this.modelCapability(row,'duplicable'))await this.beginPlacement(row.sourceLevel,row.templateIndex,row.yaw,undefined,{assembly:this.modelCapability(row,'assemblyDuplicable')});});
    action('models-undo',()=>this.modelHistory('modelUndo','modelRedo'));
    action('models-redo',()=>this.modelHistory('modelRedo','modelUndo'));
    action('models-reset',()=>this.commitModels(copy(this.current.modelOriginal),[]));
    action('models-cancel',()=>this.cancelModels());
    action('models-focus',()=>{const row=this.modelRow();if(row){this.navigation.reset(this.modelBounds(row));this.onModeChange(this.active);}});
    el('models-selection').addEventListener('change',()=>{this.cancelModels();this.modelSelected=el('models-selection').value||null;this.refresh();});
    for(const axis of ['x','y','z','yaw'])el(`models-${axis}`).addEventListener('change',()=>{
      const values=['x','y','z','yaw'].map(k=>el(`models-${k}`).value);
      this.perform(()=>{const row=this.modelRow();if(!row||!this.modelEditable(row))return;if(values.some(v=>v.trim()===''||!Number.isFinite(Number(v))))throw Error('Enter finite position and yaw values.');
        const position=displayToSource(values.slice(0,3).map(Number)).map(Math.round),yaw=axis==='yaw'?((Math.round(Number(values[3])/360*256)%256+256)%256)*16:row.yaw;
        this.transformModel(row,{position,yaw});
      });
    });
    el('model-library-level').replaceChildren(...SCENERY_LEVELS.map(n=>new Option(`Rollcage / LEV${n}`,String(n))));
    el('model-library-level').addEventListener('change',()=>this.perform(()=>this.loadLibrary()));
    el('model-library-search').addEventListener('input',()=>this.filterLibrary());
    el('model-library-placeable-only').addEventListener('change',()=>this.filterLibrary());
    el('model-library-entry').addEventListener('change',()=>this.previewLibrary());
    el('model-library-cancel').addEventListener('click',()=>{this.libraryToken++;el('model-library').close();});
    el('model-library').addEventListener('cancel',()=>{this.libraryToken++;});
    action('model-library-place',async()=>{const chosen=this.libraryChoice();if(!chosen?.template)return;await this.beginPlacement(this.libraryBase.level,chosen.template.index,chosen.template.yaw,chosen.scene);el('model-library').close();});
    window.addEventListener('keydown',event=>{
      if(!this.modelsEditing||this.busy||/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)||el('model-library').open)return;
      if(event.code==='Escape'){this.cancelModels();this.refresh();}
      else if((event.ctrlKey||event.metaKey)&&event.code==='KeyZ'){event.preventDefault();this.perform(()=>this.modelHistory(event.shiftKey?'modelRedo':'modelUndo',event.shiftKey?'modelUndo':'modelRedo'));}
      else if((event.ctrlKey||event.metaKey)&&event.code==='KeyY'){event.preventDefault();this.perform(()=>this.modelHistory('modelRedo','modelUndo'));}
      else if(['Delete','Backspace'].includes(event.code)&&document.activeElement===this.canvas){event.preventDefault();el('models-delete').click();}
    });
  }
  modelRows(){return [...(this.current?.modelDraft??[]),...(this.current?.assemblies??[])];}
  modelRow(){return this.modelRows().find(row=>row.id===this.modelSelected)??null;}
  modelAssembly(row){return row?this.current?.assemblies?.find(command=>command.id===row.id)??null:null;}
  assemblyMembers(command){const key=JSON.stringify([this.current?.level,command]);this.assemblyMembersCache??=new Map();if(!this.assemblyMembersCache.has(key)){if(this.assemblyMembersCache.size>64)this.assemblyMembersCache.clear();const base=this.levels.get(command.sourceLevel);this.assemblyMembersCache.set(key,instantiateSceneryAssembly(base.LOW,command.templateIndex,{...command,level:base.level}).members);}return this.assemblyMembersCache.get(key);}
  modelCapability(row,capability='editable'){
    if(!row)return false;const base=this.levels.get(row.sourceLevel),assembly=Boolean(this.modelAssembly(row));
    if(['editable','yawEditable','removable'].includes(capability)&&this.modelProtectionReason(row))return false;
    return Boolean(base&&[base.modelInfo,base.highInfo].every(info=>{const p=info.find(p=>p.index===row.templateIndex);if(capability==='duplicable')return p?.duplicable||p?.assemblyDuplicable;if(assembly&&capability==='removable')return false;if(assembly&&capability==='editable')return p?.assemblyDuplicable;if(assembly&&capability==='yawEditable')return p?.assemblyYawEditable;return p?.[capability];}));
  }
  modelEditable(row){return this.modelCapability(row);}
  modelReason(row,capability='editable'){
    if(['editable','yawEditable','removable'].includes(capability)){const reason=this.modelProtectionReason(row);if(reason)return reason;}
    const base=this.levels.get(row?.sourceLevel);if(!base)return 'Original model library is unavailable.';
    for(const [quality,info]of[['LOW',base.modelInfo],['HIGH',base.highInfo]]){const p=info?.find(p=>p.index===row.templateIndex);if(!p?.[capability])return `${quality}: ${p?.reason||p?.importReason||'Unsupported model operation.'}`;}
    return '';
  }
  modelBounds(row){
    const assembly=this.modelAssembly(row);if(assembly){const bounds=this.assemblyMembers({...assembly,position:row.position,yaw:row.yaw}).map(member=>this.modelBounds(member));return [0,1,2].map(axis=>[Math.min(...bounds.map(b=>b[axis][0])),Math.max(...bounds.map(b=>b[axis][1]))]);}
    const base=this.levels.get(row.sourceLevel),info=base.modelInfo.find(p=>p.index===row.templateIndex),modelIndex=info.modelIndex;
    const position=info.preview?.position?info.preview.position.map((n,i)=>n+row.position[i]-info.position[i]):row.position;
    if(modelIndex===null||modelIndex===undefined)return sourceToDisplay(position).map(n=>[n-24,n+24]);
    base.models??=parseGFXM(base.LOW.geometry).models;
    base.placements??=parsePlacements(base.LOW.texture,base.models).records;
    const angles=[...(info.preview?.angles??base.placements[row.templateIndex].angles)];angles[1]=row.yaw;
    const points=base.models[modelIndex].vertices.map(v=>sourceToDisplay(transformPlacedVertex(v,placementMatrix(angles),position)));
    if(!points.length)return sourceToDisplay(row.position).map(n=>[n-1,n+1]);
    return [0,1,2].map(axis=>[Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))]);
  }
  transformModel(row,{position,yaw}){const assembly=this.modelAssembly(row);if(assembly)this.commitModels(this.current.modelDraft,this.current.assemblies.map(command=>command.id===row.id?{...command,position,yaw}:command));else this.commitModels(applySceneryTransform(this.current.modelDraft,{id:row.id,position,yaw},this.levels.get(row.sourceLevel).modelInfo));}
  modelSnapshot(){return {models:copy(this.current.modelDraft),assemblies:copy(this.current.assemblies??[])};}
  commitModels(draft,assemblies=this.current.assemblies??[]){
    if(same(draft,this.current.modelDraft)&&same(assemblies,this.current.assemblies??[]))return;
    const compiled=this.compile(this.current,draft,this.current.draft,this.current.terrainDraft,this.current.layoutDraft,{assemblies}); // paired validation before history/draft mutation
    this.current.modelUndo.push(this.modelSnapshot());if(this.current.modelUndo.length>100)this.current.modelUndo.shift();this.current.modelRedo=[];this.current.modelDraft=copy(draft);this.current.assemblies=copy(assemblies);
    this.current.compiled=compiled;this.current.compiledSignature=this.signature(this.current);
    this.revision++;this.modelPicks.clear();this.cancelModels();this.onChange();this.refresh();
  }
  modelHistory(from,to){
    this.cancelModels();const base=this.current;if(!base?.[from].length)return;
    const stored=base[from].at(-1),next=Array.isArray(stored)?{models:stored,assemblies:[]}:stored,compiled=this.compile(base,next.models,base.draft,base.terrainDraft,base.layoutDraft,{assemblies:next.assemblies});base[to].push(this.modelSnapshot());base[from].pop();base.modelDraft=copy(next.models);base.assemblies=copy(next.assemblies);base.compiled=compiled;base.compiledSignature=this.signature(base);
    this.revision++;this.modelPicks.clear();this.onChange();this.refresh();
  }
  cancelModels(){
    this.modelPending=null;this.modelDrag=null;this.placementMessage='';this.placementFailed=false;this.renderer?.setEditorGhost(null);this.renderer?.editorTransforms.clear();
    this.renderer?.setEditorBounds(null);
  }
  cancelDrag(){this.layout?.cancel();this.terrain?.cancel();super.cancelDrag();if(this.modelDrag){this.modelDrag=null;this.renderer.editorTransforms.clear();this.refresh();}}
  async openLibrary(){
    this.cancelModels();this.releaseMouse();el('model-library-level').value=String(this.current.level);el('model-library').showModal();
    this.previewRenderer??=new Renderer(el('model-library-canvas'));this.previewNavigation??=new Navigation();
    this.previewOverlay??=new CollisionOverlay(this.previewRenderer);
    if(!this.previewBound){
      const canvas=el('model-library-canvas');let drag=null;
      canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY,pan:e.button===2||e.shiftKey};canvas.setPointerCapture(e.pointerId);});
      canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(drag.pan)this.previewNavigation.pan(dx,dy,canvas.clientHeight);else this.previewNavigation.look(dx,dy);drag.x=e.clientX;drag.y=e.clientY;});
      for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{drag=null;});
      canvas.addEventListener('wheel',e=>{e.preventDefault();this.previewNavigation.wheel(e.deltaY);},{passive:false});this.previewBound=true;
    }
    const render=()=>{if(!el('model-library').open)return;this.previewRenderer.render(this.previewNavigation,{textures:true,lighting:true,objects:el('model-library-show-model').checked,sector:-1});this.previewOverlay.render(this.previewNavigation,{show:el('model-library-show-collision').checked,disabled:el('model-library-show-disabled').checked,normals:el('model-library-show-normals').checked});requestAnimationFrame(render);};render();
    await this.loadLibrary();
  }
  async loadLibrary(){
    const token=++this.libraryToken;this.libraryCollection=null;this.libraryBase=null;disabled('model-library-place',true);text('model-library-note','Loading original library…');
    this.previewOverlay.clear();this.previewRenderer.clear();text('model-library-collision','');hidden('model-library-collision',true);
    const base=await this.loadLevel(Number(el('model-library-level').value));if(token!==this.libraryToken)return;
    this.libraryBase=base;this.libraryCollection=decodeObjectCollection(base.LOW.geometry,base.LOW.texture,{game:'rollcage',resource:{name:`LOW/LEV${base.level}.BLP`}});el('model-library-search').value='';this.filterLibrary();
  }
  filterLibrary(){
    const query=el('model-library-search').value.trim().toLowerCase(),previous=el('model-library-entry').value,placeableOnly=el('model-library-placeable-only').checked;
    const entries=(this.libraryCollection?.entries??[]).filter(e=>e.kind==='scenery'&&`${e.label} ${e.modelIndex} ${this.libraryCollision(e).label} ${this.libraryCollision(e).low?.status}`.toLowerCase().includes(query)&&(!placeableOnly||this.libraryCompatibility(e).template));
    el('model-library-entry').replaceChildren(...entries.map(e=>new Option(`${e.label} · ${this.libraryCollision(e).label}${this.libraryCompatibility(e).template?'':' · locked'}`,e.id)));
    if(entries.some(e=>e.id===previous))el('model-library-entry').value=previous;
    this.previewLibrary();
  }
  templateFor(entry){return this.libraryBase?.modelInfo.find(p=>entry?.placementIndices.includes(p.index)&&p.importable&&this.libraryBase.highInfo.find(h=>h.index===p.index)?.importable);}
  libraryCollision(entry){
    const index=this.templateFor(entry)?.index??entry.placementIndices[0],low=this.libraryBase?.collisions?.LOW.get(index),high=this.libraryBase?.collisions?.HIGH.get(index);
    return {low,high,label:collisionLabel(low,high)};
  }
  checkImport(sourceLevel,templateIndex,{details=false}={}){
    if(!this.current){const result={reason:'Load a destination track first.',qualities:{}};return details?result:result.reason;}
    const key=`${this.current.level}:${this.revision}:${sourceLevel}:${templateIndex}`;
    if(this.importChecks.has(key)){const result=this.importChecks.get(key);return details?result:result.reason;}
    const base=this.levels.get(sourceLevel),template=base?.modelInfo.find(p=>p.index===templateIndex);
    const result={reason:'',qualities:{}};
    try{
      if(!template?.importable||!base.highInfo.find(p=>p.index===templateIndex)?.importable)throw Error(this.modelReason({sourceLevel,templateIndex},'importable'));
      let serial=0,id;do{id=`import-check-${serial++}`;}while(this.current.modelDraft.some(p=>p.id===id));
      const rows=[...this.current.modelDraft,{id,sourceLevel,templateIndex,position:[...template.position],yaw:template.yaw}];
      for(const quality of ['LOW','HIGH'])result.qualities[quality]=inspectSceneryImport(this.current[quality],rows,{level:this.current.level,quality,donors:this.sources(),assemblies:this.current.assemblies??[]});
      result.reason=Object.entries(result.qualities).filter(([,report])=>!report.compatible).map(([quality,report])=>`${quality}: ${report.reason}`).join('\n');
    }catch(error){result.reason=error.message;}
    this.importChecks.set(key,result);return details?result:result.reason;
  }
  libraryCompatibility(entry){
    if(entry.status!=='supported')return {reason:entry.reason||'Unsupported textured preview.'};
    const template=this.templateFor(entry);
    if(!template)return {reason:this.modelReason({sourceLevel:this.libraryBase.level,templateIndex:entry.placementIndices[0]},'importable')};
    const report=this.checkImport(this.libraryBase.level,template.index,{details:true});return report.reason?{reason:report.reason,report}:{template,reason:'',report};
  }
  libraryChoice(){const entry=this.libraryCollection?.entries.find(e=>e.id===el('model-library-entry').value);return entry?{entry,...this.libraryCompatibility(entry),scene:this.libraryScene}:null;}
  previewLibrary(){
    const chosen=this.libraryChoice();this.libraryScene=null;this.previewRenderer?.clear();this.previewOverlay?.clear();disabled('model-library-place',true);
    text('model-library-collision','');hidden('model-library-collision',!chosen);
    if(!chosen){text('model-library-note',el('model-library-placeable-only').checked?'No placeable models match. Try another library or clear the filters.':'No matching scenery models.');return;}
    const collision=this.libraryCollision(chosen.entry);
    text('model-library-collision',`Authored collision · LOW: ${collisionDescription(collision.low)}\nHIGH: ${collisionDescription(collision.high)}\nActive records do not guarantee that a car will be blocked. Placement preserves the original shapes and settings.`);
    try{
      if(chosen.entry.status==='supported'){this.libraryScene=this.libraryCollection.load(chosen.entry);this.previewRenderer.setScene(this.libraryScene);this.previewNavigation.reset(this.libraryScene.bounds);}
      const data=this.libraryBase.LOW.geometry,models=parseGFXM(data).models,placements=parsePlacements(this.libraryBase.LOW.texture,models),index=this.templateFor(chosen.entry)?.index??chosen.entry.placementIndices[0];
      const shape=parseModelCollision(data,models[chosen.entry.modelIndex]),preview=buildModelCollisionPreview(shape,readPlacementCollision(data,placements.records[index],shape));
      this.previewOverlay.set(preview);
      if(preview.bounds){const bounds=this.libraryScene?.bounds;this.previewNavigation.reset(bounds?bounds.map(([min,max],i)=>[Math.min(min,preview.bounds[i][0]),Math.max(max,preview.bounds[i][1])]):preview.bounds);}
      const reason=chosen.template?'Compatible with this track in LOW + HIGH. Click Place, then left-click terrain. Collision cell limits are checked at the chosen location.':chosen.reason;
      const diagnostics=Object.entries(chosen.report?.qualities??{}).map(([quality,report])=>{
        const allocate=report.textureAllocations.filter(t=>t.action!=='reuse').map(t=>t.targetPage),reuse=[...new Set(report.textureAllocations.filter(t=>t.action==='reuse').map(t=>t.targetPage))];
        return `${quality}: ${report.compatible?`${report.finalTextureCount} texture slots after placement`:`Import blocked [${report.code}]`} · allocate ${allocate.length}${allocate.length?` (${allocate.join(', ')})`:''} · reuse ${reuse.length}${reuse.length?` (${reuse.join(', ')})`:''} · ${Math.max(0,report.capacity.remaining)} slots remain after reserving game startup textures.`;
      }).join('\n');
      if(el('model-library-note').style.whiteSpace!=='pre-line')el('model-library-note').style.whiteSpace='pre-line';text('model-library-note',[chosen.entry.reason,reason,diagnostics].filter(Boolean).join('\n'));disabled('model-library-place',!chosen.template||!this.libraryScene);
    }catch(error){text('model-library-note',error.message);}
  }
  async beginPlacement(sourceLevel,templateIndex,yaw,scene,{assembly=false}={}){
    const base=await this.loadLevel(sourceLevel),template=base.modelInfo.find(p=>p.index===templateIndex);
    if(assembly){if(sourceLevel!==this.current.level||![base.modelInfo,base.highInfo].every(info=>info.find(p=>p.index===templateIndex)?.assemblyDuplicable))throw Error(template?.assemblyReason||'Unsupported same-track assembly.');scene=buildSceneryAssemblyPreview(base.LOW,templateIndex);}
    else{if(!template?.importable||!base.highInfo.find(p=>p.index===templateIndex)?.importable)throw Error(template?.reason||template?.importReason||'Unsupported model template.');const incompatibility=this.checkImport(sourceLevel,templateIndex);if(incompatibility)throw Error(incompatibility);
      if(!scene){const collection=decodeObjectCollection(base.LOW.geometry,base.LOW.texture,{game:'rollcage'}),entry=collection.entries.find(e=>e.kind==='scenery'&&e.placementIndices.includes(templateIndex));scene=collection.load(entry);}}
    this.cancelModels();this.modelPending={sourceLevel,templateIndex,yaw,ghostYaw:scene.worldOrientation?0:yaw,assembly,memberCount:assembly?scene.instances:1,position:null,clearance:Math.max(0,-scene.bounds[1][0])};this.placementMessage=assembly?`Left-click terrain to place the complete ${scene.instances}-part assembly. Its destruction and effects are independent. Esc cancels.`:'Left-click terrain to place this model. Esc cancels.';this.renderer.setEditorGhost(scene);this.say(assembly?'Click terrain to place the complete assembly. Esc cancels without adding anything.':'Click terrain to place the model. Esc cancels without adding anything.');this.refresh();
  }
  pointerDown(event){
    if(this.roadEditing)return this.roadsTool.pointerDown(event);
    if(this.layoutEditing)return this.layout.pointerDown(event);
    if(this.terrainEditing)return this.terrain.pointerDown(event);
    if(!this.modelsEditing){
      if(this.editing&&!this.adding&&event.button===0){const index=pickPickup(this.current.draft.map(p=>sourceToDisplay(p.position)),this.navigation,this.canvas.getBoundingClientRect(),event.clientX,event.clientY);if(index!==null){const row=this.current.draft[index],reason=this.routePointProtectionReason(row);if(reason){this.selected=row.id;this.refresh();this.say(reason);return true;}}}
      return super.pointerDown(event);
    }
    if(this.busy||event.button!==0||event.shiftKey||!this.current)return false;
    const ray=cameraRay(this.navigation,this.canvas.getBoundingClientRect(),event.clientX,event.clientY);
    if(this.modelPending){
      const hit=intersectTerrain(this.scene,ray);if(!hit){this.placementMessage='No terrain at this point. Move the preview over the track and left-click again.';this.placementFailed=true;this.refresh();return true;}
      const pending=this.modelPending,position=displayToSource([hit.position[0],hit.position[1]+pending.clearance,hit.position[2]]).map(Math.round);
      let id;do{id=`${pending.assembly?'assembly':'model'}-${++this.modelSerial}`;}while(this.modelRows().some(p=>p.id===id));
      this.perform(()=>{try{const row={id,sourceLevel:pending.sourceLevel,templateIndex:pending.templateIndex,position,yaw:pending.yaw};if(pending.assembly)this.commitModels(this.current.modelDraft,[...this.current.assemblies,row]);else this.commitModels([...this.current.modelDraft,row]);this.modelSelected=id;this.refresh();this.say(pending.assembly?'Complete assembly placed with independent destruction and effects. Adjust position/yaw, or test the changes.':'Model placed. Adjust position/yaw, or test the changes.');}catch(error){this.placementMessage=`${error.message} Move the preview elsewhere and left-click again, or press Esc to cancel.`;this.placementFailed=true;throw error;}});return true;
    }
    if(!el('objects').checked)return false;
    const terrainHit=intersectTerrain(this.scene,ray);
    let nearest=null;
    const compiled=this.compile()[qualityOf(this.track)];
    for(const row of this.modelRows()){
      const indices=this.modelAssembly(row)?this.assemblyMembers(row).map(member=>compiled.indices[member.id]):[compiled.indices[row.id]],key=indices.join(',');
      let mesh=this.modelPicks.get(key);if(!mesh){mesh={groups:this.scene.groups.filter(g=>g.kind==='object'&&indices.includes(g.instance)).map(g=>({...g,kind:'terrain'}))};this.modelPicks.set(key,mesh);}
      const hit=intersectTerrain(mesh,ray);if(hit&&(!terrainHit||hit.distance<=terrainHit.distance+0.0001)&&(!nearest||hit.distance<nearest.hit.distance))nearest={row,hit};
    }
    if(!nearest)return false;
    this.canvas.focus();this.modelSelected=nearest.row.id;this.refresh();
    if(this.modelEditable(nearest.row)){
      const point=sourceToDisplay(nearest.row.position),ground=intersectTerrain(this.scene,ray);
      this.modelDrag={id:event.pointerId,row:copy(nearest.row),position:[...nearest.row.position],offset:ground?point.map((n,i)=>n-ground.position[i]):[0,0,0],x:event.clientX,y:event.clientY,moved:false};this.canvas.setPointerCapture(event.pointerId);
    }
    return true;
  }
  pointerMove(event){
    if(this.roadEditing)return this.roadsTool.pointerMove(event);
    if(this.layoutEditing)return this.layout.pointerMove(event);
    if(this.terrainEditing)return this.terrain.pointerMove(event);
    if(!this.modelsEditing)return super.pointerMove(event);
    if(!this.modelPending&&!this.modelDrag)return false;
    const hit=intersectTerrain(this.scene,cameraRay(this.navigation,this.canvas.getBoundingClientRect(),event.clientX,event.clientY));if(!hit)return Boolean(this.modelDrag);
    if(this.modelPending){const p=this.modelPending;p.position=displayToSource([hit.position[0],hit.position[1]+p.clearance,hit.position[2]]).map(Math.round);this.renderer.editorGhostMatrix=carDisplayMatrix({position:p.position,rotation:placementMatrix([0,p.ghostYaw,0]).map(n=>n/4096)});return false;}
    const drag=this.modelDrag;if(drag.id!==event.pointerId)return false;
    if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<3&&!drag.moved)return true;
    drag.moved=true;drag.position=displayToSource(hit.position.map((n,i)=>n+drag.offset[i])).map(Math.round);
    const delta=sourceToDisplay(drag.position.map((n,i)=>n-drag.row.position[i])),matrix=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,...delta,1]);
    const assembly=this.modelAssembly(drag.row),preview=assembly?this.assemblyMembers({...assembly,position:drag.position}):applySceneryTransform(this.current.modelDraft,{id:drag.row.id,position:drag.position,yaw:drag.row.yaw},this.levels.get(drag.row.sourceLevel).modelInfo),originals=assembly?this.assemblyMembers(assembly):this.current.modelDraft,indices=this.compile()[qualityOf(this.track)].indices;
    this.renderer.editorTransforms.clear();
    for(const row of preview){const original=originals.find(r=>r.id===row.id);if(row.position.some((n,i)=>n!==original.position[i]))this.renderer.editorTransforms.set(indices[row.id],matrix);}this.renderer.setEditorBounds(this.modelBounds({...drag.row,position:drag.position}));return true;
  }
  pointerUp(){
    if(this.roadEditing)return this.roadsTool.pointerUp();
    if(this.layoutEditing)return this.layout.pointerUp();
    if(this.terrainEditing)return this.terrain.pointerUp();
    if(!this.modelDrag)return super.pointerUp();const drag=this.modelDrag;this.modelDrag=null;this.renderer.editorTransforms.clear();
    if(drag.moved)this.perform(()=>this.transformModel(drag.row,{position:drag.position,yaw:drag.row.yaw}));else this.refresh();return true;
  }
  refresh(){
    super.refresh();this.terrain?.refresh();this.layout?.refresh();this.roadsTool?.refresh();this.reversalTool?.refresh();
    hidden('model-placement-feedback',!this.modelPending);text('model-placement-title',this.placementFailed?'Cannot place model here':'Place model');text('model-placement-message',this.placementMessage||'');
    const base=this.current,available=Boolean(base?.modelDraft),active=available&&this.modelsEditing&&!this.busy,row=this.modelRow(),editable=active&&this.modelEditable(row);
    disabled('models-enable',!available||this.busy);if(el('models-enable').checked!==Boolean(this.modelsEditing))el('models-enable').checked=Boolean(this.modelsEditing);hidden('models-controls',!this.modelsEditing);
    for(const id of ['models-x','models-y','models-z'])disabled(id,!editable);disabled('models-yaw',!editable||!this.modelCapability(row,'yawEditable'));disabled('models-delete',!active||!this.modelCapability(row,'removable'));disabled('models-duplicate',!active||!this.modelCapability(row,'duplicable'));
    disabled('models-focus',!active||!row);disabled('models-add',!active);disabled('models-selection',!active);
    disabled('models-undo',!active||!base?.modelUndo.length);disabled('models-redo',!active||!base?.modelRedo.length);disabled('models-reset',!active||(same(base?.modelDraft,base?.modelOriginal)&&!base?.assemblies?.length));hidden('models-cancel',!this.modelPending);
    const selector=el('models-selection'),modelRows=this.modelRows(),signature=JSON.stringify(modelRows.map(p=>[p.id,p.sourceLevel,p.templateIndex]));
    if(selector.dataset.signature!==signature){selector.replaceChildren(new Option('Select a model',''),...modelRows.map(p=>new Option(`${p.id} · LEV${p.sourceLevel} / ${(()=>{const info=this.levels.get(p.sourceLevel)?.modelInfo.find(i=>i.index===p.templateIndex);return this.modelAssembly(p)?`${this.assemblyMembers(p).length}-part assembly`:info?.modelIndex===null?info.kind==='particle'?'particle emitter':'effect':`model ${info?.modelIndex}`;})()}${this.modelEditable(p)?this.modelCapability(p,'duplicable')?'':' · transform only':' · locked'}`,p.id)));selector.dataset.signature=signature;}
    if(selector.value!==(row?.id??''))selector.value=row?.id??'';
    const values=row?[...sourceToDisplay(row.position),Number((((row.yaw%4096+4096)%4096)/4096*360).toFixed(6))]:['','','',''];
    ['x','y','z','yaw'].forEach((key,i)=>{const input=el(`models-${key}`),value=String(values[i]);if(document.activeElement!==input&&input.value!==value)input.value=value;});
    const capabilities=row?this.levels.get(row.sourceLevel)?.modelInfo.find(p=>p.index===row.templateIndex):null;
    text('models-reason',row?(this.modelAssembly(row)?`Cloned assembly · ${this.assemblyMembers(row).length} parts move${this.modelCapability(row,'yawEditable')?'/rotate':''} together. Destruction, collision states and attached effects are independent. Undo the addition to remove it.`:this.modelEditable(row)?`${capabilities?.special?'Original special object · behavior preserved.':'Plain scenery.'} ${capabilities?.linkedIndices?.length>1?`${capabilities.linkedIndices.length} linked parts ${this.modelCapability(row,'yawEditable')?'move/rotate':'move'} together. `:''}${this.modelCapability(row,'assemblyDuplicable')?'Duplicate copies the complete assembly with independent destruction and effects. Original removal is unavailable. ':!this.modelCapability(row,'duplicable')?'Duplicate/remove unavailable for this object. ':''}${capabilities?.kind==='animated'?'The complete script path moves; its control polygon is shown.':capabilities?.modelIndex===null?'Emitter position is retained.':'Collision lookup follows edits.'}${capabilities?.operationNotice?' '+capabilities.operationNotice:''}`:this.modelReason(row)):'Select a model in the view or list.');
    if(this.modelsEditing&&!this.modelDrag)this.renderer.setEditorBounds(row?this.modelBounds(row):null);
    disabled('editor-test',!base||this.busy);text('editor-test',[16,17].includes(base?.level)?'Preview changes':'Test changes');
    text('models-note',available?`${base.modelDraft.length} original/imported models${base.assemblies?.length?` + ${base.assemblies.length} cloned assemblies`:''} · LOW + HIGH`:'Requires verified Rollcage archives.');
    this.refreshModelOverlay?.();
    this.refreshProtection?.();
  }
  refreshProtection(){
    const base=this.current,rule=editorProtectionRules(base?.level),note=el('editor-protection');if(note){hidden('editor-protection',!rule.sectors.length);text('editor-protection',rule.reason?`${rule.reason} Amber outlines are read-only. Protected stages: ${rule.stages.join(', ')} (native, zero-based).`:'');}
    if(this.editing){const reason=this.routePointProtectionReason(this.selectedRow());if(reason){for(const id of ['editor-delete','editor-x','editor-y','editor-z'])disabled(id,true);text('editor-note',reason);}}
    if(!this.protectionOverlay)return;const signature=`${base?.level}:${Boolean(this.active)}`;if(signature===this.protectionSignature)return;this.protectionSignature=signature;
    if(!base||!this.active||!rule.sectors.length){this.protectionOverlay.clear();return;}
    const info=inspectEditorProtection(base.LOW.geometry,base.level),lines=[];
    for(const {segment:s}of info.regions)for(const f of s.faces){const ids=[0,1,3,2].map(i=>f.gridIndices[i]);for(let i=0;i<4;i++)lines.push(...sourceToDisplay(s.vertices[ids[i]].slice(0,3)),...sourceToDisplay(s.vertices[ids[(i+1)%4]].slice(0,3)));}
    this.protectionOverlay.set({groups:[{active:true,lines:[],normals:lines}]});
  }
  refreshModelOverlay(){
    if(!this.modelOverlay)return;const row=this.modelRow(),info=row?this.levels.get(row.sourceLevel)?.modelInfo.find(p=>p.index===row.templateIndex):null,signature=JSON.stringify([this.current?.level,this.modelsEditing,row,info?.script?.path]);
    if(signature===this.modelOverlaySignature)return;this.modelOverlaySignature=signature;const lines=[],normals=[];
    if(this.modelsEditing&&row&&info){
      const delta=row.position.map((n,i)=>n-info.position[i]),point=p=>sourceToDisplay(p.map((n,i)=>n+delta[i])),path=info.script?.path??[],radius=Math.max(5,Math.min(25,this.navigation.radius*0.004));
      for(let i=1;i<path.length;i++)lines.push(...point(path[i-1]),...point(path[i]));
      for(const p of [info.preview?.position??info.position,...path]){const center=point(p);for(let axis=0;axis<3;axis++){const a=center.slice(),b=center.slice();a[axis]-=radius;b[axis]+=radius;normals.push(...a,...b);}}
    }
    this.modelOverlay.set({groups:[{active:true,lines,normals}]});
  }
  renderEditorOverlay(navigation){this.roadsTool?.render(navigation);this.reversalTool?.render(navigation);this.modelOverlay?.render(navigation,{show:Boolean(this.modelsEditing),disabled:false,normals:true});this.protectionOverlay?.render(navigation,{show:this.active,disabled:false,normals:true});}
  inspect(){return {...super.inspect(),active:this.active,roadEditing:Boolean(this.roadEditing),roads:copy(this.current?.roads??[]),roadPreview:this.roadsTool?.generated?{bounds:copy(this.roadsTool.generated.bounds),points:copy(this.roadsTool.working.points)}:null,reversal:copy(this.current?.compiled?.reversalReport??this.current?.reversal??null),variantEditing:Boolean(this.variantEditing),reversalPreview:this.reversalTool?.inspect()??null,layoutEditing:Boolean(this.layoutEditing),layoutKind:this.layout?.kind,layout:copy(this.current?.layoutDraft??emptyRaceLayoutDraft()),layoutRows:copy(this.layout?.rows()??[]),layoutSelected:this.layout?.selected??null,terrainEditing:this.terrainEditing,terrain:copy(this.current?.terrainDraft??emptyTerrainDraft()),terrainStroke:Boolean(this.terrain?.stroke),modelsEditing:this.modelsEditing,models:copy(this.current?.modelDraft??[]),assemblies:copy(this.current?.assemblies??[]),assemblyMembers:(this.current?.assemblies??[]).flatMap(command=>copy(this.assemblyMembers(command))),modelSelected:this.modelSelected,modelPreviewTransforms:this.renderer.editorTransforms.size,modelCapabilities:copy(this.modelRow()?this.levels.get(this.modelRow().sourceLevel)?.modelInfo.find(p=>p.index===this.modelRow().templateIndex):null),placingModel:Boolean(this.modelPending),placingAssembly:Boolean(this.modelPending?.assembly),ghostMembers:this.modelPending?.memberCount??0,modelUndo:this.current?.modelUndo.length??0,modelRedo:this.current?.modelRedo.length??0,collisionPreview:{groups:this.previewOverlay?.groups.length??0,drawnSegments:this.previewOverlay?.draws??0}};}
}

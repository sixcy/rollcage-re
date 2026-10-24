import {TerrainEditorUI} from './terrain-editor-ui.mjs';
import {emptyTerrainDraft} from '../../src/terrain-editor.mjs';
import {PickupEditor} from './pickup-editor-ui.mjs';
import {getGame} from '../../src/track-games.mjs';
import {parseGFXM} from '../../src/gfxm.mjs';
import {parsePlacements} from '../../src/placements.mjs';
import {placementMatrix, transformPlacedVertex} from '../../src/fixed-math.mjs';
import {SCENERY_LEVELS, inspectScenery, createSceneryDraft, validateSceneryImport} from '../../src/scenery-editor.mjs';
import {inspectSceneryCollisions} from '../../src/scenery-collision-info.mjs';
import {collisionLabel,collisionDescription} from './collision-label.mjs';
import {parseModelCollision,readPlacementCollision} from '../../src/model-collision.mjs';
import {buildModelCollisionPreview} from '../../src/model-collision-preview.mjs';
import {CollisionOverlay} from './collision-overlay.mjs';
import {compileTrackDraft, parseTrackProject, validateTrackProject} from '../../src/track-editor-project.mjs';
import {pickupSha256, parsePickupProject, validatePickupProject} from '../../src/pickup-editor.mjs';
import {decodeObjectCollection} from '../../src/object-catalog.mjs';
import {cameraRay, intersectTerrain, sourceToDisplay, displayToSource, prepareTerrainPicking} from './pickup-picking.mjs';
import {Renderer} from './renderer.mjs';
import {Navigation} from './navigation.mjs';
import {carDisplayMatrix} from './solo-presentation.mjs';

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
    this.modelPicks=new Map();this.importChecks=new Map();this.bindModels();this.terrainEditing=false;this.terrain=new TerrainEditorUI(this);this.refresh();
  }
  get active(){return this.editing||this.modelsEditing||this.terrainEditing;}
  get hasEdits(){return [...this.levels.values()].some(base=>!same(base.draft,base.original)||!same(base.modelDraft,base.modelOriginal)||Boolean(base.terrainDraft?.heights.length||base.terrainDraft?.surfaces.length));}
  async readLevel(level,source) {
    const base=await super.readLevel(level,source);
    // Pickup loading has finished, but the shared level must not become visible
    // to a concurrent track/project/library request until BTPs and hashes finish.
    if(this.levels.get(level)===base)this.levels.delete(level);
    try {
      for(const quality of ['LOW','HIGH']) {
        const track=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV${level}.BLP`), resource=await source.readResource(track.textureIndex);
        Object.assign(base[quality],{geometry:base[quality].data,texture:resource.data,textureIndex:track.textureIndex});
      }
      if(this.archive!==source)throw Error('Archive changed while loading scenery.');
      base.modelInfo=inspectScenery(base.LOW.geometry,base.LOW.texture);base.modelOriginal=createSceneryDraft(base.LOW.geometry,base.LOW.texture,level);
      const high=createSceneryDraft(base.HIGH.geometry,base.HIGH.texture,level);
      if(!same(base.modelOriginal,high))throw Error('LOW/HIGH scenery placements differ.');
      base.highInfo=inspectScenery(base.HIGH.geometry,base.HIGH.texture);
      base.collisions={LOW:inspectSceneryCollisions(base.LOW.geometry,base.LOW.texture),HIGH:inspectSceneryCollisions(base.HIGH.geometry,base.HIGH.texture)};
      base.modelDraft=copy(base.modelOriginal);base.modelUndo=[];base.modelRedo=[];base.terrainDraft=emptyTerrainDraft();base.terrainUndo=[];base.terrainRedo=[];
      base.hashes={};for(const quality of ['LOW','HIGH'])base.hashes[quality]={geometry:base.sourceHashes[quality],texture:await pickupSha256(base[quality].texture)};
      if(this.archive!==source)throw Error('Archive changed while checking scenery.');
      this.levels.set(level,base);
      return base;
    } catch(error){if(this.levels.get(level)===base)this.levels.delete(level);throw error;}
  }
  async setSource(...args){this.terrain?.cancel();this.terrainEditing=false;this.terrain&&(this.terrain.paletteBase=null);this.cancelModels();this.importChecks?.clear();this.modelsEditing=false;this.modelSelected=null;this.libraryToken++;el('model-library').close();await super.setSource(...args);}
  clearTrack(){this.terrain?.cancel();this.terrainEditing=false;this.cancelModels();this.libraryToken++;el('model-library').close();this.modelSelected=null;this.modelsEditing=false;this.modelPicks?.clear();super.clearTrack();}
  async setTrack(track,scene){this.track=track;await super.setTrack(track,scene);this.refresh();}
  setEditing(enabled,options){this.terrain?.cancel();this.terrainEditing=false;this.cancelModels();this.modelsEditing=false;super.setEditing(enabled,options);}
  setModelsEditing(enabled){
    this.terrain?.cancel();this.terrainEditing=false;
    this.releaseMouse();this.cancelModels();this.editing=false;this.adding=false;this.modelsEditing=Boolean(enabled&&this.current?.modelDraft);
    if(this.modelsEditing){if(this.navigation.mode==='follow')this.navigation.setMode('orbit');el('objects').checked=true;}
    this.onModeChange(this.active);this.refresh();
  }
  setTerrainEditing(kind){
    this.releaseMouse();this.cancelModels();this.editing=false;this.modelsEditing=false;this.adding=false;this.terrainEditing=Boolean(kind&&this.current);
    if(this.terrainEditing){if(this.navigation.mode==='follow')this.navigation.setMode('orbit');this.terrain.setKind(kind);}
    this.onModeChange(this.active);this.refresh();
  }
  commitTerrain(draft){
    const base=this.current;if(same(draft,base.terrainDraft))return;
    const compiled=this.compile(base,base.modelDraft,base.draft,draft);base.terrainUndo.push(copy(base.terrainDraft));if(base.terrainUndo.length>100)base.terrainUndo.shift();base.terrainRedo=[];base.terrainDraft=copy(draft);base.compiled=compiled;base.compiledSignature=JSON.stringify([base.modelDraft,base.draft,base.terrainDraft]);this.revision++;this.modelPicks.clear();this.onChange();this.refresh();
  }
  terrainHistory(from,to){
    this.terrain.cancel();const base=this.current;if(!base?.[from]?.length)return;const next=base[from].at(-1),compiled=this.compile(base,base.modelDraft,base.draft,next);base[to].push(copy(base.terrainDraft));base.terrainDraft=base[from].pop();base.compiled=compiled;base.compiledSignature=JSON.stringify([base.modelDraft,base.draft,base.terrainDraft]);this.revision++;this.onChange();this.refresh();
  }
  sources(){return new Map([...this.levels].filter(([,base])=>base.modelDraft).map(([level,base])=>[level,{LOW:base.LOW,HIGH:base.HIGH}]));}
  compile(base=this.current,models=base.modelDraft,pickups=base.draft,terrain=base.terrainDraft??emptyTerrainDraft()){
    const signature=JSON.stringify([models,pickups,terrain]);
    if(base.compiledSignature===signature)return base.compiled;
    const result=compileTrackDraft({LOW:base.LOW,HIGH:base.HIGH},{level:base.level,pickups,models,terrain},this.sources());
    // Cache only committed state; rejected previews never replace it.
    if(models===base.modelDraft&&pickups===base.draft&&terrain===base.terrainDraft){base.compiledSignature=signature;base.compiled=result;}
    return result;
  }
  resourcesFor(track,geometry,texture){const base=this.levels.get(levelOf(track));return base?.modelDraft?this.compile(base)[qualityOf(track)]:{geometry,texture};}
  geometryFor(track,original){return this.resourcesFor(track,original,null).geometry;}
  async project(){
    if(!this.archive||!this.indexSha256)throw Error('Load original verified Rollcage archives first.');
    const levels=[...this.levels.values()].filter(b=>b.modelDraft&&(!same(b.draft,b.original)||!same(b.modelDraft,b.modelOriginal)||b.terrainDraft.heights.length||b.terrainDraft.surfaces.length)).sort((a,b)=>a.level-b.level).map(b=>({level:b.level,pickups:copy(b.draft),models:copy(b.modelDraft),terrain:copy(b.terrainDraft)}));
    const required=new Set(levels.flatMap(row=>[row.level,...row.models.map(m=>m.sourceLevel)]));
    return parseTrackProject({schemaVersion:3,game:'rollcage',indexSha256:this.indexSha256,sources:[...required].sort((a,b)=>a-b).map(level=>({level,hashes:copy(this.levels.get(level).hashes)})),levels});
  }
  async restoreProject(value){
    let levels,compiled;
    if(value?.schemaVersion===1){
      const legacy=parsePickupProject(value);
      if(legacy.indexSha256!==this.indexSha256)throw Error('This project was saved with a different IMG/IDX pair. Select the same starting files used to create it, then load the project again.');
      const bases=await Promise.all(legacy.levels.map(row=>this.loadLevel(row.level)));
      validatePickupProject(legacy,{indexSha256:this.indexSha256,levels:bases.map(b=>({level:b.level,sourceHashes:b.sourceHashes,lowData:b.LOW.geometry,highData:b.HIGH.geometry}))});
      levels=legacy.levels.map(row=>({...row,models:copy(this.levels.get(row.level).modelOriginal)}));
      compiled=new Map(levels.map(row=>[row.level,compileTrackDraft(this.sources().get(row.level),row,this.sources())]));
    }else{
      const project=parseTrackProject(value);
      if(project.indexSha256!==this.indexSha256)throw Error('This project was saved with a different IMG/IDX pair. Select the same starting files used to create it, then load the project again.');
      await Promise.all(project.sources.map(row=>this.loadLevel(row.level)));
      ({compiled}=validateTrackProject(project,{indexSha256:this.indexSha256,sources:this.sources(),hashes:new Map([...this.levels].map(([n,b])=>[n,b.hashes]))})); levels=project.levels;
    }
    // All resources, source hashes and both quality compilers passed before any
    // visible draft is changed, including when loading an old pickup project.
    this.cancelModels();this.cancelDrag();
    for(const base of this.levels.values())if(base.modelOriginal){base.draft=copy(base.original);base.modelDraft=copy(base.modelOriginal);base.undo=[];base.redo=[];base.modelUndo=[];base.modelRedo=[];base.terrainDraft=emptyTerrainDraft();base.terrainUndo=[];base.terrainRedo=[];base.compiledSignature=null;}
    for(const row of levels){const base=this.levels.get(row.level);base.draft=copy(row.pickups);base.modelDraft=copy(row.models);base.terrainDraft=copy(row.terrain??emptyTerrainDraft());base.compiled=compiled.get(row.level);base.compiledSignature=JSON.stringify([base.modelDraft,base.draft,base.terrainDraft]);}
    this.revision++;this.savedRevision=this.revision;this.modelSelected=null;this.selected=null;this.onChange();
    const tool=el('editor-tool').value;if(tool==='models')this.setModelsEditing(true);else if(tool==='pickups')this.setEditing(true);else this.setTerrainEditing(tool);
    this.say('Track project loaded. Edits apply to LOW + HIGH.');
  }
  async exportReplacements(){
    const replacements=new Map();
    for(const base of this.levels.values())if(base.modelDraft&&(!same(base.modelDraft,base.modelOriginal)||!same(base.draft,base.original)||base.terrainDraft.heights.length||base.terrainDraft.surfaces.length)){const compiled=this.compile(base);for(const quality of ['LOW','HIGH']){for(const[key,indexKey]of[['geometry','index'],['texture','textureIndex']])if(!equal(compiled[quality][key],base[quality][key]))replacements.set(base[quality][indexKey],compiled[quality][key]);}}
    return replacements;
  }
  bindModels(){
    const action=(id,fn)=>el(id).addEventListener('click',()=>this.perform(fn));
    el('models-enable').addEventListener('change',()=>this.setModelsEditing(el('models-enable').checked));
    action('models-add',()=>this.openLibrary());
    action('models-delete',()=>{if(this.modelEditable(this.modelRow()))this.commitModels(this.current.modelDraft.filter(row=>row.id!==this.modelSelected));});
    action('models-duplicate',async()=>{const row=this.modelRow();if(row&&this.modelEditable(row))await this.beginPlacement(row.sourceLevel,row.templateIndex,row.yaw);});
    action('models-undo',()=>this.modelHistory('modelUndo','modelRedo'));
    action('models-redo',()=>this.modelHistory('modelRedo','modelUndo'));
    action('models-reset',()=>this.commitModels(copy(this.current.modelOriginal)));
    action('models-cancel',()=>this.cancelModels());
    action('models-focus',()=>{const row=this.modelRow();if(row)this.navigation.reset(this.modelBounds(row));});
    el('models-selection').addEventListener('change',()=>{this.cancelModels();this.modelSelected=el('models-selection').value||null;this.refresh();});
    for(const axis of ['x','y','z','yaw'])el(`models-${axis}`).addEventListener('change',()=>{
      const values=['x','y','z','yaw'].map(k=>el(`models-${k}`).value);
      this.perform(()=>{const row=this.modelRow();if(!row||!this.modelEditable(row))return;if(values.some(v=>v.trim()===''||!Number.isFinite(Number(v))))throw Error('Enter finite position and yaw values.');
        const draft=copy(this.current.modelDraft),item=draft.find(p=>p.id===row.id);item.position=displayToSource(values.slice(0,3).map(Number)).map(Math.round);
        if(axis==='yaw')item.yaw=((Math.round(Number(values[3])/360*256)%256+256)%256)*16;
        this.commitModels(draft);
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
  modelRow(){return this.current?.modelDraft?.find(row=>row.id===this.modelSelected)??null;}
  modelEditable(row){if(!row)return false;const base=this.levels.get(row.sourceLevel);return base?.modelInfo.find(p=>p.index===row.templateIndex)?.editable&&base.highInfo.find(p=>p.index===row.templateIndex)?.editable;}
  modelReason(row){
    const base=this.levels.get(row?.sourceLevel);if(!base)return 'Original model library is unavailable.';
    for(const [quality,info]of[['LOW',base.modelInfo],['HIGH',base.highInfo]]){const p=info?.find(p=>p.index===row.templateIndex);if(!p?.editable)return `${quality}: ${p?.reason||'Unsupported model template.'}`;}
    return '';
  }
  modelBounds(row){
    const base=this.levels.get(row.sourceLevel),modelIndex=base.modelInfo.find(p=>p.index===row.templateIndex).modelIndex;
    base.models??=parseGFXM(base.LOW.geometry).models;
    base.placements??=parsePlacements(base.LOW.texture,base.models).records;
    const angles=[...base.placements[row.templateIndex].angles];angles[1]=row.yaw;
    const points=base.models[modelIndex].vertices.map(v=>sourceToDisplay(transformPlacedVertex(v,placementMatrix(angles),row.position)));
    if(!points.length)return sourceToDisplay(row.position).map(n=>[n-1,n+1]);
    return [0,1,2].map(axis=>[Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))]);
  }
  commitModels(draft){
    if(same(draft,this.current.modelDraft))return;
    const compiled=this.compile(this.current,draft); // both variants, before history/draft mutation
    this.current.modelUndo.push(copy(this.current.modelDraft));if(this.current.modelUndo.length>100)this.current.modelUndo.shift();this.current.modelRedo=[];this.current.modelDraft=copy(draft);
    this.current.compiled=compiled;this.current.compiledSignature=JSON.stringify([this.current.modelDraft,this.current.draft,this.current.terrainDraft]);
    this.revision++;this.modelPicks.clear();this.cancelModels();this.onChange();this.refresh();
  }
  modelHistory(from,to){
    this.cancelModels();const base=this.current;if(!base?.[from].length)return;
    const next=base[from].at(-1),compiled=this.compile(base,next);base[to].push(copy(base.modelDraft));base.modelDraft=base[from].pop();base.compiled=compiled;base.compiledSignature=JSON.stringify([base.modelDraft,base.draft]);
    this.revision++;this.modelPicks.clear();this.onChange();this.refresh();
  }
  cancelModels(){
    this.modelPending=null;this.modelDrag=null;this.placementMessage='';this.placementFailed=false;this.renderer?.setEditorGhost(null);this.renderer?.editorTransforms.clear();
    this.renderer?.setEditorBounds(null);
  }
  cancelDrag(){this.terrain?.cancel();super.cancelDrag();if(this.modelDrag){this.modelDrag=null;this.renderer.editorTransforms.clear();this.refresh();}}
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
  templateFor(entry){return this.libraryBase?.modelInfo.find(p=>entry?.placementIndices.includes(p.index)&&p.editable&&this.libraryBase.highInfo.find(h=>h.index===p.index)?.editable);}
  libraryCollision(entry){
    const index=this.templateFor(entry)?.index??entry.placementIndices[0],low=this.libraryBase?.collisions?.LOW.get(index),high=this.libraryBase?.collisions?.HIGH.get(index);
    return {low,high,label:collisionLabel(low,high)};
  }
  checkImport(sourceLevel,templateIndex){
    if(!this.current)return 'Load a destination track first.';
    const key=`${this.current.level}:${this.revision}:${sourceLevel}:${templateIndex}`;
    if(this.importChecks.has(key))return this.importChecks.get(key);
    const base=this.levels.get(sourceLevel),template=base?.modelInfo.find(p=>p.index===templateIndex);
    let reason='';
    try{
      if(!template?.editable||!base.highInfo.find(p=>p.index===templateIndex)?.editable)throw Error(this.modelReason({sourceLevel,templateIndex}));
      let serial=0,id;do{id=`import-check-${serial++}`;}while(this.current.modelDraft.some(p=>p.id===id));
      const rows=[...this.current.modelDraft,{id,sourceLevel,templateIndex,position:[...template.position],yaw:template.yaw}];
      for(const quality of ['LOW','HIGH'])try{validateSceneryImport(this.current[quality],rows,{level:this.current.level,quality,donors:this.sources()});}catch(error){throw Error(`${quality}: ${error.message}`);}
    }catch(error){reason=error.message;}
    this.importChecks.set(key,reason);return reason;
  }
  libraryCompatibility(entry){
    if(entry.status!=='supported')return {reason:entry.reason||'Unsupported textured preview.'};
    const template=this.templateFor(entry);
    if(!template)return {reason:this.modelReason({sourceLevel:this.libraryBase.level,templateIndex:entry.placementIndices[0]})};
    const reason=this.checkImport(this.libraryBase.level,template.index);return reason?{reason}:{template,reason:''};
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
      text('model-library-note',chosen.entry.reason||reason);disabled('model-library-place',!chosen.template||!this.libraryScene);
    }catch(error){text('model-library-note',error.message);}
  }
  async beginPlacement(sourceLevel,templateIndex,yaw,scene){
    const base=await this.loadLevel(sourceLevel),template=base.modelInfo.find(p=>p.index===templateIndex);
    if(!template?.editable||!base.highInfo.find(p=>p.index===templateIndex)?.editable)throw Error(template?.reason||'Unsupported model template.');
    const incompatibility=this.checkImport(sourceLevel,templateIndex);if(incompatibility)throw Error(incompatibility);
    if(!scene){const collection=decodeObjectCollection(base.LOW.geometry,base.LOW.texture,{game:'rollcage'}),entry=collection.entries.find(e=>e.kind==='scenery'&&e.placementIndices.includes(templateIndex));scene=collection.load(entry);}
    this.cancelModels();this.modelPending={sourceLevel,templateIndex,yaw,position:null,clearance:Math.max(0,-scene.bounds[1][0])};this.placementMessage='Left-click terrain to place this model. Esc cancels.';this.renderer.setEditorGhost(scene);this.say('Click terrain to place the model. Esc cancels without adding anything.');this.refresh();
  }
  pointerDown(event){
    if(this.terrainEditing)return this.terrain.pointerDown(event);
    if(!this.modelsEditing)return super.pointerDown(event);
    if(this.busy||event.button!==0||event.shiftKey||!this.current)return false;
    const ray=cameraRay(this.navigation,this.canvas.getBoundingClientRect(),event.clientX,event.clientY);
    if(this.modelPending){
      const hit=intersectTerrain(this.scene,ray);if(!hit){this.placementMessage='No terrain at this point. Move the preview over the track and left-click again.';this.placementFailed=true;this.refresh();return true;}
      const pending=this.modelPending,position=displayToSource([hit.position[0],hit.position[1]+pending.clearance,hit.position[2]]).map(Math.round);
      let id;do{id=`model-${++this.modelSerial}`;}while(this.current.modelDraft.some(p=>p.id===id));
      this.perform(()=>{try{this.commitModels([...this.current.modelDraft,{id,sourceLevel:pending.sourceLevel,templateIndex:pending.templateIndex,position,yaw:pending.yaw}]);this.modelSelected=id;this.refresh();this.say('Model placed. Adjust position/yaw, or test the changes.');}catch(error){this.placementMessage=`${error.message} Move the preview elsewhere and left-click again, or press Esc to cancel.`;this.placementFailed=true;throw error;}});return true;
    }
    if(!el('objects').checked)return false;
    const terrainHit=intersectTerrain(this.scene,ray);
    let nearest=null;
    for(const row of this.current.modelDraft){
      const index=this.compile()[qualityOf(this.track)].indices[row.id];
      let mesh=this.modelPicks.get(index);if(!mesh){mesh={groups:this.scene.groups.filter(g=>g.kind==='object'&&g.instance===index).map(g=>({...g,kind:'terrain'}))};this.modelPicks.set(index,mesh);}
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
    if(this.terrainEditing)return this.terrain.pointerMove(event);
    if(!this.modelsEditing)return super.pointerMove(event);
    if(!this.modelPending&&!this.modelDrag)return false;
    const hit=intersectTerrain(this.scene,cameraRay(this.navigation,this.canvas.getBoundingClientRect(),event.clientX,event.clientY));if(!hit)return Boolean(this.modelDrag);
    if(this.modelPending){const p=this.modelPending;p.position=displayToSource([hit.position[0],hit.position[1]+p.clearance,hit.position[2]]).map(Math.round);this.renderer.editorGhostMatrix=carDisplayMatrix({position:p.position,rotation:placementMatrix([0,p.yaw,0]).map(n=>n/4096)});return false;}
    const drag=this.modelDrag;if(drag.id!==event.pointerId)return false;
    if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<3&&!drag.moved)return true;
    drag.moved=true;drag.position=displayToSource(hit.position.map((n,i)=>n+drag.offset[i])).map(Math.round);
    const delta=sourceToDisplay(drag.position.map((n,i)=>n-drag.row.position[i])),matrix=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,...delta,1]);
    this.renderer.editorTransforms.set(this.compile()[qualityOf(this.track)].indices[drag.row.id],matrix);this.renderer.setEditorBounds(this.modelBounds({...drag.row,position:drag.position}));return true;
  }
  pointerUp(){
    if(this.terrainEditing)return this.terrain.pointerUp();
    if(!this.modelDrag)return super.pointerUp();const drag=this.modelDrag;this.modelDrag=null;this.renderer.editorTransforms.clear();
    if(drag.moved)this.perform(()=>{const draft=copy(this.current.modelDraft);draft.find(p=>p.id===drag.row.id).position=drag.position;this.commitModels(draft);});else this.refresh();return true;
  }
  refresh(){
    super.refresh();this.terrain?.refresh();
    hidden('model-placement-feedback',!this.modelPending);text('model-placement-title',this.placementFailed?'Cannot place model here':'Place model');text('model-placement-message',this.placementMessage||'');
    const base=this.current,available=Boolean(base?.modelDraft),active=available&&this.modelsEditing&&!this.busy,row=this.modelRow(),editable=active&&this.modelEditable(row);
    disabled('models-enable',!available||this.busy);if(el('models-enable').checked!==Boolean(this.modelsEditing))el('models-enable').checked=Boolean(this.modelsEditing);hidden('models-controls',!this.modelsEditing);
    for(const id of ['models-delete','models-duplicate','models-x','models-y','models-z','models-yaw'])disabled(id,!editable);
    disabled('models-focus',!active||!row);disabled('models-add',!active);disabled('models-selection',!active);
    disabled('models-undo',!active||!base?.modelUndo.length);disabled('models-redo',!active||!base?.modelRedo.length);disabled('models-reset',!active||same(base?.modelDraft,base?.modelOriginal));hidden('models-cancel',!this.modelPending);
    const selector=el('models-selection'),signature=JSON.stringify(base?.modelDraft?.map(p=>[p.id,p.sourceLevel,p.templateIndex])??[]);
    if(selector.dataset.signature!==signature){selector.replaceChildren(new Option('Select a model',''),...(base?.modelDraft??[]).map(p=>new Option(`${p.id} · LEV${p.sourceLevel} / model ${this.levels.get(p.sourceLevel)?.modelInfo.find(i=>i.index===p.templateIndex)?.modelIndex}${this.modelEditable(p)?'':' · locked'}`,p.id)));selector.dataset.signature=signature;}
    if(selector.value!==(row?.id??''))selector.value=row?.id??'';
    const values=row?[...sourceToDisplay(row.position),Number((((row.yaw%4096+4096)%4096)/4096*360).toFixed(6))]:['','','',''];
    ['x','y','z','yaw'].forEach((key,i)=>{const input=el(`models-${key}`),value=String(values[i]);if(document.activeElement!==input&&input.value!==value)input.value=value;});
    text('models-reason',row?(this.modelEditable(row)?'Plain scenery · edits update its collision lookup.':this.modelReason(row)):'Select a model in the view or list.');
    if(this.modelsEditing&&!this.modelDrag)this.renderer.setEditorBounds(row?this.modelBounds(row):null);
    disabled('editor-test',!base||this.busy);text('editor-test',[16,17].includes(base?.level)?'Preview changes':'Test changes');
    text('models-note',available?`${base.modelDraft.length} placed models · ${base.modelDraft.filter(p=>this.modelEditable(p)).length} editable · LOW + HIGH`:'Requires verified Rollcage archives.');
  }
  inspect(){return {...super.inspect(),active:this.active,terrainEditing:this.terrainEditing,terrain:copy(this.current?.terrainDraft??emptyTerrainDraft()),terrainStroke:Boolean(this.terrain?.stroke),modelsEditing:this.modelsEditing,models:copy(this.current?.modelDraft??[]),modelSelected:this.modelSelected,placingModel:Boolean(this.modelPending),modelUndo:this.current?.modelUndo.length??0,modelRedo:this.current?.modelRedo.length??0,collisionPreview:{groups:this.previewOverlay?.groups.length??0,drawnSegments:this.previewOverlay?.draws??0}};}
}

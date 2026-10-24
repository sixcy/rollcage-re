import {getGame} from '../../src/track-games.mjs';
import {parseGFXM} from '../../src/gfxm.mjs';
import {parsePickupPlacements, createPickupDraft, validatePickupDraft, compilePickupEdits, parsePickupProject, validatePickupProject, pickupSha256} from '../../src/pickup-editor.mjs';
import {cameraRay, intersectTerrain, pickPickup, sourceToDisplay, displayToSource, prepareTerrainPicking} from './pickup-picking.mjs';
import {buildPickupGameDownload} from './editor-download.mjs';

const element = id => document.getElementById(id);
const copy = value => structuredClone(value);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const bytesEqual = (a,b) => a.length === b.length && a.every((byte,i) => byte === b[i]);
const supported = level => Number.isInteger(level) && level >= 1 && level <= 20 && ![15,16,17].includes(level);
const levelOf = track => Number(/\/(?:LEV)(\d+)\.BLP$/i.exec(track?.name ?? '')?.[1]);
const messageOf = error => error instanceof Error ? error.message : String(error);

export class PickupEditor {
  constructor({canvas, navigation, renderer, releaseMouse, onModeChange, onChange, onTest, onDownload}) {
    Object.assign(this, {canvas, navigation, renderer, releaseMouse, onModeChange, onChange, onTest, onDownload});
    this.archive = null; this.levels = new Map(); this.levelLoads = new Map(); this.current = null; this.scene = null;
    this.editing = false; this.adding = false; this.selected = null; this.drag = null;
    this.revision = 0; this.savedRevision = 0; this.serial = 0; this.token = 0; this.busy = false;
    this.bind(); this.refresh();
  }
  bind() {
    const action = (id, fn) => element(id).addEventListener('click', () => this.perform(fn));
    element('editor-enable').addEventListener('change', () => this.setEditing(element('editor-enable').checked));
    action('editor-add', () => {this.adding = !this.adding; this.pendingDuplicate=null; this.say(this.adding ? 'Click the terrain to place a new pickup. Esc cancels placement.' : 'Placement cancelled.'); this.refresh();});
    action('editor-duplicate', () => {
      const row = this.selectedRow(); if (!row) return;
      const draft = copy(this.current.draft), added = {...copy(row), id: this.nextId()};
      draft.push(added); this.selected = added.id; this.commit(draft); this.adding = true; this.pendingDuplicate = added.id;
      this.say('Duplicate created. Click the terrain to move it, or adjust its coordinates.'); this.refresh();
    });
    action('editor-delete', () => {
      if (!this.selectedRow()) return;
      this.adding=false;this.pendingDuplicate=null;
      this.commit(this.current.draft.filter(row => row.id !== this.selected));
      this.selected = this.current.draft[0]?.id ?? null; this.refresh();
    });
    action('editor-undo', () => this.history('undo', 'redo'));
    action('editor-redo', () => this.history('redo', 'undo'));
    action('editor-reset-level', () => {this.adding = false; this.pendingDuplicate = null; this.selected = null; this.commit(copy(this.current.original)); this.say('This level is restored to its original pickup definitions.');});
    element('editor-pickup').addEventListener('change', () => {const selected = element('editor-pickup').value || null; this.cancelDrag(); this.adding = false; this.pendingDuplicate = null; this.selected = selected; this.refresh();});
    for (const axis of ['x','y','z']) element(`editor-${axis}`).addEventListener('change', () => {
      //Capture form values before the busy state disables/blurs the input.
      const values=['x','y','z'].map(key=>element(`editor-${key}`).value);
      this.perform(() => {
      const row = this.selectedRow(); if (!row) return;
      const position = displayToSource(values.map(Number)).map(Math.round);
      if (values.some(value=>value.trim()==='')) throw Error('Enter all three pickup coordinates.');
      const draft = copy(this.current.draft); draft.find(item => item.id === row.id).position = position; this.commit(draft); this.adding = false; this.pendingDuplicate = null;
      });
    });
    action('editor-test', () => {this.setEditing(false, {testing:true}); this.onTest(); this.say('Testing edited pickups. Weapons are enabled; the race has restarted.');});
    action('editor-save', async () => {
      const project = await this.project(); this.onDownload({filename:'pickup-project.json',blob:new Blob([JSON.stringify(project,null,2)],{type:'application/json'})});
      this.savedRevision = this.revision; this.say('Project download started. Reload it with the original archives to continue editing.'); this.refresh();
    });
    element('editor-load').addEventListener('change', () => this.perform(async () => {
      const file = element('editor-load').files[0]; if (!file) return;
      try {
        if (file.size > 1048576) throw Error('Pickup project exceeds the 1 MB limit.');
        const project = parsePickupProject(JSON.parse(await file.text()));
        if (project.indexSha256 !== this.indexSha256) throw Error('This project requires its matching original Rollcage archives.');
        const bases = await Promise.all(project.levels.map(row => this.loadLevel(row.level)));
        validatePickupProject(project, {indexSha256:this.indexSha256,levels:bases.map(row => ({level:row.level,sourceHashes:row.sourceHashes,lowData:row.LOW.data,highData:row.HIGH.data}))});
        //No draft changes until the whole project and every base resource pass.
        for (const base of this.levels.values()) {base.draft = copy(base.original); base.undo = []; base.redo = [];}
        for (const row of project.levels) this.levels.get(row.level).draft = copy(row.pickups);
        this.revision++; this.savedRevision = this.revision; this.selected = null; this.onChange(); this.setEditing(true);
        this.say('Project loaded. Edits apply to both LOW and HIGH versions.'); this.refresh();
      } finally {element('editor-load').value = '';}
    }));
    action('editor-export', async () => {
      this.onModeChange(true); this.releaseMouse();
      const project = await this.project(), replacements = new Map();
      for (const row of project.levels) {
        const base = this.levels.get(row.level);
        for (const quality of ['LOW','HIGH']) {
          const data = compilePickupEdits(base[quality].data, row.pickups);
          if (!bytesEqual(data,base[quality].data)) replacements.set(base[quality].index,data);
        }
      }
      this.abort = new AbortController(); element('editor-cancel-export').hidden = false;
      try {
        const download = await buildPickupGameDownload(this.archive,replacements,project,{signal:this.abort.signal,onProgress:({completed,total})=>this.say(`Preparing game files… ${Math.round(completed / Math.max(1,total) * 100)}%`)});
        this.onDownload(download); this.savedRevision = this.revision;
        this.say('Game-files download started. Follow README.txt to use them in a separate game copy.');
      } finally {this.abort = null; element('editor-cancel-export').hidden = true; this.refresh();}
    });
    element('editor-cancel-export').addEventListener('click', () => this.abort?.abort());
    window.addEventListener('beforeunload', event => {if (this.hasUnsavedChanges) {event.preventDefault(); event.returnValue = '';}});
    window.addEventListener('keydown', event => {
      if (!this.editing || this.busy || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      if (event.code === 'Escape') {this.adding = false; this.pendingDuplicate=null; this.cancelDrag(); this.refresh(); return;}
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {event.preventDefault(); this.perform(()=>this.history(event.shiftKey?'redo':'undo',event.shiftKey?'undo':'redo'));}
      else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') {event.preventDefault(); this.perform(()=>this.history('redo','undo'));}
      else if ((event.code === 'Delete' || event.code === 'Backspace') && document.activeElement === this.canvas) {event.preventDefault(); element('editor-delete').click();}
    });
  }
  async perform(fn) {
    if (this.busy) return;
    this.busy = true; this.refresh(); element('editor-error').textContent = '';
    try {await fn();}
    catch(error) {if (error.name === 'AbortError') this.say('Export cancelled. Your edits are retained.'); else element('editor-error').textContent = messageOf(error);}
    finally {this.busy = false; this.refresh();}
  }
  say(text) {element('editor-status').textContent = text;}
  get hasUnsavedChanges() {return this.revision !== this.savedRevision;}
  get hasEdits() {return [...this.levels.values()].some(row => !same(row.draft,row.original));}
  nextId() {let id;do{id=`new-${++this.serial}`;}while(this.current.draft.some(row=>row.id===id));return id;}
  selectedRow() {return this.current?.draft.find(row => row.id === this.selected) ?? null;}
  async setSource(archive, game, verified) {
    ++this.token; this.cancelDrag(); this.archive = verified && game?.id === 'rollcage' ? archive : null;
    this.levels.clear(); this.levelLoads.clear(); this.current = null; this.scene = null; this.selected = null; this.editing = false; this.adding = false;
    this.revision = this.savedRevision = 0; this.indexSha256 = null; this.renderer.setEditorPickups([]); this.refresh();
    if (this.archive) {const source=this.archive;const digest=await pickupSha256(archive.indexData);if(this.archive===source)this.indexSha256=digest;}
    this.refresh();
  }
  clearTrack() {++this.token; this.cancelDrag(); this.current=null; this.scene=null; this.selected=null; this.adding=false;this.renderer.setEditorPickups([]);this.refresh();}
  async loadLevel(level) {
    if (!this.archive || !supported(level)) throw Error('Pickup editing is unavailable for this track.');
    const cached=this.levels.get(level);if(cached)return cached;
    const pending=this.levelLoads.get(level);if(pending)return pending;
    const promise=this.readLevel(level,this.archive);this.levelLoads.set(level,promise);
    try{return await promise;}finally{if(this.levelLoads.get(level)===promise)this.levelLoads.delete(level);}
  }
  async readLevel(level,source) {
    const pair={level};
    for(const quality of ['LOW','HIGH']) {
      const track=getGame('rollcage').tracks.find(row=>row.name===`${quality}/LEV${level}.BLP`);
      const resource=await source.readResource(track.index);
      pair[quality]={index:track.index,data:resource.data};
    }
    if(this.archive!==source)throw Error('The archive source changed while loading pickup definitions.');
    const low=parsePickupPlacements(pair.LOW.data),high=parsePickupPlacements(pair.HIGH.data);
    if (!low.count || low.count!==high.count || low.records.some((row,i)=>!bytesEqual(row.raw,high.records[i].raw))) throw Error('LOW and HIGH pickup definitions must match the original supported level.');
    pair.original=createPickupDraft(pair.LOW.data);pair.draft=copy(pair.original);pair.undo=[];pair.redo=[];
    pair.sourceHashes={LOW:await pickupSha256(pair.LOW.data),HIGH:await pickupSha256(pair.HIGH.data)};
    if(this.archive!==source)throw Error('The archive source changed while checking pickup definitions.');
    const models=parseGFXM(pair.LOW.data),metadata=pair.LOW.data.readUInt32LE(0x84),modelIndex=pair.LOW.data.readInt16LE(metadata+12);
    const vertices=models.models[modelIndex]?.vertices??[];
    pair.clearance=Math.max(0,...vertices.map(vertex=>vertex[1]));
    this.levels.set(level,pair);return pair;
  }
  async setTrack(track,scene) {
    const token=++this.token;this.current=null;this.scene=null;this.selected=null;this.adding=false;this.refresh();
    if(!this.archive||!supported(levelOf(track))){this.editing=false;this.renderer.setEditorPickups([]);this.refresh();return;}
    try {
      const base=await this.loadLevel(levelOf(track));if(token!==this.token)return;
      this.current=base;this.scene=scene;prepareTerrainPicking(scene);this.refresh();
      this.say(`${base.draft.length} pickup points · edits apply to LOW + HIGH.`);
    }catch(error){if(token===this.token){element('editor-error').textContent=messageOf(error);this.editing=false;this.refresh();}}
  }
  setEditing(enabled, {testing = false} = {}) {
    this.releaseMouse();this.cancelDrag();this.editing=Boolean(enabled&&this.current);this.adding=false;this.pendingDuplicate=null;
    if(this.editing)this.navigation.setMode('orbit');this.onModeChange(this.editing, {testing});
    this.refresh();
  }
  geometryFor(track,original) {const base=this.levels.get(levelOf(track));return base?compilePickupEdits(original,base.draft):original;}
  async project() {
    if(!this.archive||!this.indexSha256)throw Error('Load the original verified Rollcage archives first.');
    return {schemaVersion:1,game:'rollcage',indexSha256:this.indexSha256,levels:[...this.levels.values()].filter(row=>!same(row.draft,row.original)).sort((a,b)=>a.level-b.level).map(row=>({level:row.level,sourceHashes:{...row.sourceHashes},pickups:copy(row.draft)}))};
  }
  commit(draft,{before=this.current.draft}={}) {
    const checked=validatePickupDraft(this.current.LOW.data,draft);validatePickupDraft(this.current.HIGH.data,checked);
    if(same(before,checked))return;
    this.current.undo.push(copy(before));if(this.current.undo.length>100)this.current.undo.shift();this.current.redo=[];this.current.draft=copy(checked);
    this.revision++;this.onChange();this.refresh();
  }
  history(from,to) {
    this.cancelDrag();
    if(!this.current?.[from].length)return;
    this.current[to].push(copy(this.current.draft));this.current.draft=this.current[from].pop();this.revision++;this.onChange();
    if(!this.selectedRow())this.selected=this.current.draft[0]?.id??null;this.adding=false;this.pendingDuplicate=null;this.refresh();
  }
  clearance(row) {
    if(!row)return this.current.clearance;
    const point=sourceToDisplay(row.position),hit=intersectTerrain(this.scene,{origin:[point[0],point[1]+0.01,point[2]],direction:[0,-1,0]});
    return hit?Math.max(0,point[1]-hit.position[1]):this.current.clearance;
  }
  placedPosition(hit,row) {const position=[...hit.position];position[1]+=this.clearance(row);return displayToSource(position).map(Math.round);}
  pointerDown(event) {
    if(!this.editing||this.busy||event.button!==0||event.shiftKey||!this.current)return false;
    this.canvas.focus();const rect=this.canvas.getBoundingClientRect();
    const selected=pickPickup(this.current.draft.map(row=>sourceToDisplay(row.position)),this.navigation,rect,event.clientX,event.clientY);
    if(this.adding){
      if(this.current.draft.length>=16&&!this.pendingDuplicate){this.say('Maximum 16 pickup points per level.');return true;}
      const hit=intersectTerrain(this.scene,cameraRay(this.navigation,rect,event.clientX,event.clientY));if(!hit){this.say('Choose a point on the track terrain.');return true;}
      try {
        let template=this.selectedRow();
        if(!template)template=this.current.original.reduce((best,row)=>{const p=sourceToDisplay(row.position),distance=p.reduce((sum,v,i)=>sum+(v-hit.position[i])**2,0);return !best||distance<best.distance?{row,distance}:best;},null).row;
        //A just-created duplicate is placed instead of creating another one.
        const duplicate=this.pendingDuplicate;
        const draft=copy(this.current.draft),position=this.placedPosition(hit,template),id=duplicate??this.nextId();
        if(duplicate)draft.find(row=>row.id===duplicate).position=position;else draft.push({id,templateIndex:template.templateIndex,position});
        this.selected=id;this.pendingDuplicate=null;this.adding=false;this.commit(draft);this.say('Pickup placed. Adjust its coordinates or test the changes.');
      }catch(error){element('editor-error').textContent=messageOf(error);}
      this.refresh();return true;
    }
    if(selected===null)return false;
    this.selected=this.current.draft[selected].id;
    this.drag={id:event.pointerId,before:copy(this.current.draft),clearance:this.clearance(this.selectedRow()),moved:false};
    this.canvas.setPointerCapture(event.pointerId);this.refresh();return true;
  }
  pointerMove(event) {
    if(!this.drag||event.pointerId!==this.drag.id)return false;
    const hit=intersectTerrain(this.scene,cameraRay(this.navigation,this.canvas.getBoundingClientRect(),event.clientX,event.clientY));
    if(hit){
      try {
        const position=displayToSource([hit.position[0],hit.position[1]+this.drag.clearance,hit.position[2]]).map(Math.round),draft=copy(this.current.draft);
        draft.find(row=>row.id===this.selected).position=position;validatePickupDraft(this.current.LOW.data,draft);this.current.draft=draft;this.drag.moved=true;this.refresh();
      }catch(error){element('editor-error').textContent=messageOf(error);}
    }
    return true;
  }
  pointerUp() {
    if(!this.drag)return false;const drag=this.drag;this.drag=null;
    if(drag.moved)this.commit(this.current.draft,{before:drag.before});return true;
  }
  cancelDrag() {const active=Boolean(this.drag);if(this.drag&&this.current)this.current.draft=this.drag.before;this.drag=null;if(active)this.refresh();}
  refresh() {
    const available=Boolean(this.current),active=available&&this.editing&&!this.busy,row=this.selectedRow();
    element('editor-enable').disabled=!available||this.busy;element('editor-enable').checked=this.editing;
    element('editor-controls').hidden=!this.editing;
    for(const id of ['editor-add','editor-duplicate'])element(id).disabled=!active||(this.current?.draft.length>=16&&!(id==='editor-add'&&this.adding))||(id==='editor-duplicate'&&!row);
    for(const id of ['editor-delete','editor-x','editor-y','editor-z'])element(id).disabled=!active||!row;
    element('editor-undo').disabled=!active||!this.current?.undo.length;element('editor-redo').disabled=!active||!this.current?.redo.length;
    element('editor-reset-level').disabled=!active||same(this.current?.draft,this.current?.original);
    element('editor-test').disabled=!available||this.busy;
    element('editor-save').disabled=!this.archive||!this.indexSha256||this.busy;
    element('editor-load').disabled=!this.archive||!this.indexSha256||this.busy;
    element('editor-export').disabled=!this.archive||!this.hasEdits||this.busy;
    const selector=element('editor-pickup'),draft=this.current?.draft??[],signature=draft.map(item=>item.id).join('|');
    if(selector.dataset.signature!==signature){selector.replaceChildren(new Option('Select a pickup',''),...draft.map((item,i)=>new Option(`Pickup ${i+1}${item.id.startsWith('new-')?' (added)':''}`,item.id)));selector.dataset.signature=signature;}
    selector.disabled=!active||!draft.length;selector.value=row?.id??'';
    if(document.activeElement!==element('editor-x')&&document.activeElement!==element('editor-y')&&document.activeElement!==element('editor-z')){
      const position=row?sourceToDisplay(row.position):['','',''];['x','y','z'].forEach((axis,i)=>{const control=element(`editor-${axis}`),value=String(position[i]);if(control.value!==value)control.value=value;});
    }
    element('editor-count').textContent=available?`${draft.length} / 16 pickup points · LOW + HIGH${this.hasUnsavedChanges?' · unsaved project changes':''}`:'';
    element('editor-note').textContent=available?'Edit spawn points, then test or export. Boxes retain their original random awards and respawn behavior.':'Requires verified Rollcage archives. LEV15 has no original pickups; LEV15/16/17 are excluded.';
    element('editor-add').textContent=this.adding?'Cancel placement':'Add pickup';
    this.renderer.setEditorPickups(this.editing?draft.map(item=>({position:sourceToDisplay(item.position),added:item.id.startsWith('new-'),selected:item.id===this.selected})):[]);
  }
  inspect() {return {available:Boolean(this.current),editing:this.editing,adding:this.adding,level:this.current?.level??null,selected:this.selected,pickups:copy(this.current?.draft??[]),undo:this.current?.undo.length??0,redo:this.current?.redo.length??0,dirty:this.hasUnsavedChanges,editedLevels:[...this.levels.values()].filter(row=>!same(row.draft,row.original)).map(row=>row.level),busy:this.busy};}
}

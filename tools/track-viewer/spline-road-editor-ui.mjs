import {createSplineRoad,generateSplineRoad} from '../../src/spline-road.mjs';
import {terrainSurfacePresets} from '../../src/terrain-editor.mjs';
import {parseScene} from '../../src/scene.mjs';
import {buildSceneExport} from '../../src/scene-export.mjs';
import {editorProtectionRules} from '../../src/editor-protection.mjs';
import {CollisionOverlay} from './collision-overlay.mjs';
import {cameraRay,intersectTerrain,pickPickup,sourceToDisplay,displayToSource} from './pickup-picking.mjs';
const el=id=>document.getElementById(`road-${id}`),copy=x=>structuredClone(x),text=(id,value)=>{if(el(id).textContent!==value)el(id).textContent=value;};
const identityMatrix=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

export class SplineRoadEditorUI{
  constructor(editor){
    this.editor=editor;this.working=null;this.selected=null;this.point=0;this.drawing=false;this.serial=0;this.overlay=new CollisionOverlay(editor.renderer);
    const action=(id,fn)=>el(id).addEventListener('click',()=>editor.perform(fn));
    action('new',()=>this.start());action('draw',()=>{if(!this.working)this.start();this.drawing=!this.drawing;this.refresh();});
    action('apply',()=>{if(!this.working)return;const road=createSplineRoad(this.working);editor.commitRoadDefinition(road,{generateRoute:el('generate-route').checked,entryPointId:el('entry').value||null,exitPointId:el('exit').value||null,replaceEntry:el('replace-entry').checked});this.selected=road.id;this.working=copy(editor.current.roads.find(r=>r.id===road.id));this.drawing=false;this.preview();this.refresh();});
    action('cancel',()=>{this.cancel();this.loadSelected();});action('delete',()=>{if(this.selected){editor.deleteRoadDefinition(this.selected,{replacementPointId:el('exit').value||null});this.selected=null;this.working=null;this.cancel();this.refresh();}});
    action('remove-point',()=>{if(!this.working)return;this.working.points.splice(this.point,1);this.point=Math.max(0,this.point-1);this.preview();this.refresh();});
    action('focus',()=>{if(this.generated){editor.navigation.reset(this.generated.bounds.map(([lo,hi],axis)=>axis?[-hi,-lo]:[lo,hi]));editor.onModeChange(editor.active);}});
    action('undo',()=>{editor.roadHistory('roadUndo','roadRedo');this.working=null;this.selected=null;this.cancel();this.refresh();});action('redo',()=>{editor.roadHistory('roadRedo','roadUndo');this.working=null;this.selected=null;this.cancel();this.refresh();});
    el('selection').addEventListener('change',()=>{this.selected=el('selection').value||null;this.loadSelected();});el('point').addEventListener('change',()=>{this.point=Number(el('point').value)||0;this.refresh();this.markers();});
    for(const id of ['x','y','z','width','bank'])el(id).addEventListener('change',()=>{if(!this.working?.points[this.point])return;const values=['x','y','z','width','bank'].map(key=>Number(el(key).value));if(values.some(n=>!Number.isFinite(n))){text('status','Enter finite control-point values.');return;}const p=this.working.points[this.point];p.position=displayToSource(values.slice(0,3)).map(Math.round);p.width=values[3];p.bank=values[4];this.preview();this.refresh();});
    for(const id of ['columns','spacing','surface','template','start-snap','end-snap'])el(id).addEventListener('change',()=>{if(!this.working)return;this.working.columns=Number(el('columns').value);this.working.spacing=Number(el('spacing').value);const [sector,cell]=el('surface').value.split(':').map(Number);this.working.surface={sector,cell};this.working.routeTemplateGroup=el('template').value||null;for(const [id,key]of [['start-snap','startSnap'],['end-snap','endSnap']]){const value=el(id).value;this.working[key]=value?{sector:Number(value.split(':')[0]),edge:value.split(':')[1]}:null;if(value){const s=parseScene(editor.current.LOW.geometry).segments[this.working[key].sector];this.working.columns=s.columns;}}this.preview();this.refresh();});
    window.addEventListener('keydown',event=>{if(!editor.roadEditing||/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName))return;if(event.code==='Escape'){this.cancel();this.loadSelected();}});
  }
  ensure(){
    const base=this.editor.current;if(!base||this.base===base)return;this.base=base;this.working=null;this.selected=null;this.drawing=false;
    this.presets=terrainSurfacePresets(base.LOW.geometry,base.HIGH.geometry);el('surface').replaceChildren(...this.presets.map(p=>new Option(p.label,`${p.sector}:${p.cell}`)));
    const scene=parseScene(base.LOW.geometry),locked=editorProtectionRules(base.level).sectors;const snaps=scene.segments.flatMap(s=>locked.includes(s.index)||s.columns>40?[]:['start','end'].map(edge=>new Option(`Sector ${s.index} / ${edge}`,`${s.index}:${edge}`)));
    for(const id of ['start-snap','end-snap'])el(id).replaceChildren(new Option('No snap',''),...snaps.map(o=>new Option(o.textContent,o.value)));
  }
  start(){
    this.ensure();const base=this.editor.current;let id;do{id=`road-${++this.serial}`;}while(base.roads.some(r=>r.id===id));const p=this.presets[0];if(!p)throw Error('This track has no supported road surface preset.');
    this.selected=null;this.working={id,points:[],surface:{sector:p.sector,cell:p.cell},columns:4,spacing:64,startSnap:null,endSnap:null,routeTemplateGroup:base.routeTopology.groups.find(g=>g.index&&g.points.length&&!g.header[3])?.id??null};this.point=0;this.drawing=true;this.preview();this.refresh();text('status','Click to add centreline points. Set a working height for bridges. Apply road commits terrain and the optional route together.');
  }
  loadSelected(){
    this.cancel();this.working=copy(this.editor.current?.roads.find(r=>r.id===this.selected)??null);this.point=0;this.preview();this.refresh();
    const topology=this.editor.current?.routeTopology,group=topology?.groups.find(g=>g.roadId===this.selected&&!g.retired);
    const entry=group&&topology.groups.flatMap(g=>g.id===group.id?[]:g.points).find(p=>p.links[0]?.pointId===group.points[0]?.id),exit=group?.points.at(-1)?.links.find(link=>link&&link.groupId!==group.id);
    el('entry').value=entry?.id??'';el('exit').value=exit?.pointId??'';
  }
  hit(event){const ray=cameraRay(this.editor.navigation,this.editor.canvas.getBoundingClientRect(),event.clientX,event.clientY);if(!ray)return null;const terrain=intersectTerrain(this.editor.scene,ray);if(terrain&&!el('use-height').checked)return terrain.position;const y=Number(el('working-height').value),t=(y-ray.origin[1])/ray.direction[1];return Number.isFinite(t)&&t>0?ray.origin.map((v,i)=>v+ray.direction[i]*t):null;}
  pointerDown(event){
    if(!this.editor.roadEditing||this.editor.busy||event.button!==0||event.shiftKey)return false;
    if(this.drawing){const hit=this.hit(event);if(!hit)return false;if(!this.working)this.start();const last=this.working.points.at(-1),width=last?.width??(Number(el('width').value)||256),bank=last?.bank??0;this.working.points.push({position:displayToSource(hit).map(Math.round),width,bank});this.point=this.working.points.length-1;this.editor.canvas.focus();this.preview();this.refresh();return true;}
    const points=this.working?.points??[],index=pickPickup(points.map(p=>sourceToDisplay(p.position)),this.editor.navigation,this.editor.canvas.getBoundingClientRect(),event.clientX,event.clientY,{radiusPx:13});if(index===null)return false;this.point=index;this.drag={before:copy(points[index]),id:event.pointerId};this.editor.canvas.setPointerCapture(event.pointerId);this.editor.canvas.focus();this.refresh();return true;
  }
  pointerMove(event){if(!this.drag)return false;const hit=this.hit(event);if(hit){const p=displayToSource(hit).map(Math.round);if(!el('use-height').checked)p[1]=this.drag.before.position[1];this.working.points[this.point].position=p;this.preview();this.refresh();}return true;}
  pointerUp(){if(!this.drag)return false;this.drag=null;text('status','Preview updated. Apply road to save this shape.');return true;}
  preview(){
    this.generated=null;this.editor.renderer.setEditorGhost(null);if(!this.working||this.working.points.length<2){this.markers();return;}
    try{const generated=generateSplineRoad(this.editor.roadSourceGeometry(),this.working);this.generated=generated;const source=parseScene(this.editor.current.LOW.geometry).segments[this.working.surface.sector].faces[this.working.surface.cell],uv=[];(source.vertexFlags&4?[0,1,2,3]:[1,3,0,2]).forEach((corner,i)=>uv[corner]=source.uv[i]);
      const segments=generated.segments.map((s,index)=>({...s,index,faces:Array.from({length:s.columns*s.rows},(_,cell)=>{const row=Math.floor(cell/s.columns),col=cell%s.columns,top=row*(s.columns+1)+col;return {index:cell,indices:[top,top+1,top+s.columns+1,top+s.columns+2],uv,page:source.page};})})),textures=this.editor.scene.textures,scene=buildSceneExport({segments},textures);scene.textures=textures;this.editor.renderer.setEditorGhost(scene);this.editor.renderer.editorGhostMatrix=identityMatrix();text('status',`${generated.segments.length} new sector(s) · ${generated.centerline.length} centreline samples · shaded preview; Apply road validates native collision and spatial data.`);
    }catch(error){text('status',error.message);}this.markers();
  }
  markers(){const points=this.working?.points??[],lines=[],normals=[],radius=Math.max(6,Math.min(35,this.editor.navigation.radius*0.006));points.forEach((point,index)=>{const p=sourceToDisplay(point.position),target=index===this.point?normals:lines;for(let axis=0;axis<3;axis++){const a=p.slice(),b=p.slice();a[axis]-=radius;b[axis]+=radius;target.push(...a,...b);}if(index)lines.push(...sourceToDisplay(points[index-1].position),...p);});this.overlay.set({groups:[{active:true,lines,normals}]});}
  cancel(){this.drag=null;this.drawing=false;this.generated=null;this.editor.renderer.setEditorGhost(null);this.overlay.clear();}
  refresh(){
    if(!this.editor.roadEditing)return;this.ensure();const base=this.editor.current,active=Boolean(base&&!this.editor.busy),roads=base?.roads??[],signature=JSON.stringify(roads.map(r=>r.id));if(el('selection').dataset.signature!==signature){el('selection').replaceChildren(new Option('Unsaved / no selection',''),...roads.map(r=>new Option(r.id,r.id)));el('selection').dataset.signature=signature;}el('selection').value=this.selected??'';
    const points=this.working?.points??[],pointSignature=JSON.stringify(points.map((_,i)=>i));if(el('point').dataset.signature!==pointSignature){el('point').replaceChildren(...points.map((_,i)=>new Option(`Point ${i+1}`,String(i))));el('point').dataset.signature=pointSignature;}el('point').value=String(this.point);
    const p=points[this.point],position=p?sourceToDisplay(p.position):['','',''];for(const [id,value]of [...['x','y','z'].map((id,i)=>[id,position[i]]),['width',p?.width??256],['bank',p?.bank??0],['columns',this.working?.columns??4],['spacing',this.working?.spacing??64]])if(document.activeElement!==el(id)&&el(id).value!==String(value))el(id).value=String(value);
    if(this.working){el('surface').value=`${this.working.surface.sector}:${this.working.surface.cell}`;for(const [id,key]of [['start-snap','startSnap'],['end-snap','endSnap']])el(id).value=this.working[key]?`${this.working[key].sector}:${this.working[key].edge}`:'';}
    const groups=base?.routeTopology.groups.filter(g=>g.index&&g.sourceGroup!==null&&g.points.length&&!g.header[3])??[],routes=base?.routeTopology.groups.flatMap(g=>g.index?g.points.map(p=>({id:p.id,label:`Group ${g.index} / ${p.id}`})):[])??[],routeSignature=JSON.stringify(routes.map(r=>r.id));if(el('template').dataset.signature!==routeSignature){el('template').replaceChildren(new Option('No reference route',''),...groups.map(g=>new Option(`Group ${g.index} · copied speed defaults`,g.id)));for(const id of ['entry','exit']){const value=el(id).value;el(id).replaceChildren(new Option('No connection yet',''),...routes.map(r=>new Option(r.label,r.id)));el(id).value=value;}el('template').dataset.signature=routeSignature;}el('template').value=this.working?.routeTemplateGroup??'';
    for(const id of ['new','selection','working-height','use-height','generate-route','entry','exit','replace-entry'])el(id).disabled=!active;for(const id of ['draw','columns','spacing','surface','template','start-snap','end-snap'])el(id).disabled=!active||!this.working;for(const id of ['x','y','z','width','bank','point','remove-point'])el(id).disabled=!active||!p;el('apply').disabled=!active||!this.generated;el('delete').disabled=!active||!this.selected;el('focus').disabled=!active||!this.generated;el('cancel').disabled=!active||!this.working;el('undo').disabled=!active||!base?.roadUndo?.length;el('redo').disabled=!active||!base?.roadRedo?.length;if(!groups.length)el('generate-route').disabled=true;
    text('draw',this.drawing?'Stop adding points':'Continue drawing');text('count',`${roads.length} saved road(s) · ${points.length} control points · LOW + HIGH`);
  }
  render(navigation){this.overlay.render(navigation,{show:this.editor.roadEditing,disabled:false,normals:true});}
}

import {inspectRaceLayout,raceLayoutCheckpointConstraint} from '../../src/race-layout-editor.mjs';
import {cameraRay,intersectTerrain,pickPickup,sourceToDisplay,displayToSource} from './pickup-picking.mjs';
import {CollisionOverlay} from './collision-overlay.mjs';
import {cloneRaceRouteGroup,insertRaceRoutePoint,connectRaceRoutePoints,validateRaceRouteTopology} from '../../src/race-route-topology.mjs';
import {insertCheckpointAfter,removeCheckpoint,setFinishCheckpoint,setCheckpointTimingMarker} from '../../src/checkpoint-topology.mjs';

const el=id=>document.getElementById(`layout-${id}`);
const text=(id,value)=>{if(el(id).textContent!==value)el(id).textContent=value;};
const identity=(kind,row)=>kind==='routes'?row.routePointId:String(kind==='checkpoints'?row.id:row.index);
const copy=value=>structuredClone(value);

// Authoring controls only: overlays never enter the simulation. Every commit
// runs the paired resource compiler before changing the visible project.
export class RaceLayoutEditorUI {
  constructor(editor){
    this.editor=editor;this.kind='routes';this.selected=null;this.drag=null;this.overlay=new CollisionOverlay(editor.renderer);
    el('selection').addEventListener('change',()=>{this.cancel();this.selected=el('selection').value||null;this.refresh();});
    el('group').addEventListener('change',()=>{this.cancel();this.selected=null;this.refresh();});
    el('show').addEventListener('change',()=>this.refreshOverlay(true));
    el('focus').addEventListener('click',()=>{const row=this.row();if(row){const p=sourceToDisplay(row.markerPosition??row.position);editor.navigation.reset(p.map(n=>[n-100,n+100]));editor.onModeChange(editor.active);}});
    const applyFields=()=>{
      const position=['x','y','z'].map(id=>el(id).value),direction=['dx','dy','dz'].map(id=>el(id).value),speeds=['min-speed','target-speed'].map(id=>el(id).value);
      editor.perform(()=>{
        const row=this.row();if(!row)return;
        const values=[...position,...(this.kind==='checkpoints'?direction:this.kind==='routes'?speeds:[])];
        if(values.some(v=>v.trim()===''||!Number.isFinite(Number(v))))throw Error('Enter finite race-layout coordinates and parameters.');
        const next={...row,position:displayToSource(position.map(Number)).map(Math.round)};
        if(this.kind==='checkpoints')next.direction=displayToSource(direction.map(Number)).map(Math.round);
        if(this.kind==='routes'){next.minSpeed=Number(speeds[0]);next.targetSpeed=Number(speeds[1]);}
        this.commitRow(next);
        text('status','Race layout updated in LOW + HIGH.');
      });
    };
    for(const axis of ['dx','dy','dz','min-speed','target-speed'])el(axis).addEventListener('change',applyFields);
    for(const name of ['minimum-readable','target-readable','full-throttle'])el(name).addEventListener('change',()=>{
      const minimum=Number(el('minimum-readable').value),target=Number(el('target-readable').value),fullThrottle=el('full-throttle').checked;
      editor.perform(()=>{
      const row=this.row();if(!row||this.kind!=='routes')return;
      if(!Number.isInteger(minimum)||minimum<0||minimum>510||minimum%2||!Number.isInteger(target)||target<0||target>508||target%2)throw Error('Native speed thresholds require even integer values; minimum 0–510 and target 0–508.');
      this.commitRow({...row,minSpeed:minimum/2,targetSpeed:fullThrottle?255:target/2});
    });});
    const action=(id,fn)=>el(id).addEventListener('click',()=>editor.perform(fn));
    action('clone-group',()=>{const base=editor.current,row=this.row(),groupId=row?.groupId??el('group').value;
      const result=cloneRaceRouteGroup(base.routeTopology,groupId);editor.commitTopology({routes:result.topology});el('group').value=result.groupId;this.selected=Object.values(result.pointIds)[0]??null;this.refresh();text('status','Group cloned. Connect an entry and exit before Test changes or export.');});
    for(const side of ['before','after'])action(`insert-${side}`,()=>{const row=this.row();if(!row)return;const result=insertRaceRoutePoint(editor.current.routeTopology,row.groupId,row.routePointId,{side});editor.commitTopology({routes:result.topology});this.selected=result.pointId;this.refresh();text('status','Route point inserted; move it to shape the route.');});
    action('connect',()=>{const row=this.row();if(!row)return;editor.commitTopology({routes:connectRaceRoutePoints(editor.current.routeTopology,row.routePointId,Number(el('link-slot').value),el('link-target').value,{replace:el('replace-link').checked})});text('status','Explicit route connection saved.');});
    action('checkpoint-add',()=>{const base=editor.current,row=this.row();if(!row)return;const next=insertCheckpointAfter(base.LOW.geometry,base.checkpointTopology,row.checkpointId,{level:base.level});const order=next.checkpoints.findIndex(cp=>cp.id===row.checkpointId);editor.commitTopology({checkpoints:next});this.selected=next.checkpoints[order+1].planes[0].id;this.refresh();text('status','Checkpoint copied after selection with timing feedback disabled. Move the copied plane to its desired position.');});
    action('checkpoint-remove',()=>{const row=this.row();if(row){editor.commitTopology({checkpoints:removeCheckpoint(editor.current.checkpointTopology,row.checkpointId)});this.selected=null;this.refresh();}});
    action('checkpoint-finish',()=>{const row=this.row();if(row)editor.commitTopology({checkpoints:setFinishCheckpoint(editor.current.checkpointTopology,row.checkpointId)});});
    el('checkpoint-timing').addEventListener('change',()=>{const enabled=el('checkpoint-timing').checked;editor.perform(()=>{const row=this.row();if(row)editor.commitTopology({checkpoints:setCheckpointTimingMarker(editor.current.checkpointTopology,row.checkpointId,enabled)});});});
    el('apply').addEventListener('click',applyFields);
    for(const axis of ['x','y','z'])el(axis).addEventListener('keydown',event=>{if(event.code==='Enter'){event.preventDefault();applyFields();}});
    for(const name of ['undo','redo','reset'])el(name).addEventListener('click',()=>editor.perform(()=>name==='reset'?editor.resetLayout():editor.layoutHistory(name==='undo'?'layoutUndo':'layoutRedo',name==='undo'?'layoutRedo':'layoutUndo')));
    window.addEventListener('keydown',event=>{
      if(!editor.layoutEditing||editor.busy||/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName))return;
      if(event.code==='Escape'){this.cancel();this.refresh();}
      if((event.ctrlKey||event.metaKey)&&event.code==='KeyZ'){event.preventDefault();editor.perform(()=>editor.layoutHistory(event.shiftKey?'layoutRedo':'layoutUndo',event.shiftKey?'layoutUndo':'layoutRedo'));}
    });
  }
  ensure(){const base=this.editor.current;if(!base)return;base.layoutInfo??=inspectRaceLayout(base.LOW.geometry);}
  setKind(kind){this.cancel();this.kind=kind;this.selected=null;this.ensure();this.refresh();}
  rows(){
    const base=this.editor.current;if(!base?.layoutInfo)return [];
    if(this.kind==='routes'&&base.routeTopology){return base.routeTopology.groups.flatMap((group,index)=>index?group.points.map((row,point)=>({...row,routePointId:row.id,groupId:group.id,group:index,point,cyclic:Boolean(group.header[4])})):[]).filter(row=>!el('group').value||row.groupId===el('group').value);}
    if(this.kind==='checkpoints'&&base.checkpointTopology){
      const geometry=this.editor.compile().LOW.geometry;
      if(this.compiledGeometry!==geometry){this.compiledInfo=inspectRaceLayout(geometry);this.compiledGeometry=geometry;}
      let nativeId=0;const sourceNativeIds=new Map();for(const cp of base.checkpointTopology.checkpoints)for(const plane of cp.planes)if(plane&&!sourceNativeIds.has(plane.id))sourceNativeIds.set(plane.id,nativeId++);
      const topologyChanged=JSON.stringify(base.checkpointTopology.checkpoints.map(cp=>[cp.id,cp.planes.map(p=>p&&[p.id,p.sourceId])]))!==JSON.stringify(base.checkpointOriginal.checkpoints.map(cp=>[cp.id,cp.planes.map(p=>p&&[p.id,p.sourceId])]));
      return base.checkpointTopology.checkpoints.flatMap((cp,order)=>cp.planes.flatMap((plane,lane)=>{
        if(!plane||cp.planes.findIndex(p=>p?.id===plane.id)!==lane)return [];
        const id=topologyChanged?sourceNativeIds.get(plane.id):plane.sourceId,current=this.compiledInfo.checkpoints.find(p=>p.id===id);
        if(!current)return [];
        const constraint=raceLayoutCheckpointConstraint(this.compiledInfo,current,current);
        return [{...plane,checkpointId:cp.id,lane,order,sector:current.sector,progress:current.progress,markerPosition:constraint.intersectionPoint??plane.position,planeSegments:constraint.intersectionSegments}];
      }));
    }
    const patches=new Map((base.layoutDraft?.[this.kind]??[]).map(row=>[identity(this.kind,row),row]));
    let rows=base.layoutInfo[this.kind].map(row=>({...row,...patches.get(identity(this.kind,row))}));
    if(this.kind==='checkpoints'){
      const geometry=this.editor.compile().LOW.geometry;
      if(this.compiledGeometry!==geometry){this.compiledInfo=inspectRaceLayout(geometry);this.compiledGeometry=geometry;}
      rows=rows.map(row=>{const current=this.compiledInfo.checkpoints.find(p=>p.id===row.id),constraint=raceLayoutCheckpointConstraint(this.compiledInfo,current,current);return {...row,sector:current.sector,markerPosition:constraint.intersectionPoint??row.position,planeSegments:constraint.intersectionSegments};});
    }
    return rows.filter(row=>this.kind!=='routes'||el('group').value===''||row.group===Number(el('group').value));
  }
  row(){return this.rows().find(row=>identity(this.kind,row)===this.selected)??null;}
  commitRow(row){
    const e=this.editor;
    if(this.kind==='routes'&&e.current.routeTopology){const draft=copy(e.current.routeTopology),point=draft.groups.flatMap(g=>g.points).find(p=>p.id===row.routePointId);Object.assign(point,{position:[...row.position],minSpeed:row.minSpeed,targetSpeed:row.targetSpeed});e.commitTopology({routes:draft});}
    else if(this.kind==='checkpoints'&&e.current.checkpointTopology){const draft=copy(e.current.checkpointTopology);for(const cp of draft.checkpoints)for(const plane of cp.planes)if(plane?.id===row.id)Object.assign(plane,{position:[...row.position],direction:[...row.direction]});e.commitTopology({checkpoints:draft});}
    else e.commitLayout(this.patch(row));
  }
  patch(row){
    const draft=copy(this.editor.current.layoutDraft),id=identity(this.kind,row);
    const original=this.editor.current.layoutInfo[this.kind].find(r=>identity(this.kind,r)===id);
    let next;if(this.kind==='routes')next={group:row.group,point:row.point,position:[...row.position],minSpeed:row.minSpeed,targetSpeed:row.targetSpeed};
    else if(this.kind==='checkpoints')next={id:row.id,position:[...row.position],direction:[...row.direction]};
    else next={index:row.index,position:[...row.position]};
    const matches=next.position.every((n,i)=>n===original.position[i])&&(this.kind!=='routes'||next.minSpeed===original.minSpeed&&next.targetSpeed===original.targetSpeed)&&(this.kind!=='checkpoints'||next.direction.every((n,i)=>n===original.direction[i]));
    draft[this.kind]=draft[this.kind].filter(r=>identity(this.kind,r)!==id);if(!matches)draft[this.kind].push(next);
    return draft;
  }
  pointerDown(event){
    const e=this.editor;if(!e.layoutEditing||e.busy||event.button!==0||event.shiftKey)return false;
    const rows=this.rows(),index=pickPickup(rows.map(row=>sourceToDisplay(row.markerPosition??row.position)),e.navigation,e.canvas.getBoundingClientRect(),event.clientX,event.clientY,{radiusPx:13});
    if(index===null)return false;const row=rows[index];this.selected=identity(this.kind,row);
    this.drag={row:copy(row),x:event.clientX,y:event.clientY,position:null};e.canvas.focus();e.canvas.setPointerCapture(event.pointerId);this.refresh();return true;
  }
  pointerMove(event){
    if(!this.drag)return false;const e=this.editor,hit=intersectTerrain(e.scene,cameraRay(e.navigation,e.canvas.getBoundingClientRect(),event.clientX,event.clientY));
    if(hit&&Math.hypot(event.clientX-this.drag.x,event.clientY-this.drag.y)>3){
      // Preserve authored height while dragging in XZ. Height is edited explicitly
      // so elevated/stacked routes are not silently snapped to another road.
      const target=displayToSource(hit.position),anchor=this.drag.row.markerPosition??this.drag.row.position;
      this.drag.position=this.drag.row.position.map((n,i)=>i===1?n:Math.round(n+target[i]-anchor[i]));this.refreshOverlay(true);
      text('status','Release to validate this move. Height is preserved; adjust Height explicitly. Esc cancels.');
    }return true;
  }
  pointerUp(){if(!this.drag)return false;const drag=this.drag;this.drag=null;if(drag.position)this.editor.perform(()=>{try{this.commitRow({...drag.row,position:drag.position});text('status','Move applied to LOW + HIGH.');}catch(error){text('status','Move rejected. The committed layout is unchanged.');throw error;}});this.refreshOverlay(true);return true;}
  cancel(){const dragging=Boolean(this.drag);this.drag=null;this.overlaySignature=null;if(dragging){text('status','Move cancelled. The committed layout is unchanged.');this.refreshOverlay(true);}}
  refreshOverlay(force=false){
    const e=this.editor,rows=this.rows(),selected=this.selected,signature=JSON.stringify([e.current?.level,this.kind,e.current?.layoutDraft,e.current?.routeTopology,e.current?.checkpointTopology,selected,this.drag?.position,el('show').checked]);
    if(!force&&signature===this.overlaySignature)return;this.overlaySignature=signature;const lines=[],normals=[],marks=[],radius=Math.max(4,Math.min(30,e.navigation.radius*0.005));
    let previous;
    for(const row of rows){
      const isSelected=identity(this.kind,row)===selected,target=isSelected?normals:marks;
      let marker=row.markerPosition??row.position,segments=row.planeSegments??[];
      if(isSelected&&this.drag?.position){if(this.kind==='checkpoints'){const constraint=raceLayoutCheckpointConstraint(this.compiledInfo,row,{...row,position:this.drag.position});marker=constraint.intersectionPoint??this.drag.position;segments=constraint.intersectionSegments??[];}else marker=this.drag.position;}
      const p=sourceToDisplay(marker);for(const segment of segments)target.push(...sourceToDisplay(segment[0]),...sourceToDisplay(segment[1]));
      for(let axis=0;axis<3;axis++){const a=p.slice(),b=p.slice();a[axis]-=radius;b[axis]+=radius;target.push(...a,...b);}
      if(this.kind==='routes'&&previous?.group===row.group)lines.push(...previous.position,...p);previous={group:row.group,position:p};
      if(this.kind==='checkpoints'){const d=sourceToDisplay(row.direction),length=Math.hypot(...d);if(length)target.push(...p,...p.map((v,i)=>v+d[i]/length*radius*5));}
    }
    this.overlay.set({groups:[{active:true,lines:[...lines,...marks],normals}]});
  }
  render(navigation){this.overlay.render(navigation,{show:Boolean(this.editor.layoutEditing&&el('show').checked),disabled:false,normals:true});}
  refresh(){
    const e=this.editor,base=e.current,active=Boolean(base&&e.layoutEditing&&!e.busy);if(e.layoutEditing)this.ensure();
    const groups=base?.routeTopology?.groups.map((g,index)=>({id:g.id,index,count:g.points.length}))??[],groupSignature=JSON.stringify([base?.level,groups]);
    if(el('group').dataset.signature!==groupSignature){const prior=el('group').value;el('group').replaceChildren(new Option('All route groups',''),...groups.filter(g=>g.index&&g.count).map(g=>new Option(`Group ${g.index} · ${g.count} points`,g.id)));el('group').value=groups.some(g=>g.id===prior)?prior:'';el('group').dataset.signature=groupSignature;}
    el('group-label').hidden=this.kind!=='routes';el('speeds').hidden=this.kind!=='routes';el('direction').hidden=this.kind!=='checkpoints';
    el('route-actions').hidden=this.kind!=='routes';el('checkpoint-actions').hidden=this.kind!=='checkpoints';
    const rows=this.rows(),selector=el('selection'),signature=JSON.stringify([base?.level,this.kind,rows.map(r=>[identity(this.kind,r),r.group,r.point,r.order,r.timingMarker])]);
    if(selector.dataset.signature!==signature){selector.replaceChildren(new Option('Select a marker',''),...rows.map(row=>new Option(this.kind==='routes'?`Group ${row.group} / point ${row.point}`:this.kind==='checkpoints'?`${row.order===0?'Finish':'Checkpoint '+row.order}${row.lane?' · alternative '+row.lane:''}${row.timingMarker?' · timing marker':''}`:`Starting slot ${row.index+1}`,identity(this.kind,row))));selector.dataset.signature=signature;}
    if(this.selected&&!rows.some(r=>identity(this.kind,r)===this.selected))this.selected=null;if(selector.value!==(this.selected??''))selector.value=this.selected??'';
    const row=this.row(),p=row?sourceToDisplay(row.position):['','',''],d=row?.direction?sourceToDisplay(row.direction):['','',''];
    for(const [id,value]of [...['x','y','z'].map((id,i)=>[id,p[i]]),...['dx','dy','dz'].map((id,i)=>[id,d[i]]),['min-speed',row?.minSpeed??''],['target-speed',row?.targetSpeed??'']]){const input=el(id);input.disabled=!active||!row;if(document.activeElement!==input&&input.value!==String(value))input.value=String(value);}
    for(const [id,value]of [['minimum-readable',row?.minSpeed===undefined?'':row.minSpeed*2],['target-readable',row?.targetSpeed===undefined?'':Math.min(row.targetSpeed,254)*2]]){const input=el(id);input.disabled=!active||!row||id==='target-readable'&&row.targetSpeed===255;if(document.activeElement!==input&&input.value!==String(value))input.value=String(value);}
    el('full-throttle').checked=row?.targetSpeed===255;el('full-throttle').disabled=!active||!row;
    const allRoutes=base?.routeTopology?.groups.flatMap((group,index)=>index?group.points.map((point,i)=>({id:point.id,label:`Group ${index} / point ${i}`})):[])??[],linkSignature=JSON.stringify(allRoutes);
    if(el('link-target').dataset.signature!==linkSignature){const previous=el('link-target').value;el('link-target').replaceChildren(new Option('Choose destination',''),...allRoutes.map(r=>new Option(r.label,r.id)));if(allRoutes.some(r=>r.id===previous))el('link-target').value=previous;el('link-target').dataset.signature=linkSignature;}
    const topologyLocked=[12,13].includes(base?.level),isRoute=this.kind==='routes',isCheckpoint=this.kind==='checkpoints';
    for(const id of ['insert-before','insert-after','connect','link-slot','link-target','replace-link'])el(id).disabled=!active||!row||!isRoute;
    el('clone-group').disabled=!active||!isRoute||!row&&!el('group').value;
    for(const id of ['checkpoint-add','checkpoint-finish'])el(id).disabled=!active||!row||!isCheckpoint||topologyLocked;
    el('checkpoint-remove').disabled=!active||!row||!isCheckpoint||topologyLocked||(base?.checkpointTopology?.checkpoints.length??0)<=2;
    el('checkpoint-timing').disabled=!active||!row||!isCheckpoint;el('checkpoint-timing').checked=Boolean(row?.timingMarker);
    let warning='';
    if(isRoute&&base?.routeTopology){
      if(this.validatedRoutes!==base.routeTopology||this.validatedGeometry!==base.LOW.geometry){this.routeValidation=validateRaceRouteTopology(base.LOW.geometry,base.routeTopology,{requireConnected:false});this.validatedRoutes=base.routeTopology;this.validatedGeometry=base.LOW.geometry;}
      warning=[...this.routeValidation.errors,...this.routeValidation.warnings].join(' ');
    }
    if(isCheckpoint&&topologyLocked)warning=`LEV${base.level}: adding/removing checkpoints and changing the finish are locked because native terrain direction uses hardcoded checkpoint stages. Plane movement and timing feedback remain editable.`;
    text('topology-warning',warning);
    for(const id of ['selection','group','show'])el(id).disabled=!active;el('focus').disabled=!active||!row;el('apply').disabled=!active||!row;
    el('undo').disabled=!active||!base?.layoutUndo?.length;el('redo').disabled=!active||!base?.layoutRedo?.length;el('reset').disabled=!active||!base||!(Object.values(base.layoutDraft).some(rows=>rows.length)||JSON.stringify(base.routeTopology)!==JSON.stringify(base.routeOriginal)||JSON.stringify(base.checkpointTopology)!==JSON.stringify(base.checkpointOriginal));
    text('count',`${rows.length} ${this.kind==='routes'?'stored route points':this.kind==='checkpoints'?'checkpoint markers':'starting slots'} · LOW + HIGH`);
    text('details',row?isRoute?`Native minimum speed threshold ${row.minSpeed*2}; target ${row.targetSpeed===255?'full throttle':row.targetSpeed*2}. These are native speed thresholds, not verified km/h. Outgoing links: ${row.links.map((link,i)=>`${i+1}: ${link?allRoutes.find(r=>r.id===link.pointId)?.label??link.pointId:'empty'}`).join('; ')}. Stored control flags are preserved.`:isCheckpoint?`Sector ${row.sector} · logical order ${row.order} · progress ${row.progress}. Timing feedback is independent of finish/lap counting. New order uses equal progress intervals.`:`Starting direction follows the finish checkpoint: [${base?.checkpointTopology?.checkpoints[0]?.planes[0]?.direction.join(', ')??''}] native units; no per-slot yaw is stored.`:'Select a marker in the view or list. Coordinates and terrain coverage are validated before applying.');
    this.refreshOverlay();
  }
}

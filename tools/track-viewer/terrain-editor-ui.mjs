import {inspectTerrain,emptyTerrainDraft,terrainSurfacePresets} from '../../src/terrain-editor.mjs';
import {terrainBrushSelection,stampTerrain} from './terrain-brush.mjs';
import {cameraRay,intersectTerrain} from './pickup-picking.mjs';
import {CollisionOverlay} from './collision-overlay.mjs';
import {editorProtectionRules} from '../../src/editor-protection.mjs';
import {parseScene} from '../../src/scene.mjs';
import {compileSplineRoads} from '../../src/terrain-construction.mjs';
import {getGame} from '../../src/track-games.mjs';
import {speedPadPatterns,speedPadFootprint,speedPadPatternShape} from '../../src/speed-pad-patterns.mjs';
const el=id=>document.getElementById(id),text=(id,value)=>{if(el(id).textContent!==value)el(id).textContent=value;};
function drawSurfaceQuad(ctx,image,uv,x,y,size){
  const points=[[x,y],[x+size,y],[x,y+size],[x+size,y+size]];
  for(const ids of [[0,1,3],[0,3,2]]){
    const [a,b,c]=ids.map(i=>uv[i]),[p,q,r]=ids.map(i=>points[i]),den=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);if(!den)continue;
    const ax=((q[0]-p[0])*(c[1]-a[1])-(r[0]-p[0])*(b[1]-a[1]))/den,bx=((q[1]-p[1])*(c[1]-a[1])-(r[1]-p[1])*(b[1]-a[1]))/den,cx=((r[0]-p[0])*(b[0]-a[0])-(q[0]-p[0])*(c[0]-a[0]))/den,dx=((r[1]-p[1])*(b[0]-a[0])-(q[1]-p[1])*(c[0]-a[0]))/den;
    ctx.save();ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.lineTo(...r);ctx.closePath();ctx.clip();ctx.transform(ax,bx,cx,dx,p[0]-ax*a[0]-cx*a[1],p[1]-bx*a[0]-dx*a[1]);ctx.drawImage(image,0,0);ctx.restore();
  }
}
export class TerrainEditorUI {
  constructor(editor){
    this.editor=editor;this.kind='terrain';this.stroke=null;this.overlay=new CollisionOverlay(editor.renderer);this.page=0;this.preset=null;this.paletteBase=null;
    for(const id of ['surface-mode','surface-rotation'])el(id).addEventListener('change',()=>{this.page=0;this.preset=(this.patternMode?this.patterns:this.presets)?.[0]??null;this.cancel();this.filterPalette();this.refresh();});
    el('terrain-operation').addEventListener('change',()=>this.refresh());
    for(const id of ['terrain-undo','terrain-redo','terrain-reset'])el(id).addEventListener('click',()=>editor.perform(()=>id==='terrain-reset'?editor.commitTerrain(emptyTerrainDraft()):editor.terrainHistory(id==='terrain-undo'?'terrainUndo':'terrainRedo',id==='terrain-undo'?'terrainRedo':'terrainUndo')));
    el('surface-search').addEventListener('input',()=>{this.page=0;this.filterPalette();});
    el('surface-prev').addEventListener('click',()=>{this.page=Math.max(0,this.page-1);this.filterPalette();});el('surface-next').addEventListener('click',()=>{this.page++;this.filterPalette();});
    window.addEventListener('keydown',event=>{
      if(!editor.terrainEditing||/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName))return;
      if(event.code==='Escape'){this.cancel();editor.refresh();}
      if((event.ctrlKey||event.metaKey)&&event.code==='KeyZ'){event.preventDefault();editor.perform(()=>editor.terrainHistory(event.shiftKey?'terrainRedo':'terrainUndo',event.shiftKey?'terrainUndo':'terrainRedo'));}
    });
  }
  ensure(){
    const base=this.editor.current;if(!base)return;
    const roadSignature=JSON.stringify(base.roads??[]);
    if(!base.terrainInfo||base.terrainInfoRoadSignature!==roadSignature){const lowData=compileSplineRoads(base.LOW.geometry,base.roads??[],{texture:base.LOW.texture,validateContacts:false}).data,highData=compileSplineRoads(base.HIGH.geometry,base.roads??[],{texture:base.HIGH.texture,validateContacts:false}).data,low=inspectTerrain(lowData),high=inspectTerrain(highData);if(low.scene.segments.length!==high.scene.segments.length||[...low.vertices].some(([id,v])=>!high.vertices.has(id)||v.position.some((n,i)=>high.vertices.get(id).position[i]!==n)))throw Error('LOW/HIGH terrain grids differ; paired height editing is unavailable.');for(const sector of editorProtectionRules(base.level).sectors)low.locked.add(sector);const nativeLocked=low.isLocked,originalCount=parseScene(base.LOW.geometry).segments.length;low.isLocked=id=>nativeLocked(id)||(this.kind!=='surfaces'&&low.seamFor.get(id)?.some(ref=>low.vertices.get(ref).sector>=originalCount));base.terrainInfo=low;base.terrainInfoRoadSignature=roadSignature;}
    if(!this.radiusInitialized){const s=base.terrainInfo.scene.segments[0],v=s?.vertices;el('terrain-radius').value=String(Math.max(1,Math.round(v?.length>1?Math.hypot(v[1][0]-v[0][0],v[1][2]-v[0][2]):128)));this.radiusInitialized=true;}
    if(this.kind==='surfaces'&&this.paletteBase!==base){this.presets=terrainSurfacePresets(base.LOW.geometry,base.HIGH.geometry);this.patterns=speedPadPatterns(base.LOW.originalGeometry??base.LOW.geometry,base.HIGH.originalGeometry??base.HIGH.geometry);this.patternScene=parseScene(base.LOW.originalGeometry??base.LOW.geometry);this.paletteTextures=getGame('rollcage').decodeTrack(base.LOW.geometry,base.LOW.texture).textures;this.paletteBase=base;this.preset=this.presets[0]??null;this.page=0;this.filterPalette();}
  }
  setKind(kind){this.kind=kind;this.ensure();this.refresh();}
  filterPalette(){
    const query=el('surface-search').value.trim().toLowerCase(),presets=(this.patternMode?this.patterns??[]:this.presets??[]).filter(p=>p.label.toLowerCase().includes(query)),size=24;this.page=Math.min(this.page,Math.max(0,Math.ceil(presets.length/size)-1));
    el('surface-palette').replaceChildren(...presets.slice(this.page*size,(this.page+1)*size).map(p=>{
      const button=document.createElement('button');button.type='button';button.title=p.label;button.className='surface-card';button.setAttribute('aria-pressed',String(p===this.preset));button.dataset.preset=`${p.sector}:${p.cell}`;
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=this.patternMode?64:48;const label=document.createElement('span');label.textContent=this.patternMode?p.label:`P${p.page} · grip ${p.gripReduction}`;button.append(canvas,label);
      const image=this.paletteTextures?.get(p.page);if(image){const source=document.createElement('canvas');source.width=image.width;source.height=image.height;const context=source.getContext('2d');const pixels=context.createImageData(image.width,image.height);pixels.data.set(image.rgba);context.putImageData(pixels,0,0);const xs=p.uv.map(uv=>uv[0]),ys=p.uv.map(uv=>uv[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(1,Math.max(...xs)-x+1),h=Math.max(1,Math.max(...ys)-y+1);const ctx=canvas.getContext('2d');if(this.patternMode){for(const tile of p.cells){const face=this.patternScene.segments[p.sector].faces[tile.cell],uv=[];const order=face.vertexFlags&4?[0,1,2,3]:[1,3,0,2];order.forEach((corner,i)=>uv[corner]=face.uv[i]);drawSurfaceQuad(ctx,source,uv,tile.x*32,tile.y*32,32);}}else ctx.drawImage(source,x,y,w,h,0,0,64,48);}
      button.addEventListener('click',()=>{this.preset=p;text('surface-selected',p.label);for(const other of el('surface-palette').querySelectorAll('button'))other.setAttribute('aria-pressed',String(other===button));});return button;
    }));
    el('surface-prev').disabled=this.page===0;el('surface-next').disabled=(this.page+1)*size>=presets.length;text('surface-page',`${presets.length} presets · page ${this.page+1}`);text('surface-selected',this.preset?.label??'No supported surface presets.');
  }
  get patternMode(){return this.kind==='surfaces'&&el('surface-mode').value==='patterns';}
  pattern(){return this.patterns?.find(p=>p===this.preset)??this.patterns?.[0];}
  patternPlacement(hit){const p=this.pattern();if(!p)throw Error('No supported original arrow patterns on this track.');return {kind:'arrow4',sector:hit.sector,cell:hit.cell,sourceSector:p.sector,sourceCell:p.cell,rotation:Number(el('surface-rotation').value)};}
  hit(event){return intersectTerrain(this.editor.scene,cameraRay(this.editor.navigation,this.editor.canvas.getBoundingClientRect(),event.clientX,event.clientY));}
  options(hit){const radius=Number(el('terrain-radius').value),strength=Number(el('terrain-strength').value);if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(strength)||strength<=0)throw Error('Enter positive brush radius and strength.');return {mode:this.kind==='surfaces'?'paint':el('terrain-operation').value,radius,strength,height:this.stroke?.height??(el('terrain-operation').value==='flatten'?hit.position[1]:Number(el('terrain-height').value)),preset:this.preset};}
  pointerDown(event){
    if(!this.editor.terrainEditing||this.editor.busy||event.button!==0||event.shiftKey)return false;
    const hit=this.hit(event);if(!hit||hit.cell===null)return false;
    try{
      this.ensure();if(this.editor.current.terrainInfo.locked.has(hit.sector))throw Error(editorProtectionRules(this.editor.current.level).sectors.includes(hit.sector)?`Sector ${hit.sector} is protected by hardcoded executable behavior.`:'This animated terrain region is locked.');
      if(this.kind!=='surfaces'&&hit.sector>=parseScene(this.editor.current.LOW.geometry).segments.length)throw Error('Change this road’s height and banking with its spline control points.');
      if(this.patternMode){const placement=this.patternPlacement(hit),draft=structuredClone(this.editor.current.terrainDraft),footprint=speedPadFootprint(this.editor.current.terrainInfo.scene,placement,this.pattern()),keys=new Set(footprint.map(p=>p.cell));draft.patterns=(draft.patterns??[]).filter(p=>p.sector!==placement.sector||!speedPadFootprint(this.editor.current.terrainInfo.scene,p,this.patterns.find(t=>t.sector===p.sourceSector&&t.cell===p.sourceCell)??speedPadPatternShape(p)).some(c=>keys.has(c.cell)));draft.patterns.push(placement);this.editor.perform(()=>{this.editor.commitTerrain(draft);text('terrain-status','Complete arrow applied to LOW + HIGH. One undo removes this placement.');});return true;}
      if(this.kind==='surfaces'&&el('surface-eyedropper').checked){const s=this.editor.current.terrainInfo.scene.segments[hit.sector],ref=this.editor.current.terrainDraft.surfaces.find(r=>r.sector===hit.sector&&r.cell===hit.cell),face=ref?this.editor.current.terrainInfo.scene.segments[ref.sourceSector].faces[ref.sourceCell]:s.faces[hit.cell];this.preset=this.presets.find(p=>this.editor.current.terrainInfo.scene.segments[p.sector].faces[p.cell].textureRecord===face.textureRecord)??null;el('surface-eyedropper').checked=false;this.filterPalette();return true;}
      const options=this.options(hit);this.stroke={draft:structuredClone(this.editor.current.terrainDraft),height:options.height,last:hit.position.slice(),sector:hit.sector};this.stamp(hit,options);this.editor.canvas.focus();this.editor.canvas.setPointerCapture(event.pointerId);
    }catch(error){text('terrain-status',error.message);this.cancel(false);}return true;
  }
  stamp(hit,options){this.stroke.draft=stampTerrain(this.editor.current.terrainInfo,this.stroke.draft,hit,options);this.updateOverlay(hit,this.stroke.draft,options.radius);text('terrain-status','Release to apply the shaded terrain. Esc cancels this stroke.');}
  pointerMove(event){
    if(!this.editor.terrainEditing)return false;const hit=this.hit(event);if(!hit)return Boolean(this.stroke);
    try{if(this.patternMode){this.updatePatternOverlay(hit);return false;}const options=this.options(hit);if(this.stroke){const last=this.stroke.last,delta=hit.position.map((n,i)=>n-last[i]),distance=Math.hypot(...delta),step=Math.max(1,options.radius/4);if(distance>=step){const samples=Math.min(128,Math.floor(distance/step));for(let i=1;i<=samples;i++)this.stamp({...hit,position:last.map((n,j)=>n+delta[j]*i*step/distance)},options);this.stroke.last=last.map((n,j)=>n+delta[j]*samples*step/distance);}}
      else this.updateOverlay(hit,this.editor.current.terrainDraft,options.radius);
    }catch(error){text('terrain-status',error.message);this.cancel(false);}return Boolean(this.stroke);
  }
  pointerUp(){if(!this.stroke)return false;const draft=this.stroke.draft;this.stroke=null;this.editor.perform(()=>{this.editor.commitTerrain(draft);text('terrain-status','Terrain applied to LOW + HIGH. Objects and race paths keep their saved positions.');});return true;}
  updatePatternOverlay(hit){
    const info=this.editor.current?.terrainInfo;if(!info)return;const placement=this.patternPlacement(hit),cells=speedPadFootprint(info.scene,placement,this.pattern()),s=info.scene.segments[hit.sector],heights=new Map(this.editor.current.terrainDraft.heights.map(r=>[`${r.sector}:${r.vertex}`,r.height])),lines=[];
    const point=i=>{const v=s.vertices[i];return [v[0],-(heights.get(`${s.index}:${i}`)??v[1])-1,-v[2]];};for(const c of cells){const ids=[0,1,3,2].map(i=>s.faces[c.cell].gridIndices[i]);for(let i=0;i<4;i++)lines.push(...point(ids[i]),...point(ids[(i+1)%4]));}this.overlay.set({groups:[{active:true,lines,normals:[]}]});text('terrain-selection',`${cells.length}-cell arrow · ${placement.rotation*90}° · click to place whole pattern`);
  }
  updateOverlay(hit,draft,radius){
    const info=this.editor.current?.terrainInfo;if(!info)return;const selected=terrainBrushSelection(info,draft,hit,radius),heights=new Map(draft.heights.map(r=>[`${r.sector}:${r.vertex}`,r.height])),lines=[],cells=new Set();
    const point=(s,i)=>{const v=s.vertices[i];return [v[0],-(heights.get(`${s.index}:${i}`)??v[1]),-v[2]];};
    for(const v of selected){const s=info.scene.segments[v.sector],row=Math.floor(v.vertex/(s.columns+1)),col=v.vertex%(s.columns+1);for(const r of [row-1,row])for(const c of [col-1,col])if(r>=0&&r<s.rows&&c>=0&&c<s.columns)cells.add(`${s.index}:${r*s.columns+c}`);}
    for(const id of cells){const [sector,cell]=id.split(':').map(Number),s=info.scene.segments[sector],face=s.faces[cell],order=[0,1,3,2].map(i=>face.gridIndices[i]);for(let i=0;i<4;i++)lines.push(...point(s,order[i]),...point(s,order[(i+1)%4]));}
    this.overlay.set({groups:[{active:true,lines,normals:[]}]});text('terrain-selection',`Sector ${hit.sector} · cell ${hit.cell} · ${selected.length} connected vertices${info.locked.has(hit.sector)?' · animated region locked':''}`);
  }
  render(navigation){this.overlay.render(navigation,{show:Boolean(this.editor.terrainEditing&&el('terrain-wireframe').checked),disabled:false,normals:false});}
  cancel(clear=true){this.stroke=null;if(clear)this.overlay.clear();}
  refresh(){
    const base=this.editor.current,available=Boolean(base),active=available&&this.editor.terrainEditing&&!this.editor.busy;
    for(const id of ['terrain-operation','terrain-radius','terrain-strength','terrain-height','terrain-wireframe','surface-search','surface-eyedropper','surface-mode','surface-rotation'])el(id).disabled=!active;
    el('terrain-undo').disabled=!active||!base?.terrainUndo?.length;el('terrain-redo').disabled=!active||!base?.terrainRedo?.length;el('terrain-reset').disabled=!active||!(base?.terrainDraft?.heights.length||base?.terrainDraft?.surfaces.length||base?.terrainDraft?.patterns?.length);
    el('surface-rotation-label').hidden=!this.patternMode;el('surface-eyedropper').disabled=!active||this.patternMode;
    el('terrain-height-tools').hidden=this.kind==='surfaces';el('terrain-surface-tools').hidden=this.kind!=='surfaces';
    el('terrain-height-label').hidden=el('terrain-operation').value!=='set';
    text('terrain-count',base?`${base.terrainDraft?.heights.length??0} height edits · ${base.terrainDraft?.surfaces.length??0} surface edits · ${base.terrainDraft?.patterns?.length??0} arrows · LOW + HIGH`:'Load verified Rollcage archives.');
  }
}

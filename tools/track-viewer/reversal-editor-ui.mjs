import {createReversedTrackDraft,refreshReversalReport,reversalJunctionBranches,resolveReversalJunctionBranch} from '../../src/track-reversal.mjs';
import {reverseSpeedPadArtwork} from '../../src/speed-pad-patterns.mjs';
import {sourceToDisplay} from './pickup-picking.mjs';
import {CollisionOverlay} from './collision-overlay.mjs';
import {reversalConnectionPreview} from './reversal-preview.mjs';
const el=id=>document.getElementById(`reverse-${id}`),copy=x=>structuredClone(x),text=(id,value)=>{if(el(id).textContent!==value)el(id).textContent=value;};
export class ReversalEditorUI{
  constructor(editor){
    this.editor=editor;this.analysis=null;this.overlay=new CollisionOverlay(editor.renderer);
    this.map=document.createElement('div');this.map.id='reverse-map';this.map.hidden=true;document.getElementById('stage').append(this.map);
    const action=(id,fn)=>el(id).addEventListener('click',()=>editor.perform(fn));
    action('create',()=>{const base=editor.current,row=editor.levelDraft(),compiled=editor.compile(),result=createReversedTrackDraft({LOW:base.LOW,HIGH:base.HIGH},row,{geometry:compiled.LOW.geometry,highGeometry:compiled.HIGH.geometry,texture:compiled.LOW.texture,reverseArrowArtwork:(low,high,terrain)=>reverseSpeedPadArtwork(low,high,terrain,{originalLow:base.LOW.originalGeometry??base.LOW.geometry,originalHigh:base.HIGH.originalGeometry??base.HIGH.geometry})});
      if([12,13].includes(base.level)){this.analysis=result.report;this.refresh();editor.say('Protected track: reversal report created. No track changes were applied.');return;}
      result.report.originalDraft=copy(row);result.draft.reversal=result.report;editor.commitVariant(result.draft);editor.say('Reversed draft created. The original is stored in this project. Review blockers and gameplay warnings before testing.');
    });
    action('restore',()=>{const original=editor.current?.reversal?.originalDraft;if(original){editor.commitVariant(copy(original));this.analysis=null;editor.say('Original draft restored. Reversed edits have been replaced by the saved original.');}});
    action('refresh',()=>{const base=editor.current;if(!base?.reversal)return;const row=editor.levelDraft(),c=editor.compile(),report=refreshReversalReport({LOW:base.LOW,HIGH:base.HIGH},row,base.reversal,{geometry:c.LOW.geometry,highGeometry:c.HIGH.geometry});editor.commitVariant({...row,reversal:report});});
    action('save-report',()=>{const report=this.report();if(report)editor.onDownload({filename:`LEV${editor.current.level}-reversal-report.json`,blob:new Blob([JSON.stringify(report,null,2)],{type:'application/json'})});});
    for(const [id,discard]of [['connect',false],['discard',true]])action(id,()=>{if(!this.preview?.selected)return;const result=resolveReversalJunctionBranch(editor.levelDraft(),this.report(),this.preview.source.point.id,this.selectedBranchId,{fromPointId:el('owner').value,slot:Number(el('slot').value),discard});editor.commitVariant({...result.draft,reversal:result.report});});
    el('pending').addEventListener('change',()=>this.showConnection(el('pending').value));
    el('owner').addEventListener('change',()=>{const point=editor.current.routeTopology.groups.flatMap(g=>g.points).find(p=>p.id===el('owner').value);el('slot').value=String(Math.max(0,point?.links.indexOf(null)??0));this.refresh();});
    el('slot').addEventListener('change',()=>this.refresh());
    action('suggest',()=>{const suggestion=this.preview?.suggestion;if(suggestion){el('owner').value=suggestion.pointId;el('slot').value=String(suggestion.slot);this.refresh();this.frameConnection();}});
    action('edit-point',()=>{const point=this.preview?.source.point;if(!point)return;const tool=document.getElementById('editor-tool');tool.value='routes';tool.dispatchEvent(new Event('change'));editor.setLayoutEditing('routes');document.getElementById('layout-group').value='';editor.layout.selected=point.id;editor.layout.refresh();const p=sourceToDisplay(point.position);editor.navigation.reset(p.map(n=>[n-220,n+220]));editor.onModeChange(editor.active);});
  }
  report(){return this.editor.current?.compiled?.reversalReport??this.editor.current?.reversal??this.analysis;}
  focus(target){
    const e=this.editor,base=e.current;let position;
    if(target.kind==='route-connection'){if(this.report()?.unresolvedConnections.some(p=>p.id===target.id)){this.showConnection(target.id);return;}position=base.routeTopology.groups.flatMap(g=>g.points).find(p=>p.id===target.pointId)?.position;}
    else if(target.kind==='start'){el('summary').scrollIntoView({block:'nearest'});document.getElementById('editor-tool').value='starts';document.getElementById('editor-tool').dispatchEvent(new Event('change'));e.setLayoutEditing('starts');e.layout.selected=String(target.id);e.layout.refresh();position=e.layout.row()?.position;}
    else if(target.kind==='model'){document.getElementById('editor-tool').value='models';document.getElementById('editor-tool').dispatchEvent(new Event('change'));e.modelSelected=target.id;e.refresh();position=e.modelRow()?.position;}
    else if(target.kind==='surfaces'){document.getElementById('editor-tool').value='surfaces';document.getElementById('editor-tool').dispatchEvent(new Event('change'));e.setTerrainEditing('surfaces');}
    if(position){const p=sourceToDisplay(position);e.navigation.reset(p.map(n=>[n-180,n+180]));e.onModeChange(e.active);}
  }
  showConnection(id){const pending=this.report()?.unresolvedConnections,connection=pending?.find(c=>c.id===id);if(!connection)return;el('pending').value=pending.find(c=>c.fromPointId===connection.fromPointId).id;this.connectionId=null;this.selectedBranchId=null;el('conflict-panel').open=true;this.refresh();this.frameConnection();el('conflict-panel').scrollIntoView({block:'nearest'});}
  selectBranch(id){this.selectedBranchId=id;this.ownerSelectionKey=null;this.refresh();}
  frameConnection(){if(this.preview){this.editor.navigation.reset(this.preview.bounds);this.editor.onModeChange(this.editor.active);}}
  refreshConnection(){
    const e=this.editor,connection=this.report()?.unresolvedConnections.find(p=>p.id===el('pending').value);
    if(connection?.id!==this.connectionId){this.connectionId=connection?.id;this.selectedBranchId=null;this.ownerSelectionKey=null;}
    const branches=connection?reversalJunctionBranches(e.current.routeTopology,this.report(),connection.fromPointId):[];
    if(!branches.some(b=>b.id===this.selectedBranchId))this.selectedBranchId=null;
    if(this.ownerSelectionKey!==this.selectedBranchId){this.ownerSelectionKey=this.selectedBranchId;if(connection){el('owner').value=connection.fromPointId;el('slot').value='0';}}
    const branchSignature=JSON.stringify(branches);if(branchSignature!==this.branchSignature){this.branchSignature=branchSignature;el('branches').replaceChildren(...branches.map((b,index)=>{const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='reverse-branch';radio.value=b.id;radio.dataset.state=b.pendingId?'pending':'stored';radio.addEventListener('change',()=>this.selectBranch(b.id));label.append(radio,document.createTextNode(`Branch ${String.fromCharCode(65+index)} → ${b.toPointId} · ${b.pendingId?'awaiting a slot':`slot ${b.slot+1}`}`));return label;}));}
    for(const input of el('branches').querySelectorAll('input')){input.checked=input.value===this.selectedBranchId;const selected=input.checked;if(input.parentElement.classList.contains('branch-option-selected')!==selected)input.parentElement.classList.toggle('branch-option-selected',selected);input.disabled=!e.variantEditing||e.busy;}
    const signature=JSON.stringify([e.current?.routeTopology,connection,branches,this.selectedBranchId,el('owner').value]);
    if(signature!==this.previewSignature){
      this.previewSignature=signature;this.preview=connection?reversalConnectionPreview(e.current.routeTopology,connection,el('owner').value,{branches,selectedBranchId:this.selectedBranchId}):null;
      this.overlay.set({groups:this.preview?.groups??[]});this.map.replaceChildren(...(this.preview?.labels??[]).map(label=>{const node=document.createElement('span');node.className=`reverse-world-label ${label.kind}`;node.textContent=label.text;if(label.branchId){node.dataset.branchId=label.branchId;node.setAttribute('role','button');node.tabIndex=0;const choose=()=>this.selectBranch(label.branchId);node.addEventListener('click',choose);node.addEventListener('keydown',event=>{if(event.code==='Enter'||event.code==='Space'){event.preventDefault();choose();}});}return node;}));
    }
    const p=this.preview,active=Boolean(e.variantEditing&&!e.busy),slot=Number(el('slot').value),link=p?.owner?.point.links[slot],canConnect=Boolean(p?.selected&&p.owner&&p.owner!==p.source&&!link);
    for(const option of el('slot').options){const link=p?.owner?.point.links[Number(option.value)],label=`${Number(option.value)+1} · ${link?`occupied → ${link.pointId}`:'free'}`;if(option.textContent!==label)option.textContent=label;option.disabled=Boolean(link);}
    el('connect').disabled=!active||!canConnect;el('discard').disabled=!active||!p?.selected;el('suggest').disabled=!active||!p?.selected||!p?.suggestion;el('edit-point').disabled=!active||!p;
    el('owner').disabled=!active||!p?.selected;el('slot').disabled=!active||!p?.selected;
    text('connection-title',p?`${branches.length} competing AI branches at ${p.source.point.id}`:'');
    text('connection-help',p?`${p.source.label} has ${branches.length} branch connections competing for two slots. Choose any branch below or click its label in the view. Amber highlights your selection; cyan shows the other competing branches.`:'');
    text('slot-status',p?(p.selected?(canConnect?`Ready to move ${p.target.point.id} to ${p.owner.label}, slot ${slot+1}. Inspect the amber proposed connection before applying.`:'Choose a different nearby point with a free slot to move the selected branch, or remove the selected branch. The other competing connections will be retained at this junction.'):'Select one of the competing branches before choosing Remove or Move.'):'');
    text('suggest',p?.suggestion?`Preview nearby free slot · ${p.suggestion.pointId}`:'No free slot found');
    for(const article of el('items').children){const pending=this.report()?.unresolvedConnections.find(c=>c.id===article.dataset.connectionId),selected=Boolean(pending&&pending.fromPointId===connection?.fromPointId);if(article.classList.contains('reverse-selected')!==selected)article.classList.toggle('reverse-selected',selected);}
  }
  render(navigation){
    const show=Boolean(this.editor.variantEditing&&this.preview);this.map.hidden=!show;el('legend').hidden=!show;
    this.overlay.render(navigation,{show,disabled:true,normals:true});if(!show)return;
    const rect=this.editor.canvas.getBoundingClientRect(),m=navigation.matrix(rect.width/rect.height);
    this.preview.labels.forEach((label,index)=>{const p=label.position,v=[0,1,2,3].map(row=>m[row]*p[0]+m[4+row]*p[1]+m[8+row]*p[2]+m[12+row]),node=this.map.children[index],x=(v[0]/v[3]+1)*rect.width/2,y=(1-v[1]/v[3])*rect.height/2;node.hidden=v[3]<=0||x<0||y<0||x>rect.width||y>rect.height;const transform=`translate(${Math.round(rect.left+x)}px,${Math.round(rect.top+y+(label.offsetY??0))}px)`;if(node.style.transform!==transform)node.style.transform=transform;});
  }
  inspect(){return {connectionId:this.connectionId??null,branchId:this.selectedBranchId??null,branches:(this.preview?.branches??[]).map(({id,letter,fromPointId,toPointId,slot,pendingId})=>({id,letter,fromPointId,toPointId,slot,pendingId})),sourcePointId:this.preview?.source.point.id??null,targetPointId:this.preview?.target?.point.id??null,suggestedPointId:this.preview?.suggestion?.pointId??null,drawnSegments:this.overlay.draws};}
  refresh(){
    const e=this.editor,base=e.current;if(base!==this.base){this.base=base;this.analysis=null;this.signature=null;this.connectionId=null;this.previewSignature=null;}const report=this.report(),active=Boolean(base&&e.variantEditing&&!e.busy);
    el('create').disabled=!active||Boolean(base?.reversal);el('restore').disabled=!active||!base?.reversal?.originalDraft;el('refresh').disabled=!active||!base?.reversal;el('save-report').disabled=!active||!report;
    const signature=JSON.stringify([base?.level,report]);if(signature!==this.signature){this.signature=signature;el('items').replaceChildren(...(report?.items??[]).map(item=>{const article=document.createElement('p');article.className='note';if(item.target?.kind==='route-connection')article.dataset.connectionId=item.target.id;const label=document.createElement('strong');label.textContent=`${item.severity.toUpperCase()}: `;article.append(label,document.createTextNode(item.message));const pending=report.unresolvedConnections.find(p=>p.id===item.target?.id);if(pending)article.append(document.createTextNode(` Extra branch: ${pending.fromPointId} → ${pending.toPointId}.`));if(item.target&&item.target.kind!=='track'){const button=document.createElement('button');button.type='button';button.textContent=pending?'Focus junction':'Focus';button.addEventListener('click',()=>e.perform(()=>this.focus(item.target)));article.append(button);}return article;}));const allPending=report?.unresolvedConnections??[],pending=allPending.filter((p,i)=>allPending.findIndex(c=>c.fromPointId===p.fromPointId)===i),selected=el('pending').value,prior=pending.find(p=>p.id===selected)??pending.find(p=>p.fromPointId===this.preview?.source.point.id);el('pending').replaceChildren(...pending.map(p=>new Option(`${p.fromPointId} · ${reversalJunctionBranches(base.routeTopology,report,p.fromPointId).length} branches / 2 slots`,p.id)));if(prior)el('pending').value=prior.id;el('conflict-panel').hidden=!pending.length;}
    const points=base?.routeTopology.groups.flatMap(g=>g.index?g.points:[])??[],pointSignature=JSON.stringify(points.map(p=>p.id));if(el('owner').dataset.signature!==pointSignature){const selected=el('owner').value;el('owner').replaceChildren(...points.map(p=>new Option(p.id,p.id)));el('owner').value=selected;el('owner').dataset.signature=pointSignature;}
    for(const id of ['pending','owner','slot','connect','discard'])el(id).disabled=!active||!report?.unresolvedConnections?.length;
    this.refreshConnection();
    text('summary',report?`${report.applied.length} automatic transformation(s) · ${report.items.filter(i=>i.severity==='blocker').length} blocker(s) · ${report.items.filter(i=>i.severity==='warning').length} gameplay warning(s)`:'No reversed draft yet. Create one to inspect the automatic changes and compatibility report.');
  }
}

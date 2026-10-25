import {sourceToDisplay} from './pickup-picking.mjs';
import {appendDashedPathLine} from './path-line-pattern.mjs';

// Editor-only diagnostics. These markers and suggestions never change a route.
export function reversalConnectionPreview(topology,connection,ownerPointId=connection?.fromPointId,{branches=null,selectedBranchId=null}={}){
  const rows=topology.groups.flatMap(g=>g.index?g.points.map((point,index)=>({point,group:g,label:`Group ${g.index}, point ${index+1} (${point.id})`})):[]),byId=new Map(rows.map(r=>[r.point.id,r]));
  const selected=branches?.find(b=>b.id===selectedBranchId),source=byId.get(connection?.fromPointId),target=byId.get(branches?selected?.toPointId:connection?.toPointId),owner=byId.get(ownerPointId);
  if(!source||(!branches&&!target))return null;
  const choices=branches?.map((b,index)=>({...b,letter:String.fromCharCode(65+index),target:byId.get(b.toPointId)})).filter(b=>b.target);
  const distance=row=>Math.hypot(...row.point.position.map((n,i)=>n-source.point.position[i]));
  const candidates=rows.filter(r=>r.point.id!==target?.point.id&&(!branches||r!==source)&&r.point.links.includes(null)).sort((a,b)=>Number(b.group.id===source.group.id)-Number(a.group.id===source.group.id)||distance(a)-distance(b));
  const candidate=candidates[0],suggestion=candidate?{pointId:candidate.point.id,slot:candidate.point.links.indexOf(null),label:candidate.label}:null;
  const kept=source.point.links.filter(Boolean).map(link=>byId.get(link.pointId)).filter(Boolean),points=[source,...(choices?choices.map(b=>b.target):[target,...kept]),...(owner&&(!branches||selected)?[owner]:[])],display=row=>sourceToDisplay(row.point.position).map((n,i)=>n+(i===1?16:0));
  const extent=Math.max(120,...points.map(distance)),radius=Math.max(18,Math.min(60,extent*.025)),lines=[],normals=[],context=[];
  const arrow=(buffer,a,b,dashed=false)=>{
    const delta=b.map((n,i)=>n-a[i]),length=Math.hypot(...delta);if(length<1)return;
    const dash=dashed?appendDashedPathLine(buffer,a,b):null;if(!dashed)buffer.push(...a,...b);
    const tip=dash?a.map((n,i)=>n+delta[i]*dash.headFraction):b,size=Math.min(radius*1.6,length*.25,dash?dash.dashLength*.9:Infinity),d=delta.map(n=>n/length),side=Math.hypot(d[0],d[2])>.001?[-d[2],0,d[0]]:[1,0,0],scale=Math.hypot(...side);
    for(const sign of [-1,1])buffer.push(...tip,...tip.map((n,i)=>n-d[i]*size+side[i]/scale*size*.5*sign));
  };
  const marker=(buffer,p)=>{for(let i=0;i<24;i++){const a=i*Math.PI/12,b=(i+1)*Math.PI/12;buffer.push(p[0]+Math.cos(a)*radius,p[1],p[2]+Math.sin(a)*radius,p[0]+Math.cos(b)*radius,p[1],p[2]+Math.sin(b)*radius);}buffer.push(p[0],p[1]-radius,p[2],p[0],p[1]+radius*2,p[2]);};
  if(choices){for(const branch of choices){const buffer=branch.id===selectedBranchId?normals:lines;arrow(buffer,display(source),display(branch.target),true);marker(buffer,display(branch.target));}marker(normals,display(source));}
  else{for(const row of kept){arrow(lines,display(source),display(row),true);marker(lines,display(row));}arrow(normals,display(source),display(target),true);marker(normals,display(source));marker(normals,display(target));}
  if(owner&&owner!==source&&target){marker(lines,display(owner));arrow(normals,display(owner),display(target),true);}
  for(const g of topology.groups)for(let i=1;i<g.points.length;i++){const a=g.points[i-1],b=g.points[i];if(Math.min(Math.hypot(...a.position.map((n,j)=>n-source.point.position[j])),Math.hypot(...b.position.map((n,j)=>n-source.point.position[j])))<600){const from=sourceToDisplay(g.header?.[2]?b.position:a.position),to=sourceToDisplay(g.header?.[2]?a.position:b.position);arrow(context,from,to);}}
  const labels=[{position:display(source),text:`Junction · ${source.point.id}`,kind:'junction'},...(choices?choices.map((b,index)=>({position:display(b.target),text:`Branch ${b.letter} · ${b.toPointId}`,kind:b.id===selectedBranchId?'selected-branch':'branch',branchId:b.id,offsetY:(index-(choices.length-1)/2)*24})):[{position:display(target),text:`Extra branch destination · ${target.point.id}`,kind:'extra'}]),...(owner&&owner!==source&&target?[{position:display(owner),text:`Proposed owner · ${owner.point.id}`,kind:'owner'}]:[])];
  return {source,target,owner,kept,selected,branches:choices,suggestion,labels,bounds:[0,1,2].map(axis=>[Math.min(...points.map(r=>display(r)[axis]))-100,Math.max(...points.map(r=>display(r)[axis]))+100]),groups:[{active:false,color:[.82,.9,1],width:2,outline:true,lines:context,normals:[]},{active:true,width:2,outline:true,lines,normals}]};
}

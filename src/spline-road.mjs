import {parseScene} from './scene.mjs';

const clone=value=>structuredClone(value);
const fields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const vector=value=>Array.isArray(value)&&value.length===3&&value.every(n=>Number.isFinite(n)&&n>=-32768&&n<=32767);
const length=v=>Math.hypot(...v),subtract=(a,b)=>a.map((n,i)=>n-b[i]),normalize=v=>{const n=length(v);if(n<1e-8)throw Error('Road control points need a usable horizontal direction.');return v.map(n=>n/length(v));};
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;

export function createSplineRoad({id,points,surface,columns=4,spacing=128,startSnap=null,endSnap=null,routeTemplateGroup=null}) {
  const road={id,points:clone(points),surface:clone(surface),columns,spacing,startSnap:clone(startSnap),endSnap:clone(endSnap),routeTemplateGroup};
  validateSplineRoad(road);return road;
}

export function validateSplineRoad(road) {
  if(!fields(road,['id','points','surface','columns','spacing','startSnap','endSnap','routeTemplateGroup'])||typeof road.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(road.id))throw Error('Invalid spline road fields or identity.');
  if(!Array.isArray(road.points)||road.points.length<2||road.points.length>128)throw Error('A road requires 2–128 control points.');
  for(const [i,point]of road.points.entries()){
    if(!fields(point,['position','width','bank'])||!vector(point.position)||!Number.isFinite(point.width)||point.width<16||point.width>4096||!Number.isFinite(point.bank)||Math.abs(point.bank)>80)throw Error('Road points require native XYZ, width 16–4096 and bank −80° to 80°.');
    if(i&&Math.hypot(point.position[0]-road.points[i-1].position[0],point.position[2]-road.points[i-1].position[2])<4)throw Error('Adjacent road control points require at least four horizontal units.');
  }
  if(!fields(road.surface,['sector','cell'])||!integer(road.surface.sector,0,127)||!integer(road.surface.cell,0,1000000))throw Error('Choose an existing surface preset for the road.');
  if(!integer(road.columns,1,40)||!Number.isFinite(road.spacing)||road.spacing<16||road.spacing>192)throw Error('Road grid requires 1–40 columns and spacing 16–192.');
  if(road.routeTemplateGroup!==null&&(typeof road.routeTemplateGroup!=='string'||!road.routeTemplateGroup))throw Error('Invalid road route template.');
  for(const snap of [road.startSnap,road.endSnap])if(snap!==null&&(!fields(snap,['sector','edge'])||!integer(snap.sector,0,127)||!['start','end'].includes(snap.edge)))throw Error('Road ends snap to an existing full start/end boundary.');
  return clone(road);
}

// Uniform Hermite/Catmull-Rom interpolation, with endpoint tangents retaining
// the first/last control span. This is editor authoring, not native spline data.
function interpolate(points,index,t) {
  const a=points[Math.max(0,index-1)],b=points[index],c=points[index+1],d=points[Math.min(points.length-1,index+2)],t2=t*t,t3=t2*t;
  const value=key=>{const v0=b[key],v1=c[key],m0=index?(c[key]-a[key])/2:c[key]-b[key],m1=index+2<points.length?(d[key]-b[key])/2:c[key]-b[key];return (2*t3-3*t2+1)*v0+(t3-2*t2+t)*m0+(-2*t3+3*t2)*v1+(t3-t2)*m1;};
  const position=[0,1,2].map(axis=>valueForAxis(axis));
  function valueForAxis(axis){const p=points.map(p=>({value:p.position[axis]}));const aa=p[Math.max(0,index-1)].value,bb=p[index].value,cc=p[index+1].value,dd=p[Math.min(p.length-1,index+2)].value,m0=index?(cc-aa)/2:cc-bb,m1=index+2<p.length?(dd-bb)/2:cc-bb;return (2*t3-3*t2+1)*bb+(t3-2*t2+t)*m0+(-2*t3+3*t2)*cc+(t3-t2)*m1;}
  return {position,width:value('width'),bank:value('bank')};
}

function snappedBoundary(scene,snap) {
  if(!snap)return null;const sector=scene.segments[snap.sector];if(!sector)throw Error('Snap boundary sector is missing.');
  const row=snap.edge==='start'?0:sector.rows;
  return Array.from({length:sector.columns+1},(_,col)=>sector.vertices[row*(sector.columns+1)+col].slice(0,3));
}

export function generateSplineRoad(data,definition) {
  const road=validateSplineRoad(definition),scene=parseScene(data),source=scene.segments[road.surface.sector]?.faces[road.surface.cell];if(!source)throw Error('Road source surface is unavailable.');
  const animated=new Set(scene.segments.filter(s=>data[s.offset+6]&63).map(s=>s.index)),animationCount=data[0xfc],animationBase=data.readUInt32LE(0x100);
  if(animationCount&&animationBase+animationCount*4>data.length)throw Error('Terrain animation cells exceed resource bounds.');
  for(let i=0;i<animationCount;i++)animated.add(data[animationBase+i*4+2]);
  if(animated.has(road.surface.sector)||(source.pageWord&~0x7f))throw Error('Animated or packed surface preset is unsupported for a new road.');
  for(const snap of [road.startSnap,road.endSnap])if(snap&&animated.has(snap.sector))throw Error('Road ends cannot attach to animated terrain.');
  const points=clone(road.points),start=snappedBoundary(scene,road.startSnap),end=snappedBoundary(scene,road.endSnap);
  for(const [boundary,index]of [[start,0],[end,points.length-1]])if(boundary){if(boundary.length!==road.columns+1)throw Error('Snapped road must have the existing boundary’s column count.');points[index].position=[0,1,2].map(axis=>boundary.reduce((sum,p)=>sum+p[axis],0)/boundary.length);points[index].width=length(subtract(boundary.at(-1),boundary[0]));}
  if(points.slice(1).reduce((sum,p,i)=>sum+length(subtract(p.position,points[i].position)),0)>131072)throw Error('Road control path exceeds the authoring length limit.');
  const sampled=[];
  for(let i=0;i<points.length-1;i++){const distance=length(subtract(points[i+1].position,points[i].position)),count=Math.max(2,Math.ceil(distance/(road.spacing/4)));for(let n=0;n<count;n++)sampled.push(interpolate(points,i,n/count));}sampled.push(clone(points.at(-1)));
  const centerline=[sampled[0]];let remaining=road.spacing,previous=sampled[0];
  for(const target of sampled.slice(1)){let from=previous,delta=subtract(target.position,from.position),distance=length(delta);while(distance>=remaining){const t=remaining/distance,next={position:from.position.map((n,i)=>n+delta[i]*t),width:from.width+(target.width-from.width)*t,bank:from.bank+(target.bank-from.bank)*t};centerline.push(next);from=next;delta=subtract(target.position,from.position);distance=length(delta);remaining=road.spacing;}remaining-=distance;previous=target;}
  if(length(subtract(centerline.at(-1).position,points.at(-1).position))<road.spacing/4&&centerline.length>1)centerline.pop();centerline.push(clone(points.at(-1)));
  if(centerline.length>1025)throw Error('Road exceeds 1024 sampled rows; shorten it or increase spacing.');
  const rows=centerline.map((point,index)=>{
    const before=centerline[Math.max(0,index-1)].position,after=centerline[Math.min(centerline.length-1,index+1)].position,tangent=normalize([after[0]-before[0],0,after[2]-before[2]]),right=[-tangent[2],0,tangent[0]],bank=point.bank*Math.PI/180;
    if(point.width<16||Math.abs(point.bank)>80)throw Error('Spline overshoot creates unsupported width or banking. Add control points.');
    return Array.from({length:road.columns+1},(_,column)=>{const lateral=(column/road.columns-0.5)*point.width,p=point.position.map((n,i)=>Math.round(n+right[i]*lateral*Math.cos(bank)+(i===1?-lateral*Math.sin(bank):0)));if(p.some(n=>n< -32768||n>32767))throw Error('Road vertex exceeds native signed16 coordinates.');return p;});
  });
  if(start){const direct=length(subtract(rows[1][0],start[0]))+length(subtract(rows[1].at(-1),start.at(-1))),reversed=length(subtract(rows[1][0],start.at(-1)))+length(subtract(rows[1].at(-1),start[0]));rows[0]=reversed<direct?[...start].reverse():start;}if(end){const direct=length(subtract(rows.at(-1)[0],end[0]))+length(subtract(rows.at(-1).at(-1),end.at(-1))),reversed=length(subtract(rows.at(-1)[0],end.at(-1)))+length(subtract(rows.at(-1).at(-1),end[0]));rows[rows.length-1]=reversed<direct?[...end].reverse():end;}
  const segments=[];
  for(let offset=0;offset<rows.length-1;offset+=15){const selected=rows.slice(offset,Math.min(rows.length,offset+16)),vertices=selected.flat();
    for(let row=0;row<selected.length-1;row++)for(let col=0;col<road.columns;col++){
      const a=selected[row][col],b=selected[row][col+1],c=selected[row+1][col],d=selected[row+1][col+1],cross=(p,q,r)=>(q[2]-p[2])*(r[0]-p[0])-(q[0]-p[0])*(r[2]-p[2]);
      const winding=[cross(a,b,c),cross(b,d,c)];if(winding.some(n=>n<=1))throw Error('Road curve folds or degenerates; reduce width or soften the turn.');
      if(length(subtract(a,d))>255||length(subtract(b,c))>255)throw Error('Road cells exceed native collision padding; reduce spacing or increase columns.');
    }
    segments.push({roadId:road.id,part:segments.length,columns:road.columns,rows:selected.length-1,vertices,sourceSurface:clone(road.surface),centerlineOffset:offset});
  }
  const bounds=[0,1,2].map(axis=>[Math.min(...rows.flat().map(p=>p[axis])),Math.max(...rows.flat().map(p=>p[axis]))]);
  if(bounds[1][1]+128>32767)throw Error('Road recovery height exceeds native signed16 coordinates.');
  return {road,segments,centerline:centerline.map(p=>p.position.map(Math.round)),bounds,seams:{start:road.startSnap,end:road.endSnap}};
}

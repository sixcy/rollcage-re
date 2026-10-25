import {appendDashedPathLine} from './path-line-pattern.mjs';
const palettes={branches:[.25,1,1],merges:[1,.76,.24],splits:[1,.4,.85],pending:[1,.52,.25],pendingMarkers:[1,.52,.25],selected:[1,1,1]};

// Static display buffers, constructed once per scene. Line width uses screen
// offsets in the shared shader rather than unsupported WebGL wide lines.
export function buildPathTopologyOverlay(graph){
  if(!graph)return [];
  const nodes=new Map(graph.nodes.map(n=>[n.id,n])),batches=new Map();
  const batch=(kind,groups)=>{groups=[...new Set(groups)].sort((a,b)=>a-b);const key=`${kind}:${groups}`;if(!batches.has(key))batches.set(key,{kind,groups,color:palettes[kind],lines:[],features:0});return batches.get(key);};
  const edges=graph.edges.flatMap(e=>e.kind==='route'&&e.branchSlots.length?[e,{...e,kind:'branch'}]:[e]);
  for(const edge of [...edges,...graph.pendingEdges.map(e=>({...e,kind:'pending'}))]){
    const from=nodes.get(edge.from),to=nodes.get(edge.to);if(!from||!to)continue;
    const kind=edge.kind==='route'?'directions':edge.kind==='pending'?'pending':'branches',out=batch(kind,kind==='directions'?[from.group]:[from.group,to.group]);
    const a=from.position,b=to.position,delta=b.map((n,i)=>n-a[i]),length=Math.hypot(...delta);if(length<.001)continue;
    let dash=null;if(kind==='directions')out.lines.push(...a,...b);
    else dash=appendDashedPathLine(out.lines,a,b);
    // A midpoint head reads well on long segments and does not merge into
    // overlapping endpoint markers. Short/coincident links keep their identity
    // in node counts even if no geometric arrow can be drawn.
    const heads=kind==='directions'?Math.max(1,Math.min(8,Math.floor(length/180))):1;
    const d=delta.map(n=>n/length),side=Math.hypot(d[0],d[2])>.001?[-d[2],0,d[0]]:[1,0,0],sideLength=Math.hypot(...side),size=Math.min(28,length*.28,dash?dash.dashLength*.9:Infinity);
    // Keep a branch head inside an inked dash, so even an edge-on view cannot
    // flatten the head across a gap and make two-way connections look solid.
    for(let h=0;h<heads;h++){const tip=a.map((n,i)=>n+delta[i]*(dash?dash.headFraction:(h+0.6)/heads));for(const sign of [-1,1])out.lines.push(...tip,...tip.map((n,i)=>n-d[i]*size+side[i]/sideLength*size*.55*sign));out.features++;}
  }
  for(const node of graph.nodes){
    if(node.incoming.length>1){const out=batch('merges',[node.group]);out.lines.push(...pathNodeMarker(node.position,'ring',34));out.features++;}
    if(node.outgoing.length>1){const out=batch('splits',[node.group]);out.lines.push(...pathNodeMarker(node.position,'diamond',22));out.features++;}
    if(node.pending){const out=batch('pendingMarkers',[node.group]);out.lines.push(...pathNodeMarker(node.position,'diamond',40));out.features++;}
  }
  return [...batches.values()].filter(b=>b.lines.length);
}

export function pathNodeMarker(position,shape='ring',radius=36){
  const lines=[],steps=shape==='diamond'?4:24;
  for(let i=0;i<steps;i++){const a=i*2*Math.PI/steps,b=(i+1)*2*Math.PI/steps;lines.push(position[0]+Math.cos(a)*radius,position[1],position[2]+Math.sin(a)*radius,position[0]+Math.cos(b)*radius,position[1],position[2]+Math.sin(b)*radius);}
  lines.push(position[0],position[1]-radius/2,position[2],position[0],position[1]+radius,position[2]);return lines;
}

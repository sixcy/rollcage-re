import {displayPosition} from './scene-export.mjs';

// Rollcage 491390: group+2 chooses direction, group+4 wraps cyclic groups.
// 47fc90 follows two 14-bit branch fields in point+12. This is a stored graph,
// not a prediction of choices under runtime speed/blocker/weapon conditions.
export function buildTrackPathConnectivity(routes){
  const nodes=routes.groups.flatMap(group=>group.index?group.points.map((point,index)=>({id:`g${group.index}:p${index}`,group:group.index,index,position:displayPosition(point.position),incoming:[],outgoing:[],incomingBranches:[],branchSlotsUsed:0,pending:0})):[]),byId=new Map(nodes.map(n=>[n.id,n])),edges=[],byEdge=new Map(),invalidLinks=[];
  const add=(from,to,kind,slot)=>{
    if(!byId.has(to)){invalidLinks.push({from,to,slot});return;}
    const key=`${from}>${to}`;let edge=byEdge.get(key);
    if(!edge){edge={from,to,kind,branchSlots:[]};edges.push(edge);byEdge.set(key,edge);byId.get(from).outgoing.push(to);byId.get(to).incoming.push(from);}
    if(slot!==undefined){if(!edge.branchSlots.length)byId.get(to).incomingBranches.push(from);edge.branchSlots.push(slot);}
  };
  for(const group of routes.groups){if(!group.index)continue;
    for(const [index,point]of group.points.entries()){
      const id=`g${group.index}:p${index}`,step=group.reverseByte2?-1:1;let next=index+step;
      if(next<0||next>=group.count)next=group.bytes[4]?(next+group.count)%group.count:-1;
      if(next>=0&&next!==index)add(id,`g${group.index}:p${next}`,'route');
      const word=point.bytes.readUInt32LE(12);
      for(let slot=0;slot<2;slot++){const bits=word>>>slot*14,targetGroup=bits&31,targetPoint=bits>>>5&511;if(targetGroup){byId.get(id).branchSlotsUsed++;add(id,`g${targetGroup}:p${targetPoint}`,'branch',slot);}}
    }
  }
  return {kind:'rollcage',nodes,edges,pendingEdges:[],invalidLinks};
}

// Pending editor conflicts are drawn separately: they are not native links in
// the compiled resource. Stable project IDs are mapped to current native IDs.
export function withPendingPathConnections(graph,topology,connections=[]){
  if(!graph||!topology)return graph;
  const ids=new Map(topology.groups.flatMap((g,index)=>g.points.map((p,i)=>[p.id,`g${index}:p${i}`]))),nodes=graph.nodes.map(n=>({...n,pending:0})),byId=new Map(nodes.map(n=>[n.id,n])),pendingEdges=[];
  for(const c of connections){const from=ids.get(c.fromPointId),to=ids.get(c.toPointId);if(byId.has(from)&&byId.has(to)){pendingEdges.push({id:c.id,from,to});byId.get(from).pending++;}}
  return {...graph,nodes,pendingEdges};
}

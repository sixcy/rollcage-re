// Model-local authored primitives only: never invent a bounding box or radius.
const display=point=>[point[0],-point[1],-point[2]];
export function collisionShapePolygons(collision,shape) {
  if(shape.faceCount<3)return [];
  const records=new Map(collision.faceRecords.map(record=>[record.index,record]));
  return shape.records.map(index=>{
    const record=records.get(index),face=collision.faces[record.faceIndex];
    const order=face.triangle?[0,2,1]:[0,2,3,1];
    return {face,vertices:order.map(i=>collision.vertices[face.indices[i]-1].slice(0,3))};
  });
}

// A consistent convex face plane contains every vertex of its shape on the
// inward side. Allow two source units for packed-normal rounding. This is a
// diagnostic, not a proof of contacts or a reason to rewrite original data.
export function collisionPlaneWarnings(collision,shape) {
  const polygons=collisionShapePolygons(collision,shape),vertices=polygons.flatMap(p=>p.vertices),warnings=[];
  for(const {face,vertices:points} of polygons){
    const maximum=Math.max(...vertices.map(vertex=>vertex.reduce((sum,value,i)=>sum+(value-points[0][i])*face.normalQ8[i]/256,0)));
    if(maximum>2)warnings.push({shape:shape.index,face:face.index,outsideDistance:maximum});
  }
  return warnings;
}

export function buildModelCollisionPreview(collision,settings) {
  const groups=[],warnings=[];
  if(!collision?.available)return {groups,warnings,bounds:null};
  for(const shape of collision.shapes){
    const config=settings?.configurations?.[shape.slot],active=shape.faceCount>0&&settings?.class!==5&&config&&config.type!==5;
    const lines=[],normals=[],line=(a,b)=>lines.push(...display(a),...display(b));
    const marker=point=>{for(let axis=0;axis<3;axis++){const a=point.slice(),b=point.slice();a[axis]-=4;b[axis]+=4;line(a,b);}};
    const polygons=collisionShapePolygons(collision,shape);
    if(polygons.length){
      const edges=new Set();
      for(const {face,vertices} of polygons){
        for(let i=0;i<vertices.length;i++){
          const a=vertices[i],b=vertices[(i+1)%vertices.length],key=[a.join(','),b.join(',')].sort().join(':');
          if(!edges.has(key)){edges.add(key);line(a,b);}
        }
        const center=[0,1,2].map(i=>vertices.reduce((sum,v)=>sum+v[i],0)/vertices.length);
        const normal=face.normalQ8.map(n=>n/256),length=Math.min(32,Math.max(8,Math.max(...vertices.map(v=>Math.hypot(...v.map((n,i)=>n-center[i]))))*0.2));
        const end=center.map((n,i)=>n+normal[i]*length),axis=Math.abs(normal[1])<0.9?[0,1,0]:[1,0,0];
        const cross=[normal[1]*axis[2]-normal[2]*axis[1],normal[2]*axis[0]-normal[0]*axis[2],normal[0]*axis[1]-normal[1]*axis[0]],scale=Math.hypot(...cross)||1;
        normals.push(...display(center),...display(end));
        for(const sign of [-1,1])normals.push(...display(end),...display(end.map((n,i)=>n-normal[i]*length*0.25+sign*cross[i]/scale*length*0.15)));
      }
      if(active)warnings.push(...collisionPlaneWarnings(collision,shape));
    }else if(shape.faceCount===2){
      const record=collision.faceRecords.find(r=>r.index===shape.records[0]),edge=collision.edges.find(e=>e.index===record.edgeIndex);
      const points=edge.indices.map(i=>collision.vertices[i-1].slice(0,3));line(...points);
    }else marker(shape.center);
    groups.push({shape:shape.index,active:Boolean(active),kind:shape.kind,lines,normals,markerOnly:shape.faceCount<2});
  }
  const bounds=Array.from({length:3},()=>[Infinity,-Infinity]);let hasPoints=false;
  for(const group of groups)for(const key of ['lines','normals'])for(let i=0;i<group[key].length;i++){
    hasPoints=true;const pair=bounds[i%3],value=group[key][i];pair[0]=Math.min(pair[0],value);pair[1]=Math.max(pair[1],value);
  }
  return {groups,warnings,bounds:hasPoints?bounds:null};
}

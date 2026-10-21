// Export the recovered static, finest-grid base pass. Runtime visibility, LOD,
// overlays and animated effects remain separate. Optional placed meshes use
// their loader-initialized transforms and per-instance primary materials.
// Convert source Y-down/forward-Z to display Y-up/backward-Z together.
// Negating Y alone is a reflection; negating both preserves handedness.
export const displayPosition=([x,y,z])=>[x,y===0?0:-y,z===0?0:-z];
export function buildSceneExport(scene, textures, placedMeshes=[]) {
  const obj=['# Rollcage recovered scene. Coordinates X,-Y,-Z (Y up).','mtllib scene.mtl'];
  const groups=[];
  const allPositions=[];
  let vertexBase=1,uvBase=1,quads=0,triangles=0;
  const meshes=[...scene.segments.map(s=>({...s,kind:'terrain',label:`segment_${s.index}`})),
    ...placedMeshes.map(s=>({...s,kind:'object',label:`object_${s.index}`,segment:-1}))];
  for(const segment of meshes) {
    obj.push(`g ${segment.label}`);
    for(const [x,y,z] of segment.vertices) {
      const position=displayPosition([x,y,z]);
      obj.push(`v ${position.join(' ')}`); allPositions.push(position);
    }
    const pageGroups=new Map(); let previousPage=-1;
    for(const face of segment.faces) {
      const texture=textures.get(face.page);
      if(!texture) throw new Error(`Texture page ${face.page} is unavailable.`);
      const uv=face.uv.map(([u,v])=>[(u+0.5)/texture.width,(v+0.5)/texture.height]);
      for(const [u,v] of uv)obj.push(`vt ${u} ${1-v}`);
      if(previousPage!==face.page){obj.push(`usemtl page_${face.page}`);previousPage=face.page;}
      const corners=face.indices.map((index,i)=>`${vertexBase+index}/${uvBase+i}`);
      obj.push(`f ${corners[0]} ${corners[1]} ${corners[2]}`);
      if(corners.length===4){obj.push(`f ${corners[1]} ${corners[3]} ${corners[2]}`);quads++;}
      uvBase+=face.uv.length;
      if(!pageGroups.has(face.page))pageGroups.set(face.page,[]);
      const vertices=pageGroups.get(face.page);
      const orders=corners.length===4?[[0,1,2],[1,3,2]]:[[0,1,2]];
      triangles+=orders.length;
      for(const order of orders) {
        const p=order.map(c=>displayPosition(segment.vertices[face.indices[c]]));
        const a=p[1].map((n,i)=>n-p[0][i]),b=p[2].map((n,i)=>n-p[0][i]);
        const normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
        const length=Math.hypot(...normal)||1;
        for(let i=0;i<3;i++)vertices.push(...p[i],...uv[order[i]],...normal.map(n=>n/length));
      }
    }
    for(const [page,values] of pageGroups) {
      const array=new Float32Array(values);
      groups.push({segment:segment.kind==='terrain'?segment.index:-1,kind:segment.kind,instance:segment.kind==='object'?segment.index:null,
        page,vertices:array.length/8,buffer:Buffer.from(array.buffer).toString('base64')});
    }
    vertexBase+=segment.vertices.length;
  }
  const bounds=[0,1,2].map(axis=>allPositions.reduce(([min,max],p)=>[Math.min(min,p[axis]),Math.max(max,p[axis])],[Infinity,-Infinity]));
  return {obj:obj.join('\n')+'\n',groups,bounds,quads,triangles,vertices:allPositions.length};
}

// Declared synthetic convex models for arithmetic/containment checks.
export function boxCollision({triangles=false,radius=16}={}) {
 const vertices=Array.from({length:8},(_,i)=>[i&1?radius:-radius,i&2?radius:-radius,i&4?radius:-radius,0]),faces=[];
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1]) {
  const other=[0,1,2].filter(value=>value!==axis),normal=[0,0,0];normal[axis]=256*sign;
  let order=[0,1,3,2].map(bits=>{let index=sign>0?1<<axis:0;if(bits&1)index|=1<<other[0];if(bits&2)index|=1<<other[1];return index+1;});
  const a=vertices[order[0]-1],b=vertices[order[1]-1],cross=[(b[1]-a[1])*(-a[2])-(b[2]-a[2])*(-a[1]),(b[2]-a[2])*(-a[0])-(b[0]-a[0])*(-a[2]),(b[0]-a[0])*(-a[1])-(b[1]-a[1])*(-a[0])];
  if(cross[axis]*sign>0)order.reverse();
  const polygons=triangles?[[order[0],order[1],order[2]],[order[0],order[2],order[3]]]:[order];
  for(const polygon of polygons){const indices=polygon.length===3?[polygon[0],polygon[2],polygon[1],0]:[polygon[0],polygon[3],polygon[1],polygon[2]],packedNormal=(((normal[0]&1023)<<20)|((normal[1]&1023)<<10)|(normal[2]&1023))>>>0;
   faces.push({index:faces.length,indices,triangle:polygon.length===3,normalQ8:normal.slice(),packedNormal});}
 }
 const faceRecords=faces.map((face,index)=>{const raw=Buffer.alloc(9);raw[8]=index;return {index,faceIndex:index,raw};});
 const raw=Buffer.alloc(20);raw.writeUInt32LE(faces.length<<16,16);
 const shape={index:0,slot:0,faceStart:0,faceCount:faces.length,records:faces.map(face=>face.index),raw};
 return {available:true,vertices,faces,faceRecords,edges:[],shapes:[shape]};
}

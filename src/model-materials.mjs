// FUN_0046c7c0 / FUN_0046d0e0: per-instance face UVs. Animation is sampled
// at the serialized frame; stepping the original animation clock is separate.
const permutations=[[0,1,2,3],[1,3,0,2],[3,2,1,0],[2,0,3,1],
 [2,3,0,1],[3,1,2,0],[1,0,3,2],[0,2,1,3]];

// 474490 publishes the default 40-byte GPU packets into 132-byte draw
// records. 46c7c0 consumes their UVs for bodies with flag800 (cars/wheels).
// These are embedded model materials, separate from placed-instance UV keys.
export function readDefaultModelMaterials(data, model) {
  const first = model.offset + data.readUInt32LE(model.offset + 0x10);
  const end = model.offset + data.readUInt32LE(model.offset + 0x14);
  if (first < 0 || end > data.length || end - first !== model.faceCount * 40) throw Error('Default model packets exceed resource bounds or face count.');
  return model.faces.map((face, index) => {
    const packet = first + index * 40, pageWord = data.readUInt16LE(packet + 22);
    return {page: pageWord & 63, pageWord,
      uv: [12,20,28,36].slice(0, face.triangle ? 3 : 4).map(offset => [data[packet + offset], data[packet + offset + 1]]),
      indices: [face.indices[0]-1, face.indices[2]-1, face.indices[1]-1, ...(face.triangle ? [] : [face.indices[3]-1])]};
  });
}
export function readModelMaterials(data,model,uvStart) {
 const range=(p,n,label)=>{if(!Number.isSafeInteger(p)||p<0||p+n>data.length)throw Error(`Model ${label} exceeds resource bounds.`);};
 range(0,0x120,'material header');
 const indexTable=data.readUInt32LE(0xcc),materialTable=data.readUInt32LE(0xd8);
 range(indexTable+uvStart*2,model.faceCount*2,'UV indices');
 return model.faces.map((face,index)=>{
  const key=data.readUInt16LE(indexTable+(uvStart+index)*2),descriptor=materialTable+(key>>2);
  range(descriptor,12,'UV descriptor');
  const animationWord=data.readUInt16LE(descriptor+2);
  let uvOffset=descriptor,permutation=0,animation=null;
  if(animationWord!==0xffff) {
   const animationIndex=animationWord&255,animTable=data.readUInt32LE(0xb0),frameTable=data.readUInt32LE(0xb8);
   if(animationIndex>=data[0xb4])throw Error('Model UV animation index is unavailable.');
   range(animTable+animationIndex*24,24,'animation state');
   let frame=data.readUInt16LE(animTable+animationIndex*24+6),p=frameTable+frame*6;
   range(p,6,'animation frame');
   if(data.readInt16LE(p+4)===0){frame=data.readInt16LE(p);p=frameTable+frame*6;range(p,6,'animation redirect');}
   const uvIndex=data.readInt16LE(p);
   uvOffset=data.readUInt32LE(0x110)+uvIndex*16;
   range(uvOffset,12,'animated UV record');
   permutation=animationWord>>8;
   animation={index:animationIndex,frame,uvIndex,permutation};
  }
  const corners=[[data[uvOffset],data[uvOffset+1]],[data[uvOffset+4],data[uvOffset+5]],
   [data[uvOffset+8],data[uvOffset+9]],[data[uvOffset+10],data[uvOffset+11]]];
  const order=permutations[permutation]??permutations[0],pageWord=data.readUInt16LE(uvOffset+6);
  return {index,key,descriptor,uvOffset,animationWord,animation,pageWord,page:pageWord&63,
   uv:order.map(i=>corners[i]),indices:[face.indices[0]-1,face.indices[2]-1,face.indices[1]-1,...(face.triangle?[]:[face.indices[3]-1])]};
 });
}

const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Renderer vertex declarations require CRT ${name}.`);return r.services.libraryCall(name,args,r);};
//40c9a0, including original rotations405d40 and inline counterpart.
function insertMapNode(map, node, parent, left, runtime) {
  const {memory: m}=runtime;
  if(ptr(m,map+4)>=0xaaaaaa9){library(runtime,'operatorDelete',[node]);library(runtime,'throwLengthError',[0x5702a8]);throw Error('CRT length-error service returned unexpectedly.');}
  put(m, map + 4, get(m, map + 4) + 1); put(m, node + 4, parent);
  const head = ptr(m, map);
  if (parent === head) {put(m, head + 4, node); put(m, head, node); put(m, head + 8, node);}
  else if (left) {put(m, parent, node); if (parent === ptr(m, head)) put(m, head, node);}
  else {put(m, parent + 8, node); if (parent === ptr(m, head + 8)) put(m, head + 8, node);}
  const rotateLeft = root => {
    const other = ptr(m, root + 8); put(m, root + 8, get(m, other)); if (!m[ptr(m, other) + 13]) put(m, ptr(m, other) + 4, root);
    put(m, other + 4, get(m, root + 4));
    if (root === ptr(m, ptr(m, map) + 4)) put(m, ptr(m, map) + 4, other);
    else {const p = ptr(m, root + 4); put(m, p + (root === ptr(m, p) ? 0 : 8), other);}
    put(m, other, root); put(m, root + 4, other);
  };
  const rotateRight = root => {
    const other = ptr(m, root); put(m, root, get(m, other + 8)); if (!m[ptr(m, other + 8) + 13]) put(m, ptr(m, other + 8) + 4, root);
    put(m, other + 4, get(m, root + 4));
    if (root === ptr(m, ptr(m, map) + 4)) put(m, ptr(m, map) + 4, other);
    else {const p = ptr(m, root + 4); put(m, p + (root === ptr(m, p + 8) ? 8 : 0), other);}
    put(m, other + 8, root); put(m, root + 4, other);
  };
  let current = node;
  while (!m[ptr(m, current + 4) + 12]) {
    let p = ptr(m, current + 4), grand = ptr(m, p + 4);
    if (p === ptr(m, grand)) {
      const uncle = ptr(m, grand + 8);
      if (!m[uncle + 12]) {m[p + 12] = 1; m[uncle + 12] = 1; m[grand + 12] = 0; current = grand;}
      else {if (current === ptr(m, p + 8)) {rotateLeft(p); current = p;} p = ptr(m, current + 4); grand = ptr(m, p + 4); m[p + 12] = 1; m[grand + 12] = 0; rotateRight(grand);}
    } else {
      const uncle = ptr(m, grand);
      if (!m[uncle + 12]) {m[p + 12] = 1; m[uncle + 12] = 1; m[grand + 12] = 0; current = grand;}
      else {if (current === ptr(m, p)) {rotateRight(p); current = p;} p = ptr(m, current + 4); grand = ptr(m, p + 4); m[p + 12] = 1; m[grand + 12] = 0; rotateLeft(grand);}
    }
  }
  m[ptr(m, ptr(m, map) + 4) + 12] = 1;
}

//52ce40/40c640. Root pointers are read separately after allocation.
export function createRendererVertexDeclarationNode(map,pair,runtime){
  const m=runtime.memory;put(m,runtime.scratchBase+4,pair);const node=library(runtime,'operatorNew',[24])>>>0;
  if(!node){library(runtime,'throwBadAlloc',[]);throw Error('CRT bad_alloc service returned unexpectedly.');}
  put(m,node,get(m,map));if(node+4>>>0)put(m,node+4,get(m,map));if(node+8>>>0)put(m,node+8,get(m,map));m.writeUInt16LE(0,node+12);
  if(node+16>>>0){const livePair=ptr(m,runtime.scratchBase+4);put(m,node+16,get(m,livePair));put(m,node+20,get(m,livePair+4));}
  return node;
}
function previous(m,current){
  if(m[current+13])return ptr(m,current+8);
  let next=ptr(m,current);if(!m[next+13]){current=next;while(!m[ptr(m,current+8)+13])current=ptr(m,current+8);return current;}
  next=ptr(m,current+4);while(!m[next+13]&&current===ptr(m,next)){current=next;next=ptr(m,next+4);}return m[current+13]?current:next;
}
//52ce70. Duplicate insertion frees only the new node, retaining its old map
//value. The creator's newly acquired COM declaration is not retired here.
export function insertRendererVertexDeclarationNode(map,output,unused,keyAddress,node,runtime){
  const m=runtime.memory,s=runtime.scratchBase;[output,unused,keyAddress,node].forEach((v,i)=>put(m,s+4+i*4,v));const head=ptr(m,map);let parent=head,current=ptr(m,head+4),left=true;
  while(!m[current+13]){parent=current;left=ptr(m,keyAddress)<ptr(m,current+16);current=ptr(m,current+(left?0:8));}
  let predecessor=parent,insert=false;
  if(left){if(parent===ptr(m,head))insert=true;else predecessor=previous(m,parent);}
  if(!insert)insert=ptr(m,predecessor+16)<ptr(m,keyAddress);
  let result;
  if(insert){insertMapNode(map,node,parent,left,runtime);result=node;put(m,s+12,node);}
  else{library(runtime,'operatorDelete',[node]);result=predecessor;}
  const liveOutput=ptr(m,s+4);put(m,liveOutput,result);m[liveOutput+4]=insert?1:0;return liveOutput;
}
//52c3e0. Integer-keyed device-declaration cache and original global
//D3DVERTEXELEMENT9 builder. Existing cached null values are real hits.
export function getRendererVertexDeclaration(manager,flags,texCount,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=((s-4)&~7)-32,map=manager+0xa8c;put(m,s+4,flags);put(m,s+8,texCount);put(m,f+0x18,manager);
  const key=((texCount<<24)|flags)>>>0,head=ptr(m,map);let found=head,current=ptr(m,head+4);
  while(!m[current+13]){if(ptr(m,current+16)<key)current=ptr(m,current+8);else{found=current;current=ptr(m,current);}}
  if(found!==head&&key>=ptr(m,found+16))return ptr(m,found+20);
  let offset=0,elements=0;
  const element=(type)=>{put(m,f+0x10,(offset&65535)<<16);put(m,f+0x14,type);put(m,0x7171a0+elements*8,get(m,f+0x10));put(m,0x7171a4+elements*8,get(m,f+0x14));elements++;};
  if(flags&1){element(2);offset+=12;}
  for(const[mask,size,type]of[[0x20,16,0x90003],[2,12,0x30002],[4,4,0xa0004]])if(flags&mask){element(type);offset+=size;}
  if(flags&0x10){element(0x60002);offset+=12;element(0x70002);offset+=12;}
  if(texCount){for(let index=0;(index>>>0)<(texCount>>>0);index++){element(((index&255)<<24)|0x50001);offset+=8;}}
  const capturedManager=ptr(m,f+0x18);put(m,f+0x10,255);put(m,f+0x14,0x11);put(m,0x7171a0+elements*8,get(m,f+0x10));put(m,0x7171a4+elements*8,get(m,f+0x14));
  const device=ptr(m,capturedManager+0x36c);put(m,f+0x10,0);
  if(typeof runtime.services?.direct3DCall!=='function')throw Error('Renderer declarations require Direct3D COM services.');runtime.services.direct3DCall(device,0x158,[device,0x7171a0,f+0x10],{...runtime,scratchBase:f-16});
  const created=ptr(m,f+0x10),liveMap=capturedManager+0xa8c;put(m,f+0x1c,created);put(m,f+0x18,key);
  const node=createRendererVertexDeclarationNode(liveMap,f+0x18,{...runtime,scratchBase:f-8});
  insertRendererVertexDeclarationNode(liveMap,f+0x18,get(m,node+16),node+16,node,{...runtime,scratchBase:f-20});return ptr(m,f+0x10);
}

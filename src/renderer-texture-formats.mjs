import constants from './renderer-texture-format-constants.json' with {type:'json'};
export function initializeRendererTextureFormatConstants(memory){for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const quotient=value=>{const high=Number(BigInt(value|0)*0x38e38e39n>>32n)>>3;return high+(high>>>31)|0;};
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Renderer texture formats require CRT ${name}.`);return r.services.libraryCall(name,args,r);};
function copyRecord(m,out,input){for(const[o,n]of[[0,16],[16,16],[32,4]])Buffer.from(m.subarray(input+o,input+o+n)).copy(m,out+o);}
//521180 with actual521300 forward packed-record copying. Allocation captures
//the requested capacity, then the native vector roots are read live.
export function reserveRendererTextureFormats(vector,count,runtime){
  const m=runtime.memory,s=runtime.scratchBase;count>>>=0;put(m,s+4,count);let allocation=0;
  if(count){if(count>0x71c71c7)throw RangeError('Native texture-format vector bad_alloc.');allocation=library(runtime,'operatorNew',[Math.imul(count,36)>>>0])>>>0;if(!allocation)throw Error('Native texture-format vector bad_alloc.');}
  let input=ptr(m,vector),end=ptr(m,vector+4),output=allocation;
  while(input!==end){if(output)copyRecord(m,output,input);input+=36;output+=36;}
  const retained=quotient(get(m,vector+4)-get(m,vector)|0),old=ptr(m,vector);put(m,s+4,retained);if(old)library(runtime,'operatorDelete',[old]);
  const live=get(m,s+4);put(m,vector,allocation);put(m,vector+8,allocation+Math.imul(count,36));put(m,vector+4,allocation+Math.imul(live,36));
}
//521260 tail-jumps to521180 after native1.5 growth.
function grow(vector,runtime){
  const m=runtime.memory,end=get(m,vector+4),capacity=get(m,vector+8);
  if((quotient(capacity-end|0)>>>0)>=1)return;
  const size=quotient(end-get(m,vector)|0),old=quotient(capacity-get(m,vector)|0),half=old>>>1,max=0x71c71c7;
  if((max-size>>>0)<1)throw RangeError('Native texture-format vector length error.');
  reserveRendererTextureFormats(vector,Math.max(size+1,(max-half>>>0)<(old>>>0)?0:old+half),runtime);
}
//520f90. An input within the live vector is rebased through growth.
export function appendRendererTextureFormat(vector,input,runtime){
  const m=runtime.memory,start=ptr(m,vector),end=ptr(m,vector+4),aliased=(input>>>0)<end&&(input>>>0)>=start,index=aliased?quotient(input-start|0):0;
  if(end===ptr(m,vector+8))grow(vector,{...runtime,scratchBase:runtime.scratchBase-16});
  const source=aliased?ptr(m,vector)+Math.imul(index,36):input,output=ptr(m,vector+4);if(output)copyRecord(m,output,source);put(m,vector+4,get(m,vector+4)+36);
}
//511500 is a literal native switch, including its zero return above127.
export function rendererComponentReductionShift(value,runtime){
  const m=runtime.memory;if((value>>>0)>127)return 0;
  const target=ptr(m,0x511548+m[0x51156c+(value>>>0)]*4);
  return new Map([[0x511513,1],[0x511519,2],[0x51151f,3],[0x511525,4],[0x51152b,5],[0x511531,6],[0x511537,7],[0x51153d,8],[0x511543,0]]).get(target)??(()=>{throw Error(`Unknown renderer component-width target${target.toString(16)}.`);})();
}
//5115f0. Unsupported formats preserve incoming mask/depth fields; the
//component width/shift bytes are recomputed only if the live depth is nonzero.
export function describeRendererTextureFormat(output,format,runtime){
  const m=runtime.memory;format|=0;let target=0x511836;
  if(format<=0x31545844){if(format===0x31545844)target=0x511813;else if((format>>>0)<=0x74)target=ptr(m,0x511920+m[0x51195c+(format>>>0)]*4);}
  else if([0x32545844,0x32595559,0x33545844,0x34545844,0x35545844,0x59565955].includes(format))target=0x511813;
  const fields=new Map([[0x511660,[0xff0000,0xff00,255,0,24]],[0x511688,[0xff0000,0xff00,255,0xff000000,32]],[0x5116b0,[0xff0000,0xff00,255,0,32]],[0x5116d8,[0xf800,0x7e0,0x1f,0,16]],[0x511700,[0x7c00,0x3e0,0x1f,0,16]],[0x511710,[0x7c00,0x3e0,0x1f,0x8000,16]],[0x511738,[0xf00,0xf0,0xf,0xf000,16]],[0x511760,[0xe0,0x1c,3,0,8]],[0x51179b,[0xe0,0x1c,3,0xff00,16]],[0x5117c0,[0xf00,0xf0,15,0,16]],[0x51161e,[0,1,2,3,64]],[0x51163f,[0,1,2,3,128]],[0x511813,[0,0,0,0,0]]]);
  if(fields.has(target))fields.get(target).forEach((v,i)=>put(m,output+8+i*4,v));
  else if(target===0x511788){put(m,output+20,255);put(m,output+24,8);put(m,output+16,0);put(m,output+12,0);put(m,output+8,0);}
  else if(target!==0x511836)throw Error(`Unknown renderer format target${target.toString(16)}.`);
  const depth=get(m,output+24);if(!depth)return;
  const green=get(m,output+12),alpha=get(m,output+20),red=get(m,output+8);for(const o of [7,5,3,1])m[output+o]=0;
  const shift=value=>{let count=0;while(!(value&1)){value>>=1;count++;}return count;};
  let blue=get(m,output+16);
  if(red&&green&&blue){if(!(red&1))m[output+1]=shift(red);if(!(green&1))m[output+3]=shift(green);blue=get(m,output+16);if(!(blue&1))m[output+5]=shift(blue);}
  if(alpha&&!(alpha&1))m[output+7]=shift(alpha);
  m[output]=rendererComponentReductionShift(red>>>m[output+1],runtime);m[output+2]=rendererComponentReductionShift(get(m,output+12)>>>m[output+3],runtime);
  m[output+4]=rendererComponentReductionShift(blue>>>m[output+5],runtime);m[output+6]=rendererComponentReductionShift(get(m,output+20)>>>m[output+7],runtime);put(m,output+28,depth>>3);
}
//51f6b0. Compressed/float preferences precede two bounded depth passes.
export function chooseRendererTextureFormatIndex(manager,category,runtime){
  const m=runtime.memory,s=runtime.scratchBase;put(m,s+4,category);const kind=category&7,count=()=>quotient(get(m,manager+0x4c4)-get(m,manager+0x4c0)|0),row=index=>ptr(m,manager+0x4c0)+Math.imul(index,36);
  if(kind===3){const n=count(),formats=category&8?[0x33545844,0x35545844,0x31545844]:[0x31545844,0x33545844,0x35545844];for(const format of formats)for(let i=0;(i>>>0)<(n>>>0);i++)if(get(m,row(i))===format)return i;}
  if(kind===4||kind===5)for(let i=0;i===0?count()!==0:(i>>>0)<(count()>>>0);i++)if(get(m,row(i))===(kind===4?0x71:0x74))return i;
  const minimum=kind<=1||kind===3?16:32,alphaRequired=category&8;put(m,s+4,alphaRequired);let selected=0,best=0;
  if(alphaRequired){for(let depth=minimum;depth<=32;depth+=8){if(best)return selected;const n=count();for(let i=0;(i>>>0)<(n>>>0);i++){const p=row(i),bits=get(m,p+28),alpha=ptr(m,p+24)>>>m[p+11];if(bits&&alpha&&(alpha>>>0)>(best>>>0)&&bits<=depth&&alpha<=(ptr(m,p+16)>>>m[p+7])){best=alpha;selected=i;}}}if(best)return selected;}
  best=0;for(let depth=minimum;depth<=32;depth+=8){if(best)return selected;const n=count();for(let i=0;(i>>>0)<(n>>>0);i++){const p=row(i),bits=get(m,p+28);if(!bits||bits>depth)continue;const green=ptr(m,p+16)>>>m[p+7];if(green<=(best>>>0))continue;if(alphaRequired&&!get(m,p+24))continue;if(green<255&&(ptr(m,p+24)>>>m[p+11])>=32)continue;best=green;selected=i;}}
  return selected;
}
//51fa00. Existing logical entries are retained, so a repeated call can append
//duplicates. All sixteen descriptor pointers refer into the resulting vector.
export function enumerateRendererTextureFormats(manager,runtime){
  const m=runtime.memory,f=runtime.scratchBase-112;
  for(const[source,target]of[[0x5dcca0,f+0x34],[0x5dccb0,f+0x44],[0x5dcdc0,f+0x54]])Buffer.from(m.subarray(source,source+16)).copy(m,target);
  for(const[o,v]of[[0x64,0x34545844],[0x68,0x71],[0x6c,0x74]])put(m,f+o,v);
  if((quotient(get(m,manager+0x4c8)-get(m,manager+0x4c0)|0)>>>0)<15)reserveRendererTextureFormats(manager+0x4c0,15,{...runtime,scratchBase:f-8});
  for(let index=0;index<15;index++){
    const format=get(m,f+0x34+index*4),caps=ptr(m,manager+0x488),object=ptr(m,manager+0x368);
    if(typeof runtime.services?.direct3DCall!=='function')throw Error('Renderer texture formats require Direct3D COM queries.');
    const result=runtime.services.direct3DCall(object,0x28,[object,get(m,caps),get(m,caps+0x534),get(m,manager+0x430),0,3,format],runtime)|0;
    if(!result){put(m,f+0x10,format);m.fill(0,f+0x14,f+0x34);describeRendererTextureFormat(f+0x14,format,{...runtime,scratchBase:f-8});appendRendererTextureFormat(manager+0x4c0,f+0x10,{...runtime,scratchBase:f-8});}
  }
  for(let category=0;category<16;category++){const index=chooseRendererTextureFormatIndex(manager,category,{...runtime,scratchBase:f-8});put(m,manager+0x43c+category*4,ptr(m,manager+0x4c0)+Math.imul(index,36));}
}

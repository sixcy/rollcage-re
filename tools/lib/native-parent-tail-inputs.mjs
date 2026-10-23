//Observed input extents for450e50's postphysics stages. No default data or
//constructor result is installed; the encoded handle domain is not capacity.
import {createCapturedMemory} from './captured-memory.mjs';
import {nativeFrameGlobalRegions} from './native-frame-manifest.mjs';
import {nativeControlAdditionalRegions} from './native-frame-control-continuation.mjs';

export const nativeParentTailModuleRegions = Object.freeze([
  {id:'tail-attachment-scratch',preferredAddress:0x91cdb0,length:0x6a4,comparison:'mutable',evidence:'44f050/44f6xx complete source scratch Buffer extent; actual bytes only.'},
  {id:'tail-type2-pointer-domain',preferredAddress:0x80e660,length:4096*4,comparison:'mutable',evidence:'44f050/44f740 encode handle&4095; bounded consumer access observation, not constructor/table capacity.'},
  {id:'tail-recovery-clone-context',preferredAddress:0x70eb00,length:0x44a8,comparison:'mutable',evidence:'Existing recovery route/metric/candidate/clone source-known module context; actual observed bytes only.'},
  {id:'tail-pickup-transitions',preferredAddress:0x911ba0,length:4*24,comparison:'mutable',evidence:'43fa20/43fa80 four actual24-byte transition records; observed source-owned inputs only.'},
].map(Object.freeze));

export function nativeParentTailAdditionalRegions(snapshot, options = {}) {
  const rows=snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges;
  const bases=new Set([options.moduleBaseAddress,snapshot.moduleBaseAddress,...rows.map(row=>row.moduleBaseAddress)].filter(value=>value!==undefined&&value!==null).map(Number));
  if(bases.size!==1)throw Error('Parent-tail inputs require one observed module base.');
  const base=[...bases][0],captured=createCapturedMemory(rows);
  const observedType1=[];
  //44f050's type1 consumer writes eight bytes at90b688+handleID*8.
  //Derive only reached slots from the original or carried SOURCE queue;
  //neither a guessed4096-record capacity nor a new table is introduced.
  let count;
  try{count=captured.span(base+0x2e6ba0,4).readUInt32LE();}catch{}
  if(count!==undefined){
    const maximum=(options.attachmentWindowBytes??1024)/4;
    if(count>maximum)throw Error('Attachment queue exceeds its observed type1 input window.');
    for(let index=0;index<count;index++){
      const body=captured.span(base+0x502040+index*4,4).readUInt32LE(),handles=captured.span(body+0x16a,10);
      for(let point=0;point<5;point++){
        const handle=handles.readUInt16LE(point*2),type=handle>>>12;if(!type)break;
        if(type===1){const id=handle&4095;observedType1.push({id:`tail-attached-light-point-${id}`,preferredAddress:0x90b688+id*8,length:8,comparison:'mutable',evidence:'44f050 actual type1 handle in the observed or source-carried queue; exact eight-byte position/flag consumer, not an allocation capacity.'});}
      }
    }
  }
  const declared=[...nativeFrameGlobalRegions.map(row=>({address:base+row.preferredAddress-0x400000,length:row.id==='attachment-queue'?options.attachmentWindowBytes??row.length:row.length})),
    ...(options.additionalRegions??[]),...nativeControlAdditionalRegions(snapshot,options)],result=[];
  for(const region of [...nativeParentTailModuleRegions,...observedType1]){
    const address=base+region.preferredAddress-0x400000;
    try{captured.span(address,region.length);}catch{continue;}
    let cursor=address;const end=address+region.length;
    const add=(start,stop)=>{if(stop>start)result.push({...region,id:`${region.id}-${start.toString(16)}`,address:start,preferredAddress:region.preferredAddress+start-address,length:stop-start});};
    for(const row of [...declared].sort((a,b)=>a.address-b.address)){
      if(row.address+row.length<=cursor||row.address>=end)continue;
      if(row.address>cursor)add(cursor,row.address);
      cursor=Math.max(cursor,row.address+row.length);
    }
    if(cursor<end)add(cursor,end);
    declared.push({address,length:region.length});
  }
  return result;
}

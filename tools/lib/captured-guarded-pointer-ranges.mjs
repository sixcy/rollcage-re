const limit=0x100000000,own=(row,key)=>Object.hasOwn(row,key);
const uint=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isSafeInteger(Number(value))&&Number(value)>=0&&Number(value)<limit;
const present=value=>value!==undefined&&value!==null&&value!=='';
const span=(address,length)=>uint(address)&&Number.isSafeInteger(length)&&length>=0&&Number(address)+length<=limit;
const fields=['dereferenceMinimumValues','guardedRootAddress','guardedDeclaredLength','guardedStopIndex','guardedPointerSteps','guardedPointerReadBytes'];
const guarded=row=>row.rangeMode==='guarded-pointer'||fields.some(key=>own(row,key));
const bad=message=>{throw Error(`Invalid captured guarded pointer: ${message}.`);};

function shape(row){
  if(row.rangeMode!=='guarded-pointer'||!Buffer.isBuffer(row.bytes)||!Array.isArray(row.dereferenceOffsets)||row.dereferenceOffsets.length<1||row.dereferenceOffsets.length>8||!Array.isArray(row.dereferenceMinimumValues)||row.dereferenceMinimumValues.length!==row.dereferenceOffsets.length||Number(row.offset??0)!==0||row.baseRegister!==undefined&&row.baseRegister!==null&&row.baseRegister!==''||row.readableRegion||row.vectorStorage||row.maxRegionBytes||row.maxVectorBytes||row.vectorHeaderAddress!==undefined)bad('descriptor/mode');
  const absolute=row.rootAddress!==undefined&&row.rootAddress!==null&&row.rootAddress!=='',rva=row.rootRva!==undefined&&row.rootRva!==null&&row.rootRva!=='';
  if(absolute===rva)bad('one explicit global root required');
  const root=absolute?Number(row.rootAddress):Number(row.moduleBaseAddress)+Number(row.rootRva);
  if(!uint(absolute?row.rootAddress:row.rootRva)||rva&&(!uint(row.moduleBaseAddress)||Number(row.moduleBaseAddress)===0)||!uint(root)||root===0||Number(row.guardedRootAddress)!==root)bad('actual root/overflow');
  const offsets=row.dereferenceOffsets.map(Number),minimums=row.dereferenceMinimumValues;
  if(offsets.some(value=>!Number.isSafeInteger(value)||Math.abs(value)>0xffffffff)||minimums.some((value,index)=>value!==1&&!(index===0&&value===257)))bad('offset/minimum');
  const length=row.guardedDeclaredLength,stop=row.guardedStopIndex,steps=row.guardedPointerSteps;
  if(!Number.isSafeInteger(length)||length<1||length>64*1024*1024||!own(row,'guardedStopIndex')||stop!==null&&(!Number.isInteger(stop)||stop<0||stop>=offsets.length)||!Array.isArray(steps)||steps.length!==(stop===null?offsets.length:stop+1)||row.guardedPointerReadBytes!==steps.length*4)bad('length/stop/proof count');
  let current=root;
  for(const [index,step]of steps.entries()){
    const address=current+offsets[index];
    if(!step||step.index!==index||!span(address,4)||!uint(step.readAddress)||Number(step.readAddress)!==address||!uint(step.value)||step.minimumValue!==minimums[index]||!/^[0-9a-f]{8}$/.test(step.bytesHex??'')||Buffer.from(step.bytesHex,'hex').readUInt32LE()!==Number(step.value))bad('pointer step address/value');
    const failed=Number(step.value)<minimums[index];
    if(failed!==(stop===index))bad('first false native guard differs');
    current=Number(step.value);
  }
  if(stop===null){if(!span(current,length)||current===0||Number(row.address)!==current||row.length!==length||row.bytes.length!==length)bad('resolved pointee/extent');}
  else if(!uint(row.address)||Number(row.address)!==0||row.length!==0||row.bytes.length!==0)bad('false guard must grant no memory');
  return {row,steps};
}

function observedWord(regions,address){
  const bytes=Buffer.alloc(4);
  for(let i=0;i<4;i++){
    let value;
    for(const row of regions){
      const start=Number(row.address);
      if(address+i<start||address+i>=start+row.bytes.length)continue;
      const actual=row.bytes[address+i-start];
      if(value!==undefined&&actual!==value)bad('other actual pointer bytes disagree');
      value=actual;
    }
    if(value===undefined)return undefined;
    bytes[i]=value;
  }
  return bytes.readUInt32LE();
}

//A proof cannot certify itself or another unproved guarded range. Admit a
//wrapper only from independent globals, then its source, then descendants.
//The four actual pointer bytes must exist separately; proof hex grants none.
export function validateCapturedGuardedPointerRanges(input,{expectedDescriptors}={}){
  if(expectedDescriptors!==undefined){
    if(!Array.isArray(expectedDescriptors))bad('expected descriptors must be explicit');
    const declared=new Map();
    for(const descriptor of expectedDescriptors){if(!descriptor||typeof descriptor.id!=='string'||declared.has(descriptor.id))bad('expected descriptor identity');declared.set(descriptor.id,descriptor);}
    for(const row of input.filter(guarded)){
      const descriptor=declared.get(row.id);
      if(!descriptor||!Array.isArray(descriptor.dereferenceMinimumValues)||JSON.stringify(row.dereferenceMinimumValues)!==JSON.stringify(descriptor.dereferenceMinimumValues)||JSON.stringify(row.dereferenceOffsets)!==JSON.stringify(descriptor.dereferenceOffsets)||row.guardedDeclaredLength!==descriptor.length||Number(row.offset??0)!==Number(descriptor.offset??0)||present(row.rootAddress)!==present(descriptor.address)||present(row.rootRva)!==present(descriptor.rva)||Number(row.rootAddress??0)!==Number(descriptor.address??0)||Number(row.rootRva??0)!==Number(descriptor.rva??0)||descriptor.baseRegister||descriptor.readableRegion||descriptor.vectorStorage||descriptor.maxRegionBytes||descriptor.maxVectorBytes)bad('actual row differs from configured guarded descriptor');
    }
    for(const descriptor of declared.values())if(descriptor.dereferenceMinimumValues!==undefined&&descriptor.dereferenceMinimumValues!==null){
      const rows=input.filter(row=>row.id===descriptor.id);if(rows.length!==1||!guarded(rows[0]))bad('configured guarded range missing or downgraded');
    }
  }
  const pending=input.filter(guarded).map(shape),skipped=new Set();
  if(!pending.length)return skipped;
  const trusted=input.filter(row=>!guarded(row)&&Buffer.isBuffer(row.bytes)&&row.bytes.length>0&&span(row.address,row.bytes.length));
  while(pending.length){
    let progress=false;
    for(let i=0;i<pending.length;){
      const {row,steps}=pending[i];let available=true;
      for(const step of steps){const value=observedWord(trusted,Number(step.readAddress));if(value===undefined){available=false;break;}if(value!==Number(step.value))bad(`proof differs from other actual captured pointer bytes for ${row.id} at0x${Number(step.readAddress).toString(16)}`);}
      if(!available){i++;continue;}
      if(row.bytes.length)trusted.push(row);else skipped.add(row);
      pending.splice(i,1);progress=true;
    }
    if(!progress)bad('unobserved/self/cyclic pointer proof dependency');
  }
  return skipped;
}

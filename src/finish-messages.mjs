const lengthOf=(memory,address)=>{let count=0;while(memory.readUInt8(address+count)!==0)count++;return count;};
const copyString=(memory,source,destination)=>{let count=0,value;do{value=memory.readUInt8(source+count);memory.writeUInt8(value,destination+count);count++;}while(value!==0);return count-1;};
const call=(handlers,name,request)=>{if(typeof handlers[name]!=='function')throw Error(`Finish messages require handler ${name}.`);return handlers[name](request);};
const resultEax=result=>{const value=typeof result==='number'?result:result?.eax;if(!Number.isInteger(value))throw Error('Finish-message callback requires explicit EAX.');return value|0;};
//439580 returns a byte offset, with0 shared by a first-byte match and failure.
export function searchLocalizationBytes(pattern,source,{memory}) {
 const size=memory.readUInt32LE(0x6e65e4),bytes=Buffer.from(pattern);
 for(let offset=0;offset<size;offset++){let index=0;while(index<bytes.length&&bytes[index]===memory.readUInt8(source+offset+index))index++;if(index===bytes.length)return offset;}
 return 0;
}
//439610 selects the requested language inside caller-owned processed text.
export function findLocalizationBlock(key,{memory}) {
 const source=memory.readUInt32LE(0x6e65f4);if(source===0)return 0;
 const keyLength=lengthOf(memory,key),pattern=Buffer.concat([memory.subarray(key,key+keyLength),memory.subarray(0x5d0698,0x5d069a)]),patternLength=pattern.indexOf(0),language=memory.readUInt16LE(0x6e65f0),languageAddress=[0x5d069c,0x5d06a4,0x5d06ac,0x5d06bc,0x5d06b4,0x5d06c4][language]??0x5d069c;
 let offset=searchLocalizationBytes(pattern.subarray(0,patternLength),source,{memory});const size=memory.readUInt32LE(0x6e65e4);if(offset===0||offset>=size)return 0;
 const length=lengthOf(memory,languageAddress);
 while(offset<size){let index=0;while(index<length&&memory[languageAddress+index]===memory[source+offset+index])index++;
  if(index===length){for(;offset<size;offset++)if(memory[source+offset]===91){offset++;while(offset<size){if(memory[source+offset]>31)return source+offset;offset++;}}}
  offset++;
 }
 return 0;
}
//439780 decodes one already preprocessed language block into CR-separated rows.
export function readLocalizationBlock(destination,key,{memory,handlers={}}) {
 let cursor=key?(handlers.call439610?resultEax(call(handlers,'call439610',{memory,ecx:key,args:[]}))>>>0:findLocalizationBlock(key,{memory})):0,out=destination,count=-1;
 if(destination)memory[destination]=0;
 if(cursor){count=0;while(memory[cursor]!==93){
  if(memory[cursor]===1){cursor++;continue;}
  if(memory[cursor]===9)call(handlers,'call401300',{memory,args:[0x5d06d0,key]});
  if(memory[cursor]===0){
   cursor++;if(memory[cursor]===126)cursor++;let end=cursor;while(memory[end]<=32)end++;
   if(memory[end]===93){cursor=end;continue;}
   if(destination&&count<2047)memory[out++]=13;
  }else{if(destination&&count<2047)memory[out++]=memory[cursor];cursor++;}
  count++;
 }}
 if(destination&&count>0)memory[out]=0;return count;
}
//439850 extracts one CR-separated localization row, returning its full length
//even when a bounded destination truncates it.
export function lookupLocalizedRow(destination,capacity,key,row,{memory,scratchBase,handlers={}}) {
 capacity|=0;row|=0;
 if(capacity===-1||capacity>0){if(destination)memory[destination]=0;else capacity=0;}
 else{destination=0;capacity=0;}
 const line=scratchBase,block=scratchBase+2048;
 const loaded=handlers.call439780?resultEax(call(handlers,'call439780',{memory,ecx:block,args:[key]})):readLocalizationBlock(block,key,{memory,handlers});
 if(loaded===-1)return -1;
 let cursor=block;
 for(;;){let out=line;while(memory[cursor]!==0&&memory[cursor]!==13)memory[out++]=memory[cursor++];memory[out]=0;if(row===0)break;row=(row-1)|0;if(memory[cursor]===0)return -1;cursor++;}
 const length=lengthOf(memory,line);
 if(destination&&length){if(capacity===-1||length<capacity)copyString(memory,line,destination);else if(capacity>0){for(let index=0;index<capacity-1;index++)memory[destination+index]=memory[line+index];memory[destination+capacity-1]=0;}}
 return length;
}
//4579e0 selects the name/country/color string family before localization.
export function generateRacerName(destination,driver,{memory,scratchBase,handlers={}}) {
 memory[destination]=0;if((driver>>>0)>6)return;
 const settings=memory.readUInt32LE(0x5ecefc),mode=memory[settings+5],key=mode===1?0x5d2578:mode===2?0x5d2594:0x5d2560;
 if(handlers.call439850)call(handlers,'call439850',{memory,ecx:scratchBase,edx:512,args:[key,driver>>>0]});
 else lookupLocalizedRow(scratchBase,512,key,driver,{memory,scratchBase:scratchBase+0x400,handlers});
 copyString(memory,scratchBase,destination);
}
//472700 converts unique1/2 markers into printf arguments. Duplicate markers
//abort and leave the caller's destination untouched.
export function formatFinishPhrase(phrase,name,firstName,destination,{memory,scratchBase,handlers={}}) {
 const settings=memory.readUInt32LE(0x5ecefc),template=(settings+0x104e+((phrase|0)<<6))>>>0,format=scratchBase+0x120,rendered=scratchBase+0x20,length=lengthOf(memory,template);
 let first=false,second=false,secondFirst=false,out=format;
 for(let index=0;index<length;index++){
  const value=memory[template+index];
  if(value===49){if(first)return;first=true;memory[out++]=37;memory[out++]=115;}
  else if(value===50){if(second)return;second=true;if(!first)secondFirst=true;memory[out++]=37;memory[out++]=115;}
  else memory[out++]=value;
 }
 memory[out]=0;
 const args=first?(second?(secondFirst?[firstName,name]:[name,firstName]):[name]):second?[firstName]:[];
 call(handlers,'sprintf',{memory,destination:rendered,format,args});
 if(lengthOf(memory,rendered)>=127)memory[rendered+127]=0;
 copyString(memory,rendered,destination);
}
//4a0620 mutates its supplied text, shifts the four65-byte history slots, then
//optionally sends an ae-tagged packet. Header bytes1..7 remain caller-owned.
export function enqueueFinishNotification(message,{memory,scratchBase,handlers={}}) {
 if(lengthOf(memory,message)>64)memory[message+64]=0;
 if(memory[0x6eafe0]&1){
  const packet=scratchBase;memory[packet]=0xae;copyString(memory,message,packet+8);
  for(let source=0x6eaf5e;source>0x6eae9b;source-=65)copyString(memory,source,source+65);
  copyString(memory,message,0x6eaedc);
  if(memory[0x6eafe0]&4)call(handlers,'call4a0420',{memory,ecx:2,edx:packet,args:[lengthOf(memory,message)+9,0]});
 }
 return 1;
}

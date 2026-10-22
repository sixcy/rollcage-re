import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const REDUX_SHA256='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5';

// Assemble static retained evidence for larger connected instruction checks.
// Available instructions are not a claim of translated source or reachability.
// Only exact-target procedure assemblies and complete byte reads are admitted.
export async function loadRetainedNativeProgram({directories=['analysis/scene/results','analysis/native-simulation/results'],sha256=REDUX_SHA256,memorySize=0xa00000}={}) {
 const instructions=new Map(),bytes=new Map(),references=[],seen=new Map(),skipped=[];
 for(const directory of directories)for(const filename of (await readdir(directory)).filter(name=>name.endsWith('.json')).sort()) {
  const path=`${directory}/${filename}`,raw=await readFile(path),reply=JSON.parse(raw.toString('utf8'));
  const evidence=reply.structuredContent??(()=>{const content=reply.content?.find(item=>item.type==='text');if(!content)return null;try{return JSON.parse(content.text);}catch{return null;}})();
  if(!evidence?.evidence_id||!['procedure_assembly','read_bytes'].includes(evidence.operation))continue;
  if(evidence.subject?.digest?.sha256?.toLowerCase()!==sha256.toLowerCase())throw Error(`Retained native target digest mismatch: ${path}`);
  const fingerprint=createHash('sha256').update(JSON.stringify([evidence.operation,evidence.normalized_result])).digest('hex');
  if(seen.has(evidence.evidence_id)){if(seen.get(evidence.evidence_id)!==fingerprint)throw Error(`Conflicting retained Evidence identity: ${path}`);continue;}
  seen.set(evidence.evidence_id,fingerprint);const normalized=evidence.normalized_result;
  if(evidence.operation==='procedure_assembly') {
   if(typeof normalized!=='string')throw Error(`Retained assembly has no instruction text: ${path}`);
   for(const line of normalized.trim().split(/\r?\n/)) {
    const match=/^(0x[0-9a-f]+): ([A-Z][A-Z0-9]*(?:\.(?:REP|REPE|REPNE|LOCK))?)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid retained instruction in ${path}: ${line}`);
    const instruction={address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]},old=instructions.get(instruction.address);
    if(old&&(old.op!==instruction.op||JSON.stringify(old.args)!==JSON.stringify(instruction.args)))throw Error(`Conflicting retained instruction0x${instruction.address.toString(16)} in ${path}`);
    instructions.set(instruction.address,instruction);
   }
  }else {
   if(!normalized?.complete){skipped.push({path,evidence:evidence.evidence_id,reason:'incomplete byte read'});continue;}
   const address=Number(normalized.address),hex=normalized.bytes_hex;
   if(!Number.isSafeInteger(address)||address<0||typeof hex!=='string'||hex.length%2||!/^[0-9a-f]*$/i.test(hex))throw Error(`Invalid retained byte span: ${path}`);
   const data=Buffer.from(hex,'hex');if(data.length!==normalized.returned_bytes||address+data.length>memorySize)throw Error(`Retained byte span exceeds declared memory: ${path}`);
   for(let i=0;i<data.length;i++){const p=address+i,old=bytes.get(p);if(old!==undefined&&old!==data[i])throw Error(`Conflicting retained byte0x${p.toString(16)} in ${path}`);bytes.set(p,data[i]);}
  }
  references.push({path,evidence:evidence.evidence_id,operation:evidence.operation,sha256:createHash('sha256').update(raw).digest('hex')});
 }
 const tables=[];let start=-1,last=-2,values=[];
 const flush=()=>{if(values.length)tables.push({address:`0x${start.toString(16)}`,bytes_hex:Buffer.from(values).toString('hex')});};
 for(const[address,value]of[...bytes].sort((a,b)=>a[0]-b[0])){if(address!==last+1){flush();start=address;values=[];}values.push(value);last=address;}flush();
 return {sha256,instructions:[...instructions.values()].sort((a,b)=>a.address-b.address),tables,references,skipped,initializeMemory(memory){if(!Buffer.isBuffer(memory)||memory.length<memorySize)throw Error('Retained program requires declared memory capacity.');for(const table of tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}};
}

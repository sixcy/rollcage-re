// Hash-index retained MCP replies without pretending they are a merged REA ledger.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=[];
for(const directory of ['analysis/scene/results','analysis/native-simulation/results']){
 for(const name of (await readdir(directory)).filter(name=>name.endsWith('.json')).sort()){
  const path=`${directory}/${name}`,bytes=await readFile(path),reply=JSON.parse(bytes);
  let value=reply.structuredContent;
  if(!value){const block=reply.content?.find(item=>item.type==='text');if(block){try{value=JSON.parse(block.text);}catch{value={};}}}
  files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),evidenceId:value?.evidence_id??null,operation:value?.operation??null,parameters:value?.parameters??null,targetSHA256:value?.subject?.digest?.sha256??null,error:value?.error?{code:value.error.code,message:value.error.message}:null});
 }
}
const summary={files:files.length,evidenceReplies:files.filter(file=>file.evidenceId).length,uniqueEvidenceIds:new Set(files.map(file=>file.evidenceId).filter(Boolean)).size,errorReplies:files.filter(file=>file.error).length};
await writeFile('analysis/native-evidence-index.json',JSON.stringify({method:'SHA-256 index of retained complete individual MCP response files. This is a local preservation index, not an imported/merged REA Evidence bundle. Older scene replies after the last exported scene ledger remain individually retained even when a new provider session restores an older snapshot. Provider-owned ledger exports retain their own coverage boundaries.',summary,files},null,2));
console.log(JSON.stringify(summary));

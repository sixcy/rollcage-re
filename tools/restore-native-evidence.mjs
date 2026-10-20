// Assemble unchanged Evidence records from retained MCP replies into a portable
// bundle for REA's public import_evidence_bundle validation/import operation.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const source=process.argv[2]??'analysis/native-simulation/merged-collision-evidence-bundle.json';
const destination=process.argv[3]??'analysis/native-simulation/retained-replies-evidence-bundle.json';
if(!process.argv[4])throw Error('Pass the installed REA dist/domain/evidenceBundle.js path as the third argument.');
const {createImmutableEvidenceBundle}=await import(pathToFileURL(process.argv[4]).href);
const bundle=JSON.parse(await readFile(source,'utf8')),index=JSON.parse(await readFile('analysis/native-evidence-index.json','utf8'));
if(!Array.isArray(bundle.records))throw Error('Source must be an exported REA bundle.');
const present=new Set(bundle.records.map(record=>record.evidence_id)),added=[];
for(const file of index.files){
 if(!file.evidenceId||present.has(file.evidenceId))continue;
 const bytes=await readFile(file.path);if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error(`Retained response changed after indexing: ${file.path}`);
 const reply=JSON.parse(bytes),record=reply.structuredContent??JSON.parse(reply.content.find(item=>item.type==='text').text);
 if(record.evidence_id!==file.evidenceId||record.subject?.digest?.sha256!=='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5')throw Error(`Unexpected Evidence identity: ${file.path}`);
 bundle.records.push(record);present.add(record.evidence_id);added.push({path:file.path,evidenceId:record.evidence_id});
}
// REA authenticates semantic record IDs and derives sorted artifact/provider/
// environment manifests; simply appending records leaves noncanonical manifests.
const canonical=createImmutableEvidenceBundle(bundle.records,bundle.unknowns);
await writeFile(destination,JSON.stringify(canonical),{flag:'wx'});
await writeFile(`${destination}.provenance.json`,JSON.stringify({method:'Preserves unchanged complete Evidence objects from the original bundle and previously absent retained MCP replies for the exact executable. The installed REA bundle builder validates semantic Evidence IDs, preserves unknown histories and derives canonical sorted manifests. No observation, evidence ID, confidence or provider metadata is synthesized. Public REA import_evidence_bundle validates and imports the result before a fresh provider-owned export.',source,destination,reaBundleModule:process.argv[4],sourceRecords:bundle.records.length-added.length,added,totalRecords:bundle.records.length},null,2),{flag:'wx'});
console.log(JSON.stringify({sourceRecords:bundle.records.length-added.length,added:added.length,total:bundle.records.length,destination}));

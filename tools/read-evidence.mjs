// Print the useful view without duplicating an MCP result's raw and structured copies.
import {readFile} from 'node:fs/promises';
for(const file of process.argv.slice(2)) {
 const reply=JSON.parse(await readFile(file,'utf8'));
 const value=reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);
 console.log(file);
 if(value.error){console.log(JSON.stringify({code:value.error.code,message:value.error.message,issues:value.error.details?.issues},null,2));continue;}
 if(value.evidence_id)console.log(value.evidence_id);
 console.log(typeof value.normalized_result==='string'?value.normalized_result:JSON.stringify(value.normalized_result??value,null,2));
}

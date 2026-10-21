import {readFile} from 'node:fs/promises';
export async function readInstructionEvidence(names,{directory='analysis/scene/results'}={}) {
 const evidence=await Promise.all(names.map(async name=>{const reply=JSON.parse(await readFile(`${directory}/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(item=>item.type==='text').text);}));
 const instructions=evidence.flatMap(value=>value.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z][A-Z0-9]*(?:\.REP)?)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};}));
 return {evidence,instructions};
}

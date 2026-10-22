import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';

const sourcePath='src/race-update.mjs',source=await readFile(sourcePath,'utf8');
const {instructions,evidence}=await readInstructionEvidence(['310-race-step-parent-assembly.json'],{directory:'analysis/native-simulation/results'});
const bindings=new Map([...source.matchAll(/if \(id === '([0-9a-f]+)'\) return ([^;]+);/g)].map(match=>[Number(`0x${match[1]}`),match[2]]));
const calls=new Map();for(const instruction of instructions)if(instruction.op==='CALL'&&/^0x[0-9a-f]+$/i.test(instruction.args[0])) {
 const target=Number(instruction.args[0]);if(!calls.has(target))calls.set(target,[]);calls.get(target).push(`0x${instruction.address.toString(16)}`);
}
for(const target of bindings.keys())assert(calls.has(target),`default0x${target.toString(16)} must be a real direct callee`);
assert.equal(calls.size,42);
const directCallees=[...calls].map(([target,sites])=>({address:`0x${target.toString(16)}`,callSites:sites,status:bindings.has(target)?'actual JavaScript default; transitive closure is separately scoped':'required explicit game handler',defaultExpression:bindings.get(target)??null}));
const report={method:'Static ownership inventory for the42 distinct direct game callees in retained450e50 assembly, reconciled against actual id-dispatch defaults in src/race-update.mjs. Source text matching identifies bindings only; it proves neither executed coverage nor transitive game-callee/producer closure. Every missing default remains a required reached handler. The final SoundManager indirect virtual5c now defaults to actual4a90e0 raw master-level storage when the original target is established; optional overrides are probes and unknown targets throw. This indirect default is outside the42 direct-call binding count. Broader indirect targets and whole-game procedure ownership remain open.',evidence:evidence.map(item=>item.evidence_id),source:{path:sourcePath,sha256:createHash('sha256').update(source).digest('hex')},directGameCallees:directCallees.length,actualDefaults:bindings.size,explicitGameHandlers:calls.size-bindings.size,directCallees};
const output=process.argv[2]??'analysis/race-update-ownership.json';await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({output,directGameCallees:report.directGameCallees,actualDefaults:report.actualDefaults,explicitGameHandlers:report.explicitGameHandlers}));

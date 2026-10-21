// Sequential retained-instruction checks; no installed executable execution.
import {readdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const tools=(await readdir('tools')).filter(name=>/^verify-.*-instructions\.mjs$/.test(name)).sort();
const variants=[{tool:'verify-race-completion-instructions.mjs',args:['--bookkeeping']},{tool:'verify-race-completion-instructions.mjs',args:['--bookkeeping','--replay']},{tool:'verify-finish-messages-instructions.mjs',args:['--localization']},{tool:'verify-finish-messages-instructions.mjs',args:['--source-rows']}];
const results=[];
for(const {tool,args=[]}of [...tools.map(tool=>({tool})),...variants]){
 const run=spawnSync(process.execPath,[`tools/${tool}`,...args],{encoding:'utf8',windowsHide:true,timeout:360000,maxBuffer:20*1024*1024});
 results.push({tool,args,exitCode:run.status??-1});
 if(run.status!==0)console.error(`${tool} ${args.join(' ')} failed\n${run.error?.message??''}\n${run.stderr}\n${run.stdout}`);
}
const report={method:'Sequential full retained-instruction tool sweep plus explicitly listed connected-chain/localization variants on the same shared interpreter. Every check retains its own arithmetic/callee/fixture boundary; aggregate passing does not establish whole-game completeness.',tools:tools.length,checks:results.length,passed:results.filter(value=>value.exitCode===0).length,results};
await writeFile('analysis/native-instruction-suite.json',JSON.stringify(report,null,2));console.log(`${report.passed}/${report.checks} checks across${report.tools} tools passed.`);if(report.passed!==report.checks)process.exitCode=1;

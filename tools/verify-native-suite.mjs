// Sequential retained-instruction checks; no installed executable execution.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const tools=(await readdir('tools')).filter(name=>/^verify-.*-instructions\.mjs$/.test(name)).sort();
const output=process.argv.slice(2).find(arg=>!arg.startsWith('--'))??'analysis/native-instruction-suite.json',withNode=process.argv.includes('--with-node');
async function referenceSnapshot(){
 const paths=['tools/verify-native-suite.mjs'];
 for(const directory of ['src','tools/lib','tests'])for(const name of await readdir(directory,{recursive:true}))if(/\.(?:mjs|json)$/.test(name))paths.push(`${directory}/${name.replaceAll('\\','/')}`);
 for(const name of (await readdir('tools')).filter(name=>/^verify-.*-instructions\.mjs$/.test(name)))paths.push(`tools/${name}`);
 const hash=createHash('sha256');for(const filename of paths.sort()){hash.update(filename);hash.update('\0');hash.update(await readFile(filename));hash.update('\0');}
 return {files:paths.length,sha256:hash.digest('hex')};
}
async function evidenceSnapshot(){
 const paths=[];
 for(const directory of ['analysis/scene/results','analysis/native-simulation/results'])for(const name of await readdir(directory))if(name.endsWith('.json'))paths.push(`${directory}/${name}`);
 for(const name of await readdir('analysis'))if(/listing\.json$/.test(name))paths.push(`analysis/${name}`);
 const hash=createHash('sha256');for(const filename of paths.sort()){hash.update(filename);hash.update('\0');hash.update(await readFile(filename));hash.update('\0');}
 return {files:paths.length,sha256:hash.digest('hex')};
}
const snapshotBefore=await referenceSnapshot();
const evidenceBefore=await evidenceSnapshot();
const variants=[{tool:'verify-race-update-instructions.mjs',args:['--actual-audio']},{tool:'verify-race-completion-instructions.mjs',args:['--bookkeeping']},{tool:'verify-race-completion-instructions.mjs',args:['--bookkeeping','--replay']},{tool:'verify-finish-messages-instructions.mjs',args:['--localization']},{tool:'verify-finish-messages-instructions.mjs',args:['--source-rows']},
 {tool:'verify-camera-update-instructions.mjs',args:['204','--boundaries']},
 {tool:'verify-camera-update-instructions.mjs',args:['204','--outer']},
 {tool:'verify-camera-update-instructions.mjs',args:['204','--outer','--boundaries']},
 {tool:'verify-race-startup-instructions.mjs',args:['800','--connected']},
 {tool:'verify-sound-manager-shutdown-instructions.mjs',args:['900','--outer']}];
const results=[];
const preservedReportTools=new Map([['verify-wormhole-targeting-instructions.mjs','wormhole-targeting'],['verify-root-name-discovery-instructions.mjs','root-name-discovery']]);
const toolRuns=tools.map(tool=>({tool,args:preservedReportTools.has(tool)?['--output',output.replace(/\.json$/,'')+'-'+preservedReportTools.get(tool)+'.json']:[]}));
for(const {tool,args=[]}of [...toolRuns,...variants]){
 const run=spawnSync(process.execPath,[`tools/${tool}`,...args],{encoding:'utf8',windowsHide:true,timeout:360000,maxBuffer:20*1024*1024});
 results.push({tool,args,exitCode:run.status??-1});
 console.log(`${tool}${args.length?' '+args.join(' '):''}: ${run.status===0?'PASS':'FAIL'}`);
 if(run.status!==0)console.error(`${tool} ${args.join(' ')} failed\n${run.error?.message??''}\n${run.stderr}\n${run.stdout}`);
}
let nodeTests=null;
if(withNode){
 const run=spawnSync(process.execPath,['--test'],{encoding:'utf8',windowsHide:true,timeout:360000,maxBuffer:20*1024*1024}),logPath=output.replace(/\.json$/, '')+'-node-tests.txt';
 await writeFile(logPath,(run.stdout??'')+(run.stderr??''),{flag:'wx'});nodeTests={exitCode:run.status??-1,logPath,error:run.error?.message??null,summary:(run.stdout??'').split(/\r?\n/).filter(line=>/^(?:#|\u2139) (?:tests|pass|fail|duration_ms) /.test(line))};
 console.log(`node --test: ${run.status===0?'PASS':'FAIL'} (${logPath})`);if(run.status!==0)console.error(nodeTests.error??(run.stderr??'').slice(-4000));
}
const snapshotAfter=await referenceSnapshot(),evidenceAfter=await evidenceSnapshot(),unchanged=snapshotBefore.sha256===snapshotAfter.sha256&&evidenceBefore.sha256===evidenceAfter.sha256;
const report={method:'Sequential full retained-instruction tool sweep plus explicitly listed connected-chain/localization variants and optional full Node suite. Before/after snapshots hash reference sources, literal JSON tables, shared libraries, tests and discoverable instruction checkers, plus every retained native/scene reply and Listing manifest used by dynamic native-program assembly. Any source/test/evidence change requires a fresh sweep. Every check retains its own arithmetic/callee/fixture boundary; aggregate passing does not establish whole-game completeness.',snapshotBefore,snapshotAfter,evidenceBefore,evidenceAfter,unchanged,nodeTests,tools:tools.length,checks:results.length,passed:results.filter(value=>value.exitCode===0).length,results};
await writeFile(output,JSON.stringify(report,null,2),output==='analysis/native-instruction-suite.json'?{}:{flag:'wx'});console.log(`${report.passed}/${report.checks} checks across${report.tools} tools passed; reference/test/evidence snapshots ${unchanged?'unchanged':'CHANGED'}.`);if(report.passed!==report.checks||!unchanged||(nodeTests&&nodeTests.exitCode!==0))process.exitCode=1;

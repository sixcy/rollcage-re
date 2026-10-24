import {readFile,writeFile} from 'node:fs/promises';
const [output,input='analysis/scenery-editor-suite-20261024-v1.log']=process.argv.slice(2);
if(!output)throw Error('Usage: node tools/audit-test-baseline.mjs NEW_REPORT.json [RETAINED_LOG]');
const log=await readFile(input,'utf8'),tail=log.slice(log.indexOf('✖ failing tests:')),failures=[];
for(const block of tail.split(/\r?\ntest at /).slice(1)){
 const lines=block.split(/\r?\n/),file=lines[0].replace(/:\d+:\d+$/,'').replaceAll('\\','/'),error=lines.find(l=>/^  (?:Error|AssertionError)/.test(l))?.trim()??'See retained log';
 const category=/Unadmitted aligned vector move/.test(block)?'instruction-interpreter vector admission':/Unobserved native global/.test(block)?'native global/alias admission':/generated standalone|standalone object page/.test(block)?'generated page freshness':/audio|sound|emitter|stream|recovery/.test(file)?'audio/recovery source-or-oracle regression':'native capture/replay regression';
 failures.push({file,test:lines.find(l=>l.startsWith('✖ ')),error,category});
}
const counts={};for(const f of failures)counts[f.category]=(counts[f.category]??0)+1;
const report={input,scope:'Classification of retained 2026-10-24 failures, not a rerun or evidence that every failure persists. Generated pages and focused editor results are checked separately.',summary:log.split(/\r?\n/).filter(l=>/^ℹ (tests|pass|fail) /.test(l)),counts,failures};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({summary:report.summary,counts,failures:failures.length,output}));

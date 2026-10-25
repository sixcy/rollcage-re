// Fast editor regression group: no game launch, installed-file writes or native
// instruction sweeps. Each invocation retains its own report directory.
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const [output]=process.argv.slice(2);
if(!output)throw Error('Usage: node tools/check-editor.mjs NEW_REPORT_DIRECTORY');
await mkdir(output);
const tests=['archive-write','pickup-editor','pickup-editor-capacity','pickup-editor-download','pickup-picking','pickup-editor-ui-state','scenery-editor','scenery-assemblies','scenery-assembly-lifecycle','scenery-collision-info','model-collision-preview','terrain-editor','speed-pad-patterns','race-layout-editor','race-route-topology','checkpoint-topology','special-scenery-editor','scripted-scenery-editor','track-editor-legacy-script-project','track-editor-project','track-editor-v5','track-editor-migration','track-editor-ui-state','track-viewer','object-viewer','object-viewer-export'];
tests.push('editor-protection','texture-page-word','scene','track-games','spline-road','terrain-construction','spline-road-textures','track-editor-v6-spline','generated-road-route','track-reversal','reversed-track-runtime-evidence','reversal-preview','track-paths','track-path-connectivity');
const run=spawnSync(process.execPath,['--test',...tests.map(n=>`tests/${n}.test.mjs`)],{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
await writeFile(`${output}/tests.log`,(run.stdout??'')+(run.stderr??''),{flag:'wx'});
const report={passed:run.status===0,exitCode:run.status,error:run.error?.message,tests,scope:'Focused editor/asset/page checks; no native process or whole-repository green claim.'};
await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;

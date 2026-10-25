// Summarize already completed, independently scoped checks. Never launches a game.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [output]=process.argv.slice(2);if(!output)throw Error('Usage: node tools/check-editor-v5-delivery.mjs NEW_REPORT.json');
const files=[
  'analysis/editor-v5-focused-20261025-v3/report.json',
  'analysis/route-topology-editor-matrix-20261025-v2.json',
  'analysis/checkpoint-topology-matrix-20261025-v2.json',
  'analysis/scenery-assembly-corpus-20261025-v5b.json',
  'analysis/speed-pad-patterns-matrix-20261025-v2.json',
  'analysis/editor-v5-combined-matrix-20261025-v2.json',
  'analysis/terrain-editor-browser-v5-20261025-v2/report.json',
  'analysis/topology-editor-browser-20261025-v6/report.json',
  'analysis/assembly-editor-viewer-20261025-v5c/report.json',
  'analysis/speed-pad-browser-20261025-v2/report.json',
  'analysis/race-layout-editor-v5-browser-20261025-v1/report.json',
  'analysis/special-scenery-browser-v5-20261025-v2/report.json',
  'analysis/scenery-editor-browser-v5-20261025-v2/report.json',
  'analysis/native-topology-assembly-low-acceptance-20261025-v1.json',
  'analysis/native-topology-assembly-high-acceptance-20261025-v1.json',
  'analysis/native-editor-lifecycle-low-off-acceptance-20261025-v3c.json',
  'analysis/native-editor-lifecycle-low-on-acceptance-20261025-v3b.json'
];
const reports=[];
for(const file of files){const bytes=await readFile(file),report=JSON.parse(bytes);assert.equal(report.passed??report.matched,true,file);reports.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),passed:true,authority:report.authority??report.scope??report.evidenceScope??report.evidence});
  if(file.includes('native-topology-assembly-')){assert.equal(report.files.length,171);assert.ok(report.files.every(f=>f.sourceUnchanged));assert.equal(report.topologyChecks.length,2);}
  if(report.profile==='editor-lifecycle'){assert.equal(report.sourceFilesVerified,171);assert.equal(report.cleanupObserved,true);assert.equal(report.proof.lapObserved,true);assert.equal(report.proof.independentDamageObserved,true);assert.equal(report.proof.allAttachmentOwnersReleased,true);assert.ok(report.proof.pads.length);assert.equal(report.proof.timing.length>0,report.proof.timingEnabled);}
}
const result={passed:true,scope:'Approved existing-track route/checkpoint topology, supported same-track assemblies, original arrow patterns and project v5 delivery. Source/browser/corpus and selected original-process evidence are distinct; no native full-race parity claim.',reports,limits:['256 points/group and 31 usable groups; blocked route-group cloning rejected.','LEV12/13 native hardcoded checkpoint stage rules keep topology locked; plane transforms and timing remain supported.','Native runtime examples are LEV1 LOW; LOW/HIGH initialization is verified.','LEV16/17 remain editable without fabricated AI paths.','Scripted assembly cloning, Blender imports and arbitrary new terrain topology are excluded.']};
await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,reports:reports.length,output}));

import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeFrameSnapshots,compareNativeFramePair} from './check-native-frame-replay.mjs';
import {traceNativeFrameDispatches} from './lib/native-frame-event-trace.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export async function traceNativeFrameEvents(input,output) {
  const capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256}),configuration=JSON.parse(await readFile(path.join(input,'configuration.json'),'utf8')),pairing=pairNativeFrameSnapshots(capture,configuration),frames=[];
  for(const pair of pairing.pairs){
    const replay=traceNativeFrameDispatches(pair.before,pair.options),comparison=compareNativeFramePair(pair,replay),categories={};
    for(const event of replay.dispatchEvents){const category=event.classification.category;categories[category]=(categories[category]??0)+1;}
    frames.push({beforeOrdinal:pair.before.ordinal,afterOrdinal:pair.after.ordinal,clock:pair.before.ranges.get('clock').bytes.readUInt32LE(),matched:comparison.matched,firstDivergence:comparison.firstDivergence,processedEvents:replay.report.processedEvents,modelQueries:replay.report.modelQueries,categories,events:replay.dispatchEvents});
  }
  const report={schemaVersion:1,authority:'source-dispatch-trace-from-original-native-frame-input',matched:frames.every(row=>row.matched),frames,
    limits:['Before/after records observe source474bb0 calls from captured native frame inputs; direct native dispatcher snapshots are a separate comparison.','Terrain-border labels require matching actual cell IDs and candidate normals of native type6/7; merged/edge cases remain unresolved.','No original game is launched and no captured state is modified.']};
  await writeFile(output,`${JSON.stringify(report,null,2)}\n`,{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const[input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node tools/trace-native-frame-events.mjs CAPTURE_DIRECTORY NEW_REPORT_FILE');
  const report=await traceNativeFrameEvents(input,output);console.log(JSON.stringify({matched:report.matched,frames:report.frames.map(row=>({clock:row.clock,processedEvents:row.processedEvents,categories:row.categories})),output}));if(!report.matched)process.exitCode=1;
}

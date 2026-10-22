import assert from 'node:assert/strict';
import {writeFile, readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {verifyRaceHudFonts} from './verify-race-hud-fonts-instructions.mjs';
import {setupActualTextureRenderer} from './lib/actual-texture-renderer-fixtures.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRaceHudRenderer({fixtures = 4, mipmaps = true, withLayout = false, traceAddress, output = 'analysis/race-hud-renderer-connected-instruction-check.json'} = {}) {
  let rendererAcquisitions = 0, rendererUploads = 0, platformTransfers = 0; const actualRendererVisits = {}; let sourceTrace, nativeTrace, baseInstruction;
  const report = await verifyRaceHudFonts({fixtures, mipmaps, withLayout, traceAddress, memoryBytes: 0x1000000, output: null, async setupFixture({memory, machine, runtime, source, native, entryRegisters, addSteps, addCall}) {
    baseInstruction ??= machine.onInstruction;
    ({sourceTrace,nativeTrace}=await setupActualTextureRenderer({memory,machine,runtime,entryRegisters,addSteps,addCall,instructionObserver:baseInstruction,actualRendererVisits}));
  }, afterFixture() {assert.deepEqual(sourceTrace,nativeTrace); platformTransfers += sourceTrace.filter(([,method])=>method===0x34).length;}});
  report.method = 'Installed FONT_BMP→actual font/HUD algorithms→408680→real5208d0 texture/index pools and520940/51ff30/51fb10 upload/commit, with real image workers. Actual128-record texture+integer pool constructors. Only CRT/STL/Win32 and declared Direct3D COM objects are services in reached paths; all mapped bytes>=10000h, ordered services and complete platform pixel storage compare. No original process/device execution; uncommon image formats, arbitrary callbacks and full renderer bootstrap remain separately scoped.';
  rendererAcquisitions=actualRendererVisits['5208d0']??0;rendererUploads=actualRendererVisits['520940']??0;
  Object.assign(report,{rendererAcquisitions,rendererUploads,platformTransfers,actualRendererVisits});
  if(output){try{await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(JSON.parse(await readFile(output,'utf8')),report);}} return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyRaceHudRenderer()));

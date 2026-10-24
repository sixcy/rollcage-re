import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createNativePickupEditorValidationConfig} from '../tools/prepare-native-pickup-editor-validation.mjs';
import {sceneryFixture} from './lib/scenery-fixture.mjs';

test('terrain native observer validates bounded read-only spans and rejects malformed policies without game execution',{skip:process.platform!=='win32'},async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'rollcage-terrain-policy-')),data=sceneryFixture().geometry;data[0xf7]=1;data[0x94]=1;data.writeUInt32LE(0x1480,0x90);
 const config=createNativePickupEditorValidationConfig(root,{kind:'baseline',quality:'LOW',compiledData:data,indexSha256:'a'.repeat(64),imageSha256:'b'.repeat(64)});config.terrainEditorObservation={spans:[{id:'terrain-probe',offset:0x1240,length:6,expectedHex:data.subarray(0x1240,0x1246).toString('hex')}],requireContact:true,allowedCellRefs:[0]};config.breakpoints.push({id:'pickup-terrain-contact',rva:'0x25e2b',ranges:[]});
 const filename=path.join(root,'policy.json');await writeFile(filename,JSON.stringify(config),{flag:'wx'});
 const quote=s=>"'"+s.replaceAll("'","''")+"'",script=`$ErrorActionPreference='Stop'; & ${quote(path.resolve('tools/native-terrain-editor-capture.ps1'))} -CompileOnly; Add-Type -AssemblyName System.Web.Extensions; $serializer=New-Object System.Web.Script.Serialization.JavaScriptSerializer; $json=[IO.File]::ReadAllText(${quote(filename)}); $policy=$serializer.Deserialize($json,[RollcageTerrainEditor.Options]); [RollcageTerrainEditor.NativeDebugger]::ValidatePickupEditorPolicy($policy); $rejected=0; foreach($kind in @('outside','length','hex','extra-site','missing-contact-cells')) { $p=$serializer.Deserialize($json,[RollcageTerrainEditor.Options]); switch($kind) {'outside'{$p.terrainEditorObservation.spans[0].offset=$p.pickupEditorObservation.resourceBytes} 'length'{$p.terrainEditorObservation.spans[0].length=65} 'hex'{$p.terrainEditorObservation.spans[0].expectedHex='00'} 'extra-site'{$p.breakpoints[12].rva='0x25e2c'} 'missing-contact-cells'{$p.terrainEditorObservation.allowedCellRefs=@()}}; try {[RollcageTerrainEditor.NativeDebugger]::ValidatePickupEditorPolicy($p)} catch {$rejected++;continue}; throw "Policy mutation accepted: $kind" }; if($rejected -ne 5){throw 'Missing rejection'}; Write-Output 'Five invalid policies rejected; no target executed.'`;
 const run=spawnSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-Command',script],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/Five invalid policies rejected/);
});

import {verifyVehicleWeaponLaunch} from './verify-vehicle-weapon-launch-instructions.mjs';
await verifyVehicleWeaponLaunch({scenarios:Number(process.argv[2]??600),stageFrames:Number(process.argv[3]??16),terrainPrefix:process.argv[4]!=='empty',output:process.argv[4]==='empty'?'analysis/race-weapon-stage-empty-candidate-instruction-check.json':'analysis/race-weapon-stage-instruction-check.json'});

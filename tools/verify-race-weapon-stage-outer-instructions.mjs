import {verifyVehicleWeaponLaunch} from './verify-vehicle-weapon-launch-instructions.mjs';
await verifyVehicleWeaponLaunch({scenarios:Number(process.argv[2]??600),stageFrames:Number(process.argv[3]??16),terrainPrefix:true,outerRace:true,output:'analysis/race-weapon-stage-outer-instruction-check.json'});

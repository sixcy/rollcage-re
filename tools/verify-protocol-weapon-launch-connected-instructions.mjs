import {verifyVehicleWeaponLaunch} from './verify-vehicle-weapon-launch-instructions.mjs';
await verifyVehicleWeaponLaunch({scenarios:Number(process.argv[2]??1200),protocolItem:true,output:'analysis/protocol-weapon-launch-connected-instruction-check.json'});

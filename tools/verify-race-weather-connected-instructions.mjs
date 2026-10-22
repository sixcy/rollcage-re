import {verifyWeatherUpdate} from './verify-weather-update-instructions.mjs';
console.log(JSON.stringify(await verifyWeatherUpdate({withRaceUpdate: true, output: 'analysis/race-weather-connected-instruction-check.json'})));

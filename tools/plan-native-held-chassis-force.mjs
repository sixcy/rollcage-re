import {prepareHeldForceDecision,waitForHeldForceRequest} from './lib/native-held-force.mjs';
const [directory,wait] = process.argv.slice(2);
if (!directory || process.argv.length>4 || wait!==undefined&&wait!=='--wait') throw Error('Usage: node tools/plan-native-held-chassis-force.mjs CAPTURE_DIRECTORY [--wait]');
if(wait)await waitForHeldForceRequest(directory);
console.log(JSON.stringify(await prepareHeldForceDecision(directory)));

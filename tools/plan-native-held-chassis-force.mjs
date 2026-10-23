import {prepareHeldForceDecision} from './lib/native-held-force.mjs';
const [directory] = process.argv.slice(2);
if (!directory || process.argv.length !== 3) throw Error('Usage: node tools/plan-native-held-chassis-force.mjs CAPTURE_DIRECTORY');
console.log(JSON.stringify(await prepareHeldForceDecision(directory)));

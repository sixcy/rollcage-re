import {pathToFileURL} from 'node:url';
import {verifyApplicationViewportCreation} from './verify-application-viewport-creation-instructions.mjs';
export const verifyRaceViewports = ({fixtures = 600, output = 'analysis/race-viewports-instruction-check.json'} = {}) => verifyApplicationViewportCreation({fixtures, parent: true, output});
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyRaceViewports({fixtures: Number(process.argv[2] ?? 600)})));

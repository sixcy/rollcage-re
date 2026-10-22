import {pathToFileURL} from 'node:url';
import {verifyRendererDeviceSelection} from './verify-renderer-device-selection-instructions.mjs';
export const verifyRendererDeviceSelectionErrors = ({fixtures = 600, output = 'analysis/renderer-device-selection-errors-instruction-check.json'} = {}) => verifyRendererDeviceSelection({fixtures, failure: true, output});
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyRendererDeviceSelectionErrors({fixtures: Number(process.argv[2] ?? 600)})));

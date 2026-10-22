import path from 'node:path';
import policies from './redux-capture-scenarios.json' with {type: 'json'};

export const reduxCaptureScenarios = Object.freeze(['post-crt', 'hidden-device-boundary', 'hidden-idle']);

// Policies are copied from retained successful native runs. All game execution
// uses the isolated installation; each requested run must have a new output.
export function createReduxCaptureConfig(directory, scenario = 'post-crt', outputDirectory = path.join(directory, `${scenario}-capture`)) {
  if (!reduxCaptureScenarios.includes(scenario)) throw Error('Unknown Redux capture scenario.');
  const root = path.resolve(directory), documents = path.join(root, 'documents');
  return {...structuredClone(policies.scenarios[scenario]),
    executablePath: path.join(root, 'installation', 'Direct3D', 'Rollcage Redux.exe'),
    workingDirectory: path.join(root, 'installation', 'Direct3D'),
    outputDirectory: path.resolve(outputDirectory), redirectedDocumentsPath: documents,
    redirectedShellFolderPath: documents, temporaryDirectory: path.join(root, 'temp')};
}

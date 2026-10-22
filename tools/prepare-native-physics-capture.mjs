import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, readdir, realpath, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReduxCaptureConfig, reduxCaptureScenarios} from './lib/redux-capture-config.mjs';

export const REDUX_SHA256 = 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Copies the installation; never launches a process or writes installed data.
export async function prepareNativePhysicsCapture(installation, outputDirectory) {
  const source = await realpath(installation), requested = path.resolve(outputDirectory);
  const destination = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  const relative = path.relative(source, destination);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw Error('Capture output must be outside the installation.');
  const executable = path.join(source, 'Direct3D', 'Rollcage Redux.exe');
  if (hash(await readFile(executable)) !== REDUX_SHA256) throw Error('Expected Rollcage Redux 1.3.8.0 executable hash.');
  // Exclusive directory creation deliberately refuses existing or partial runs.
  await mkdir(destination);
  const copiedRoot = path.join(destination, 'installation'), documents = path.join(destination, 'documents'), temporaryDirectory = path.join(destination, 'temp');
  await mkdir(copiedRoot); await mkdir(documents); await mkdir(temporaryDirectory);
  const files = [];
  async function copyDirectory(directory, target) {
    for (const entry of (await readdir(directory, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
      const from = path.join(directory, entry.name), to = path.join(target, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Refusing installation link: ${from}`);
      if (entry.isDirectory()) {await mkdir(to); await copyDirectory(from, to);}
      else if (entry.isFile()) {
        const before = hash(await readFile(from));
        await copyFile(from, to, constants.COPYFILE_EXCL);
        const copied = await readFile(to), after = hash(await readFile(from));
        if (before !== after || hash(copied) !== before) throw Error(`Source changed or copy mismatch: ${from}`);
        files.push({path: path.relative(source, from).split(path.sep).join('/'), length: copied.length, sha256: before});
      } else throw Error(`Unsupported installation entry: ${from}`);
    }
  }
  await copyDirectory(source, copiedRoot);
  const configuration = createReduxCaptureConfig(destination);
  const manifest = {schemaVersion: 1, target: {name: 'Rollcage Redux.exe', version: '1.3.8.0', sha256: REDUX_SHA256}, source, destination,
    method: 'Exclusive byte-for-byte installation copy; source hashes checked before and after copying. No target execution.',
    limits: ['Capture configuration is a startup/race-entry probe, not a physics fidelity verdict.', 'Personal-folder redirection and denied registry writes are declared interventions outside physics.', 'Legacy Documents and AppData shell outputs share the isolated folder; child music/restart processes are denied.', 'Debugger pauses cannot establish original wall-clock cadence.', 'No simulation inputs or physics values are overridden.'], files};
  await writeFile(path.join(destination, 'installation-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'});
  await writeFile(path.join(destination, 'capture-config.json'), `${JSON.stringify(configuration, null, 2)}\n`, {flag: 'wx'});
  const scenarios = {};
  for (const scenario of reduxCaptureScenarios) {
    const filename = path.join(destination, `${scenario}-config.json`);
    await writeFile(filename, `${JSON.stringify(createReduxCaptureConfig(destination, scenario), null, 2)}\n`, {flag: 'wx'});
    scenarios[scenario] = filename;
  }
  return {directory: destination, files: files.length, bytes: files.reduce((sum, file) => sum + file.length, 0), configuration: path.join(destination, 'capture-config.json'), scenarios};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [installation = 'C:/Program Files (x86)/Psygnosis/Rollcage', output] = process.argv.slice(2);
  if (!output) throw Error('Usage: node tools/prepare-native-physics-capture.mjs [installation] NEW_OUTPUT_DIRECTORY');
  console.log(JSON.stringify(await prepareNativePhysicsCapture(installation, output)));
}

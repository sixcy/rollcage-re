import {constants, createReadStream} from 'node:fs';
import {copyFile, mkdir, open, readFile, readdir, lstat, realpath, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {buildEditedArchive} from '../src/archive-write.mjs';
import {compilePickupEdits, parsePickupPlacements, validatePickupProject} from '../src/pickup-editor.mjs';
import {getGame} from '../src/track-games.mjs';
import {createReduxCaptureConfig} from './lib/redux-capture-config.mjs';
import {controlledRaceSettingsBreakpoint} from './lib/native-controlled-race-settings.mjs';

const targetSha256 = 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5';
const projectSha256 = '72993e902384717274677235c81c1ef77fe17ea3d957ecaec6aafaaa2fa72172';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const archiveNames = ['IDXData/Rollcage.idx', 'IDXData/Rollcage.img'];
const sites = [['pickup-loader-entry', '0x4c2b0'], ['pickup-init-entry', '0x7b580'], ['pickup-init-return', '0x319e6'], ['pickup-first-tick', '0x7b680'], ['pickup-collection-before', '0x7b8d0'], ['pickup-collection-after', '0x7b8da'], ['pickup-respawn-before', '0x7caf0'], ['pickup-respawn-after', '0x7cc17']];

async function fileHash(filename) {
  const digest = createHash('sha256'); let length = 0;
  for await (const chunk of createReadStream(filename)) {digest.update(chunk); length += chunk.length;}
  return {length, sha256: digest.digest('hex')};
}
function contained(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}
async function absent(filename) {
  try {await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return; throw error;}
  throw Error(`Refusing existing output: ${filename}`);
}
async function originalFiles(root, expected) {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error('Installation symlinks are not accepted.');
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile()) found.push(path.relative(root, filename).replaceAll('\\', '/'));
      else throw Error('Unsupported installation entry.');
    }
  }
  await walk(root);
  if (found.length !== expected.length || expected.some(row => !found.includes(row.path))) throw Error('Pristine installation file census differs from manifest.');
  for (const row of expected) {
    if (!contained(root, path.resolve(root, row.path))) throw Error('Manifest path escapes installation.');
    const actual = await fileHash(path.join(root, row.path));
    if (actual.length !== row.length || actual.sha256 !== row.sha256) throw Error(`Pristine file mismatch: ${row.path}`);
  }
  return {count: found.length, bytes: expected.reduce((n, row) => n + row.length, 0), allMatched: true};
}

export function createNativePickupEditorValidationConfig(caseRoot, {kind, quality, compiledData, indexSha256, imageSha256, frontendLevel = 1}) {
  if (!['baseline', 'edited16', 'zero'].includes(kind) || !['LOW', 'HIGH'].includes(quality)) throw Error('Unknown pickup validation case.');
  const parsed = parsePickupPlacements(compiledData);
  if (parsed.count > 16 || kind === 'edited16' && parsed.count !== 16 || kind === 'zero' && parsed.count !== 0) throw Error('Pickup case count differs from declared scenario.');
  if (![indexSha256, imageSha256].every(value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value))) throw Error('Missing archive hash pins.');
  if (!Number.isInteger(frontendLevel) || frontendLevel < 1 || frontendLevel > 20 || compiledData.length < 0xf8 || compiledData[0xf7] < 1 || compiledData[0xf7] > 6) throw Error('Invalid frontend or independent controller count.');
  const authored = compiledData.subarray(parsed.offset, parsed.offset + parsed.count * 12);
  const headerIdentity = Buffer.concat([[0, 20], [0x2c, 4], [0x64, 4], [0x78, 4], [0x94, 4], [0xf4, 4]].map(([offset, length]) => compiledData.subarray(offset, offset + length)));
  const configuration = createReduxCaptureConfig(caseRoot, 'hidden-idle', path.join(caseRoot, 'capture'));
  configuration.ranges = []; configuration.breakpoints = configuration.breakpoints.slice(0, 3);
  configuration.breakpoints.push(controlledRaceSettingsBreakpoint(), ...sites.map(([id, rva]) => ({id, rva, ranges: []})));
  configuration.captureThreadEnvironment = true; configuration.maxDurationMs = 90000; configuration.maxEvents = 1000000; configuration.maxSnapshots = 80;
  configuration.controlledRaceSettings = {breakpointId: 'controlled-race-settings', level: frontendLevel, quality: quality === 'LOW' ? 0 : 1, expectedTrackByte: 0, expectedQualityByte: 1};
  configuration.pickupEditorObservation = {scenario: kind === 'edited16' ? 'cycle' : 'load', sceneName: `${quality}/LEV1.BLP`,
    resourceSha256: hash(compiledData), indexSha256, imageSha256, authoredHex: authored.toString('hex'), authoredSha256: hash(authored), headerIdentityHex: headerIdentity.toString('hex'),
    level: 1, frontendLevel, quality: quality === 'LOW' ? 0 : 1, expectedCount: parsed.count, expectedControllerCount: compiledData[0xf7], targetIndex: kind === 'zero' ? -1 : kind === 'edited16' ? 15 : 0,
    authoredOffset: parsed.offset, resourceBytes: compiledData.length};
  return configuration;
}

// Exclusive streaming output; never reads a whole IMG into host memory.
export async function writePickupArchiveParts(sourceImage, destinationImage, plan) {
  await absent(destinationImage);
  const source = await open(sourceImage, 'r'), destination = await open(destinationImage, 'wx');
  const digest = createHash('sha256'), scratch = Buffer.alloc(1024 * 1024); let position = 0;
  async function append(bytes) {
    let written = 0;
    while (written < bytes.length) {
      const result = await destination.write(bytes, written, bytes.length - written, position + written);
      if (!result.bytesWritten) throw Error('Short archive output write.');
      written += result.bytesWritten;
    }
    digest.update(bytes); position += bytes.length;
  }
  try {
    for (const part of plan.parts) {
      if (part instanceof Uint8Array) await append(part);
      else {
        if (!Number.isSafeInteger(part.offset) || !Number.isSafeInteger(part.length) || part.offset < 0 || part.length < 0) throw Error('Invalid original image part.');
        let consumed = 0;
        while (consumed < part.length) {
          const {bytesRead} = await source.read(scratch, 0, Math.min(scratch.length, part.length - consumed), part.offset + consumed);
          if (!bytesRead) throw Error('Short original image read.');
          await append(scratch.subarray(0, bytesRead)); consumed += bytesRead;
        }
      }
    }
    if (position !== plan.imageBytes) throw Error('Archive plan length mismatch.');
    return {length: position, sha256: digest.digest('hex')};
  } finally {await source.close(); await destination.close();}
}

export async function prepareNativePickupEditorValidation(destination, {baselineRoot = 'analysis/pickup-editor-native-baseline-20261024', projectPath = 'analysis/pickup-editor-level1-late-route-project-20261024.json'} = {}) {
  const output = path.resolve(destination), baseline = await realpath(baselineRoot), sourceRoot = await realpath(path.join(baseline, 'installation'));
  if (!contained(process.cwd(), output) || contained(sourceRoot, output) || contained(output, sourceRoot)) throw Error('Staging destination must be a new workspace directory outside pristine installation.');
  await absent(output);
  const originalManifest = JSON.parse(await readFile(path.join(baseline, 'installation-manifest.json'), 'utf8'));
  if (originalManifest.target.sha256 !== targetSha256 || originalManifest.files.length !== 171) throw Error('Unexpected pristine target/manifest.');
  const baselineBefore = await originalFiles(sourceRoot, originalManifest.files), projectBytes = await readFile(projectPath);
  if (hash(projectBytes) !== projectSha256) throw Error('Source forecast project hash differs from approved fixture.');
  let archive; const resources = [], cases = [];
  try {
    archive = await RollcageArchive.open(sourceRoot);
    const imagePath = path.join(sourceRoot, archiveNames[1]), imageSize = (await archive.file.stat()).size;
    for (const quality of ['LOW', 'HIGH']) {
      const track = getGame('rollcage').tracks.find(row => row.name === `${quality}/LEV1.BLP`), {data} = await archive.readResource(track.index);
      resources.push({quality, resourceIndex: track.index, data, sourceHash: hash(data)});
    }
    const project = validatePickupProject(projectBytes.toString('utf8'), {indexSha256: hash(archive.indexData), levels: [{level: 1, sourceHashes: {LOW: resources[0].sourceHash, HIGH: resources[1].sourceHash}, lowData: resources[0].data, highData: resources[1].data}]});
    await mkdir(output);
    for (const kind of ['baseline', 'edited16', 'zero']) {
      const compiled = resources.map(row => ({...row, compiledData: kind === 'baseline' ? Buffer.from(row.data) : compilePickupEdits(row.data, kind === 'zero' ? [] : project.levels[0].pickups)}));
      const replacements = new Map(kind === 'baseline' ? [] : compiled.map(row => [row.resourceIndex, row.compiledData]));
      const plan = buildEditedArchive(archive.indexData, imageSize, replacements);
      for (const resource of compiled) {
        const id = `${kind}-${resource.quality.toLowerCase()}`, caseRoot = path.join(output, id), installation = path.join(caseRoot, 'installation');
        await mkdir(caseRoot); await mkdir(installation); await mkdir(path.join(caseRoot, 'documents')); await mkdir(path.join(caseRoot, 'temp'));
        for (const row of originalManifest.files) {
          if (archiveNames.includes(row.path)) continue;
          const source = path.join(sourceRoot, row.path), target = path.join(installation, row.path);
          await mkdir(path.dirname(target), {recursive: true}); await copyFile(source, target, constants.COPYFILE_EXCL);
          const actual = await fileHash(target);
          if (actual.sha256 !== row.sha256 || actual.length !== row.length) throw Error(`Staged source copy mismatch: ${row.path}`);
        }
        await mkdir(path.join(installation, 'IDXData'), {recursive: true});
        const image = await writePickupArchiveParts(imagePath, path.join(installation, archiveNames[1]), plan);
        const index = {length: plan.index.length, sha256: hash(plan.index)};
        await writeFile(path.join(installation, archiveNames[0]), plan.index, {flag: 'wx'});
        const configuration = createNativePickupEditorValidationConfig(caseRoot, {kind, quality: resource.quality, compiledData: resource.compiledData, indexSha256: index.sha256, imageSha256: image.sha256});
        const configurationPath = path.join(caseRoot, 'capture-config.json');
        await writeFile(configurationPath, `${JSON.stringify(configuration, null, 2)}\n`, {flag: 'wx'});
        const files = originalManifest.files.map(row => ({...row, ...(row.path === archiveNames[0] ? index : row.path === archiveNames[1] ? image : {})}));
        const originalArchives = originalManifest.files.filter(row => archiveNames.includes(row.path));
        const changes = files.filter(row => originalManifest.files.find(source => source.path === row.path).sha256 !== row.sha256).map(row => ({path: row.path, original: originalManifest.files.find(source => source.path === row.path), staged: row}));
        if (changes.length !== (kind === 'baseline' ? 0 : 2)) throw Error('Unexpected staged installation change count.');
        const expected = {schemaVersion: 1, id, kind, sceneName: configuration.pickupEditorObservation.sceneName, preparedOnly: true, nativeExecutionPerformed: false,
          sourceRoot, sourceProject: {path: path.resolve(projectPath), sha256: projectSha256}, configurationPath, configurationSha256: hash(await readFile(configurationPath)),
          policy: configuration.pickupEditorObservation, originalArchives, archiveResourceChanges: plan.changes, installation: {root: installation, files, changes}};
        const expectedPath = path.join(caseRoot, 'expected.json'); await writeFile(expectedPath, `${JSON.stringify(expected, null, 2)}\n`, {flag: 'wx'});
        cases.push({id, kind, quality: resource.quality, root: caseRoot, configurationPath, expectedPath, index, image, expectedCount: configuration.pickupEditorObservation.expectedCount, scenario: configuration.pickupEditorObservation.scenario});
      }
    }
    const baselineAfter = await originalFiles(sourceRoot, originalManifest.files);
    const manifest = {schemaVersion: 1, method: 'Exclusive six-case isolated staging only. Pristine171-file installation verified before/after;169nonarchivefiles copied; fresh streamedIMG/IDX preserve original prefix and append only two uncompressed geometry replacements for edited/zero cases. No original execution.',
      targetSha256, baselineRoot: baseline, baselineManifestSha256: hash(await readFile(path.join(baseline, 'installation-manifest.json'))), baselineBefore, baselineAfter,
      sourceFiles: originalManifest.files, sourceProject: {path: path.resolve(projectPath), sha256: projectSha256}, cases,
      limits: ['Prepared configs and source forecast do not establish native load/collection/respawn.', 'Frontend level1 remains an explicit guarded input; actual native resource stem/header/table observations must match or fail without remapping/retry.', 'Baseline, edited16, zero and both qualities each use separate writable installation/document/temp directories.']};
    const manifestPath = path.join(output, 'manifest.json'); await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'});
    return {manifestPath, cases};
  } finally {await archive?.close();}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [destination] = process.argv.slice(2);
  if (!destination || process.argv.length > 3) throw Error('Usage: node tools/prepare-native-pickup-editor-validation.mjs NEW_STAGING_ROOT');
  const result = await prepareNativePickupEditorValidation(destination);
  console.log(JSON.stringify({manifestPath: result.manifestPath, cases: result.cases.map(row => ({id: row.id, configurationPath: row.configurationPath, expectedCount: row.expectedCount, scenario: row.scenario}))}));
}

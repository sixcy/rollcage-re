import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const [root, output, capture] = process.argv.slice(2);
if (!root || !output || !capture) throw Error('Usage: node tools/verify-native-capture-installation.mjs ISOLATED_ROOT NEW_REPORT_JSON CAPTURE_LABEL');
const manifest = JSON.parse(await readFile(path.join(root, 'installation-manifest.json'), 'utf8'));
const roots = [manifest.source, path.join(root, 'installation')], mismatches = [];
for (const file of manifest.files) {
  for (const directory of roots) {
    const filename = path.resolve(directory, file.path), relative = path.relative(path.resolve(directory), filename);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw Error('Capture manifest file escapes its installation root.');
    const bytes = await readFile(filename), actualSha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== file.length || actualSha256 !== file.sha256) mismatches.push({directory, path: file.path, expectedLength: file.length, actualLength: bytes.length, expectedSha256: file.sha256, actualSha256});
  }
}
const report = {target: manifest.target, files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.length, 0),
  allInstalledOriginalAndCopiedFilesMatch: mismatches.length === 0, afterCapture: capture,
  method: 'Post-run SHA-256 check of every manifest original installed file and corresponding copied path; redirected runtime files are separate.', mismatches};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
console.log(JSON.stringify({matched: !mismatches.length, files: report.files, output}));
if (mismatches.length) process.exitCode = 1;

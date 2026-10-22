import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const rollout = 'C:/Users/Cyril/.codex/sessions/2026/10/21/rollout-2026-10-21T16-24-04-01a15ed9-0a89-7d50-86ff-7ec0885d7211.jsonl';
const destination = 'src/game-diagnostics.mjs', target = 'C:/Users/Cyril/Documents/Rollcage RE/src/game-diagnostics.mjs';
let source, applied = [];
for (const line of (await readFile(rollout, 'utf8')).split('\n')) {
  if (!line.includes('game-diagnostics.mjs')) continue;
  const record = JSON.parse(line), item = record.payload;
  if (record.type !== 'response_item' || item?.type !== 'custom_tool_call' || item.name !== 'exec') continue;
  for (const match of item.input.matchAll(/tools\.apply_patch\(("(?:\\.|[^"\\])*")\)/g)) {
    const patch = JSON.parse(match[1]), lines = patch.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === `*** Add File: ${target}`) {
        assert.equal(source, undefined); const added = []; for (i++; i < lines.length && !lines[i].startsWith('*** '); i++) {assert(lines[i].startsWith('+')); added.push(lines[i].slice(1));} source = added.join('\n') + '\n'; i--; applied.push(item.id);
      } else if (lines[i] === `*** Update File: ${target}`) {
        assert.notEqual(source, undefined); i++;
        while (i < lines.length && !lines[i].startsWith('*** ')) {
          assert(lines[i].startsWith('@@')); const old = [], replacement = []; i++;
          while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('*** ')) {const text = lines[i]; if (text.startsWith(' ') || text.startsWith('-')) old.push(text.slice(1)); if (text.startsWith(' ') || text.startsWith('+')) replacement.push(text.slice(1)); i++;}
          const before = old.join('\n'), after = replacement.join('\n'); assert.equal(source.split(before).length, 2, `Ambiguous or stale hunk in ${item.id}`); source = source.replace(before, after);
        }
        i--; applied.push(item.id);
      }
    }
  }
}
assert(source); const hash = createHash('sha256').update(source).digest('hex'), snapshot = JSON.parse(await readFile('analysis/root-name-discovery-staged-source-snapshot-20261022.json', 'utf8')), expected = snapshot.files.find(f => f.path === destination).sha256;
assert.equal(hash, expected, 'Reconstructed bytes must match frozen original before restoration.');
await writeFile(destination, source);
console.log(JSON.stringify({restored: destination, bytes: Buffer.byteLength(source), sha256: hash, frozenHashMatched: true, appliedPatches: applied}));

import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
const sourcePath = 'src/race-startup.mjs', source = await readFile(sourcePath, 'utf8');
const own = await readInstructionEvidence(['2457-autonomous-initializer-dispatch-assembly.json'], {directory: 'analysis/native-simulation/results'});
const bindings = new Map([...source.matchAll(/if \(id === '([0-9a-f]+)'\) return ([^;]+);/g)].map(match => [Number(`0x${match[1]}`), match[2]]));
const calls = new Map(), library = new Map();
for (const instruction of own.instructions) if (instruction.op === 'CALL' && /^0x[0-9a-f]+$/i.test(instruction.args[0])) {
  const target = Number(instruction.args[0]), owner = [0x568a50, 0x5684da].includes(target) ? library : calls;
  if (!owner.has(target)) owner.set(target, []); owner.get(target).push(`0x${instruction.address.toString(16)}`);
}
for (const address of bindings.keys()) assert(calls.has(address), `default0x${address.toString(16)} must be a real direct game callee`);
assert.equal(calls.size, 49);
const directCallees = [...calls].map(([address, callSites]) => ({address: `0x${address.toString(16)}`, callSites, status: bindings.has(address) ? 'actual JavaScript default; transitive closure separately scoped' : 'required explicit game handler', defaultExpression: bindings.get(address) ?? null}));
const report = {method: 'Static inventory of49 distinct direct game callees in original47ea40, reconciled against its actual JavaScript dispatch defaults. Genuine CRT memset and unreachable compiler rangecheck are separately listed; indirect allocation is CRT malloc. Input-manager/device virtuals remain explicit and their game-adapter ownership must be traced. Source binding inventory proves neither execution nor transitive callee/producer/lifecycle closure.', evidence: own.evidence.map(e => e.evidence_id), source: {path: sourcePath, sha256: createHash('sha256').update(source).digest('hex')}, directGameCallees: calls.size, actualDefaults: bindings.size, explicitGameHandlers: calls.size - bindings.size, directCallees, directLibraryCalls: [...library].map(([address, callSites]) => ({address: `0x${address.toString(16)}`, callSites}))};
const output = process.argv[2] ?? 'analysis/race-startup-ownership.json'; await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'}); console.log(JSON.stringify({output, directGameCallees: calls.size, actualDefaults: bindings.size, explicitGameHandlers: calls.size - bindings.size}));

import {readFile, writeFile} from 'node:fs/promises';
import {comparePhysicsCaptures, loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';

const [referenceDirectory, candidateDirectory, policyFile, output] = process.argv.slice(2);
if (!referenceDirectory || !candidateDirectory || !policyFile || !output) throw Error('Usage: node tools/compare-physics-captures.mjs REFERENCE_DIRECTORY CANDIDATE_DIRECTORY POLICY_JSON NEW_REPORT_JSON');
const policy = JSON.parse(await readFile(policyFile, 'utf8'));
if (policy.schemaVersion !== 1 || !policy.expectedSha256) throw Error('Policy requires schemaVersion1 and expectedSha256.');
const [reference, candidate] = await Promise.all([loadPhysicsCapture(referenceDirectory, policy), loadPhysicsCapture(candidateDirectory, policy)]);
const report = {schemaVersion: 1, method: 'Ordered captured fields with explicit comparison policy; first divergence retained.', referenceDirectory, candidateDirectory, policy,
  referenceInterventions: reference.interventions, candidateInterventions: candidate.interventions,
  ...comparePhysicsCaptures(reference, candidate, policy.fields, policy)};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
console.log(JSON.stringify({matched: report.matched, comparedFields: report.comparedFields, firstDivergence: report.firstDivergence, output}));
if (!report.matched) process.exitCode = 1;

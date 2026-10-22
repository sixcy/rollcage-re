// Conservative whole-program worklist. References are not implementation claims.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';

const targetSHA256 = 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5';
const inventoryPath = 'analysis/native-simulation/results/181-native-procedure-inventory.json';
const output = process.argv[2] ?? 'analysis/redux-procedure-ownership-20261022.json';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const inventoryBytes = await readFile(inventoryPath);
const inventory = JSON.parse(inventoryBytes).structuredContent;
assert.equal(inventory.subject.digest.sha256, targetSHA256);
assert.equal(inventory.operation, 'list_procedures');
assert(Array.isArray(inventory.normalized_result));
const canonical = address => /^0x[0-9a-f]+$/i.test(address) ? `0x${Number(address).toString(16)}` : address;
const procedures = new Map(inventory.normalized_result.map(row => [canonical(row.address), {
  address: canonical(row.address), name: row.value, metadata: row.procedure,
  ownership: row.procedure.external ? 'external symbol; declared platform/library boundary' : 'unclassified local procedure',
  scopedBindings: [], candidateSourceReferences: [], retainedProcedures: [], directCallsInRetainedAssembly: []
}]));
assert.equal(procedures.size, inventory.normalized_result.length);

// Follow only provider-declared thunk targets, never symbol-name heuristics.
for (const procedure of procedures.values()) if (procedure.metadata.thunk) {
  const chain = [procedure.address], seen = new Set(chain);
  let current = procedure;
  while (current?.metadata.thunk && current.metadata.thunk_target) {
    const address = canonical(current.metadata.thunk_target);
    chain.push(address);
    if (seen.has(address)) break;
    seen.add(address);
    current = procedures.get(address);
  }
  const terminal = procedures.get(chain.at(-1));
  const externalTarget = terminal?.metadata.external ? {address: terminal.address, name: terminal.name} : null;
  procedure.forwarding = {chain, externalTarget, basis: 'retained Ghidra thunk metadata; native wrapper behavior is not separately proved by this classification'};
  if (externalTarget) procedure.ownership = 'provider-declared forwarding chain to external symbol';
}

const sources = new Map();
for (const name of (await readdir('src', {recursive: true})).filter(name => name.endsWith('.mjs')).sort()) {
  const path = `src/${name.replaceAll('\\', '/')}`, bytes = await readFile(path);
  sources.set(path, {text: bytes.toString('utf8'), sha256: digest(bytes)});
}
const candidateReferences = new Map();
for (const [path, source] of sources) for (const [line, text] of source.text.split(/\r?\n/).entries()) {
  // This deliberately includes comments and numeric constants: candidate only.
  for (const token of text.matchAll(/(?<![\da-z_])(?:0x)?([4-5][\da-f]{5})(?![\da-z_])/gi)) {
    const address = canonical(`0x${token[1]}`), references = candidateReferences.get(address) ?? [];
    if (!references.some(hit => hit.path === path && hit.line === line + 1)) references.push({path, line: line + 1});
    candidateReferences.set(address, references);
  }
}
for (const procedure of procedures.values()) procedure.candidateSourceReferences = candidateReferences.get(procedure.address) ?? [];

const startupAuditFlag = process.argv.indexOf('--startup-audit');
const startupAuditPath = startupAuditFlag < 0 ? 'analysis/race-startup-ownership-track-loader.json' : process.argv[startupAuditFlag + 1];
assert(startupAuditPath && !startupAuditPath.startsWith('--'), '--startup-audit requires a current binding inventory');
const auditPaths = ['analysis/race-update-ownership-audio-level.json', startupAuditPath];
const scopedAudits = [];
for (const path of auditPaths) {
  const bytes = await readFile(path), audit = JSON.parse(bytes), source = sources.get(audit.source.path);
  assert(source, `missing audited source ${audit.source.path}`);
  assert.equal(source.sha256, audit.source.sha256, `stale binding audit ${path}`);
  const imports = new Map();
  for (const match of source.text.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/([^']+)'/g)) {
    for (const entry of match[1].split(',')) {
      const [exportName, localName = exportName] = entry.trim().split(/\s+as\s+/);
      imports.set(localName, {module: `src/${match[2]}`, exportName});
    }
  }
  for (const callee of audit.directCallees) {
    const procedure = procedures.get(canonical(callee.address));
    assert(procedure, `callee missing from retained inventory: ${callee.address}`);
    if (!callee.defaultExpression) continue;
    const functionName = callee.defaultExpression.match(/^([a-zA-Z_$][\w$]*)\(/)?.[1], binding = imports.get(functionName);
    assert(binding, `unresolved source import: ${callee.defaultExpression}`);
    assert(sources.get(binding.module)?.text.match(new RegExp(`export\\s+function\\s+${binding.exportName}\\s*\\(`)), `missing exported function ${binding.module}:${binding.exportName}`);
    procedure.scopedBindings.push({callerSource: audit.source.path, auditPath: path, ...binding, callSites: callee.callSites});
    procedure.ownership = 'source default binding verified; transitive and execution scope remain separately qualified';
  }
  scopedAudits.push({path, sha256: digest(bytes), source: audit.source, actualDefaults: audit.actualDefaults, explicitGameHandlers: audit.explicitGameHandlers, evidence: audit.evidence});
}
for (const [address, module, exportName] of [['0x450e50', 'src/race-update.mjs', 'runRaceUpdate'], ['0x47ea40', 'src/race-startup.mjs', 'initializeRace']]) {
  assert(sources.get(module).text.includes(`export function ${exportName}(`));
  procedures.get(address).scopedBindings.push({module, exportName, role: 'audited parent orchestration; callee closure remains scoped'});
  procedures.get(address).ownership = 'source parent orchestration verified; transitive and execution scope remain separately qualified';
}

const evidenceIndexPath = 'analysis/native-evidence-index.json';
const evidenceIndexBytes = await readFile(evidenceIndexPath), evidenceIndex = JSON.parse(evidenceIndexBytes);
for (const file of evidenceIndex.files) {
  if (file.targetSHA256 !== targetSHA256 || file.toolError || file.error || !['procedure_assembly', 'procedure_pseudo_code'].includes(file.operation)) continue;
  const address = canonical(file.parameters?.procedure ?? ''), procedure = procedures.get(address);
  if (!procedure) continue;
  const bytes = await readFile(file.path);
  assert.equal(digest(bytes), file.sha256, `changed retained reply ${file.path}`);
  const reply = JSON.parse(bytes), evidence = reply.structuredContent ?? JSON.parse(reply.content.find(block => block.type === 'text').text);
  assert.equal(evidence.subject.digest.sha256, targetSHA256);
  procedure.retainedProcedures.push({path: file.path, evidenceId: file.evidenceId, operation: file.operation, sha256: file.sha256});
  if (file.operation === 'procedure_assembly' && typeof evidence.normalized_result === 'string') {
    for (const match of evidence.normalized_result.matchAll(/^(0x[\da-f]+):\s+CALL\s+(0x[\da-f]+)\s*$/gim)) {
      const site = canonical(match[1]), target = canonical(match[2]);
      if (!procedure.directCallsInRetainedAssembly.some(call => call.site === site && call.target === target)) procedure.directCallsInRetainedAssembly.push({site, target});
    }
  }
}
const listingManifests = [], additionalEntries = new Map();
async function retainInstructionEntry(path, evidenceId, address) {
  const indexed = evidenceIndex.files.find(file => file.path === path);
  assert(indexed && !indexed.toolError && !indexed.error);
  const bytes = await readFile(path);
  assert.equal(digest(bytes), indexed.sha256, `changed Listing entry reply ${path}`);
  const reply = JSON.parse(bytes), evidence = reply.structuredContent ?? JSON.parse(reply.content.find(block => block.type === 'text').text);
  assert.equal(evidence.subject.digest.sha256, targetSHA256);
  assert.equal(evidence.evidence_id, evidenceId);
  assert.equal(evidence.operation, 'inspect_native_instruction');
  assert.equal(canonical(evidence.normalized_result.address), address);
  assert.equal(evidence.normalized_result.status, 'decoded');
  return {path, sha256: indexed.sha256, evidenceId, normalized: evidence.normalized_result};
}
function addInstructionEntry(address, basis, firstInstruction) {
  if (procedures.has(address)) return;
  const row = additionalEntries.get(address) ?? {address, ownership: 'retained instruction entry absent from defined-procedure inventory; implementation ownership not established by this audit', candidateSourceReferences: candidateReferences.get(address) ?? [], bases: [], firstInstruction};
  row.bases.push(basis); additionalEntries.set(address, row);
}
for (const name of (await readdir('analysis')).filter(name => name.endsWith('listing.json')).sort()) {
  const path = `analysis/${name}`, bytes = await readFile(path), manifest = JSON.parse(bytes);
  assert.equal(manifest.targetSha256, targetSHA256);
  const address = canonical(manifest.entry), first = manifest.instructions[0];
  assert.equal(canonical(first.address), address);
  const entry = await retainInstructionEntry(first.file, first.evidenceId, address);
  if (first.bytes !== undefined) assert.equal(entry.normalized.bytes, first.bytes);
  const record = {path, sha256: digest(bytes), address, instructions: manifest.instructions.length, firstInstructionEvidence: {path: entry.path, evidenceId: entry.evidenceId, sha256: entry.sha256}};
  listingManifests.push(record); addInstructionEntry(address, {kind: 'explicit Listing manifest entry', ...record}, entry);
}
// This existing callback uses individual Listing replies rather than a root
// *listing.json manifest. Do not mistake every decoded instruction for a callee.
const callbackAddress = '0x46e470';
const callback = evidenceIndex.files.find(file => file.operation === 'inspect_native_instruction' && canonical(file.parameters?.address ?? '') === callbackAddress && !file.toolError && !file.error);
assert(callback, 'retained scripted-release callback instruction entry');
addInstructionEntry(callbackAddress, {kind: 'curated scripted-release callback entry; previously traced pointer installation in46e4e0 and source checks; not an exhaustive callback inventory'}, await retainInstructionEntry(callback.path, callback.evidenceId, callbackAddress));
const rows = [...procedures.values()], locals = rows.filter(row => !row.metadata.external);
const summary = {
  definedProcedures: rows.length, externalSymbols: rows.length - locals.length,
  localProcedures: locals.length, localThunks: locals.filter(row => row.metadata.thunk).length,
  localForwardersToExternal: locals.filter(row => row.forwarding?.externalTarget).length,
  scopedSourceBindings: locals.filter(row => row.scopedBindings.length).length,
  localProceduresWithoutScopedBinding: locals.filter(row => !row.scopedBindings.length).length,
  localProceduresWithUnclassifiedOwnership: locals.filter(row => !row.scopedBindings.length && !row.forwarding?.externalTarget).length,
  localProceduresWithCandidateSourceReferences: locals.filter(row => row.candidateSourceReferences.length).length,
  localProceduresWithRetainedAssembly: locals.filter(row => row.retainedProcedures.some(evidence => evidence.operation === 'procedure_assembly')).length,
  localProceduresWithRetainedPseudocode: locals.filter(row => row.retainedProcedures.some(evidence => evidence.operation === 'procedure_pseudo_code')).length,
  listingManifests: listingManifests.length, additionalInstructionEntries: additionalEntries.size
};
const report = {
  method: 'Conservative worklist for the complete retained Ghidra-defined procedure list of the selected Redux binary. Inventory completeness is limited to procedures Ghidra defined. External/thunk metadata is preserved verbatim; forwarding classifications follow only declared thunk-target chains to external symbols, without claiming a native wrapper-body proof. Only hash-current direct startup/update bindings and their two parents receive scoped source bindings. Other source address mentions are candidate references, not recovered implementations or ownership classifications. Retained assembly/pseudocode availability and literal direct calls do not prove executed coverage, complete bodies, indirect calls, relevance, transitive closure or whole-game completion. Unlisted/unidentified procedures and unresolved local ownership remain open. No completion percentage is inferred.',
  targetSHA256, inventory: {path: inventoryPath, sha256: digest(inventoryBytes), evidenceId: inventory.evidence_id},
  evidenceIndex: {path: evidenceIndexPath, sha256: digest(evidenceIndexBytes)}, scopedAudits,
  sourceSnapshot: [...sources].map(([path, source]) => ({path, sha256: source.sha256})), summary, procedures: rows,
  instructionEntryMethod: 'Separate explicit entry points from root Listing manifests plus one previously traced release callback. Entry metadata/identity/target/hash are checked against retained instruction replies. Body byte/branch validation remains in the corresponding Listing checkers. These are additional code-entry work items, not invented Ghidra procedures or a complete discovery of callbacks. Source mentions remain candidate references.',
  listingManifests, additionalInstructionEntries: [...additionalEntries.values()]
};
await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});
console.log(JSON.stringify({output, ...summary}));

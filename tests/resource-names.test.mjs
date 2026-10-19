import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResourceName, findResourceIndex, resourceMappings } from '../src/resource-names.mjs';

test('resource names use case-insensitive extension and path aliases', () => {
  assert.equal(normalizeResourceName('low__lev1_blp'), 'LOW/LEV1.BLP');
  assert.equal(findResourceIndex('low\\lev1.blp'), 30);
  assert.equal(findResourceIndex('FE.BTP'), 1);
  assert.equal(findResourceIndex('FONTPC_RDX\0ignored'), 8);
  assert.equal(findResourceIndex('missing.blp'), -1);
});
test('every recovered name resolves to its table ID', () => {
  assert.equal(resourceMappings.length, 340);
  for (const { name, index } of resourceMappings) assert.equal(findResourceIndex(name), index, name);
});
